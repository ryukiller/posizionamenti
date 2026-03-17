import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          preload: path.join(__dirname, "src/main/preload.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": path.join(__dirname, "src/renderer"),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: path.join(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
