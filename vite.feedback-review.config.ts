import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = path.resolve(repositoryRoot, "apps/web");

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: {
      // Match root vite.config.ts so FeedbackPage and feedback hooks resolve after the apps/web move.
      "@": path.resolve(webRoot, "src"),
    },
  },
  build: {
    outDir: "dist-feedback-review",
    rolldownOptions: { input: "e2e/feedback-community.html" },
  },
});
