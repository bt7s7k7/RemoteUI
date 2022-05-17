import { Struct } from "../struct/Struct"
import { SerializationError, Type } from "../struct/Type"

export type MetaActionType = "cancel" | "reload"

export type UIElement = InstanceType<(typeof UI)[keyof typeof UI]>

export const UIElementInternal_t: Type<unknown> = Type.createType({
    default: () => null,
    serialize(element) {
        const name = Struct.getBaseType(element).name
        const data = element.serialize()
        data.type = name
        return data
    },
    deserialize(source) {
        const name = source.type as keyof typeof UI
        if (!(name in UI)) throw new SerializationError(`Invalid UI element type "${name}"`)
        const ctor = UI[name]
        return ctor.deserialize(source)
    },
    getDefinition(indent) { return indent + this.name },
    name: "UIElement"
})

export const UIElement_t = UIElementInternal_t as Type<UIElement>

const Variant_t = Type.stringUnion("white", "black", "dark", "primary", "secondary", "success", "danger", "warning")

const layoutProps = {
    axis: Type.stringUnion("column", "row").as(Type.nullable),
    gap: Type.number.as(Type.nullable)
}

const positionProps = {
    fill: Type.boolean.as(Type.nullable)
}

const styleProps = {
    fontColor: Variant_t.as(Type.nullable),
    bgColor: Variant_t.as(Type.nullable),
    muted: Type.boolean.as(Type.nullable),
    monospace: Type.boolean.as(Type.nullable)
}

export namespace UI {
    export class Label extends Struct.define("Label", {
        text: Type.string,
        ...positionProps,
        ...styleProps
    }) { }

    export class Output extends Struct.define("Output", {
        model: Type.string,
        ...positionProps,
        ...styleProps
    }) { }

    export class Frame extends Struct.define("Frame", {
        children: UIElementInternal_t.as(Type.array).as(Type.nullable),
        ...layoutProps,
        ...positionProps,
        ...styleProps
    }) { }

    export interface Frame {
        children: UIElement[]
    }

    export class Button extends Struct.define("Button", {
        text: Type.string,
        onClick: Type.string.as(Type.nullable),
        name: Type.string.as(Type.nullable),
        variant: Variant_t.as(Type.nullable),
        clear: Type.boolean.as(Type.nullable),
        ...positionProps,
        ...styleProps
    }) { }

    export class Input extends Struct.define("Input", {
        model: Type.string,
        ...positionProps,
        ...styleProps
    }) { }
}

export function parseActionID(id: string) {
    const [type, title, subtitle] = id.split("_")

    let waitForCompletion = false
    let form: string | null = null
    let action: string

    if (type == "form") {
        if (!title) throw new Error("Missing action component: form")
        form = title
        if (!subtitle) throw new Error("Missing action component: action")
        action = subtitle
    } else if (type == "action" || type == "meta") {
        if (!title) throw new Error("Missing action component: action")
        action = title
    } else throw new Error("Invalid action type")

    if (action[action.length - 1] == "*") {
        action = action.slice(0, action.length - 1)
        waitForCompletion = true
    }

    return { type: type as "form" | "action" | "meta", form, action, waitForCompletion } as (
        { type: "action" | "meta" } | { type: "form", form: string }
    ) & { action: string, waitForCompletion: boolean }
}