import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  base: "./",
  plugins: [react()],
  resolve: { alias: { "@core": resolve(__dirname, "src/core") } },
  build: { outDir: "../dist-web", emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 800 },
  test: { root: "." },
});
