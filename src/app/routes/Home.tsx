import { defineComponent } from "vue"
import { HelloWorld } from "../../remoteUI/HelloWorld"

export const Home = defineComponent({
    name: "Home",
    setup(props, ctx) {
        return () => (
            <HelloWorld />
        )
    }
})