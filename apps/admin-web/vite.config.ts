import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const adminRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: adminRoot,
  resolve: { alias: { "@": path.resolve(adminRoot, "src") } },
  plugins: [react()],
  server: { host: "0.0.0.0", port: 4174 },
  preview: { host: "0.0.0.0", port: 4175 },
  build: {
    outDir: path.resolve(adminRoot, "dist"),
    emptyOutDir: true,
  },
});
