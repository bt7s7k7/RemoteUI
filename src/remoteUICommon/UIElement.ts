import { Struct } from "../struct/Struct"
import { SerializationError, Type } from "../struct/Type"
import { Variant } from "../vue3gui/variants"

export type MetaActionType = "cancel" | "reload"

export type UIElement = InstanceType<(typeof UI.InternalTypes)[keyof typeof UI.InternalTypes]>

export const UIElementInternal_t: Type<unknown> = Type.createType({
    default: () => null,
    serialize(element) {
        const name = Struct.getBaseType(element).name
        const data = element.serialize()
        data.type = name
        return data
    },
    deserialize(source) {
        const name = source.type as keyof typeof UI.InternalTypes
        if (!(name in UI.InternalTypes)) throw new SerializationError(`Invalid UI element type "${name}"`)
        const ctor = UI.InternalTypes[name]
        return ctor.deserialize(source)
    },
    getDefinition(indent) { return indent + this.name },
    name: "UIElement"
})

export const UIElement_t = UIElementInternal_t as Type<UIElement>

const Variant_t = Type.enum(...Variant.LIST)
const Border_t = Type.enum(...Variant.LIST, true)

const layoutProps = {
    axis: Type.enum("column", "row").as(Type.nullable),
    gap: Type.number.as(Type.nullable),
    center: Type.enum("all", "main", "cross").as(Type.nullable),
    border: Border_t.as(Type.nullable),
    rounded: Type.boolean.as(Type.nullable)
}

const positionProps = {
    fill: Type.boolean.as(Type.nullable),
    basis: Type.number.as(Type.nullable),
    margin: Type.string.as(Type.nullable),
    padding: Type.string.as(Type.nullable)
}

const styleProps = {
    fontColor: Variant_t.as(Type.nullable),
    bgColor: Variant_t.as(Type.nullable),
    muted: Type.boolean.as(Type.nullable),
    monospace: Type.boolean.as(Type.nullable)
}

type ElementOptions = {
    [P in keyof typeof UI.InternalTypes]: ConstructorParameters<typeof UI.InternalTypes[P]>[0]
}

function defaultFactory<K extends keyof ElementOptions>(name: K) { return (options: ElementOptions[K]) => new UI.InternalTypes[name](options as any) }

export namespace UI {
    export const label = defaultFactory("Label")
    export const output = defaultFactory("Output")
    export const input = defaultFactory("Input")
    export const table = defaultFactory("Table")
    export function button(options: Omit<ElementOptions["Button"], "onClick"> & { onClick?: string | undefined | null | { id: string } }) {
        if (options.onClick != null && typeof options.onClick == "object") {
            options.onClick = options.onClick.id
        }

        return new InternalTypes.Button(options as ElementOptions["Button"])
    }
    export function editable(options: Omit<ElementOptions["Editable"], "onChange"> & { onChange?: string | undefined | null | { id: string } }) {
        if (options.onChange != null && typeof options.onChange == "object") {
            options.onChange = options.onChange.id
        }

        return new InternalTypes.Editable(options as ElementOptions["Editable"])
    }
    export function checkbox(options: Omit<ElementOptions["Checkbox"], "onChange"> & { onChange?: string | undefined | null | { id: string } }) {
        if (options.onChange != null && typeof options.onChange == "object") {
            options.onChange = options.onChange.id
        }

        return new InternalTypes.Checkbox(options as ElementOptions["Checkbox"])
    }
    export function frame(options?: Omit<Exclude<ElementOptions["Frame"], void>, "children"> & { children?: UIElement[] }) { return new InternalTypes.Frame(options) }

    export namespace InternalTypes {
        export class Label extends Struct.define("Label", {
            text: Type.string,
            size: Type.enum("small", "h1", "h2", "h3").as(Type.nullable),
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
            children?: UIElement[]
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

        export class Checkbox extends Struct.define("Checkbox", {
            model: Type.string,
            onChange: Type.string.as(Type.nullable),
            name: Type.string.as(Type.nullable),
            readonly: Type.boolean.as(Type.nullable),
            ...positionProps,
            ...styleProps
        }) { }

        export class Editable extends Struct.define("Editable", {
            model: Type.string,
            onChange: Type.string.as(Type.nullable),
            name: Type.string.as(Type.nullable),
            ...positionProps,
            ...styleProps
        }) { }

        export class Table extends Struct.define("Table", {
            variable: Type.string,
            columns: Type.object({ label: Type.string, key: Type.string, element: UIElementInternal_t }).as(Type.array),
            model: Type.string,
            ...positionProps,
            ...styleProps
        }) { }
    }
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

    return { type: type as "form" | "action" | "meta", form, action, waitForCompletion, id } as (
        { type: "action" | "meta" } | { type: "form", form: string }
    ) & { action: string, waitForCompletion: boolean, id: string }
}

export function parseModelID(id: string) {
    let formEnd = id.indexOf("_")
    const form = id.slice(0, formEnd == -1 ? id.length : formEnd)
    const property = formEnd == -1 ? null : id.slice(formEnd + 1)
    const path = property?.split(".") ?? []
    return { form, path, id }
}