export const CANONICAL_ORIGIN = "https://www.toonstudio.cloud";

const REDIRECT_CACHE_CONTROL = "public, max-age=3600";
const STRICT_TRANSPORT_SECURITY =
  "max-age=63072000; includeSubDomains; preload";

export function canonicalRedirect(request: Request): Response {
  const source = new URL(request.url);
  const target = new URL(`${source.pathname}${source.search}`, CANONICAL_ORIGIN);

  return new Response(null, {
    status: 308,
    headers: {
      "cache-control": REDIRECT_CACHE_CONTROL,
      location: target.href,
      "referrer-policy": "strict-origin-when-cross-origin",
      "strict-transport-security": STRICT_TRANSPORT_SECURITY,
      "x-content-type-options": "nosniff",
      "x-toonspectrum-canonical-origin": CANONICAL_ORIGIN,
    },
  });
}

export default {
  fetch(request: Request): Response {
    return canonicalRedirect(request);
  },
};
