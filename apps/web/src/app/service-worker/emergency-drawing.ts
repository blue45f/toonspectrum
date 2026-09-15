/** Independent, deliberately small shell: no user data or authenticated requests. */
export const EMERGENCY_DRAWING_CACHE = "toonstudio-emergency-drawing-shell-v2";
export const EMERGENCY_DRAWING_READY = "/offline-draw/ready-v2";
export const EMERGENCY_DRAWING_FILES = new Set([
  "/offline-draw/index.html", "/offline-draw/portable.html", "/offline-draw/styles.css", "/offline-draw/model.js",
  "/offline-draw/storage.js", "/offline-draw/editor.js", "/offline-draw/cache.js",
  "/offline-draw/bootstrap.js",
]);
export function emergencyDrawingPath(request: Request, origin: string): string | null {
  if (request.method !== "GET" || request.headers.has("range")) return null;
  const url = new URL(request.url);
  if (url.origin !== origin) return null;
  const path = url.pathname === "/offline-draw/" || url.pathname === "/offline-draw"
    ? "/offline-draw/index.html" : url.pathname;
  return EMERGENCY_DRAWING_FILES.has(path) ? path : null;
}
export async function readEmergencyDrawing(path = "/offline-draw/index.html"): Promise<Response | undefined> {
  try {
    const cache = await caches.open(EMERGENCY_DRAWING_CACHE);
    if (!(await cache.match(EMERGENCY_DRAWING_READY))) return undefined;
    return await cache.match(path);
  } catch { return undefined; }
}
export async function navigationWithDeadline(
  request: Request,
  preload: Promise<Response | undefined>,
  timeoutMs = 4_000,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = (await preload) ?? await fetch(request, { signal: controller.signal });
        if (response.status >= 500) throw new Error(`origin unavailable: ${response.status}`);
        return response;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("origin response deadline exceeded")); }, timeoutMs);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
