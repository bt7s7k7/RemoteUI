import { markRaw, reactive } from "vue"
import { RemoteUIContract, Route } from "../remoteUICommon/RemoteUI"
import { UIElement } from "../remoteUICommon/UIElement"
import { Mutation } from "../struct/Mutation"

export class RemoteUISessionHandle {
    public open = true
    public depth = 0
    public closedByHost = false
    public redirected: Route | null = null
    public root: UIElement | null = null
    public id: string = null!
    public forms: Map<string, any> = new Map()
    public loading = 0
    public error: string | null = null

    public triggerAction(action: string, form: any, sender: string | null | undefined) {
        if (!this.open) return Promise.reject(new Error("Cannot trigger action, session is closed"))
        return this.proxy.triggerAction({ session: this.id, action, form, sender })
    }

    public redirect(redirect: Route) {
        this.close()
        this.redirected = redirect
    }

    public close() {
        if (!this.open) return

        this.open = false
        if (!this.id) return

        this.proxy.closeSession({ session: this.id })
        this.proxy["sessions"].delete(this.id)
    }

    constructor(
        public readonly proxy: RemoteUIProxy,
        public readonly route: Route
    ) {
        return reactive(this) as this
    }
}

export class RemoteUIProxy extends RemoteUIContract.defineProxy() {
    protected sessions = new Map<string, RemoteUISessionHandle>()

    public getSession(route: Route) {
        const sessionHandle = new RemoteUISessionHandle(this, route)
        this.openSession({ route }).then(({ forms, root, session }) => {
            if (!sessionHandle.open) {
                this.closeSession({ session })
                return
            }

            sessionHandle.id = session
            sessionHandle.root = root
            sessionHandle.forms = forms

            this.sessions.set(session, sessionHandle)
        }, error => {
            // eslint-disable-next-line no-console
            console.error(error)
            sessionHandle.open = false
        })
        return sessionHandle
    }

    constructor(...args: ConstructorParameters<ReturnType<typeof RemoteUIContract.defineProxy>>) {
        super(...args)
        const self = markRaw(this)

        this.onSessionUpdate.add(null, ({ root, session }) => {
            const sessionHandle = this.sessions.get(session)
            if (!sessionHandle) return

            sessionHandle.root = root
        })

        this.onFormSet.add(null, ({ form, session, data }) => {
            const sessionHandle = this.sessions.get(session)
            if (!sessionHandle) return

            sessionHandle.forms.set(form, data)
        })

        this.onFormUpdate.add(null, ({ form, session, mutations }) => {
            const sessionHandle = this.sessions.get(session)
            if (!sessionHandle) return

            const formData = sessionHandle.forms.get(form)
            for (const mutation of mutations) {
                Mutation.apply(formData, null, mutation)
            }
        })

        this.onSessionClosed.add(null, ({ session, redirect }) => {
            const handle = this.sessions.get(session)
            if (!handle) return

            this.sessions.delete(session)
            handle.open = false
            handle.closedByHost = true
            if (redirect) {
                handle.redirected = redirect
            } else {
                handle.error = "Session closed by host"
            }
        })

        return self
    }
}
