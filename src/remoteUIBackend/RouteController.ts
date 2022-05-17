import { AUTO_DISPOSE, Disposable, DISPOSE } from "../eventLib/Disposable"
import { WeakRef } from "../eventLib/SharedRef"
import { MetaActionType, parseActionID, UIElement } from "../remoteUICommon/UIElement"
import { Type } from "../struct/Type"
import { ClientError } from "../structSync/StructSyncServer"
import { RemoteUISession } from "./RemoteUIController"

interface ActionEvent {
    session: RemoteUISession
}

interface FormEvent<T> extends ActionEvent {
    data: T
}

interface FormDefinition {
    id: string
    type: Type<any>
    actions: Map<string, FormActionCallback<any>>
    defaultFactory: (() => any) | null
}

interface ActionHandle {
    id: string
}

type FormActionCallback<T> = (event: FormEvent<T>) => void | Promise<void>

interface FormHandle<T> {
    id: string
    action(name: string, callback: FormActionCallback<T>, options?: { waitForCompletion?: boolean }): ActionHandle
}

type ActionCallback = (event: ActionEvent) => void | Promise<void>

interface RouteControllerContext {
    action(name: string, callback: ActionCallback, options?: { waitForCompletion?: boolean }): ActionHandle
    form<T>(name: string, type: Type<T>, defaultFactory?: () => T): FormHandle<T>
    meta: Record<MetaActionType, string>
    controller: RouteController
}

export class RouteController extends Disposable {
    public [AUTO_DISPOSE] = true
    protected sessions = new Set<WeakRef<RemoteUISession>>()

    public [DISPOSE]() {
        for (const session of this.iterateSessions()) {
            session.close()
        }

        super[DISPOSE]()
    }

    public makeForms() {
        const forms: Record<string, any> = {}

        for (const form of this.forms.values()) {
            forms[form.id] = form.defaultFactory?.() ?? form.type.default()
        }

        return forms
    }

    public makeUI(session: RemoteUISession) {
        return this.render(session)
    }

    public async handleAction(session: RemoteUISession, actionID: string, formData: any, sender: string | null | undefined) {
        const actionData = parseActionID(actionID)

        if (actionData.type == "action") {
            const action = this.actions.get(actionData.action)
            if (!action) throw new ClientError(`Invalid action "${actionID}"`)
            await action({ session })
        } else if (actionData.type == "form") {
            const form = this.forms.get(actionData.form)
            if (!form) throw new ClientError(`Invalid action "${actionID}"`)
            const action = form.actions.get(actionData.action)
            if (!action) throw new ClientError(`Invalid action "${actionID}"`)
            await action({ session, data: formData })
        } else throw new ClientError(`Cannot trigger meta action on backend (was "${actionID}")`)
    }

    protected *iterateSessions() {
        for (const sessionRef of this.sessions) {
            if (!sessionRef.alive) {
                this.sessions.delete(sessionRef)
                continue
            }

            yield sessionRef.value
        }
    }

    public update() {
        for (const session of this.iterateSessions()) {
            session.update()
        }
    }

    public updateForm(form: string, data: any) {
        for (const session of this.iterateSessions()) {
            session.updateForm(form, data)
        }
    }

    constructor(
        protected readonly actions: Map<string, ActionCallback>,
        protected readonly forms: Map<string, FormDefinition>,
        protected readonly render: (session: RemoteUISession) => UIElement
    ) { super() }
}

export function defineRouteController(setup: (ctx: RouteControllerContext) => (session: RemoteUISession) => UIElement) {
    const actions = new Map<string, ActionCallback>()
    const forms = new Map<string, FormDefinition>()

    const ctx: RouteControllerContext = {
        action(name, callback, options = {}) {
            const id = "action_" + name + (options.waitForCompletion ? "*" : "")

            actions.set(name, callback)

            return { id }
        },
        form(name, type, defaultFactory) {
            const id = "form_" + name

            const form: FormDefinition = {
                type, id,
                actions: new Map(),
                defaultFactory: defaultFactory ?? null
            }

            forms.set(name, form)

            return {
                id,
                action(name, callback, options = {}) {
                    const id = form.id + "_" + name + (options.waitForCompletion ? "*" : "")

                    form.actions.set(name, callback)

                    return { id }
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

    const controller = new RouteController(actions, forms, render)
    ctx.controller = controller
    return controller
}