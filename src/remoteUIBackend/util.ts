import { autoFilter, camelToTitleCase, cloneArray } from "../comTypes/util"
import { parseModelID, UI, UIElement } from "../remoteUICommon/UIElement"
import { Type } from "../struct/Type"
import { StructSyncMessages } from "../structSync/StructSyncMessages"
import { FormEvent } from "./RouteController"

interface FormRenderSettings {
    noLabels?: boolean
    labelSize?: number,
    onChange?: string | { id: string },
    readonly?: boolean,
    renderChildren?: boolean
    childRenderOverrides?: FormRenderSettings
}

type FieldRenderer = (model: string, onChange: string | { id: string } | null | undefined, name: string) => UIElement

const FIELD_RENDERERS = new Map<Type<any>, FieldRenderer>()

export function setCustomFieldRenderer(type: Type<any>, render: FieldRenderer) {
    FIELD_RENDERERS.set(type, render)
}

setCustomFieldRenderer(Type.string, (model, onChange, name) => onChange == null ? (
    UI.input({ model, fill: true })
) : (
    UI.editable({ model, onChange, name, fill: true })
))

setCustomFieldRenderer(Type.boolean, (model, onChange, name) => UI.checkbox({ model, onChange, name }))

export function renderForm<T extends Type.ObjectType, B extends boolean = false>(options: { type: T, model: string, name?: string, raw?: B } & FormRenderSettings) {
    const { model, type, onChange, noLabels, labelSize = 100, readonly, renderChildren, raw } = options
    const formName = options.name ?? model

    const fields: UIElement[] = []

    for (const [prop, propType] of type.propList) {
        let renderer = FIELD_RENDERERS.get(propType)
        const name = formName + "." + prop
        if (renderer) {
            const field = renderer(model + "." + prop, onChange, name)
            if (noLabels) {
                fields.push(field)
            } else {
                fields.push(UI.frame({
                    axis: "row",
                    center: "cross",
                    children: [
                        UI.label({
                            text: camelToTitleCase(prop),
                            basis: labelSize
                        }),
                        field
                    ]
                }))
            }
        } else if (Type.isObject(propType) && renderChildren) {
            fields.push(UI.frame({
                axis: "column",
                border: true,
                rounded: true,
                padding: "x2b2",
                margin: "y2",
                children: autoFilter([
                    !noLabels && UI.label({
                        text: "• " + camelToTitleCase(prop),
                        margin: "a0b2"
                    }),
                    ...renderForm({ ...options, ...options.childRenderOverrides, model: model + "." + prop, type: propType, name, raw: true })
                ])
            }))

            continue
        }
    }

    return (raw ? fields : UI.frame({
        axis: "column",
        children: fields
    })) as B extends true ? UIElement[] : UIElement
}

export function formEventToMutation(event: FormEvent<any>, target = ""): StructSyncMessages.AssignMutateMessage {
    if (!event.sender) throw new Error("Event must have a sender")
    const model = parseModelID(event.sender)

    let value = event.data
    for (const segment of model.path) {
        value = value[segment]
    }

    const path = cloneArray(model.path)
    const key = path.pop()!

    return {
        type: "mut_assign",
        key, path, value, target
    }
}