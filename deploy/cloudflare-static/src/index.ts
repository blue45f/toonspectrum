export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface CloudflareStaticEnv {
  readonly ASSETS: AssetsBinding;
  readonly CORE_API_ORIGIN?: string;
}

interface GatewayRuntime {
  readonly fetch: typeof globalThis.fetch;
}

const DEFAULT_RUNTIME: GatewayRuntime = {
  fetch: globalThis.fetch.bind(globalThis),
};

export const COMMON_SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'sha256-OmHwrCLVdhu+S3kh6CjljJPz6ndGTuXZGMTrN96KuAg=' 'wasm-unsafe-eval' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' blob: https://api.artic.edu https://openaccess-api.clevelandart.org https://ko.wikipedia.org https://accounts.google.com https://www.googleapis.com https://graph.microsoft.com https://storage.googleapis.com https://api.unsplash.com https://images.unsplash.com https://desk-platform.vercel.app https://api.openai.com https://openrouter.ai https://api.z.ai https://api.deepseek.com https://ybsgfhofuvkhywbpytnl.supabase.co https://cdn.jsdelivr.net https://toonspectrum-realtime.toonstudio-realtime.workers.dev wss://toonspectrum-realtime.toonstudio-realtime.workers.dev https://realtime.toonstudio.cloud wss://realtime.toonstudio.cloud; frame-src https://accounts.google.com https://www.youtube-nocookie.com https://player.vimeo.com; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests; block-all-mixed-content",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), cross-origin-isolated=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
} as const);

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...COMMON_SECURITY_HEADERS,
    },
  });
}

function coreOrigin(raw: string | undefined): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
  ) {
    return null;
  }
  return url;
}

function hasExactlyOneEncodedSegment(
  pathname: string,
  prefix: string,
): boolean {
  if (!pathname.startsWith(prefix)) return false;
  const segment = pathname.slice(prefix.length);
  return segment.length > 0 && !segment.includes("/");
}

function isDynamicPath(pathname: string): boolean {
  return pathname === "/api"
    || pathname.startsWith("/api/")
    || pathname === "/socket.io"
    || pathname.startsWith("/socket.io/")
    || hasExactlyOneEncodedSegment(pathname, "/title/")
    || pathname === "/market"
    || pathname === "/market/browse"
    || hasExactlyOneEncodedSegment(pathname, "/market/resource/");
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("upgrade")?.toLowerCase() === "websocket";
}

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function mapDynamicPath(requestUrl: URL): URLSearchParams | null {
  if (requestUrl.pathname === "/market") {
    return new URLSearchParams({ marketPage: "home" });
  }
  if (requestUrl.pathname === "/market/browse") {
    return new URLSearchParams({ marketPage: "browse" });
  }
  if (requestUrl.pathname.startsWith("/market/resource/")) {
    const resourceId = decodePathSegment(
      requestUrl.pathname.slice("/market/resource/".length),
    );
    if (!resourceId) return null;
    return new URLSearchParams({ marketResourceId: resourceId });
  }
  if (requestUrl.pathname.startsWith("/title/")) {
    const slug = decodePathSegment(requestUrl.pathname.slice("/title/".length));
    if (!slug) return null;
    return new URLSearchParams({ slug });
  }
  return null;
}

export function createCoreApiRequest(request: Request, origin: URL): Request {
  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, origin);
  const ogQuery = mapDynamicPath(incoming);
  if (ogQuery) {
    upstream.pathname = "/api/og";
    upstream.search = ogQuery.toString();
  }

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-toonspectrum-edge", "cloudflare-static-gateway-v1");

  return new Request(upstream, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
    signal: request.signal,
  });
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(COMMON_SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createCloudflareStaticGateway(
  runtime: GatewayRuntime = DEFAULT_RUNTIME,
) {
  return async function fetchRequest(
    request: Request,
    env: CloudflareStaticEnv,
  ): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (!isDynamicPath(requestUrl.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const origin = coreOrigin(env.CORE_API_ORIGIN);
    if (!origin || origin.origin === requestUrl.origin) {
      return jsonError(503, "CORE_API_UNAVAILABLE");
    }

    try {
      const response = await runtime.fetch(createCoreApiRequest(request, origin));
      // Reconstructing a WebSocket upgrade response drops the runtime-specific
      // WebSocket handle. Security headers apply to HTTP responses; the upgrade
      // handshake must pass through unchanged.
      if (isWebSocketUpgrade(request) || response.status === 101) return response;
      return withSecurityHeaders(response);
    } catch {
      return jsonError(502, "CORE_API_UPSTREAM_FAILED");
    }
  };
}

const fetchRequest = createCloudflareStaticGateway();

export default {
  fetch: fetchRequest,
};
