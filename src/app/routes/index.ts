import { delayedPromise } from "../../comTypes/util"
import { defineRouteController } from "../../remoteUIBackend/RouteController"
import { Route } from "../../remoteUICommon/RemoteUI"
import { UI } from "../../remoteUICommon/UIElement"
import { Type } from "../../struct/Type"
import { ClientError } from "../../structSync/StructSyncServer"

export default defineRouteController(ctx => {
    let count = 0

    const increment = ctx.action("increment", async (event) => {
        await delayedPromise(100)

        count++
        ctx.controller.update()
    }, { waitForCompletion: true })

    const form = ctx.form("form", Type.object({ hello: Type.string, output: Type.string }))
    const submitForm = form.action("submit", event => {
        form.set(event.session, { ...event.data, output: event.data.hello.toUpperCase() })
    })

    const throwError = ctx.action("throwError", async () => {
        throw new ClientError("This is an error!")
    }, { waitForCompletion: true })

    const redirect = ctx.action("redirect", async (event) => {
        event.session.redirect(Route.parse("/table"))
    })

    return (session) => (
        session.route.query.test ? (
            UI.frame({
                gap: 2,
                children: [
                    UI.label({ text: "You are there" }),
                    UI.button({ text: "Go Back", to: "?test=" })
                ]
            })
        ) : (
            UI.frame({
                axis: "column",
                gap: 2,
                children: [
                    UI.frame({
                        axis: "row",
                        gap: 2,
                        children: [
                            UI.input({
                                model: form.model.hello,
                                fill: true
                            }),
                            UI.button({
                                text: "Submit",
                                onClick: submitForm
                            })
                        ]
                    }),
                    UI.output({
                        model: form.model.output
                    }),
                    UI.frame({
                        axis: "row",
                        gap: 2,
                        children: [
                            UI.label({
                                text: `Count: ${count}`
                            }),
                            UI.button({
                                text: "Increment",
                                onClick: increment.id
                            }),
                            UI.button({
                                text: "Throw",
                                onClick: throwError.id
                            })
                        ]
                    }),
                    UI.frame({
                        axis: "row",
                        gap: 2,
                        children: [
                            UI.button({
                                text: "Link",
                                to: "?test=true"
                            }),
                            UI.button({
                                text: "Redirect",
                                onClick: redirect
                            })
                        ]
                    }),
                    UI.frame({
                        axis: "row",
                        gap: 2,
                        children: [
                            UI.label({ text: `<span class="text-success">Rich text</span>`, richText: true })
                        ]
                    })
                ]
            })
        )
    )
})