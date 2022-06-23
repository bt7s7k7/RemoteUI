import { markRaw, reactive } from "vue"
import { RemoteUIContract, Route } from "../remoteUICommon/RemoteUI"
import { UIElement } from "../remoteUICommon/UIElement"
import { MutationUtil } from "../structSync/MutationUtil"

export class RemoteUISessionHandle {
    public open = true
    public root: UIElement | null = null
    public id: string = null!
    public forms: Record<string, any> = {}
    public loading = 0
    public error: string | null = null

    public triggerAction(action: string, form: any, sender: string | null | undefined) {
        return this.proxy.triggerAction({ session: this.id, action, form, sender })
    }

    public close() {
        if (this.open) return

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

            sessionHandle.forms[form] = data
        })

        this.onFormUpdate.add(null, ({ form, session, mutations }) => {
            const sessionHandle = this.sessions.get(session)
            if (!sessionHandle) return

            const formData = sessionHandle.forms[form]
            for (const mutation of mutations) {
                MutationUtil.applyMutation(formData, null, mutation)
            }
        })

        return self
    }
}