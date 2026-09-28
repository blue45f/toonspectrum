import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = path.resolve(repositoryRoot, "apps/web");
const reviewEntries = ["e2e/feedback-community.html", "e2e/community-replies.html"];

export default defineConfig({
  root: repositoryRoot,
  base: "./",
  publicDir: false,
  cacheDir: path.resolve(repositoryRoot, ".qa/feedback-vite-cache"),
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(webRoot, "src") },
  },
  // 댓글 진입점도 선탐색해 첫 검사 중 의존성 재최적화가 화면을 재시작하지 않게 한다.
  optimizeDeps: { entries: reviewEntries },
  server: { warmup: { clientFiles: reviewEntries } },
  build: {
    outDir: "dist-feedback-review",
    rolldownOptions: { input: reviewEntries },
  },
});
