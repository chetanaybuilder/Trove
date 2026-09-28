import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
export default defineConfig({
  root: "client", plugins: [react()],
  css: { postcss: { plugins: [tailwindcss("./tailwind.config.js"), autoprefixer()] } },
  build: { outDir: "../dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787", "/auth": "http://localhost:8787" } },
});
