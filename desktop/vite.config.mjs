import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const directory = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root: directory,
  base: "/",
  publicDir: ".generated/public",
  resolve: { alias: { "@": fileURLToPath(new URL(".generated/src", import.meta.url)) } },
  plugins: [tailwindcss(), react()],
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false, target: "chrome140" },
});
