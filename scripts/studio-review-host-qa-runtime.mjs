import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  requireUnusedApiTarget,
  startIsolatedMarketApi,
  stopDetachedProcessTree,
  validateIsolatedMarketApiTarget,
} from "./isolated-market-api.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Own both processes, reject occupied ports, and restrict writes to a local test DB.
 * The shared isolated-API environment excludes local .env files and paid services.
 * @param {NodeJS.ProcessEnv} environment
 * @param {(context: {origin: URL, databaseTarget: import("./isolated-market-api.mjs").IsolatedMarketApiTarget}) => Promise<unknown>} verify
 * @param {{localReviewStorage?: import("./studio-review-local-storage-config.mjs").StudioReviewLocalStorageOptions}} options
 */
export async function withStudioReviewHostQaRuntime(environment, verify, options = {}) {
  const web = new URL(environment.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:5181/");
  // These exact development origins are already supported by the real CSRF/CORS
  // contract; do not widen or bypass that contract just for the browser probe.
  if (!/^http:\/\/127\.0\.0\.1:(5173|5181)$/u.test(web.origin)
    || web.pathname !== "/" || web.username || web.password || web.search || web.hash) {
    throw new Error("Choose the unused 127.0.0.1:5173 or :5181 Studio QA origin.");
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
  const api = await startIsolatedMarketApi(target, { environment, localReviewStorage: options.localReviewStorage });
  let webProcess;
  try {
    webProcess = spawn("pnpm", ["exec", "vite", "--host", web.hostname, "--port", web.port, "--strictPort"], {
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
        VITE_STUDIO_LIVE_DEV_PROXY_ENABLED: "true",
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
