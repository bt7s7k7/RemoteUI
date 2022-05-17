import { defineComponent, shallowRef } from "vue"
import { delayedPromise } from "../comTypes/util"
import { IDProvider } from "../dependencyInjection/commonServices/IDProvider"
import { MessageBridge } from "../dependencyInjection/commonServices/MessageBridge"
import { DIContext } from "../dependencyInjection/DIContext"
import { RemoteUIController, RouteResolver } from "../remoteUIBackend/RemoteUIController"
import { defineRouteController } from "../remoteUIBackend/RouteController"
import { UI } from "../remoteUICommon/UIElement"
import { RemoteUIProxy } from "../remoteUIFrontend/RemoteUIProxy"
import { RemoteUIView } from "../remoteUIFrontend/RemoteUIView"
import { Type } from "../struct/Type"
import { StructSyncClient } from "../structSync/StructSyncClient"
import { ClientError, StructSyncServer } from "../structSync/StructSyncServer"
import { StructSyncSession } from "../structSync/StructSyncSession"

export const RemoteUITest = (defineComponent({
    name: "RemoteUITest",
    setup(props, ctx) {
        const context = new DIContext()
        context.provide(IDProvider, () => new IDProvider.Incremental())
        context.provide(MessageBridge, () => new MessageBridge.Dummy())
        const server = context.provide(StructSyncServer, "default")
        const sessions = context.provide(StructSyncSession, "default")
        const client = context.provide(StructSyncClient, "default")

        const controller = context.instantiate(() => new RemoteUIController().register())
        const proxy = shallowRef<RemoteUIProxy | null>(null)
        RemoteUIProxy.make(context, { track: true }).then(v => {
            proxy.value = v
        })

        controller.routes = new RouteResolver.Static({
            routes: {
                index: defineRouteController(ctx => {
                    let count = 0

                    const increment = ctx.action("increment", async (event) => {
                        await delayedPromise(100)

                        count++
                        ctx.controller.update()
                    }, { waitForCompletion: true })

                    const form = ctx.form("form", Type.object({ hello: Type.string, output: Type.string }))
                    const submitForm = form.action("submit", event => {
                        form.update(event.session, { ...event.data, output: event.data.hello.toUpperCase() })
                    })

                    const throwError = ctx.action("throwError", async () => {
                        throw new ClientError("This is an error!")
                    }, { waitForCompletion: true })

                    return () => (
                        new UI.Frame({
                            axis: "column",
                            gap: 2,
                            children: [
                                new UI.Frame({
                                    axis: "row",
                                    gap: 2,
                                    children: [
                                        new UI.Input({
                                            model: form.model.hello,
                                            fill: true
                                        }),
                                        new UI.Button({
                                            text: "Submit",
                                            onClick: submitForm.id
                                        })
                                    ]
                                }),
                                new UI.Output({
                                    model: form.model.output
                                }),
                                new UI.Frame({
                                    axis: "row",
                                    gap: 2,
                                    children: [
                                        new UI.Label({
                                            text: `Count: ${count}`
                                        }),
                                        new UI.Button({
                                            text: "Increment",
                                            onClick: increment.id
                                        }),
                                        new UI.Button({
                                            text: "Throw",
                                            onClick: throwError.id
                                        })
                                    ]
                                })
                            ]
                        })
                    )
                })
            }
        })

        return () => (
            <div class="p-4">
                <div class="w-500 h-500 border flex">
                    {proxy.value ? <RemoteUIView class="flex-fill" route="/" remoteUI={proxy.value} /> : "Loading..."}
                </div>
            </div>
        )
    }
}))