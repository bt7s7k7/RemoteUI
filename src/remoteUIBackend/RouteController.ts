import { AUTO_DISPOSE, Disposable, DISPOSE } from "../eventLib/Disposable"
import { WeakRef } from "../eventLib/SharedRef"
import { FormModelProperty, Route } from "../remoteUICommon/RemoteUI"
import { MetaActionType, parseActionID, UI, UIElement } from "../remoteUICommon/UIElement"
import { Type } from "../struct/Type"
import { Mutation } from "../struct/Mutation"
import { StructSyncMessages } from "../structSync/StructSyncMessages"
import { ClientError } from "../structSync/StructSyncServer"
import { RemoteUISession } from "./RemoteUIController"

export interface ActionEvent {
    session: RemoteUISession
    sender: string | null | undefined
}

export interface FormEvent<T> extends ActionEvent {
    data: T
}

interface FormDefinition {
    id: string
    type: Type<any>
    actions: Map<string, FormActionCallback<any>>
    defaultFactory: ((session: RemoteUISession) => any) | null
}

interface ActionHandle {
    id: string
}

type FormActionCallback<T> = (event: FormEvent<T>) => void | Promise<void>

interface FormHandle<T> {
    id: string
    action(name: string, callback: FormActionCallback<T>, options?: { waitForCompletion?: boolean }): ActionHandle
    model: { [P in keyof T]: FormModelProperty<T[P]> & string }
    set(session: RemoteUISession | "all", data: T): void
    update(session: RemoteUISession | "all", mutation: ((v: T) => void) | Mutation.AnyMutation | Mutation.AnyMutation[]): void
}

type ActionCallback = (event: ActionEvent) => void | Promise<void>

interface RouteControllerContext {
    action(name: string, callback: ActionCallback, options?: { waitForCompletion?: boolean }): ActionHandle
    form<T>(name: string, type: Type<T>, defaultFactory?: (session: RemoteUISession) => T): FormHandle<T>
    meta: Record<MetaActionType, string>
    controller: RouteController
}

type RenderFunction = (session: RemoteUISession) => UIElement
type SlotFunction = (session: RemoteUISession, slot: Route) => UIElement

export class RouteController extends Disposable {
    public [AUTO_DISPOSE] = true
    protected sessions = new Set<WeakRef<RemoteUISession>>()

    public [DISPOSE]() {
        for (const session of this.getSessions()) {
            session.close()
        }

        super[DISPOSE]()
    }

    public makeForms(session: RemoteUISession) {
        const forms: Record<string, any> = {}

        for (const form of this.forms.values()) {
            forms[form.id] = form.defaultFactory?.(session) ?? form.type.default()
        }

        return forms
    }

    public render(session: RemoteUISession, slot: Route) {
        const slotName = slot.getPath()
        if (slotName == "/") return this.defaultSlot(session)

        const slotRenderer = this.slots.get(slotName)
        if (!slotRenderer) return (
            UI.label({
                text: "Invalid slot: " + slot.toString(),
                monospace: true
            })
        )

        return slotRenderer(session, slot)
    }

    public async handleAction(session: RemoteUISession, actionID: string, formData: any, sender: string | null | undefined) {
        const actionData = parseActionID(actionID)

        if (actionData.type == "action") {
            const action = this.actions.get(actionData.action)
            if (!action) throw new ClientError(`Invalid action "${actionID}"`)
            await action({ session, sender })
        } else if (actionData.type == "form") {
            const form = this.forms.get(actionData.form)
            if (!form) throw new ClientError(`Invalid action "${actionID}"`)
            const action = form.actions.get(actionData.action)
            if (!action) throw new ClientError(`Invalid action "${actionID}"`)

            const verifiedFormData = form.type.deserialize(formData)

            await action({ session, data: verifiedFormData, sender })
        } else throw new ClientError(`Cannot trigger meta action on backend (was "${actionID}")`)
    }

    public *getSessions() {
        for (const sessionRef of [...this.sessions]) {
            if (!sessionRef.alive) {
                this.sessions.delete(sessionRef)
                continue
            }

            yield sessionRef.value
        }
    }

    public update() {
        for (const session of this.getSessions()) {
            session.update()
        }
    }

    public updateForm(form: string, data: any) {
        for (const session of this.getSessions()) {
            session.setForm(form, data)
        }
    }

    constructor(
        protected readonly actions: Map<string, ActionCallback>,
        protected readonly forms: Map<string, FormDefinition>,
        protected readonly defaultSlot: RenderFunction,
        protected readonly slots: Map<string, SlotFunction>
    ) { super() }
}

export function defineRouteController(setup: (ctx: RouteControllerContext) => RenderFunction) {
    const actions = new Map<string, ActionCallback>()
    const forms = new Map<string, FormDefinition>()
    const slots = new Map<string, SlotFunction>()

    const ctx: RouteControllerContext = {
        action(name, callback, options = {}) {
            const id = "action_" + name + (options.waitForCompletion ? "*" : "")

            actions.set(name, callback)

            return { id }
        },
        form(name, type, defaultFactory) {
            const id = name

            if (!Type.isObject(type)) throw new Error("Form type must be an object")

            const form: FormDefinition = {
                type, id,
                actions: new Map(),
                defaultFactory: defaultFactory ?? null
            }

            forms.set(name, form)

            return {
                id,
                action(name, callback, options = {}) {
                    const id = "form_" + form.id + "_" + name + (options.waitForCompletion ? "*" : "")

                    form.actions.set(name, callback)

                    return { id }
                },
                model: Object.fromEntries(type.propList.map(([key]) => [key, form.id + "_" + key])) as any,
                set(session, data) {
                    if (session == "all") {
                        for (const session of controller.getSessions()) {
                            session.setForm(form.id, data)
                        }
                    } else {
                        session.setForm(form.id, data)
                    }
                },
                update(session, mutations) {
                    if (typeof mutations == "function") {
                        mutations = Mutation.create(null, type, mutations)
                    } else if (!(mutations instanceof Array)) {
                        mutations = [mutations]
                    }

                    if (session == "all") {
                        for (const session of controller.getSessions()) {
                            session.updateForm(form.id, mutations)
                        }
                    } else {
                        session.updateForm(form.id, mutations)
                    }
                }
            }
        },
        meta: {
            cancel: "meta_cancel",
            reload: "meta_reload"
        },
        controller: null!
    }

    const render = setup(ctx)

    const controller = new RouteController(actions, forms, render, slots)
    ctx.controller = controller
    return controller
}
