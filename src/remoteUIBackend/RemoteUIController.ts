import { Readwrite } from "../comTypes/types"
import { makeRandomID } from "../comTypes/util"
import { DISPOSE } from "../eventLib/Disposable"
import { EventListener } from "../eventLib/EventListener"
import { RemoteUIContract, Route } from "../remoteUICommon/RemoteUI"
import { UI } from "../remoteUICommon/UIElement"
import { StructSyncMessages } from "../structSync/StructSyncMessages"
import { ClientError } from "../structSync/StructSyncServer"
import { defineRouteController, RouteController } from "./RouteController"

export interface RouteResolver {
    getRoute(name: string): RouteController | RouteResolver | null
    getComponent(name: string): RouteController | null
}

export namespace RouteResolver {
    export class Static implements RouteResolver {
        public getRoute(name: string) {
            return this.options.routes?.[name] ?? null
        }

        public getComponent(name: string) {
            return this.options.components?.[name] ?? null
        }

        constructor(
            public readonly options: { routes?: Record<string, RouteResolver | RouteController>, components?: Record<string, RouteController> } = {}
        ) { }
    }
}

export class RemoteUISession extends EventListener {
    public [DISPOSE]() {
        (this as Readwrite<this>).routeController = null!
        super[DISPOSE]()
    }

    public setForm(form: string, data: any) {
        this.controller.onFormSet.emit({ session: this.id, form, data })
    }

    public updateForm(form: string, mutations: StructSyncMessages.AnyMutateMessage[]): void {
        this.controller.onFormUpdate.emit({ session: this.id, form, mutations })
    }

    public update() {
        this.controller.onSessionUpdate.emit({ session: this.id, root: this.routeController.render(this, Route.ROOT) })
    }

    public close() {
        this.redirect(undefined)
    }

    public redirect(redirect: Route | null | undefined) {
        this.controller.onSessionClosed.emit({ session: this.id, redirect })
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
    getRoute() { return null },
    getComponent() { return null }
}

const DEFAULT_ROUTE = defineRouteController(ctx => {
    return () => (
        UI.label({
            text: "Page not found",
            monospace: true
        })
    )
})

function resolveRoute(root: RouteResolver, route: Route) {
    let resolver: RouteController | RouteResolver = root
    for (let i = 0; i < route.segments.length; i++) {
        const segment = route.segments[i]
        const target: RouteResolver | RouteController | null = resolver.getRoute(segment)
        if (target == null) return null
        resolver = target
        if (resolver instanceof RouteController) {
            if (i < route.segments.length) {
                break
            } else {
                return null
            }
        }
    }

    if (route.component) {
        if (resolver instanceof RouteController) {
            return null
        } else {
            const component = resolver.getComponent(route.component)
            if (component == null) return null
            resolver = component
        }
    }

    if (!(resolver instanceof RouteController)) {
        const index = resolver.getRoute("index")
        if (index == null) return null
        if (!(index instanceof RouteController)) return null
        resolver = index
    }

    return resolver
}

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
            const controller = resolveRoute(this.routes, route) ?? DEFAULT_ROUTE
            const session = new RemoteUISession(this, makeRandomID(), route, controller)

            controller["sessions"].add(session.getWeakRef())

            this.sessions.set(session.id, session)

            return {
                session: session.id,
                forms: controller.makeForms(),
                root: controller.render(session, Route.ROOT)
            }
        },
        renderSession: async ({ session: sessionID, slot }) => {
            const session = this.sessions.get(sessionID)
            if (!session) throw new ClientError(`Session "${sessionID}" not found`)

            return session.routeController.render(session, Route.ROOT)
        },
        triggerAction: async ({ action, session: sessionID, form, sender }) => {
            const session = this.sessions.get(sessionID)
            if (!session) throw new ClientError(`Session "${sessionID}" not found`)

            const controller = session.routeController
            await controller.handleAction(session, action, form, sender)
        }
    })
}