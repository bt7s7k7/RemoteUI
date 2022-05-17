/// <reference path="./.vscode/config.d.ts" />

const { project, github } = require("ucpem")

project.prefix("src").res("remoteUICommon",
    github("bt7s7k7/Struct").res("structSync")
)

project.prefix("src").res("remoteUIFrontend",
    github("bt7s7k7/Vue3GUI").res("vue3gui"),
    project.ref("remoteUICommon")
)

project.prefix("src").res("remoteUIBackend",
    project.ref("remoteUICommon"),
    github("bt7s7k7/CommonTypes").res("comTypes")
)