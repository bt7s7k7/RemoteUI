import { computed, defineComponent, h, inject, InjectionKey, PropType, provide, Ref, ref, watch } from "vue"
import { unreachable } from "../comTypes/util"
import { Route } from "../remoteUICommon/RemoteUI"
import { parseActionID, UI, UIElement } from "../remoteUICommon/UIElement"
import { Struct } from "../struct/Struct"
import { Button } from "../vue3gui/Button"
import { LoadingIndicator } from "../vue3gui/LoadingIndicator"
import { Overlay } from "../vue3gui/Overlay"
import { TextField } from "../vue3gui/TextField"
import { RemoteUIProxy, RemoteUISessionHandle } from "./RemoteUIProxy"

const REMOTE_UI_KEY: InjectionKey<RemoteUIProxy> = Symbol("remoteUI")
const SESSION_KEY: InjectionKey<Ref<RemoteUISessionHandle>> = Symbol("remoteUISession")

function getLayoutClasses(element: Omit<UI.Frame, "children">) {
    return [
        element.axis,
        element.gap && `gap-${element.gap}`
    ]
}

interface ElementProps<T> {
    element: T
}

const UI_ELEMENT_SETUP: Record<keyof typeof UI, (element: any) => () => any> = {
    Button: (props: ElementProps<UI.Button>) => {
        const session = inject(SESSION_KEY)!

        function click() {
            const actionID = props.element.onClick!
            const action = parseActionID(actionID)
            if (action.type == "action") {
                session.value.triggerAction(actionID, null, props.element.name)
            } else if (action.type == "form") {
                const form = session.value.forms[action.form]
                session.value.triggerAction(actionID, form, props.element.name)
            } else unreachable()
        }

        return () => (
            <Button
                variant={props.element.variant ?? undefined}
                clear={props.element.clear ?? undefined}
                onClick={props.element.onClick ? click : undefined}
            >{props.element.text}</Button>
        )
    },
    Label: (props: ElementProps<UI.Label>) => {

        return () => (
            <span>{props.element.text}</span>
        )
    },
    Frame: (props: ElementProps<UI.Frame>) => {

        return () => (
            <div class={[...getLayoutClasses(props.element), "flex"]}>
                {props.element.children.map(v => (
                    <UIElementView element={v} />
                ))}
            </div>
        )
    },
    Input: (props: ElementProps<UI.Input>) => {
        const session = inject(SESSION_KEY)!

        const model = computed(() => props.element.model.split("_"))

        return () => (
            <TextField vModel={session.value.forms[model.value[0]][model.value[1]]} />
        )
    },
    Output: (props: ElementProps<UI.Input>) => {
        const session = inject(SESSION_KEY)!

        const model = computed(() => props.element.model.split("_"))

        return () => (
            <span>{session.value.forms[model.value[0]][model.value[1]]}</span>
        )
    }
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
                    props.element.muted && `muted`
                ]
            })
        )
    }
})

export const RemoteUIView = (defineComponent({
    name: "RemoteUIView",
    props: {
        route: { type: String, required: true },
        remoteUI: { type: RemoteUIProxy }
    },
    setup(props, ctx) {
        const parentRemoteUI = inject(REMOTE_UI_KEY, null)
        const parentSession = inject(SESSION_KEY, null)
        const remoteUI = computed(() => props.remoteUI ?? parentRemoteUI ?? unreachable("RemoteUIProxy was not provided or inherited"))

        const session = ref<RemoteUISessionHandle>(null!)
        watch(() => props.route, route => {
            if (session.value) session.value.close()
            session.value = remoteUI.value.getSession(Route.parse(route, parentSession?.value.route ?? null))
        }, { immediate: true })

        provide(REMOTE_UI_KEY, remoteUI.value)
        provide(SESSION_KEY, session)

        return () => (
            <Overlay show={!session.value.root}>{{
                overlay: () => <LoadingIndicator />,
                default: () => (
                    session.value.root && <UIElementView element={session.value.root!} />
                )
            }}</Overlay>
        )
    }
}))