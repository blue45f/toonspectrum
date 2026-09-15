import {
  CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL,
  cloudflareLargeAssetDescriptor,
  cloudflareLargeAssetKey,
  cloudflareLargeAssetSidecarPath,
  isCloudflareOversizedAssetPath,
  type CloudflareLargeAssetEncoding,
} from "./large-static-assets";

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface R2ObjectBinding {
  readonly size: number;
  readonly httpEtag: string;
  readonly range?: { readonly offset: number; readonly length: number };
  writeHttpMetadata(headers: Headers): void;
}

export interface R2ObjectBodyBinding extends R2ObjectBinding {
  readonly body: ReadableStream<Uint8Array>;
}

export interface R2BucketBinding {
  get(
    key: string,
    options?: { readonly range?: Headers },
  ): Promise<R2ObjectBodyBinding | null>;
  head(key: string): Promise<R2ObjectBinding | null>;
}

export interface CloudflareStaticEnv {
  readonly ASSETS: AssetsBinding;
  readonly LARGE_ASSETS?: R2BucketBinding;
  readonly CORE_API_ORIGIN?: string;
  readonly CORE_ORIGIN_SECRET?: string;
  /** Comma-separated stateless read replicas for public/catalog/search traffic. */
  readonly PUBLIC_READ_API_ORIGINS?: string;
  readonly SOCIAL_API_ORIGIN?: string;
  readonly PLAYGROUND_API_ORIGIN?: string;
  readonly ADMIN_API_ORIGIN?: string;
  readonly REALTIME_API_ORIGIN?: string;
  readonly LARGE_ASSET_ORIGIN?: string;
}

interface GatewayRuntime {
  readonly fetch: typeof globalThis.fetch;
}

type DynamicRoute =
  | "core"
  | "public-read"
  | "social"
  | "playground"
  | "admin"
  | "realtime"
  | "large-asset";

interface OriginResolution {
  readonly origins: readonly URL[];
  readonly invalidConfiguration: boolean;
}

const DEFAULT_RUNTIME: GatewayRuntime = {
  fetch: globalThis.fetch.bind(globalThis),
};

const RETRYABLE_READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const RETRYABLE_UPSTREAM_STATUSES = new Set([502, 503, 504]);
const MAX_PUBLIC_READ_ORIGINS = 8;
const CORE_ORIGIN_AUTH_HEADER = "x-toonspectrum-origin-secret";
const MINIMUM_CORE_ORIGIN_SECRET_BYTES = 32;

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

function isEdgeLivenessRequest(request: Request, url: URL): boolean {
  const method = request.method.toUpperCase();
  return (method === "GET" || method === "HEAD")
    && (url.pathname === "/api/health" || url.pathname === "/api/health/live");
}

function edgeLivenessResponse(request: Request): Response {
  const body = request.method.toUpperCase() === "HEAD"
    ? null
    : JSON.stringify({ status: "ok" });
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
      "x-toonspectrum-health-source": "cloudflare-edge",
      ...COMMON_SECURITY_HEADERS,
    },
  });
}

function validatedCoreOriginSecret(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const normalized = raw.trim();
  if (
    raw !== normalized
    || new TextEncoder().encode(normalized).byteLength < MINIMUM_CORE_ORIGIN_SECRET_BYTES
  ) {
    return null;
  }
  return normalized;
}

function validatedOrigin(raw: string | undefined): URL | null {
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
  return isCloudflareOversizedAssetPath(pathname)
    || pathname === "/api"
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

function pathWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const PUBLIC_READ_EXACT_PATHS = new Set([
  "/api/random",
  "/api/home",
  "/api/calendar",
  "/api/insights",
  "/api/ranking",
  "/api/explore",
  "/api/tags",
  "/api/authors",
  "/api/search",
  "/api/titles",
  "/api/kmas/book-webtoons",
  "/api/cover",
]);

function isPublicReadPath(pathname: string): boolean {
  return PUBLIC_READ_EXACT_PATHS.has(pathname)
    || pathWithin(pathname, "/api/public")
    || pathWithin(pathname, "/api/titles")
    || pathWithin(pathname, "/api/authors");
}

function classifyDynamicRoute(request: Request, requestUrl: URL): DynamicRoute {
  if (isCloudflareOversizedAssetPath(requestUrl.pathname)) {
    return "large-asset";
  }
  if (
    requestUrl.pathname === "/socket.io"
    || requestUrl.pathname.startsWith("/socket.io/")
    || pathWithin(requestUrl.pathname, "/api/realtime")
    || pathWithin(requestUrl.pathname, "/api/studio-live")
  ) {
    return "realtime";
  }
  if (pathWithin(requestUrl.pathname, "/api/admin")) return "admin";
  if (
    pathWithin(requestUrl.pathname, "/api/community")
    || pathWithin(requestUrl.pathname, "/api/reviews")
  ) {
    return "social";
  }
  if (
    pathWithin(requestUrl.pathname, "/api/fortune")
    || pathWithin(requestUrl.pathname, "/api/play")
  ) {
    return "playground";
  }
  if (
    RETRYABLE_READ_METHODS.has(request.method.toUpperCase())
    && isPublicReadPath(requestUrl.pathname)
  ) {
    return "public-read";
  }
  return "core";
}

function optionalOrigin(
  raw: string | undefined,
  fallback: URL | null,
): OriginResolution {
  if (raw === undefined || raw.trim() === "") {
    return {
      origins: fallback ? [fallback] : [],
      invalidConfiguration: false,
    };
  }
  const origin = validatedOrigin(raw.trim());
  return origin
    ? { origins: [origin], invalidConfiguration: false }
    : { origins: [], invalidConfiguration: true };
}

function publicReadOrigins(
  raw: string | undefined,
  fallback: URL | null,
): OriginResolution {
  if (raw === undefined || raw.trim() === "") {
    return {
      origins: fallback ? [fallback] : [],
      invalidConfiguration: false,
    };
  }
  const values = raw.split(",").map((value) => value.trim());
  if (
    values.length === 0
    || values.length > MAX_PUBLIC_READ_ORIGINS
    || values.some((value) => value === "")
  ) {
    return { origins: [], invalidConfiguration: true };
  }
  const origins: URL[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const origin = validatedOrigin(value);
    if (!origin || seen.has(origin.origin)) {
      return { origins: [], invalidConfiguration: true };
    }
    origins.push(origin);
    seen.add(origin.origin);
  }
  return { origins, invalidConfiguration: false };
}

function resolveOrigins(
  route: DynamicRoute,
  env: CloudflareStaticEnv,
): OriginResolution {
  const core = validatedOrigin(env.CORE_API_ORIGIN?.trim());
  switch (route) {
    case "public-read":
      return publicReadOrigins(env.PUBLIC_READ_API_ORIGINS, core);
    case "social":
      return optionalOrigin(env.SOCIAL_API_ORIGIN, core);
    case "playground":
      return optionalOrigin(env.PLAYGROUND_API_ORIGIN, core);
    case "admin":
      return optionalOrigin(env.ADMIN_API_ORIGIN, core);
    case "realtime":
      return optionalOrigin(env.REALTIME_API_ORIGIN, core);
    case "large-asset":
      // Static sidecars and R2 are the normal authorities. A final HTTP origin
      // is used only when explicitly configured; never wake the Core API for files.
      return optionalOrigin(env.LARGE_ASSET_ORIGIN, null);
    case "core":
      return {
        origins: core ? [core] : [],
        invalidConfiguration: env.CORE_API_ORIGIN !== undefined && core === null,
      };
  }
}

function cyrb53(value: string): number {
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    high = Math.imul(high ^ code, 2_654_435_761);
    low = Math.imul(low ^ code, 1_597_334_677);
  }
  high = Math.imul(high ^ (high >>> 16), 2_246_822_507)
    ^ Math.imul(low ^ (low >>> 13), 3_266_489_909);
  low = Math.imul(low ^ (low >>> 16), 2_246_822_507)
    ^ Math.imul(high ^ (high >>> 13), 3_266_489_909);
  return 4_294_967_296 * (2_097_151 & low) + (high >>> 0);
}

function orderedReadOrigins(
  request: Request,
  origins: readonly URL[],
): readonly URL[] {
  if (origins.length <= 1) return origins;
  const url = new URL(request.url);
  const edgeRequestId = request.headers.get("cf-ray")?.trim();
  const routingKey = edgeRequestId
    ? `${edgeRequestId}:${url.pathname}:${url.search}`
    : `${request.method}:${url.pathname}:${url.search}`;
  return [...origins].sort((left, right) => {
    const rightScore = cyrb53(`${routingKey}\u0000${right.origin}`);
    const leftScore = cyrb53(`${routingKey}\u0000${left.origin}`);
    return rightScore - leftScore || left.origin.localeCompare(right.origin);
  });
}

function removePublicReadCredentials(headers: Headers): void {
  headers.delete("authorization");
  headers.delete("proxy-authorization");
  headers.delete("cookie");
  for (const name of [...headers.keys()]) {
    if (
      name.startsWith("x-user-")
      || name.startsWith("x-admin-")
      || name.startsWith("x-csrf-")
      || name.startsWith("x-session-")
    ) {
      headers.delete(name);
    }
  }
}

function containsForbiddenForwardedIpCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint <= 0x20 || codePoint === 0x7f) return true;
  }
  return false;
}

function trustedConnectingIp(request: Request): string | null {
  const value = request.headers.get("cf-connecting-ip")?.trim();
  if (
    !value
    || value.length > 64
    || containsForbiddenForwardedIpCharacter(value)
  ) {
    return null;
  }
  return value;
}

async function cancelRetryResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A failed best-effort body cancellation must not suppress a safe replica retry.
  }
}

export function createUpstreamApiRequest(
  request: Request,
  origin: URL,
  route: DynamicRoute,
  attempt: number,
  coreOriginSecret?: string,
): Request {
  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, origin);
  const ogQuery = mapDynamicPath(incoming);
  if (ogQuery) {
    upstream.pathname = "/api/og";
    upstream.search = ogQuery.toString();
  }

  const headers = new Headers(request.headers);
  const connectingIp = trustedConnectingIp(request);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("forwarded");
  headers.delete("true-client-ip");
  headers.delete("x-forwarded-for");
  headers.delete("x-real-ip");
  headers.delete(CORE_ORIGIN_AUTH_HEADER);
  if (route === "public-read" || route === "large-asset") {
    removePublicReadCredentials(headers);
  } else if (connectingIp) {
    headers.set("x-forwarded-for", connectingIp);
  }
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-toonspectrum-edge", "cloudflare-static-gateway-v2");
  headers.set("x-toonspectrum-edge-route", route);
  headers.set("x-toonspectrum-edge-attempt", String(attempt));
  if (coreOriginSecret) {
    headers.set(CORE_ORIGIN_AUTH_HEADER, coreOriginSecret);
  }

  const upstreamRequest = new Request(upstream, request);
  return new Request(upstreamRequest, {
    headers,
    redirect: "manual",
    signal: request.signal,
  });
}

export function createCoreApiRequest(request: Request, origin: URL): Request {
  return createUpstreamApiRequest(request, origin, "core", 0);
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

function retryableRead(request: Request, route: DynamicRoute): boolean {
  return route === "public-read"
    && RETRYABLE_READ_METHODS.has(request.method.toUpperCase())
    && !isWebSocketUpgrade(request);
}

function encodingQuality(header: string, name: string): number {
  let wildcardQuality: number | null = null;
  for (const entry of header.split(",")) {
    const [rawToken, ...parameters] = entry.trim().split(";");
    const token = rawToken?.trim().toLowerCase();
    if (!token) continue;
    let quality = 1;
    for (const parameter of parameters) {
      const [rawKey, rawValue] = parameter.trim().split("=");
      if (rawKey?.toLowerCase() !== "q") continue;
      const parsed = Number(rawValue);
      quality = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
        ? parsed
        : 0;
    }
    if (token === name) return quality;
    if (token === "*") wildcardQuality = quality;
  }
  return wildcardQuality ?? 0;
}

function preferredLargeAssetEncoding(
  request: Request,
): CloudflareLargeAssetEncoding | null {
  const method = request.method.toUpperCase();
  if ((method !== "GET" && method !== "HEAD") || request.headers.has("range")) {
    return null;
  }
  const accepted = request.headers.get("accept-encoding") ?? "";
  const brotliQuality = encodingQuality(accepted, "br");
  const gzipQuality = encodingQuality(accepted, "gzip");
  if (brotliQuality > 0 && brotliQuality >= gzipQuality) return "br";
  if (gzipQuality > 0) return "gzip";
  return null;
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get("vary")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
  if (!current.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
    current.push(value);
  }
  headers.set("vary", current.join(", "));
}

async function serveCompressedLargeAsset(
  request: Request,
  env: CloudflareStaticEnv,
): Promise<Response | null> {
  const incoming = new URL(request.url);
  const descriptor = cloudflareLargeAssetDescriptor(incoming.pathname);
  const encoding = preferredLargeAssetEncoding(request);
  if (!descriptor || !encoding) return null;

  const sidecarUrl = new URL(incoming);
  sidecarUrl.pathname = cloudflareLargeAssetSidecarPath(
    incoming.pathname,
    encoding,
  );
  const headers = new Headers(request.headers);
  removePublicReadCredentials(headers);
  headers.delete("range");
  headers.delete("if-range");
  headers.set("accept-encoding", "identity");

  const assetResponse = await env.ASSETS.fetch(new Request(sidecarUrl, {
    method: request.method,
    headers,
    redirect: "manual",
    signal: request.signal,
  }));
  if (assetResponse.status === 404 || assetResponse.status >= 500) {
    await cancelRetryResponse(assetResponse);
    return null;
  }

  const responseHeaders = new Headers(assetResponse.headers);
  responseHeaders.set("content-encoding", encoding === "br" ? "br" : "gzip");
  responseHeaders.set("content-type", descriptor.contentType);
  responseHeaders.set("cache-control", CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL);
  responseHeaders.set("accept-ranges", "none");
  responseHeaders.set(
    "x-toonspectrum-large-asset-source",
    `static-${encoding}`,
  );
  responseHeaders.delete("content-range");
  appendVary(responseHeaders, "Accept-Encoding");

  const body = request.method.toUpperCase() === "HEAD"
    || assetResponse.status === 304
    ? null
    : assetResponse.body;
  return withSecurityHeaders(new Response(body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers: responseHeaders,
  }));
}

function matchesIfNoneMatch(request: Request, httpEtag: string): boolean {
  const raw = request.headers.get("if-none-match");
  if (!raw) return false;
  const target = httpEtag.startsWith("W/") ? httpEtag.slice(2) : httpEtag;
  return raw.split(",").some((candidate) => {
    const value = candidate.trim();
    if (value === "*") return true;
    return (value.startsWith("W/") ? value.slice(2) : value) === target;
  });
}

function r2LargeAssetHeaders(
  object: R2ObjectBinding,
  contentType: string,
): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", contentType);
  headers.set("cache-control", CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("access-control-allow-origin", "*");
  headers.set("x-toonspectrum-large-asset-source", "r2");
  if (object.range) {
    const end = object.range.offset + object.range.length - 1;
    headers.set(
      "content-range",
      `bytes ${object.range.offset}-${end}/${object.size}`,
    );
    headers.set("content-length", String(object.range.length));
  } else {
    headers.set("content-length", String(object.size));
  }
  return headers;
}

function r2RangeHeaders(request: Request): Headers | undefined {
  const range = request.headers.get("range");
  if (!range || request.headers.has("if-range")) return undefined;
  return new Headers({ range });
}

async function serveR2LargeAsset(
  request: Request,
  env: CloudflareStaticEnv,
): Promise<Response | null> {
  const requestUrl = new URL(request.url);
  const descriptor = cloudflareLargeAssetDescriptor(requestUrl.pathname);
  const key = cloudflareLargeAssetKey(requestUrl.pathname);
  if (
    !descriptor
    || !key
    || !env.LARGE_ASSETS
    || request.headers.has("if-range")
  ) return null;

  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    return withSecurityHeaders(new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-allow-headers": "Range, If-None-Match",
        "access-control-max-age": "86400",
      },
    }));
  }
  if (method !== "GET" && method !== "HEAD") {
    return withSecurityHeaders(new Response(null, {
      status: 405,
      headers: { allow: "GET, HEAD, OPTIONS" },
    }));
  }

  try {
    const rangeHeaders = r2RangeHeaders(request);
    const object = method === "HEAD"
      ? await env.LARGE_ASSETS.head(key)
      : await env.LARGE_ASSETS.get(
        key,
        rangeHeaders ? { range: rangeHeaders } : undefined,
      );
    if (!object) return null;

    const headers = r2LargeAssetHeaders(object, descriptor.contentType);
    if (matchesIfNoneMatch(request, object.httpEtag)) {
      headers.delete("content-length");
      headers.delete("content-range");
      return withSecurityHeaders(new Response(null, { status: 304, headers }));
    }

    const status = object.range ? 206 : 200;
    const body = method === "HEAD"
      ? null
      : (object as R2ObjectBodyBinding).body;
    return withSecurityHeaders(new Response(body, { status, headers }));
  } catch {
    return null;
  }
}

export function createCloudflareStaticGateway(
  runtime: GatewayRuntime = DEFAULT_RUNTIME,
) {
  return async function fetchRequest(
    request: Request,
    env: CloudflareStaticEnv,
  ): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (isEdgeLivenessRequest(request, requestUrl)) {
      return edgeLivenessResponse(request);
    }
    if (!isDynamicPath(requestUrl.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const route = classifyDynamicRoute(request, requestUrl);
    if (route === "large-asset") {
      try {
        const staticResponse = await serveCompressedLargeAsset(request, env);
        if (staticResponse) return staticResponse;
      } catch {
        // Missing or unreadable sidecars continue to R2.
      }
      const r2Response = await serveR2LargeAsset(request, env);
      if (r2Response) return r2Response;
    }

    const configuredCoreSecret = env.CORE_ORIGIN_SECRET;
    const coreOriginSecret = validatedCoreOriginSecret(configuredCoreSecret);
    if (configuredCoreSecret !== undefined && coreOriginSecret === null) {
      return jsonError(503, "CORE_API_UNAVAILABLE");
    }
    const coreOrigin = validatedOrigin(env.CORE_API_ORIGIN);
    const resolution = resolveOrigins(route, env);
    const selfReferential = resolution.origins.some(
      (origin) => origin.origin === requestUrl.origin,
    );
    const origins = resolution.origins.filter(
      (origin) => origin.origin !== requestUrl.origin,
    );
    if (
      resolution.invalidConfiguration
      || selfReferential
      || origins.length === 0
    ) {
      return jsonError(
        503,
        route === "large-asset"
          ? "LARGE_ASSET_UNAVAILABLE"
          : "CORE_API_UNAVAILABLE",
      );
    }

    const orderedOrigins = retryableRead(request, route)
      ? orderedReadOrigins(request, origins)
      : origins.slice(0, 1);
    let attempted = 0;
    for (const [index, origin] of orderedOrigins.entries()) {
      attempted += 1;
      try {
        const response = await runtime.fetch(
          createUpstreamApiRequest(
            request,
            origin,
            route,
            index,
            coreOrigin?.origin === origin.origin
              ? coreOriginSecret ?? undefined
              : undefined,
          ),
        );
        // Reconstructing a WebSocket upgrade response drops the runtime-specific
        // WebSocket handle. Security headers apply to HTTP responses; the upgrade
        // handshake must pass through unchanged.
        if (isWebSocketUpgrade(request) || response.status === 101) return response;
        const shouldRetry = retryableRead(request, route)
          && RETRYABLE_UPSTREAM_STATUSES.has(response.status)
          && index + 1 < orderedOrigins.length;
        if (shouldRetry) {
          await cancelRetryResponse(response);
          continue;
        }
        return withSecurityHeaders(response);
      } catch {
        if (
          retryableRead(request, route)
          && index + 1 < orderedOrigins.length
        ) {
          continue;
        }
      }
    }

    return jsonError(
      502,
      attempted > 0 ? "CORE_API_UPSTREAM_FAILED" : "CORE_API_UNAVAILABLE",
    );
  };
}

const fetchRequest = createCloudflareStaticGateway();

export default {
  fetch: fetchRequest,
};
