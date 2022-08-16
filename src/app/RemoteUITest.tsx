import { computed, defineComponent, ref, shallowRef } from "vue"
import { useRoute, useRouter } from "vue-router"
import { camelToTitleCase } from "../comTypes/util"
import { IDProvider } from "../dependencyInjection/commonServices/IDProvider"
import { MessageBridge } from "../dependencyInjection/commonServices/MessageBridge"
import { DIContext } from "../dependencyInjection/DIContext"
import { RemoteUIController, RouteResolver } from "../remoteUIBackend/RemoteUIController"
import { Route } from "../remoteUICommon/RemoteUI"
import { RemoteUIProxy } from "../remoteUIFrontend/RemoteUIProxy"
import { RemoteUIView } from "../remoteUIFrontend/RemoteUIView"
import { StructSyncClient } from "../structSync/StructSyncClient"
import { StructSyncServer } from "../structSync/StructSyncServer"
import { StructSyncSession } from "../structSync/StructSyncSession"
import { Button } from "../vue3gui/Button"
import { TextField } from "../vue3gui/TextField"

const routesList = Object.entries(import.meta.globEager("./routes/*.ts")).map(([name, module]) => {
    name = name.match(/^\.\/routes\/([^.]*)/)![1]
    return [name, module["default"]]
})

export const RemoteUITest = (defineComponent({
    name: "RemoteUITest",
    setup(props, ctx) {
        const route = useRoute()
        const router = useRouter()

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

        const routes = controller.routes = new RouteResolver.Static({
            routes: Object.fromEntries(routesList)
        })

        const selectedRoute = computed({
            get: () => (route.query["selected"] as string | undefined) ?? "/" + routesList[0][0],
            set: (v) => router.replace({ query: { selected: v } })
        })

        const testRoute = ref("")
        const testBase = ref("")
        const testResult = computed(() => {
            if (testRoute.value == "") return ""

            try {
                const result = Route.parse(testRoute.value, testBase.value == "" ? null : Route.parse(testBase.value))
                return result.toString() + "\n\n" + JSON.stringify(result, null, 4)
            } catch (err: any) {
                return err.message
            }
        })

        return () => (
            <div class="p-4 flex-fill flex row gap-2">
                <div class="flex-basis-500 p-2 rounded border flex">
                    {proxy.value ? <RemoteUIView class="flex-fill" route={selectedRoute.value} remoteUI={proxy.value} /> : "Loading..."}
                </div>
                <div class="flex-basis-500 p-2 rounded border flex">
                    {proxy.value ? <RemoteUIView class="flex-fill" route={selectedRoute.value} remoteUI={proxy.value} /> : "Loading..."}
                </div>
                <div class="flex flex-basis-100 column">
                    {Object.keys(routes.options.routes!).map(key => (
                        <Button class="text-left" clear onClick={() => selectedRoute.value = "/" + key}>{camelToTitleCase(key)}</Button>
                    ))}
                </div>
                <div class="flex-basis-500 flex column">
                    <div class="flex row">
                        Route:&nbsp;<TextField class="flex-fill" vModel={testRoute.value} />
                        &nbsp;
                        Base:&nbsp;<TextField class="flex-fill" vModel={testBase.value} />
                    </div>
                    <pre>{testResult.value}</pre>
                </div>
            </div>
        )
    }
}))