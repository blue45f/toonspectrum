import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  requireUnusedApiTarget,
  startIsolatedMarketApi,
  stopDetachedProcessTree,
  validateIsolatedMarketApiTarget,
} from "./isolated-market-api.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** 실제 CSRF/CORS 범위와 production preview의 명시적 빌드 선택을 함께 검사한다. */
export function studioReviewHostWebLaunch(environment, options = {}) {
  const web = new URL(environment.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:5181/");
  if (!/^http:\/\/127\.0\.0\.1:(5173|5181)$/u.test(web.origin)
    || web.pathname !== "/" || web.username || web.password || web.search || web.hash) {
    throw new Error("Choose the unused 127.0.0.1:5173 or :5181 Studio QA origin.");
  }
  const mode = options.webMode ?? "development";
  if (mode !== "development" && mode !== "preview") {
    throw new Error("Studio QA 웹 실행 방식은 development 또는 preview로 지정하세요.");
  }
  if (mode === "preview" && !options.webOutDir?.trim()) {
    throw new Error("정본 QA preview는 loopback realtime 설정으로 빌드한 webOutDir를 명시하세요.");
  }
  if (mode === "development" && options.webOutDir !== undefined) {
    throw new Error("webOutDir는 production preview 실행에서만 지정할 수 있습니다.");
  }
  const outDir = mode === "preview" ? resolve(ROOT, options.webOutDir) : null;
  const args = ["exec", "vite", ...(mode === "preview" ? ["preview"] : []),
    "--config", "apps/web/vite.config.ts", "--host", web.hostname, "--port", web.port, "--strictPort",
    ...(outDir ? ["--outDir", outDir] : [])];
  return { web, mode, outDir, args };
}

/** Own both processes, reject occupied ports, and restrict writes to a local test DB.
 * The shared isolated-API environment excludes local .env files and paid services.
 * @param {NodeJS.ProcessEnv} environment
 * @param {(context: {origin: URL, databaseTarget: import("./isolated-market-api.mjs").IsolatedMarketApiTarget}) => Promise<unknown>} verify
 * @param {{localReviewStorage?: import("./studio-review-local-storage-config.mjs").StudioReviewLocalStorageOptions,
 *   webMode?: "development" | "preview", webOutDir?: string, apiEntry?: "source" | "compiled"}} options
 */
export async function withStudioReviewHostQaRuntime(environment, verify, options = {}) {
  const { web, mode, outDir, args } = studioReviewHostWebLaunch(environment, options);
  if (outDir) {
    for (const file of ["index.html", ".vite/manifest.json"]) {
      await access(resolve(outDir, file)).catch(() => {
        throw new Error(`정본 QA 빌드에 ${file}이 없습니다. 지정한 outDir로 build:bundle을 먼저 실행하세요.`);
      });
    }
  }
  const target = validateIsolatedMarketApiTarget({
    rawApiUrl: environment.STUDIO_QA_API_BASE_URL ?? "http://127.0.0.1:4355/",
    rawDatabaseUrl: environment.TEST_DATABASE_URL,
    environment,
  });
  await requireUnusedApiTarget({ apiOrigin: web.origin, apiPort: Number(web.port) });
  if (options.localReviewStorage && Number(new URL(options.localReviewStorage.endpoint).port) === Number(web.port)) {
    throw new Error("Studio QA storage and web must have distinct loopback ports.");
  }
  const api = await startIsolatedMarketApi(target, {
    environment, localReviewStorage: options.localReviewStorage, entry: options.apiEntry,
  });
  let webProcess;
  try {
    webProcess = spawn("pnpm", args, {
      cwd: ROOT,
      detached: process.platform !== "win32",
      env: {
        PATH: environment.PATH,
        HOME: environment.HOME,
        TMPDIR: environment.TMPDIR,
        NODE_ENV: "test",
        NEST_API_URL: target.apiOrigin,
        // Authoring a shared source must receive the actual Nest CRDT save acknowledgement.
        // The existing same-origin Vite WS proxy targets only the owned loopback API above.
        // preview는 빌드에 기록한 명시적 realtime origin을 사용한다.
        ...(mode === "development" ? { VITE_STUDIO_LIVE_DEV_PROXY_ENABLED: "true" } : {}),
      },
      stdio: "inherit",
    });
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (webProcess.exitCode !== null || webProcess.signalCode !== null) {
        throw new Error("The owned Studio QA web process stopped before startup.");
      }
      try {
        const response = await fetch(`${web.origin}/studio`, { signal: AbortSignal.timeout(1_000) });
        if (response.ok) { ready = true; break; }
      } catch { /* The owned process may still be binding its port. */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("The owned Studio QA web process did not become ready.");
    return await verify({ origin: web, databaseTarget: target });
  } finally {
    try { if (webProcess) await stopDetachedProcessTree(webProcess); }
    finally { await stopDetachedProcessTree(api); }
  }
}
