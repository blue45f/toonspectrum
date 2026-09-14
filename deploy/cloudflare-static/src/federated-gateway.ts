import {
  COMMON_SECURITY_HEADERS,
  createCloudflareStaticGateway,
  type CloudflareStaticEnv,
} from "./index";

export interface FederatedCloudflareStaticEnv extends CloudflareStaticEnv {
  /**
   * Once enabled, every non-core workload must have its dedicated authority.
   * Compatibility fallback to core is removed, but write failover is never added.
   */
  readonly FEDERATED_API_STRICT?: string;
  /** Static Assets prefix for query-free public-read JSON snapshots. */
  readonly READ_MODEL_STATIC_PREFIX?: string;
}

export type FederatedRoute =
  | "core"
  | "public-read"
  | "social"
  | "playground"
  | "admin"
  | "realtime";

export type FederatedRoutingMode =
  | "core-authority"
  | "legacy-core-authority"
  | "dedicated-authority"
  | "replica-pool"
  | "static-read-model"
  | "unavailable";

interface FederatedGatewayRuntime {
  readonly fetch: typeof globalThis.fetch;
  readonly baseFetch?: (
    request: Request,
    env: CloudflareStaticEnv,
  ) => Promise<Response>;
}

const DEFAULT_RUNTIME: FederatedGatewayRuntime = {
  fetch: globalThis.fetch.bind(globalThis),
};

const SAFE_PUBLIC_READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const STATIC_FALLBACK_STATUSES = new Set([502, 503, 504]);
const MAX_PUBLIC_READ_ORIGINS = 8;
export const DEFAULT_READ_MODEL_STATIC_PREFIX = "/data/api-read-model";

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

function pathWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function publicReadPath(pathname: string): boolean {
  return PUBLIC_READ_EXACT_PATHS.has(pathname)
    || pathWithin(pathname, "/api/public")
    || pathWithin(pathname, "/api/titles")
    || pathWithin(pathname, "/api/authors");
}

export function classifyFederatedRoute(request: Request): FederatedRoute {
  const requestUrl = new URL(request.url);
  if (
    requestUrl.pathname === "/socket.io"
    || requestUrl.pathname.startsWith("/socket.io/")
    || pathWithin(requestUrl.pathname, "/api/realtime")
    || pathWithin(requestUrl.pathname, "/api/studio-live")
  ) return "realtime";
  if (pathWithin(requestUrl.pathname, "/api/admin")) return "admin";
  if (
    pathWithin(requestUrl.pathname, "/api/community")
    || pathWithin(requestUrl.pathname, "/api/reviews")
  ) return "social";
  if (
    pathWithin(requestUrl.pathname, "/api/fortune")
    || pathWithin(requestUrl.pathname, "/api/play")
  ) return "playground";
  if (
    SAFE_PUBLIC_READ_METHODS.has(request.method.toUpperCase())
    && publicReadPath(requestUrl.pathname)
  ) return "public-read";
  return "core";
}

function parseStrictMode(raw: string | undefined): boolean | null {
  if (raw === undefined || raw.trim() === "") return false;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function validatedOrigin(raw: string | undefined): URL | null {
  if (!raw?.trim()) return null;
  let origin: URL;
  try {
    origin = new URL(raw.trim());
  } catch {
    return null;
  }
  if (
    origin.protocol !== "https:"
    || origin.username !== ""
    || origin.password !== ""
    || origin.pathname !== "/"
    || origin.search !== ""
    || origin.hash !== ""
  ) return null;
  return origin;
}

function explicitOriginState(
  raw: string | undefined,
  requestOrigin: string,
): "missing" | "configured" | "invalid" {
  if (raw === undefined || raw.trim() === "") return "missing";
  const origin = validatedOrigin(raw);
  return origin && origin.origin !== requestOrigin ? "configured" : "invalid";
}

function publicReadOriginState(
  raw: string | undefined,
  requestOrigin: string,
): { readonly state: "missing" | "configured" | "invalid"; readonly count: number } {
  if (raw === undefined || raw.trim() === "") {
    return { state: "missing", count: 0 };
  }
  const values = raw.split(",").map((value) => value.trim());
  if (
    values.length === 0
    || values.length > MAX_PUBLIC_READ_ORIGINS
    || values.some((value) => value === "")
  ) return { state: "invalid", count: 0 };

  const origins = values.map(validatedOrigin);
  if (
    origins.some((origin) => origin === null || origin.origin === requestOrigin)
  ) return { state: "invalid", count: 0 };
  const normalized = origins.map((origin) => (origin as URL).origin);
  if (new Set(normalized).size !== normalized.length) {
    return { state: "invalid", count: 0 };
  }
  return { state: "configured", count: normalized.length };
}

function validStaticPrefix(value: string): boolean {
  return value.startsWith("/")
    && value !== "/"
    && !value.startsWith("/api")
    && !value.includes("?")
    && !value.includes("#")
    && !value.split("/").includes("..");
}

export function resolveReadModelStaticPrefix(raw: string | undefined): string {
  const candidate = raw?.trim() || DEFAULT_READ_MODEL_STATIC_PREFIX;
  return validStaticPrefix(candidate)
    ? candidate.replace(/\/+$/u, "")
    : DEFAULT_READ_MODEL_STATIC_PREFIX;
}

function routeOriginState(
  route: FederatedRoute,
  env: FederatedCloudflareStaticEnv,
  requestOrigin: string,
): "missing" | "configured" | "invalid" {
  switch (route) {
    case "core":
      return explicitOriginState(env.CORE_API_ORIGIN, requestOrigin);
    case "public-read":
      return publicReadOriginState(
        env.PUBLIC_READ_API_ORIGINS,
        requestOrigin,
      ).state;
    case "social":
      return explicitOriginState(env.SOCIAL_API_ORIGIN, requestOrigin);
    case "playground":
      return explicitOriginState(env.PLAYGROUND_API_ORIGIN, requestOrigin);
    case "admin":
      return explicitOriginState(env.ADMIN_API_ORIGIN, requestOrigin);
    case "realtime":
      return explicitOriginState(env.REALTIME_API_ORIGIN, requestOrigin);
  }
}

function routingMode(
  route: FederatedRoute,
  state: "missing" | "configured" | "invalid",
): FederatedRoutingMode {
  if (state === "invalid") return "unavailable";
  if (route === "core") return state === "configured"
    ? "core-authority"
    : "unavailable";
  if (state === "missing") return "legacy-core-authority";
  return route === "public-read" ? "replica-pool" : "dedicated-authority";
}

function routingHeaders(
  route: FederatedRoute,
  mode: FederatedRoutingMode,
): Record<string, string> {
  return {
    "x-toonspectrum-edge-route": route,
    "x-toonspectrum-edge-routing": mode,
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  route: FederatedRoute,
  mode: FederatedRoutingMode,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...COMMON_SECURITY_HEADERS,
      ...routingHeaders(route, mode),
    },
  });
}

function withRoutingHeaders(
  response: Response,
  route: FederatedRoute,
  mode: FederatedRoutingMode,
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(routingHeaders(route, mode))) {
    headers.set(name, value);
  }
  for (const [name, value] of Object.entries(COMMON_SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function sanitizedRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete("x-toonspectrum-edge");
  headers.delete("x-toonspectrum-edge-route");
  headers.delete("x-toonspectrum-edge-attempt");
  headers.delete("x-toonspectrum-edge-routing");
  return new Request(request, { headers });
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("upgrade")?.toLowerCase() === "websocket";
}

export function createReadModelSnapshotRequest(
  request: Request,
  rawPrefix: string | undefined,
): Request | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const incoming = new URL(request.url);
  if (incoming.search !== "" || !incoming.pathname.startsWith("/api/")) {
    return null;
  }
  const suffix = incoming.pathname.slice("/api".length).replace(/\/+$/u, "");
  if (!suffix || suffix === "/") return null;

  const target = new URL(incoming.origin);
  target.pathname = `${resolveReadModelStaticPrefix(rawPrefix)}${suffix}.json`;
  target.search = "";
  target.hash = "";
  return new Request(target, {
    method: request.method,
    headers: { accept: "application/json" },
    signal: request.signal,
  });
}

async function staticReadFallback(
  request: Request,
  env: FederatedCloudflareStaticEnv,
): Promise<Response | null> {
  const snapshotRequest = createReadModelSnapshotRequest(
    request,
    env.READ_MODEL_STATIC_PREFIX,
  );
  if (!snapshotRequest) return null;
  try {
    const response = await env.ASSETS.fetch(snapshotRequest);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok || !contentType.includes("json") || contentType.includes("html")) {
      return null;
    }
    return withRoutingHeaders(
      response,
      "public-read",
      "static-read-model",
    );
  } catch {
    return null;
  }
}

function optionalSettingValid(
  raw: string | undefined,
  requestOrigin: string,
): boolean {
  return explicitOriginState(raw, requestOrigin) !== "invalid";
}

function edgeHealth(
  requestUrl: URL,
  env: FederatedCloudflareStaticEnv,
): Response {
  const strict = parseStrictMode(env.FEDERATED_API_STRICT);
  const publicRead = publicReadOriginState(
    env.PUBLIC_READ_API_ORIGINS,
    requestUrl.origin,
  );
  const configured = {
    core: explicitOriginState(env.CORE_API_ORIGIN, requestUrl.origin) === "configured",
    publicReadReplicaCount: publicRead.count,
    social: explicitOriginState(env.SOCIAL_API_ORIGIN, requestUrl.origin) === "configured",
    playground: explicitOriginState(env.PLAYGROUND_API_ORIGIN, requestUrl.origin) === "configured",
    admin: explicitOriginState(env.ADMIN_API_ORIGIN, requestUrl.origin) === "configured",
    realtime: explicitOriginState(env.REALTIME_API_ORIGIN, requestUrl.origin) === "configured",
  };
  const staticPrefixRaw = env.READ_MODEL_STATIC_PREFIX?.trim();
  const configurationValid = strict !== null
    && publicRead.state !== "invalid"
    && optionalSettingValid(env.SOCIAL_API_ORIGIN, requestUrl.origin)
    && optionalSettingValid(env.PLAYGROUND_API_ORIGIN, requestUrl.origin)
    && optionalSettingValid(env.ADMIN_API_ORIGIN, requestUrl.origin)
    && optionalSettingValid(env.REALTIME_API_ORIGIN, requestUrl.origin)
    && (staticPrefixRaw === undefined
      || staticPrefixRaw === ""
      || validStaticPrefix(staticPrefixRaw));
  const strictReady = strict === false || (
    strict === true
    && configured.core
    && configured.publicReadReplicaCount > 0
    && configured.social
    && configured.playground
    && configured.admin
    && configured.realtime
  );
  const healthy = configurationValid && configured.core && strictReady;

  return jsonResponse(
    healthy ? 200 : 503,
    {
      status: healthy ? "ok" : "misconfigured",
      version: "cloudflare-federated-gateway-v1",
      strict,
      strictReady,
      configurationValid,
      configured,
      readModelStaticFallback: {
        enabled: true,
        prefix: resolveReadModelStaticPrefix(env.READ_MODEL_STATIC_PREFIX),
        queryFallbackEnabled: false,
      },
    },
    "core",
    healthy ? "core-authority" : "unavailable",
  );
}

export function createFederatedStaticGateway(
  runtime: FederatedGatewayRuntime = DEFAULT_RUNTIME,
) {
  const baseFetch = runtime.baseFetch
    ?? createCloudflareStaticGateway({ fetch: runtime.fetch });

  return async function fetchRequest(
    request: Request,
    env: FederatedCloudflareStaticEnv,
  ): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/api/edge/health") {
      return edgeHealth(requestUrl, env);
    }

    const route = classifyFederatedRoute(request);
    const strict = parseStrictMode(env.FEDERATED_API_STRICT);
    if (strict === null) {
      return jsonResponse(
        503,
        { error: "CORE_API_UNAVAILABLE" },
        route,
        "unavailable",
      );
    }

    const state = routeOriginState(route, env, requestUrl.origin);
    const mode = routingMode(route, state);
    if (state === "invalid") {
      return jsonResponse(
        503,
        { error: "CORE_API_UNAVAILABLE" },
        route,
        "unavailable",
      );
    }

    if (strict && route !== "core" && state === "missing") {
      const fallback = route === "public-read"
        ? await staticReadFallback(request, env)
        : null;
      return fallback ?? jsonResponse(
        503,
        { error: "CORE_API_UNAVAILABLE" },
        route,
        "unavailable",
      );
    }

    const response = await baseFetch(sanitizedRequest(request), env);
    if (isWebSocketUpgrade(request) || response.status === 101) return response;

    if (
      route === "public-read"
      && STATIC_FALLBACK_STATUSES.has(response.status)
    ) {
      const fallback = await staticReadFallback(request, env);
      if (fallback) return fallback;
    }
    return withRoutingHeaders(response, route, mode);
  };
}

const fetchRequest = createFederatedStaticGateway();

export default {
  fetch: fetchRequest,
};
