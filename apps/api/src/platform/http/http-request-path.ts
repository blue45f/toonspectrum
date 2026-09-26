const MAXIMUM_SAFE_HTTP_PATH_LENGTH = 2_048;

function boundedPathWithoutControlCharacters(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined
      || codePoint <= 0x1f
      || codePoint === 0x7f
    ) {
      continue;
    }
    result += character;
    if (result.length >= MAXIMUM_SAFE_HTTP_PATH_LENGTH) break;
  }
  return result;
}

/**
 * Returns only a bounded request pathname suitable for public error envelopes and logs.
 * Query strings and fragments can carry OAuth codes, signed URLs and bearer credentials, so
 * callers must never fall back to the original URL after this function rejects a value.
 */
export function normalizeSafeHttpPathname(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  let pathname = trimmed;
  if (/^https?:\/\//iu.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return undefined;
    }
  } else {
    const queryIndex = pathname.indexOf("?");
    const fragmentIndex = pathname.indexOf("#");
    const boundary = [queryIndex, fragmentIndex]
      .filter((index) => index >= 0)
      .reduce(
        (lowest, index) => Math.min(lowest, index),
        pathname.length,
      );
    pathname = pathname.slice(0, boundary);
  }

  pathname = boundedPathWithoutControlCharacters(pathname);
  if (pathname.length === 0 || !pathname.startsWith("/")) return undefined;
  return pathname;
}

export function safeHttpRequestPathname(request: {
  readonly originalUrl?: unknown;
  readonly url?: unknown;
  readonly path?: unknown;
}): string {
  return normalizeSafeHttpPathname(request.originalUrl)
    ?? normalizeSafeHttpPathname(request.url)
    ?? normalizeSafeHttpPathname(request.path)
    ?? "/";
}
