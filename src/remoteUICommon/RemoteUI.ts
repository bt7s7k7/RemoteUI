import { isWord } from "../comTypes/util"
import { Struct } from "../struct/Struct"
import { DeserializationError, Deserializer, SerializationError, Serializer, Type } from "../struct/Type"
import { ActionType } from "../structSync/ActionType"
import { EventType } from "../structSync/EventType"
import { StructSyncContract } from "../structSync/StructSyncContract"
import { UIElement_t } from "./UIElement"

export class RouteParseError extends SerializationError {
    public name = "RouteParseError"
}

function isRouteSegment(char: string) {
    return isWord(char) || char == "-" || char == "%" || char == "."
}

export class Route {
    public segments: string[]
    public query: Record<string, string>
    public component: string | null

    public getPath() {
        return "/" + this.segments.map(v => encodeURIComponent(v)).join("/")
    }

    public toString() {
        const queryEntries = Object.entries(this.query)
        return (
            this.getPath()
            + (this.component ? "@" + encodeURIComponent(this.component) : "")
            + (queryEntries.length > 0 ? "?" + queryEntries.map(v => encodeURIComponent(v[0]) + "=" + encodeURIComponent(v[1])).join("&") : "")
        )
    }

    constructor(input?: Route) {
        if (input == undefined) {
            this.component = null
            this.query = Object.create(null)
            this.segments = []
        } else {
            this.component = input.component
            this.query = Object.assign(Object.create(null), input.query)
            this.segments = [...input.segments]
        }
    }

    public static parse(input: string, base: Route | null = null) {
        const route = base == null ? new Route() : new Route(base)

        let index = 0
        let isQuery = false
        let didComponent = false

        function consumeToken() {
            let end = index
            while (isRouteSegment(input[end]) && end < input.length) {
                end++
            }
            const token = input.slice(index, end)
            index = end
            return decodeURIComponent(token)
        }

        while (index < input.length) {
            if (isQuery) {
                const name = consumeToken()
                if (!input.startsWith("=", index)) throw new RouteParseError(`Unexpected "${input[index]}", expected "="`)
                index++
                const value = consumeToken()
                if (value == "") {
                    delete route.query[name]
                } else {
                    route.query[name] = value
                }

                if (index < input.length) {
                    if (input.startsWith("&", index)) {
                        index++
                    } else {
                        throw new RouteParseError(`Unexpected "${input[index]}", expected "&" or end`)
                    }
                }
            } else {
                if (input.startsWith("?", index)) {
                    index++
                    isQuery = true
                    continue
                }

                if (didComponent) throw new RouteParseError(`Unexpected "${input[index]}", expected "?" or end`)

                if (input.startsWith("..", index)) {
                    const success = !!route.segments.pop()
                    if (!success) throw new RouteParseError(`Unexpected "..", route is already root at ${index} (${input})`)
                    index += 2

                    route.component = null
                    route.query = {}
                    continue
                }

                if (input.startsWith("/", index)) {
                    if (index == 0) {
                        route.segments.length = 0
                        route.component = null
                        route.query = {}
                    }
                    index++
                    const segment = consumeToken()

                    if (segment == "..") {
                        const success = !!route.segments.pop()
                        if (!success) throw new RouteParseError(`Unexpected "..", route is already root at ${index} (${input})`)
                        continue
                    }

                    if (segment.length > 0) route.segments.push(segment)
                    continue
                }

                if (input.startsWith("./", index)) {
                    if (index != 0) throw new RouteParseError(`Unexpected "./", it should only be used on the start of the route at ${index} (${input})`)
                    if (base == null) throw new RouteParseError(`Unexpected "./", it cannot be used without a base route at ${index} (${input})`)
                    index++
                    continue
                }

                if (input.startsWith("@")) {
                    index++
                    route.component = consumeToken()
                    route.query = {}
                    didComponent = true
                    continue
                }

                throw new RouteParseError(`Unexpected "${input[index]}" at ${index} (${input})`)
            }
        }

        return route
    }

    public static readonly ROOT = Route.parse("/")
}

export const Route_t = new class RouteType extends Type<Route> {
    public readonly name = "Route"
    public getDefinition(indent: string): string {
        return indent + this.name
    }

    public default(): Route {
        return new Route()
    }
    public verify(value: unknown): Route {
        if (!(value instanceof Route)) throw new DeserializationError("Expected route")
        return value
    }
    protected _serialize(source: Route, serializer: Serializer<unknown, unknown, unknown, unknown>): unknown {
        return serializer.createPrimitive(source.toString())
    }

    protected _deserialize(handle: any, deserializer: Deserializer<unknown, unknown, unknown, unknown>): Route {
        const value = Type.string["_deserialize"](handle, deserializer)
        return Route.parse(value)
    }
}

const FormData_t = Type.passthrough(null as any)
export const RemoteUIContract = StructSyncContract.define(class RemoteUI extends Struct.define("RemoteUI", {}) { }, {
    openSession: ActionType.define("openSession", Type.object({ route: Route_t }), Type.object({ session: Type.string, root: UIElement_t, forms: FormData_t.as(Type.map) })),
    renderSession: ActionType.define("rendedSession", Type.object({ session: Type.string, slot: Route_t }), UIElement_t),
    closeSession: ActionType.define("closeSession", Type.object({ session: Type.string }), Type.empty),
    triggerAction: ActionType.define("triggerAction", Type.object({ session: Type.string, action: Type.string, form: FormData_t, sender: Type.string.as(Type.nullable) }), Type.empty)
}, {
    onSessionUpdate: EventType.define("onSessionUpdate", Type.object({ session: Type.string, root: UIElement_t })),
    onFormSet: EventType.define("onFormSet", Type.object({ session: Type.string, form: Type.string, data: FormData_t })),
    onFormUpdate: EventType.define("onFormUpdate", Type.object({ session: Type.string, form: Type.string, mutations: FormData_t.as(Type.array) })),
    onSessionClosed: EventType.define("onSessionClosed", Type.object({ session: Type.string, redirect: Route_t.as(Type.nullable) }))
})

declare const TYPE_MARKER: unique symbol
export interface FormModelProperty<T> {
    [TYPE_MARKER]: T
}
