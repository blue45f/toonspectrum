const MAXIMUM_LOGGED_METHOD_LENGTH = 32;
const MAXIMUM_LOGGED_PATH_LENGTH = 2_048;

interface SafeRequestLog {
  readonly method?: string;
  readonly url?: string;
}

interface SafeResponseLog {
  readonly statusCode?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeMethod(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (
    normalized.length === 0 ||
    normalized.length > MAXIMUM_LOGGED_METHOD_LENGTH ||
    !/^[A-Z][A-Z0-9-]*$/u.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function boundedPathWithoutControlCharacters(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      codePoint <= 0x1f ||
      codePoint === 0x7f
    ) {
      continue;
    }
    result += character;
    if (result.length >= MAXIMUM_LOGGED_PATH_LENGTH) break;
  }
  return result;
}

function sanitizePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  let path = trimmed;
  if (/^https?:\/\//iu.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return undefined;
    }
  } else {
    const queryIndex = path.indexOf("?");
    const fragmentIndex = path.indexOf("#");
    const boundary = [queryIndex, fragmentIndex]
      .filter((index) => index >= 0)
      .reduce(
        (lowest, index) => Math.min(lowest, index),
        path.length,
      );
    path = path.slice(0, boundary);
  }

  path = boundedPathWithoutControlCharacters(path);
  if (path.length === 0) return undefined;
  return path;
}

/**
 * Pino HTTP's default request serializer includes the complete header bag and
 * network address. Vercel injects bearer credentials and signed proxy metadata
 * into those headers, so request logging is deliberately an allowlist boundary.
 */
export function serializeSafeHttpRequest(value: unknown): SafeRequestLog {
  if (!isRecord(value)) return {};

  const method = sanitizeMethod(value.method);
  const url = sanitizePath(value.originalUrl ?? value.url);

  return {
    ...(method ? { method } : {}),
    ...(url ? { url } : {}),
  };
}

/**
 * Response headers can contain Set-Cookie credentials. Preserve only the
 * bounded status code needed for operational request metrics.
 */
export function serializeSafeHttpResponse(value: unknown): SafeResponseLog {
  if (!isRecord(value)) return {};
  const statusCode = value.statusCode;
  if (
    typeof statusCode !== "number" ||
    !Number.isInteger(statusCode) ||
    statusCode < 100 ||
    statusCode > 599
  ) {
    return {};
  }
  return { statusCode };
}

export const SAFE_HTTP_LOG_SERIALIZERS = Object.freeze({
  req: serializeSafeHttpRequest,
  res: serializeSafeHttpResponse,
});

export const SAFE_HTTP_LOG_REDACT_PATHS = Object.freeze([
  "req.headers",
  "req.raw.headers",
  "res.headers",
  "res.raw.headers",
]);
