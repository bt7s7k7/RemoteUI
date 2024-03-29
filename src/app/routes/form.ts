import { formEventToMutation, FormRenderer } from "../../remoteUIBackend/FormRenderer"
import { defineRouteController } from "../../remoteUIBackend/RouteController"
import { UI } from "../../remoteUICommon/UIElement"
import { Type } from "../../struct/Type"

const Person_t = Type.object({
    name: Type.string,
    status: Type.enum("here", "there"),
    exists: Type.boolean,
    home: Type.object({
        address: Type.string,
        available: Type.boolean
    })
})

export default defineRouteController(ctx => {
    const form = ctx.form("form", Type.object({
        person: Person_t
    }), () => ({
        person: {
            name: "Foo",
            exists: true,
            status: "here",
            home: {
                address: "there",
                available: false
            }
        }
    }))

    const submit = form.action("submit", (event) => {
        form.update("all", formEventToMutation(event))
    })

    const test = ctx.action("test", () => {
        form.update("all", v => v.person.name = Date.now().toString())
    })

    const formRenderer = new FormRenderer({ type: Person_t, model: form.model.person, renderChildren: true, onChange: submit })

    return () => (
        UI.frame({
            axis: "column",
            children: [
                formRenderer.renderFrame(),
                UI.frame({
                    axis: "row",
                    children: [
                        UI.button({ text: "Test", onClick: test })
                    ]
                })
            ]
        })
    )
})