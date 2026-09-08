import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [react()],
  // The web app moved to apps/web; `@` must resolve to its source root or every
  // `@/shared/...` import in the feedback page fails to resolve at build time.
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  build: {
    outDir: "dist-feedback-review",
    rolldownOptions: { input: "e2e/feedback-community.html" },
  },
});
