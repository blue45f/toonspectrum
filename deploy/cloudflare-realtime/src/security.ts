import { isRealtimeId } from "./protocol";

export const REALTIME_DEFAULT_ALLOWED_ORIGINS = [
  "https://toonstudio.cloud",
  "https://www.toonstudio.cloud",
] as const;

export interface RealtimeRoomScope {
  readonly workId: string;
  readonly roomId: string;
}

const TOONSTUDIO_HOST_SUFFIX = ".toonstudio.cloud";
const FORBIDDEN_TICKET_QUERY_KEYS = new Set([
  "access_token",
  "authorization",
  "jwt",
  "ticket",
  "token",
]);

function parseAllowedOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    const hostIsAllowed =
      parsed.hostname === "toonstudio.cloud" ||
      parsed.hostname.endsWith(TOONSTUDIO_HOST_SUFFIX);
    if (
      parsed.protocol !== "https:" ||
      parsed.origin !== value ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      !hostIsAllowed
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveAllowedOrigins(
  configuredOrigins: string | undefined,
): ReadonlySet<string> {
  if (configuredOrigins === undefined || configuredOrigins.trim() === "") {
    return new Set(REALTIME_DEFAULT_ALLOWED_ORIGINS);
  }
  const candidates = configuredOrigins
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (candidates.length === 0 || candidates.length > 16) {
    throw new Error("REALTIME_ALLOWED_ORIGINS is invalid");
  }
  const parsed = candidates.map(parseAllowedOrigin);
  if (parsed.some((origin) => origin === null)) {
    throw new Error(
      "REALTIME_ALLOWED_ORIGINS must contain exact HTTPS toonstudio.cloud origins",
    );
  }
  return new Set(parsed as string[]);
}

export function isAllowedRealtimeOrigin(
  origin: string | null,
  allowedOrigins: ReadonlySet<string>,
): origin is string {
  if (origin === null) {
    return false;
  }
  const parsed = parseAllowedOrigin(origin);
  return parsed !== null && allowedOrigins.has(parsed);
}

export function hasForbiddenCredentialQuery(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (FORBIDDEN_TICKET_QUERY_KEYS.has(key.toLowerCase())) {
      return true;
    }
  }
  return false;
}

export function parseRealtimeRoomPath(
  pathname: string,
): RealtimeRoomScope | null {
  const match = /^\/v1\/rooms\/([^/]+)\/([^/]+)$/u.exec(pathname);
  if (match === null) {
    return null;
  }
  try {
    const workId = decodeURIComponent(match[1]);
    const roomId = decodeURIComponent(match[2]);
    return isRealtimeId(workId) && isRealtimeId(roomId)
      ? { workId, roomId }
      : null;
  } catch {
    return null;
  }
}

export function normalizeRealtimeRoomObjectName(
  scope: RealtimeRoomScope,
): string {
  if (!isRealtimeId(scope.workId) || !isRealtimeId(scope.roomId)) {
    throw new Error("Realtime room scope is invalid");
  }
  return `work:${encodeURIComponent(scope.workId)}:room:${encodeURIComponent(
    scope.roomId,
  )}`;
}

export function isWebSocketUpgrade(request: Request): boolean {
  return (
    request.method === "GET" &&
    request.headers.get("Upgrade")?.toLowerCase() === "websocket"
  );
}
