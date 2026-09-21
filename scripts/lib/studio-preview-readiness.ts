/** Static-only verifiers have no API. Never apply this classification to production origins. */
function localPreviewOrigin(studioUrl: string): string | null {
  try {
    const url = new URL(studioUrl);
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port
      && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}
export function isStaticPreviewReadinessUnavailable(message: string, studioUrl: string): boolean {
  const origin = localPreviewOrigin(studioUrl);
  return origin !== null && message === `Failed to load resource: the server responded with a status of 502 (Bad Gateway) @ ${origin}/api/health/ready`;
}
export function isStaticPreviewReadinessResponse(status: number, responseUrl: string, studioUrl: string): boolean {
  const origin = localPreviewOrigin(studioUrl);
  return origin !== null && status === 502 && responseUrl === `${origin}/api/health/ready`;
}
