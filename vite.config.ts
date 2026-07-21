import { fileURLToPath, URL } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.NEST_API_URL ?? "http://127.0.0.1:4001";
const ENTRY_PRELOAD_EXCLUSIONS = [
  "studio-konva-runtime",
  "StudioVrmPoser",
  "three.module",
  "three-vrm.module",
  "GLTFLoader",
  "lucide-studio-core-icons",
];
const INITIAL_ICON_MODULES = new Set([
  "chevron-left",
  "chevron-right",
  "pause",
  "play",
  "sparkles",
  "star",
]);
const STUDIO_CORE_ICON_MODULES = new Set([
  "arrow-up-to-line",
  "bookmark",
  "book-open",
  "check",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "chevron-up",
  "circle",
  "circle-check",
  "clipboard-check",
  "command",
  "copy",
  "credit-card",
  "download",
  "droplets",
  "eye",
  "eye-off",
  "eraser",
  "film",
  "flip-horizontal-2",
  "grid-2x2",
  "hand",
  "history",
  "image",
  "image-plus",
  "images",
  "layers",
  "layout-grid",
  "layout-template",
  "loader-circle",
  "lock",
  "lock-open",
  "maximize-2",
  "message-circle",
  "message-square",
  "minus",
  "minimize-2",
  "mouse-pointer-2",
  "move",
  "paint-bucket",
  "paintbrush",
  "palette",
  "pen-tool",
  "pencil",
  "pipette",
  "plus",
  "redo-2",
  "rotate-ccw",
  "scan-line",
  "scissors",
  "send",
  "shapes",
  "shield-check",
  "sliders-horizontal",
  "smartphone",
  "smile",
  "spline",
  "square",
  "star",
  "trash-2",
  "type",
  "undo-2",
  "upload",
  "users-round",
  "video",
  "wand-sparkles",
]);

function iconModuleName(id: string) {
  if (!id.includes("/node_modules/lucide-react/dist/esm/icons/")) return null;
  const fileName = id.slice(id.lastIndexOf("/") + 1);
  if (!fileName.endsWith(".mjs")) return null;
  return fileName.slice(0, -4);
}

function isInitialIconModule(id: string) {
  const moduleName = iconModuleName(id);
  return Boolean(moduleName && INITIAL_ICON_MODULES.has(moduleName));
}

function isStudioCoreIconModule(id: string) {
  const moduleName = iconModuleName(id);
  return Boolean(moduleName && STUDIO_CORE_ICON_MODULES.has(moduleName));
}

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
  build: {
    // CI reads this graph to enforce the mobile Studio's initial-JS budgets and lazy-only engines.
    manifest: true,
    modulePreload: {
      resolveDependencies(_filename, deps, context) {
        if (context.hostType !== "html") return deps;
        return deps.filter((dep) => !ENTRY_PRELOAD_EXCLUSIONS.some((chunkName) => dep.includes(chunkName)));
      },
    },
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (
            id.endsWith("/src/domains/creator/studio-tool-hints.ts")
            || id.endsWith("/src/domains/creator/studio-view-action-hints.ts")
            || id.endsWith("/src/domains/creator/studio-inspector-layout.ts")
          ) {
            // The view HUD, always-visible rails and inspector shell share this small UI
            // vocabulary. Co-locating it avoids an extra HTTP request on every Studio launch.
            return "studio-tool-hints";
          }
          if (
            id.endsWith("/lib/studio-raster-asset-admission.ts")
            || id.endsWith("/src/domains/creator/studio-background-gradient-color-stops.ts")
            || id.endsWith("/src/domains/creator/studio-characters.ts")
          ) {
            // These dependency-free contracts are shared by several Studio lazy entries. Keeping
            // them together avoids three sub-kilobyte HTTP requests on every editor launch.
            return "studio-core-micro-contracts";
          }
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/") ||
            id.includes("/node_modules/react-router/") ||
            id.includes("/node_modules/react-router-dom/")
          ) {
            return "react-runtime";
          }
          if (id.includes("/node_modules/konva/") || id.includes("/node_modules/react-konva/")) {
            return "studio-konva-runtime";
          }
          if (isInitialIconModule(id)) {
            return "lucide-initial-icons";
          }
          if (isStudioCoreIconModule(id)) {
            return "lucide-studio-core-icons";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/socket.io": {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
}));
