import { fileURLToPath, URL } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import {
  STUDIO_CROSS_ORIGIN_ISOLATION_HEADERS,
  STUDIO_CROSS_ORIGIN_ISOLATION_WORKER_HEADERS,
  isStudioCrossOriginIsolationDocumentRequest,
  isStudioCrossOriginIsolationWorkerRequest,
} from "./src/app/studio-cross-origin-isolation";

const apiTarget = process.env.NEST_API_URL ?? "http://127.0.0.1:4001";
// Chunks that must never be pulled into the entry document's <link rel="modulepreload"> set.
// A modulepreload is a highest-priority fetch on every route, so anything here competes with the
// entry script and the render-blocking stylesheet for the first round trip.
// "i18n" covers the shared dictionary chunk and the route i18n loaders: translations resolve
// through an explicit ko/en fallback chain, so nothing on the critical path blocks on them.
const ENTRY_PRELOAD_EXCLUSIONS = [
  "studio-konva-runtime",
  "StudioVrmPoser",
  "three.module",
  "three-vrm.module",
  "GLTFLoader",
  "lucide-studio-core-icons",
  "i18n",
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
  "a-large-small",
  "align-justify",
  "arrow-up-to-line",
  "asterisk",
  "blend",
  "bookmark",
  "book-open",
  "brush",
  "check",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "chevron-up",
  "circle",
  "circle-check",
  "circle-dashed",
  "circle-dot",
  "circle-ellipsis",
  "clipboard-check",
  "cloud",
  "cloud-fog",
  "command",
  "copy",
  "credit-card",
  "download",
  "droplets",
  "eye",
  "eye-off",
  "eraser",
  "feather",
  "fence",
  "film",
  "flame",
  "flip-horizontal-2",
  "flower-2",
  "footprints",
  "gem",
  "grid-2x2",
  "grid-3x3",
  "grip",
  "hand",
  "heart",
  "highlighter",
  "history",
  "image",
  "image-plus",
  "images",
  "layers",
  "layers-3",
  "layout-grid",
  "layout-template",
  "leaf",
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
  "paint-roller",
  "paintbrush",
  "palette",
  "pen",
  "pen-line",
  "pen-tool",
  "pencil",
  "pipette",
  "plus",
  "redo-2",
  "rectangle-horizontal",
  "rectangle-vertical",
  "rows-3",
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
  "spray-can",
  "square",
  "star",
  "stamp",
  "sun",
  "trees",
  "trash-2",
  "type",
  "undo-2",
  "upload",
  "users-round",
  "video",
  "waves",
  "wand-sparkles",
  "wheat",
  "wind",
]);

function iconModuleName(id: string) {
  if (!id.includes("lucide-react") || !id.includes("/icons/")) return null;
  const fileName = id.slice(id.lastIndexOf("/") + 1);
  const match = fileName.match(/^(.+?)\.(?:[cm]?[jt]s)$/);
  return match ? match[1] : null;
}

function isInitialIconModule(id: string) {
  const moduleName = iconModuleName(id);
  return Boolean(moduleName && INITIAL_ICON_MODULES.has(moduleName));
}

function isStudioCoreIconModule(id: string) {
  const moduleName = iconModuleName(id);
  return Boolean(moduleName && (STUDIO_CORE_ICON_MODULES.has(moduleName) || Boolean(moduleName)));
}

/**
 * Folder-move leftovers sometimes leave production specifiers pointing at `*.test.ts`.
 * Resolve the sibling implementation when one exists so the studio bundle never binds
 * runtime exports (e.g. STUDIO_RASTER_CRDT_VERSION) from a test module.
 */
function preferImplementationOverTestModulePlugin(): Plugin {
  return {
    name: "toonspectrum-prefer-implementation-over-test-module",
    apply: "serve",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (process.env.VITEST || !importer) return null;
      if (!source.includes(".test.")) return null;
      if (/\.test\.tsx?(?:\?|$)/.test(importer)) return null;
      if (!/\.test\.tsx?(?:\?|$)/.test(source)) return null;
      const rewritten = source.replace(/\.test\.(tsx?)(?=\?|$)/, ".$1");
      return this.resolve(rewritten, importer, { ...options, skipSelf: true });
    },
  };
}

function studioCrossOriginIsolationPlugin(): Plugin {
  const applyHeaders = (
    request: {
      readonly url?: string;
      readonly method?: string;
      readonly headers: {
        readonly accept?: string;
        readonly "sec-fetch-dest"?: string;
      };
    },
    response: { setHeader(name: string, value: string): void },
  ) => {
    if (isStudioCrossOriginIsolationWorkerRequest({
      url: request.url,
      method: request.method,
      accept: request.headers.accept,
      secFetchDest: request.headers["sec-fetch-dest"],
    })) {
      for (const [name, value] of Object.entries(
        STUDIO_CROSS_ORIGIN_ISOLATION_WORKER_HEADERS,
      )) {
        response.setHeader(name, value);
      }
    }
    if (
      !isStudioCrossOriginIsolationDocumentRequest({
        url: request.url,
        method: request.method,
        accept: request.headers.accept,
        secFetchDest: request.headers["sec-fetch-dest"],
      })
    ) {
      return;
    }
    for (const [name, value] of Object.entries(STUDIO_CROSS_ORIGIN_ISOLATION_HEADERS)) {
      response.setHeader(name, value);
    }
  };

  return {
    name: "toonspectrum-studio-cross-origin-isolation",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        applyHeaders(request, response);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        applyHeaders(request, response);
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    preferImplementationOverTestModulePlugin(),
    studioCrossOriginIsolationPlugin(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
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
  // Industrial OCCT: allow Vite to emit wasm asset URLs for browser fetch/locateFile.
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["opencascade.js"],
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
            id.includes("/node_modules/@babylonjs/")
            || id.includes("/node_modules/babylonjs-gltf2interface/")
          ) {
            // Keep every Babylon package in one manifest-visible specialist chunk. The production
            // bundle audit can then prove that no generic shared vendor chunk leaks the engine
            // into the app, Studio route, or BG3D editor activation graphs.
            return "studio-bg3d-babylon-runtime";
          }
          // NOTE (2026-08-14): naming a chunk for the launch-time SQLite repositories was tried and
          // reverted. Every entry above is a dependency-free leaf; these repositories are not, so
          // rolldown made the named chunk the home of their whole shared color — a 671 KiB blob that
          // the BG3D editor (+28%) and even the admin/feedback routes then had to download. Merging
          // only pays when the merged modules carry nothing behind them.
          if (
            id.endsWith("/src/domains/creator/studio-workspaces.ts")
            || id.endsWith("/src/domains/creator/brush/studio-drawing-palettes.ts")
          ) {
            // Drawing-palette layout is part of the synchronously restored workspace envelope.
            // Co-locate both small models so Studio startup does not pay a separate shared-chunk
            // request while the lazy palette stack can reuse the already-loaded workspace chunk.
            return "studio-workspaces";
          }
          if (
            id.endsWith("/src/domains/creator/studio-selection-tools.ts")
            || id.endsWith("/src/domains/creator/studio-magic-wand.ts")
            || id.endsWith("/src/domains/creator/studio-alpha-lock.ts")
          ) {
            // Advanced Fill's user-triggered browser engine shares alpha-lock and magic-wand
            // primitives with the always-on selection graph. Keep those already-eager pure cores
            // in one chunk so the dynamic boundary does not add two launch-time HTTP requests.
            return "studio-selection-tools";
          }
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
            || id.endsWith("/src/domains/creator/brush/studio-brush-pack-format.ts")
            || id.endsWith("/src/domains/creator/brush/studio-brush-pack-id.ts")
            || id.endsWith("/src/domains/creator/brush/studio-brush-selection.ts")
            || id.endsWith("/src/domains/creator/studio-help-center-channel.ts")
            || id.endsWith("/src/domains/creator/studio-inspector-focus.ts")
            || id.endsWith("/src/domains/creator/studio-liquify-contract.ts")
            || id.endsWith("/src/domains/creator/studio-mobile-sheet-snap.ts")
            || id.endsWith("/src/domains/creator/studio-similar-style.ts")
            || id.endsWith("/src/domains/creator/studio-story-beats.ts")
            || id.endsWith("/src/domains/creator/studio-element-model.ts")
            || id.endsWith("/src/domains/creator/render/studio-raster-image-presentation.ts")
          ) {
            // These lightweight contracts are shared by several Studio lazy entries. Similar-style
            // and story-beat helpers are also synchronously needed by StudioPage, so leaving their
            // tiny bodies as separate shared chunks costs launch requests without preserving lazy
            // bytes. Element-model and raster-presentation are dependency-free linked-surface
            // contracts, so co-locating them also avoids recursive 3D dependency capture. The
            // procedural descriptor index is deliberately excluded so its 160 labels/previews stay
            // behind the full-library and saved-pro-brush dynamic boundaries.
            return "studio-core-micro-contracts";
          }
          if (
            id.endsWith("/src/domains/creator/brush/studio-paper-brush-response.ts")
            || id.endsWith("/src/domains/creator/brush/studio-paper-texture.ts")
          ) {
            // Paper texture is an unconditional dependency of the eager brush-response model.
            // Keep the tiny texture helper in the same request instead of paying a second chunk.
            return "studio-paper-brush-response";
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
        changeOrigin: false,
        ws: true,
      },
      "/studio-live": {
        target: apiTarget,
        changeOrigin: false,
        ws: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
}));
