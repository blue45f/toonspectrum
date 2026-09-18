import { isUsableStudioShell } from "./studio-service-worker-navigation";

import {
  STUDIO_OFFLINE_MAX_RESOURCES,
  normalizeStudioOfflineAssetUrl,
  type StudioOfflinePreparationReport,
} from "../../shared/lib/studio-offline-protocol";

const MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024;
const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;
const RESOURCE_TIMEOUT_MS = 12_000;
const PREPARATION_TIMEOUT_MS = 30_000;
const STANDALONE_OFFLINE_HTML_URLS = new Set([
  "/offline-draw/index.html",
  "/offline-draw/portable.html",
]);

export interface StudioOfflinePreparationOptions {
  readonly origin: string;
  readonly buildId: string;
  readonly urls: readonly string[];
  readonly drawingUrls?: readonly string[];
  readonly shellUrls: readonly string[];
  readonly criticalUrls: readonly string[];
  readonly warmUrls: readonly string[];
  readonly read: (url: string) => Promise<Response | undefined>;
  readonly write: (url: string, response: Response) => Promise<void>;
  readonly fetcher?: typeof fetch;
}

function usable(url: string, response: Response, shellUrls: readonly string[]): boolean {
  if (shellUrls.includes(url)) return isUsableStudioShell(response, url === "/studio");
  if (!response.ok || response.status === 206 || response.redirected) return false;
  const mime = response.headers.get("content-type")?.toLowerCase() ?? "";
  // SPA error pages must never be accepted as JavaScript, fonts, or dictionaries.
  // The reviewed emergency drawing documents are intentional standalone HTML.
  if (mime.includes("text/html") && !STANDALONE_OFFLINE_HTML_URLS.has(url)) return false;
  if (/\.m?js$/u.test(url) && !/(?:javascript|ecmascript)/u.test(mime)) return false;
  if (url.endsWith(".css") && !mime.includes("text/css")) return false;
  if (url.endsWith(".json") && !mime.includes("json")) return false;
  if (url.endsWith(".wasm") && !mime.includes("application/wasm")) return false;
  if (/\.worker-[A-Za-z0-9_-]+\.js$/u.test(url)
    && !response.headers.get("cross-origin-resource-policy")) return false;
  return true;
}

async function boundedResource(
  url: string,
  options: StudioOfflinePreparationOptions,
  remainingBytes: number,
  timeoutMs: number,
  onBytes: (bytes: number) => void,
): Promise<{ response: Response; bytes: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(RESOURCE_TIMEOUT_MS, timeoutMs));
  try {
    const response = await (options.fetcher ?? fetch)(new URL(url, options.origin), {
      signal: controller.signal, credentials: "same-origin", redirect: "error",
      headers: options.shellUrls.includes(url) ? { Accept: "text/html,application/xhtml+xml" } : undefined,
    });
    if (!usable(url, response, options.shellUrls)) {
      await response.body?.cancel();
      throw new Error("Unusable offline resource");
    }
    const limit = Math.min(MAX_RESOURCE_BYTES, remainingBytes);
    const length = Number(response.headers.get("content-length"));
    if (length > limit) {
      await response.body?.cancel();
      throw new Error("Offline resource exceeds byte budget");
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        for (;;) {
          const result = await reader.read();
          if (result.done) break;
          bytes += result.value.byteLength;
          onBytes(result.value.byteLength);
          if (bytes > limit) throw new Error("Offline resource exceeds byte budget");
          chunks.push(result.value);
        }
      } catch (cause) {
        await reader.cancel().catch(() => undefined);
        throw cause;
      } finally {
        reader.releaseLock();
      }
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const headers = new Headers(response.headers);
    // fetch streams decoded bytes; do not attach compressed transport lengths to a synthetic body.
    headers.delete("content-encoding");
    headers.set("content-length", String(bytes));
    return { response: new Response(body, { status: response.status, headers }), bytes };
  } finally {
    clearTimeout(timer);
  }
}

/** Explicit, bounded preparation of the current loaded editor, never arbitrary API caching. */
export async function prepareStudioOfflineResources(
  options: StudioOfflinePreparationOptions,
): Promise<StudioOfflinePreparationReport> {
  const missing: string[] = [];
  if (options.urls.length > STUDIO_OFFLINE_MAX_RESOURCES) {
    return { schema: 1, buildId: options.buildId, checked: 0, cached: 0,
      downloadedBytes: 0, missing: ["resource-limit"], complete: false };
  }
  const assets: string[] = [];
  for (const candidate of options.urls) {
    const normalized = normalizeStudioOfflineAssetUrl(candidate, options.origin);
    if (normalized) assets.push(normalized);
    else missing.push("invalid-resource");
  }
  const urls = [...new Set([...options.shellUrls, ...options.criticalUrls, ...options.warmUrls, ...(options.drawingUrls ?? []), ...assets])];
  let downloadedBytes = 0;
  const deadline = Date.now() + PREPARATION_TIMEOUT_MS;
  // Sequential by design: one user's explicit click cannot launch hundreds of requests at once.
  for (const url of urls) {
    try {
      const cached = await options.read(url);
      if (cached && usable(url, cached, options.shellUrls)) continue;
      if (Date.now() >= deadline || downloadedBytes >= MAX_DOWNLOAD_BYTES) {
        missing.push(url);
        continue;
      }
      const fetched = await boundedResource(
        url, options, MAX_DOWNLOAD_BYTES - downloadedBytes, deadline - Date.now(),
        (bytes) => { downloadedBytes += bytes; },
      );
      await options.write(url, fetched.response);
    } catch {
      missing.push(url);
    }
  }
  // Re-read the WHOLE set after writes: quota failures or trimming may have evicted earlier items.
  let cached = 0;
  for (const url of urls) {
    try {
      const response = await options.read(url);
      if (response && usable(url, response, options.shellUrls)) { cached += 1; continue; }
    } catch { /* Report a missing resource, never a false readiness success. */ }
    if (!missing.includes(url)) missing.push(url);
  }
  return { schema: 1, buildId: options.buildId, checked: urls.length, cached,
    downloadedBytes, missing, complete: missing.length === 0 && cached === urls.length };
}

/** Re-check this build's complete core pack; a past receipt or HTML alone is insufficient.
 * Cache-only, bounded concurrency/deadline, no database access or network probe.
 */
export async function hasPreparedStudioDrawingResources(
  options: Pick<StudioOfflinePreparationOptions, "shellUrls" | "criticalUrls" | "warmUrls" | "drawingUrls" | "read">,
  timeoutMs = 2_000,
): Promise<boolean> {
  if (!options.drawingUrls?.length) return false;
  const queue = [...new Set([...options.shellUrls, ...options.criticalUrls, ...options.warmUrls, ...options.drawingUrls])];
  if (queue.length > STUDIO_OFFLINE_MAX_RESOURCES) return false;
  let valid = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const inspect = async (): Promise<void> => {
    while (valid) {
      const url = queue.shift();
      if (url === undefined) return;
      try {
        const response = await options.read(url);
        if (!response || !usable(url, response, options.shellUrls)) valid = false;
      } catch { valid = false; }
    }
  };
  try {
    return await Promise.race([
      Promise.all(Array.from({ length: 8 }, inspect)).then(() => valid),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => { valid = false; resolve(false); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
