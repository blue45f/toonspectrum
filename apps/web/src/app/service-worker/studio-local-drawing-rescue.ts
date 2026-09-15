/** Tiny, dependency-free rescue payload. No auth/API cache or cloud document mutation. */
export const LOCAL_DRAWING_URL = "/offline-drawing.html";
export const LOCAL_DRAWING_URLS = [LOCAL_DRAWING_URL, "/offline-drawing/app.js", "/offline-drawing/model.js", "/offline-drawing/style.css"] as const;
// Bump when rescue bytes change; the worker script then changes and installs a fresh rescue cache.
export const LOCAL_DRAWING_RELEASE = "20260915.1";
const PREFIX = "toonstudio-local-drawing-";
export const LOCAL_DRAWING_CACHE = `${PREFIX}${LOCAL_DRAWING_RELEASE}`;
export const LOCAL_DRAWING_NAVIGATION_TIMEOUT_MS = 4000;
export function isLocalDrawingRequest(request: Request, origin: string): boolean {
  const url = new URL(request.url);
  return request.method === "GET" && !request.headers.has("range") && url.origin === origin
    && (LOCAL_DRAWING_URLS as readonly string[]).includes(url.pathname);
}
export function usableLocalDrawingResponse(path: string, response: Response): boolean {
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  return response.status === 200 && !response.redirected && (
    path.endsWith(".html") ? mime === "text/html" : path.endsWith(".css") ? mime === "text/css"
      : ["text/javascript", "application/javascript"].includes(mime)
  );
}
export async function installLocalDrawingRescue(storage: CacheStorage = caches): Promise<void> {
  const responses = await Promise.all(LOCAL_DRAWING_URLS.map(async path => {
    const response = await fetch(new Request(new URL(path, globalThis.location.origin), { cache: "reload", credentials: "omit", signal: AbortSignal.timeout(15000) }));
    if (!usableLocalDrawingResponse(path, response)) throw new Error(`Invalid local drawing payload: ${path}`);
    const bytes = await response.clone().arrayBuffer();
    if (bytes.byteLength > 96 * 1024) throw new Error(`Local drawing payload exceeds budget: ${path}`);
    return response;
  }));
  const cache = await storage.open(LOCAL_DRAWING_CACHE);
  await Promise.all(LOCAL_DRAWING_URLS.map((path, index) => cache.put(path, responses[index])));
}
export async function localDrawingResponse(request: Request, storage: CacheStorage = caches): Promise<Response> {
  const path = new URL(request.url).pathname;
  const cache = await storage.open(LOCAL_DRAWING_CACHE);
  const cached = await cache.match(path);
  if (cached && usableLocalDrawingResponse(path, cached)) return cached;
  const response = await fetch(request);
  if (!usableLocalDrawingResponse(path, response)) throw new Error("Local drawing is not prepared on this browser.");
  return response;
}
/** Bound stalled preload AND fetch. A late request cannot populate the offline cache. */
export async function boundedNavigationResponse(request: Request, preload: Promise<Response | undefined>, timeoutMs = LOCAL_DRAWING_NAVIGATION_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      preload.then(response => response ?? fetch(request, { signal: controller.signal })),
      new Promise<Response>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Navigation deadline exceeded")); }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
export function isNavigationOutage(status: number): boolean { return status >= 500 || status === 408; }
export async function cachedLocalDrawingRescue(storage: CacheStorage = caches): Promise<Response | undefined> {
  const cache = await storage.open(LOCAL_DRAWING_CACHE);
  const cached = await cache.match(LOCAL_DRAWING_URL);
  return cached && usableLocalDrawingResponse(LOCAL_DRAWING_URL, cached) ? cached : undefined;
}
export async function localDrawingRescueReady(storage: CacheStorage = caches): Promise<boolean> {
  const cache = await storage.open(LOCAL_DRAWING_CACHE);
  return (await Promise.all(LOCAL_DRAWING_URLS.map(async path => { const response = await cache.match(path); return Boolean(response && usableLocalDrawingResponse(path, response)); }))).every(Boolean);
}
/** Explicit kill only. Never evict a previous rescue payload during active drawing. */
export async function clearLocalDrawingCaches(storage: CacheStorage = caches): Promise<void> {
  await Promise.all((await storage.keys()).filter(name => name.startsWith(PREFIX)).map(name => storage.delete(name)));
}
