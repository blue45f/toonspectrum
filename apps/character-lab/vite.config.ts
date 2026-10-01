import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const labRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: labRoot,
  resolve: { alias: { "@": path.resolve(labRoot, "src") } },
  plugins: [react()],
  server: { host: "0.0.0.0", port: 4176 },
  preview: { host: "0.0.0.0", port: 4177 },
  build: {
    outDir: path.resolve(labRoot, "dist"),
    emptyOutDir: true,
    // top-level await와 WebGPU 코드를 다운레벨하지 않는다.
    target: "esnext",
  },
  // Worker는 ES module 형식으로 빌드해 import를 그대로 유지한다.
  worker: { format: "es" },
});
