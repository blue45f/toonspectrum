import { fileURLToPath, URL } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.NEST_API_URL ?? "http://127.0.0.1:4001";

export default defineConfig(({ mode }) => ({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  // 정적 카탈로그 모드에선 lib/server/* (예: live.ts) 가 브라우저 번들로 끌려오며
  // 모듈 로드 시점에 process.env.* 를 읽어 "process is not defined" 백스크린을 유발한다.
  // 브라우저엔 서버 env 가 없으므로 빈 객체로 치환해 서버 기본값으로 폴백시키고,
  // 라이브러리가 참조하는 NODE_ENV 만 보존한다. (NestJS api 는 별도 빌드라 실 env 유지)
  define: {
    "process.env": JSON.stringify({
      NODE_ENV: mode === "production" ? "production" : "development",
    }),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
}));
