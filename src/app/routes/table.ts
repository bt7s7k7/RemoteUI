import { makeRandomID } from "../../comTypes/util"
import { formEventToMutation, TableRenderer } from "../../remoteUIBackend/FormRenderer"
import { defineRouteController } from "../../remoteUIBackend/RouteController"
import { UI } from "../../remoteUICommon/UIElement"
import { Type } from "../../struct/Type"

const Person_t = Type.object({
    name: Type.string,
    exists: Type.boolean
})

export default defineRouteController(ctx => {
    const form = ctx.form("form", Type.object({
        people: Person_t.as(Type.record)
    }), () => ({
        people: {
            foo: { name: "foo", exists: false },
            bar: { name: "bar", exists: true },
            baz: { name: "baz", exists: false }
        }
    }))

    const submit = form.action("submit", (event) => {
        form.update("all", formEventToMutation(event))
    })

    const add = ctx.action("add", () => {
        const name = makeRandomID()
        form.update("all", v => v.people[name] = { name, exists: Math.random() > 0.5 })
    })

    const tableRenderer = new TableRenderer({ type: Person_t, model: form.model.people, onChange: submit })

    return () => (
        UI.frame({
            axis: "column",
            gap: 2,
            children: [
                tableRenderer.render(),
                UI.button({
                    text: "Add Person",
                    onClick: add
                })
            ]
        })
    )
})