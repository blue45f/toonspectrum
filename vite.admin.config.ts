import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(rootDir, "apps/admin");

export default defineConfig({
  root: adminRoot,
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 4174,
  },
  preview: {
    host: "0.0.0.0",
    port: 4175,
  },
  build: {
    outDir: path.resolve(rootDir, "dist-admin"),
    emptyOutDir: true,
  },
});
