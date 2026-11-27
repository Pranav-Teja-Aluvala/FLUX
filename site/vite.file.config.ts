import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  publicDir: false,
  build: {
    outDir: ".local-preview",
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./main.ts", import.meta.url)),
      name: "FluxPreview",
      formats: ["iife"],
      fileName: () => "flux.js",
    },
  },
});
