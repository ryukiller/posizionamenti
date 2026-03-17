"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_vite_1 = require("electron-vite");
const plugin_react_swc_1 = __importDefault(require("@vitejs/plugin-react-swc"));
const path_1 = __importDefault(require("path"));
exports.default = (0, electron_vite_1.defineConfig)({
    main: {
        plugins: [(0, electron_vite_1.externalizeDepsPlugin)()],
    },
    preload: {
        plugins: [(0, electron_vite_1.externalizeDepsPlugin)()],
        build: {
            rollupOptions: {
                input: {
                    preload: path_1.default.join(__dirname, "src/main/preload.ts"),
                },
            },
        },
    },
    renderer: {
        resolve: {
            alias: {
                "@renderer": path_1.default.join(__dirname, "src/renderer"),
            },
        },
        plugins: [(0, plugin_react_swc_1.default)()],
        build: {
            rollupOptions: {
                input: path_1.default.join(__dirname, "src/renderer/index.html"),
            },
        },
    },
});
//# sourceMappingURL=electron.vite.config.js.map