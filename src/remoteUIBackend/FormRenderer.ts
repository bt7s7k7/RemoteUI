import { camelToTitleCase, cloneArray, ensureKey, unreachable } from "../comTypes/util"
import { UI, UIElement, parseModelID } from "../remoteUICommon/UIElement"
import { Mutation } from "../struct/Mutation"
import { Type } from "../struct/Type"
import { FormEvent } from "./RouteController"

interface FormRenderSettings {
    noLabels?: boolean
    labelSize?: number,
    onChange?: string | { id: string },
    readonly?: boolean,
    renderChildren?: boolean
    childProps?: FormRenderSettings
    childOverrides?: Record<string, FormRenderSettings>
    blacklist?: string[]
    whitelist?: string[]
}

type FieldRenderer = (model: string, readonly: boolean, onChange: string | { id: string } | null | undefined, name: string) => UIElement

interface Field {
    key: string
    label: string
    renderer: FieldRenderer | FormRenderer
}

const FIELD_RENDERERS = new Map<Type<any>, FieldRenderer>()

export function setCustomFieldRenderer(type: Type<any>, render: FieldRenderer) {
    FIELD_RENDERERS.set(type, render)
}

setCustomFieldRenderer(Type.string, (model, readonly, onChange, name) => (
    readonly == true ? (
        UI.output({ model })
    ) : onChange == null ? (
        UI.input({ model, fill: true })
    ) : (
        UI.editable({ model, onChange, name, fill: true })
    )
))

setCustomFieldRenderer(Type.boolean, (model, readonly, onChange, name) => UI.checkbox({ model, onChange, name, readonly }))

const DEFAULT_LABEL_SIZE = 100
export class FormRenderer<T extends Type<any> = Type<any>> {
    public readonly rootName = this.options.name ?? this.options.model
    protected childRendererCache = new Map<string, FormRenderer>()
    protected fieldsCache: Field[] | null = null
    protected childPrefix = this.options.model.includes("_") ? this.options.model + "." : this.options.model + "_"
    protected namePrefix = this.rootName.includes("_") ? this.rootName + "." : this.rootName + "_"

    public renderFrame(options?: Omit<Parameters<typeof UI.frame>[0], "children">) {
        return UI.frame({
            axis: "column",
            children: this.renderRaw(),
            ...options
        })
    }

    public renderRaw() {
        const fields = this.getFields()
        const result: UIElement[] = []
        const labelSize = this.options.labelSize ?? DEFAULT_LABEL_SIZE

        for (const { key, label, renderer } of fields) {
            if (typeof renderer == "function") {
                const field = renderer(this.childPrefix + key, this.options.readonly ?? false, this.options.onChange, this.namePrefix + key)

                if (this.options.noLabels) {
                    result.push(field)
                } else {
                    result.push(UI.frame({
                        axis: "row",
                        center: "cross",
                        children: [
                            UI.label({
                                text: label,
                                basis: labelSize,
                            }),
                            field
                        ]
                    }))
                }
            } else {
                const children = renderer.renderRaw()
                if (!this.options.noLabels) children.unshift(UI.label({
                    text: "• " + label,
                    margin: "a0b2"
                }))

                result.push(UI.frame({
                    axis: "column",
                    border: true,
                    rounded: true,
                    padding: "x2b2",
                    margin: "y2",
                    children
                }))
            }
        }

        return result
    }

    public getFields() {
        if (this.fieldsCache) return this.fieldsCache

        const fields: Field[] = []

        if (!Type.isObject(this.options.type)) unreachable()

        for (const [prop, propType] of this.options.type.propList) {
            if (this.options.whitelist && !this.options.whitelist.includes(prop)) continue
            if (this.options.blacklist && this.options.blacklist.includes(prop)) continue

            let renderer = FIELD_RENDERERS.get(propType)
            const label = camelToTitleCase(prop)
            if (renderer) {
                fields.push({ key: prop, label, renderer })
                continue
            }

            if (Type.isObject(propType) && this.options.renderChildren) {
                const overrides = this.options.childOverrides?.[prop]

                const renderer = ensureKey(this.childRendererCache, prop, () => new FormRenderer({
                    ...this.options, ...this.options.childProps,
                    childOverrides: undefined, blacklist: undefined, whitelist: undefined,
                    ...overrides,
                    model: this.childPrefix + prop, type: propType, name: this.namePrefix + prop
                }))

                fields.push({ key: prop, label, renderer })
            }
        }

        this.fieldsCache = fields
        return fields
    }

    constructor(
        public readonly options: { type: T, model: string, name?: string } & FormRenderSettings
    ) { }
}

type TableDefinition = Pick<Parameters<typeof UI.table>[0], "columns" | "variable" | "model">
type TableColumn = TableDefinition["columns"][number]
export class TableRenderer<T extends Type<any> = Type<any>> {
    public variable = this.options.name ?? "table"
    public formRenderer = new FormRenderer({ noLabels: true, ...this.options, type: this.options.type, model: this.variable })
    protected columnsCache: TableColumn[] | null = null

    public render(options?: Omit<Parameters<typeof UI.table>[0], "columns" | "variable" | "model">) {
        return UI.table({
            columns: this.getColumns(),
            variable: this.variable,
            model: this.options.model,
            ...options
        })
    }

    public getDefinition(): TableDefinition {
        return { variable: this.variable, model: this.options.model, columns: this.getColumns() }
    }

    public getColumns() {
        const columns: TableColumn[] = []
        if (this.columnsCache) return this.columnsCache as typeof columns
        const fields = this.formRenderer.getFields()
        const fieldElements = this.formRenderer.renderRaw()

        for (let i = 0; i < fields.length; i++) {
            const { key, label } = fields[i]
            const element = fieldElements[i]

            columns.push({ key, label, element })
        }

        this.columnsCache = columns
        return columns
    }

    constructor(
        public readonly options: { type: T, model: string, name?: string } & FormRenderSettings
    ) { }
}

export function formEventToMutation(event: FormEvent<any>): Mutation {
    if (!event.sender) throw new Error("Event must have a sender")
    const model = parseModelID(event.sender)

    let value = event.data
    for (const segment of model.path) {
        if (value instanceof Map) {
            value = value.get(segment)
        } else {
            value = value[segment]
        }
    }

    const path = cloneArray(model.path)
    const key = path.pop()!

    return new Mutation.AssignMutation({
        key, path, value
    })
}
