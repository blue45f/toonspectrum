const EXPORTED_HTTP_URL_PATTERN = /(?:^|[\s(<["'])(https?:\/\/[^\s<>"'`\\]+)/gimu;
const TRAILING_MARKDOWN_PUNCTUATION_PATTERN = /[)\],.;:!?}]+$/u;

function parseTrustedHttpsUrl(value: string, label: string): URL {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
  ) {
    throw new TypeError(`${label} must be an HTTPS URL without credentials`);
  }
  return parsed;
}

function hasSameAuthority(candidate: URL, expected: URL): boolean {
  return candidate.protocol === expected.protocol
    && candidate.hostname === expected.hostname
    && candidate.port === expected.port
    && candidate.username === ""
    && candidate.password === "";
}

/**
 * Parses URL-shaped tokens from exported Markdown/text before provenance checks.
 * Consumers must compare parsed URL components; never authorize a raw substring.
 */
export function extractExportedHttpUrls(text: string): URL[] {
  const urls: URL[] = [];
  for (const match of text.matchAll(EXPORTED_HTTP_URL_PATTERN)) {
    const token = match[1]?.replace(TRAILING_MARKDOWN_PUNCTUATION_PATTERN, "");
    if (!token) continue;
    try {
      const parsed = new URL(token);
      if (
        (parsed.protocol === "http:" || parsed.protocol === "https:")
        && parsed.username === ""
        && parsed.password === ""
      ) {
        urls.push(parsed);
      }
    } catch {
      // Ignore malformed export tokens; the caller decides whether a required URL is missing.
    }
  }
  return urls;
}

export function hasExactExportedHttpsUrl(text: string, expectedHref: string): boolean {
  const expected = parseTrustedHttpsUrl(expectedHref, "expectedHref");
  return extractExportedHttpUrls(text).some((candidate) => (
    hasSameAuthority(candidate, expected)
    && candidate.pathname === expected.pathname
    && candidate.search === expected.search
    && candidate.hash === expected.hash
  ));
}

export function hasExportedHttpsUrlUnderPath(
  text: string,
  expectedOrigin: string,
  pathnamePrefix: string,
): boolean {
  const expected = parseTrustedHttpsUrl(expectedOrigin, "expectedOrigin");
  if (
    expected.pathname !== "/"
    || expected.search !== ""
    || expected.hash !== ""
  ) {
    throw new TypeError("expectedOrigin must not include a path, query, or fragment");
  }
  if (!pathnamePrefix.startsWith("/") || !pathnamePrefix.endsWith("/")) {
    throw new TypeError("pathnamePrefix must be an absolute directory path ending in /");
  }

  return extractExportedHttpUrls(text).some((candidate) => (
    hasSameAuthority(candidate, expected)
    && candidate.pathname.startsWith(pathnamePrefix)
    && candidate.pathname.length > pathnamePrefix.length
  ));
}
