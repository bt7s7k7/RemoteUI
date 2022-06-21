import { makeRandomID } from "../comTypes/util"
import { DISPOSE } from "../eventLib/Disposable"
import { EventListener } from "../eventLib/EventListener"
import { RemoteUIContract, Route } from "../remoteUICommon/RemoteUI"
import { UI } from "../remoteUICommon/UIElement"
import { ClientError } from "../structSync/StructSyncServer"
import { defineRouteController, RouteController } from "./RouteController"

export interface RouteResolver {
    resolveRoute(route: Route, offset: number): RouteController | null
}

export namespace RouteResolver {
    export class Static implements RouteResolver {
        public resolveRoute(route: Route, offset: number): RouteController | null {
            let segment = route.segments[offset]
            if (segment == null) {
                if (route.component) {
                    if (!this.options.components) return null
                    const component = this.options.components[route.component]
                    if (!component) return null
                    return component
                }

                segment = "index"
            }

            if (!this.options.routes) return null
            const entry = this.options.routes[segment]
            if (!entry) return null

            if (entry instanceof RouteController) {
                return entry
            } else {
                return entry.resolveRoute(route, offset + 1)
            }
        }

        constructor(
            public readonly options: { routes?: Record<string, RouteResolver | RouteController>, components?: Record<string, RouteController> } = {}
        ) { }
    }
}

export class RemoteUISession extends EventListener {
    public updateForm(form: string, data: any) {
        this.controller.onFormUpdate.emit({ session: this.id, form, data })
    }

    public update() {
        this.controller.onSessionUpdate.emit({ session: this.id, root: this.routeController.makeUI(this) })
    }

    public close() {
        this.controller.onSessionClosed.emit({ session: this.id })
        this.controller["sessions"].delete(this.id)
        this.dispose()
    }

    constructor(
        public readonly controller: RemoteUIController,
        public readonly id: string,
        public readonly route: Route,
        public readonly routeController: RouteController
    ) { super() }
}

const NULL_ROUTE_RESOLVER: RouteResolver = {
    resolveRoute() { return null }
}

const DEFAULT_ROUTE = defineRouteController(ctx => {
    return () => (
        UI.label({
            text: "Page not found",
            monospace: true
        })
    )
})

export class RemoteUIController extends RemoteUIContract.defineController() {
    public routes = NULL_ROUTE_RESOLVER

    protected sessions = new Map<string, RemoteUISession>()

    public [DISPOSE]() {
        for (const session of this.sessions.values()) {
            session.dispose()
        }

        super[DISPOSE]()
    }

    public impl = super.impl({
        closeSession: async ({ session: sessionID }) => {
            const session = this.sessions.get(sessionID)
            if (!session) throw new ClientError(`Session "${sessionID}" not found`)

            session.dispose()
            this.sessions.delete(sessionID)
        },
        openSession: async ({ route }) => {
            const controller = this.routes.resolveRoute(route, 0) ?? DEFAULT_ROUTE
            const session = new RemoteUISession(this, makeRandomID(), route, controller)

            controller["sessions"].add(session.getWeakRef())

            this.sessions.set(session.id, session)

            return {
                session: session.id,
                forms: controller.makeForms(),
                root: controller.makeUI(session)
            }
        },
        triggerAction: async ({ action, session: sessionID, form, sender }) => {
            const session = this.sessions.get(sessionID)
            if (!session) throw new ClientError(`Session "${sessionID}" not found`)

            const controller = session.routeController
            await controller.handleAction(session, action, form, sender)
        }
    })
}