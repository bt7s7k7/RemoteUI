import { mdiAlert, mdiCheckboxBlankOutline, mdiCheckboxMarked } from "@mdi/js"
import { computed, defineComponent, h, inject, InjectionKey, onUnmounted, PropType, provide, reactive, Ref, ref, watch } from "vue"
import { cloneArray, isAlpha, unreachable, unzip } from "../comTypes/util"
import { Route } from "../remoteUICommon/RemoteUI"
import { parseActionID, parseModelID, UI, UIElement } from "../remoteUICommon/UIElement"
import { Struct } from "../struct/Struct"
import { Button } from "../vue3gui/Button"
import { useDynamicsEmitter } from "../vue3gui/DynamicsEmitter"
import { Icon } from "../vue3gui/Icon"
import { LoadingIndicator } from "../vue3gui/LoadingIndicator"
import { Overlay } from "../vue3gui/Overlay"
import { TextField } from "../vue3gui/TextField"
import { stringifyError } from "../vue3gui/util"
import { RemoteUIProxy, RemoteUISessionHandle } from "./RemoteUIProxy"

const REMOTE_UI_KEY: InjectionKey<RemoteUIProxy> = Symbol("remoteUI")
const SESSION_KEY: InjectionKey<Ref<RemoteUISessionHandle>> = Symbol("remoteUISession")
const FORM_OVERRIDE_KEY: InjectionKey<Record<string, string>> = Symbol("formOverride")

function getLayoutClasses(element: Omit<UI.InternalTypes.Frame, "children">) {
    return [
        element.axis,
        element.gap && `gap-${element.gap}`,
        element.rounded && `rounded`,
        element.center == "all" && `center`,
        element.center == "cross" && `center-cross`,
        element.center == "main" && `center-main`,
        element.border && (`border` + (element.border !== true ? ` border-${element.border}` : "")),
    ]
}

function getSpacingClasses(element: UIElement) {
    let ret: string[] = []

    function parseSpacing(input: string, type: "p" | "m") {
        const entries = unzip(input, v => isAlpha(v))
        for (const [direction, value] of entries) {
            ret.push(type + (direction == "a" ? "" : direction) + "-" + value.join(""))
        }
    }

    if (element.margin) parseSpacing(element.margin, "m")
    if (element.padding) parseSpacing(element.padding, "p")

    return ret.join(" ")
}

interface ElementProps<T> {
    element: T
}

function useModel(session: Ref<RemoteUISessionHandle>, modelFactory: () => string, ignoreErrors?: boolean) {
    const overrides = inject(FORM_OVERRIDE_KEY)!
    const model = computed(() => {
        const id = modelFactory()
        try {
            let model = parseModelID(id)
            while (model.form in overrides) {
                const override = overrides[model.form]
                const newModel = parseModelID(override)
                model = { form: newModel.form, path: newModel.path.concat(model.path), id: null! }
            }

            model.id = model.form + "_" + model.path.join(".")

            return model
        } catch (error) {
            if (ignoreErrors) return { form: "", path: [], id }
            else throw error
        }
    })

    return model
}

function useFormModel(session: Ref<RemoteUISessionHandle>, modelFactory: () => string) {
    const model = useModel(session, modelFactory)

    const value = computed({
        get: () => {
            let target = session.value.forms[model.value.form]
            for (let segment of model.value.path) {
                target = target[segment]
            }

            return target
        },
        set: value => {
            let target = session.value.forms[model.value.form]
            const path = cloneArray(model.value.path)
            const final = path.pop()!

            for (let segment of path) {
                target = target[segment]
            }

            target[final] = value
        }
    })

    return reactive({ value, model })
}

function useAction(session: Ref<RemoteUISessionHandle>, actionFactory: () => string | null | undefined, senderFactory: () => string | null | undefined) {
    const action = computed(() => {
        const id = actionFactory()
        if (id == null) return null
        return parseActionID(id)
    })
    const sender = useModel(session, () => senderFactory()!, true)

    return () => {
        if (action.value == null) return

        let promise: Promise<void>
        if (action.value.type == "action") {
            promise = session.value.triggerAction(action.value.id, null, sender.value.id)
        } else if (action.value.type == "form") {
            const form = session.value.forms[action.value.form]
            promise = session.value.triggerAction(action.value.id, form, sender.value.id)
        } else unreachable()

        if (action.value.waitForCompletion) {
            session.value.loading++
            promise.then(() => {
                session.value.loading--
            }, error => {
                session.value.loading--
                // eslint-disable-next-line no-console
                console.error(error)
                session.value.error = stringifyError(error)
            })
        }
    }
}

const ProvideUtil = defineComponent({
    name: "ProvideUtil",
    props: {
        provideKey: { type: null, required: true },
        value: { type: null, required: true }
    },
    setup(props, ctx) {
        provide(props.provideKey, props.value)

        return () => <>{ctx.slots.default?.()}</>
    }
})

const UI_ELEMENT_SETUP: Record<keyof typeof UI.InternalTypes, (element: any) => () => any> = {
    Button: (props: ElementProps<UI.InternalTypes.Button>) => {
        const session = inject(SESSION_KEY)!
        const onClickAction = useAction(session, () => props.element.onClick, () => props.element.name)

        function click() {
            onClickAction()

            if (props.element.to) {
                const target = Route.parse(props.element.to, session.value.route)
                session.value.redirect(target)
            }
        }

        return () => (
            <Button
                variant={props.element.variant ?? undefined}
                clear={props.element.clear ?? undefined}
                onClick={click}
            >{props.element.text}</Button>
        )
    },
    Label: (props: ElementProps<UI.InternalTypes.Label>) => {

        return () => (
            props.element.richText ? (
                h(props.element.size ?? "span", { innerHTML: props.element.text })
            ) : (
                h(props.element.size ?? "span", {}, props.element.text)
            )
        )
    },
    Frame: (props: ElementProps<UI.InternalTypes.Frame>) => {

        return () => (
            <div class={[...getLayoutClasses(props.element), "flex"]}>
                {props.element.children?.map(v => (
                    <UIElementView element={v} />
                ))}
            </div>
        )
    },
    Input: (props: ElementProps<UI.InternalTypes.Input>) => {
        const session = inject(SESSION_KEY)!

        const model = useFormModel(session, () => props.element.model)

        return () => (
            <TextField vModel={model.value} />
        )
    },
    Checkbox: (props: ElementProps<UI.InternalTypes.Checkbox>) => {
        const session = inject(SESSION_KEY)!

        const model = useFormModel(session, () => props.element.model)
        const submit = useAction(session, () => props.element.onChange, () => props.element.name)

        function changed(event: Event) {
            const target = event.target as HTMLInputElement
            const value = target.checked

            model.value = value
            submit()
        }

        return () => (
            props.element.readonly ? (
                model.value ? (
                    <Icon icon={mdiCheckboxMarked} />
                ) : (
                    <Icon icon={mdiCheckboxBlankOutline} />
                )
            ) : (
                <input type="checkbox" checked={model.value} onChange={changed} />
            )
        )
    },
    Output: (props: ElementProps<UI.InternalTypes.Output>) => {
        const session = inject(SESSION_KEY)!

        const model = useFormModel(session, () => props.element.model)

        return () => (
            props.element.richText ? (
                <span innerHTML={model.value} />
            ) : (
                <span>{model.value}</span>
            )
        )
    },
    Editable: (props: ElementProps<UI.InternalTypes.Editable>) => {
        const session = inject(SESSION_KEY)!
        const emitter = useDynamicsEmitter()
        const submit = useAction(session, () => props.element.onChange, () => props.element.name)

        const model = useFormModel(session, () => props.element.model)
        async function edit(event: MouseEvent) {
            const target = event.target as HTMLElement
            const width = target.getBoundingClientRect().width
            const value = ref(model.value)
            const prompt = emitter.popup(target, () => (
                <TextField focus class="w-min-200" style={{ width: width + "px" }} vModel={value.value} />
            ), {
                align: "over",
                props: {
                    backdropCancels: true
                }
            })

            if (await prompt) {
                model.value = value.value
                submit()
            }
        }

        return () => (
            <Button class="text-left" onClick={edit} clear>
                {model.value ? (
                    model.value
                ) : (
                    <div class="muted">Click to edit</div>
                )}
            </Button>
        )
    },
    Table: (props: ElementProps<UI.InternalTypes.Table>) => {
        const session = inject(SESSION_KEY)!
        const formOverride = inject(FORM_OVERRIDE_KEY)!

        const model = useFormModel(session, () => props.element.model)

        return () => (
            <table>
                <thead>
                    <tr>
                        {props.element.columns.map(column => (
                            <th key={column.key}>{column.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {Object.keys(model.value).map(row => (
                        <tr key={row}>
                            <ProvideUtil
                                value={{ ...formOverride, [props.element.variable]: `${model.model.id}.${row}` }}
                                provideKey={FORM_OVERRIDE_KEY}
                            >
                                {props.element.columns.map(column => (
                                    <td key={column.key}>
                                        <UIElementView element={column.element as UIElement} class="w-fill" />
                                    </td>
                                ))}
                            </ProvideUtil>
                        </tr>
                    ))}
                </tbody>
            </table>
        )
    },
    Embed: (props: ElementProps<UI.InternalTypes.Embed>) => {
        const session = inject(SESSION_KEY)!

        return () => (
            session.value.depth > 10 ? (
                <div class="text-danger">Max embed depth reached</div>
            ) : (
                <RemoteUIView route={props.element.route} />
            )
        )
    },
}

const UI_ELEMENT_LOOKUP = Object.fromEntries(Object.entries(UI_ELEMENT_SETUP).map(([key, value]) => [key, defineComponent({
    name: key,
    props: {
        element: { type: Object, required: true }
    },
    setup: (props) => value(props)
})]))


const UIElementView = defineComponent({
    name: "UIElementView",
    props: {
        element: { type: Object as PropType<UIElement>, required: true }
    },
    setup(props, ctx) {
        const elementComponent = computed(() => UI_ELEMENT_LOOKUP[Struct.getBaseType(props.element).name as keyof typeof UI_ELEMENT_LOOKUP])

        return () => (
            h(elementComponent.value, {
                element: props.element,
                class: [
                    props.element.bgColor && `bg-${props.element.bgColor}`,
                    props.element.fontColor && `text-${props.element.fontColor}`,
                    props.element.fill && `flex-fill`,
                    props.element.monospace && `monospace`,
                    props.element.muted && `muted`,
                    props.element.basis && `flex-basis-${props.element.basis}`,
                    props.element.textAlign && `text-${props.element.textAlign}`,
                    getSpacingClasses(props.element)
                ]
            })
        )
    }
})

export const RemoteUIView = (defineComponent({
    name: "RemoteUIView",
    props: {
        route: { type: String, default: () => "/" },
        remoteUI: { type: RemoteUIProxy }
    },
    setup(props, ctx) {
        const parentRemoteUI = inject(REMOTE_UI_KEY, null)
        const parentSession = inject(SESSION_KEY, null)
        const remoteUI = computed(() => props.remoteUI ?? parentRemoteUI ?? unreachable("RemoteUIProxy was not provided or inherited"))

        const route = ref(props.route)
        watch(() => props.route, (newRoute) => {
            route.value = newRoute
        })

        const session = ref<RemoteUISessionHandle>(null!)
        watch(route, route => {
            if (session.value) session.value.close()
            session.value = remoteUI.value.getSession(Route.parse(route, parentSession?.value.route ?? null))
            if (parentSession?.value) session.value.depth = parentSession.value.depth + 1
        }, { immediate: true })

        watch(() => session.value.redirected, (redirect) => {
            if (!redirect) return
            route.value = redirect.toString()
        })

        provide(REMOTE_UI_KEY, remoteUI.value)
        provide(SESSION_KEY, session)
        provide(FORM_OVERRIDE_KEY, {})

        onUnmounted(() => {
            if (session.value?.open) {
                session.value.close()
            }
        })

        return () => (
            <Overlay class="flex column" show={!session.value.root || session.value.loading > 0}>{{
                overlay: () => <LoadingIndicator />,
                default: () => (
                    <Overlay class="flex-fill flex column" show={session.value.error != null}>{{
                        overlay: () => (
                            <div class="p-4 bg-white text-danger rounded flex center column gap-2 text-danger">
                                <h1 class="m-0"> <Icon icon={mdiAlert} /> </h1>
                                {session.value.error}
                            </div>
                        ),
                        default: () => (
                            session.value.root && <UIElementView element={session.value.root!} />
                        )
                    }}</Overlay>
                )
            }}</Overlay>
        )
    }
}))