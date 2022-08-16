import { defineRouteController } from "../../remoteUIBackend/RouteController"
import { UI } from "../../remoteUICommon/UIElement"

export default defineRouteController(ctx => {

    return () => (
        UI.frame({
            axis: "column",
            gap: 2,
            children: [
                UI.frame({
                    axis: "column",
                    padding: "a2",
                    basis: 200,
                    border: true,
                    rounded: true,
                    children: [
                        UI.embed({
                            route: "../form",
                        })
                    ]
                }),
                UI.frame({
                    axis: "column",
                    padding: "a2",
                    basis: 200,
                    border: true,
                    rounded: true,
                    children: [
                        UI.embed({
                            route: "../form",
                        })
                    ]
                })
            ]
        })
    )
})