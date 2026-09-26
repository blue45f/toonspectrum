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
  if (origin === null) return false;
  const optionalPaths = [
    "/api/health/ready",
    "/api/health/capabilities",
    "/api/studio-realtime/tickets",
  ];
  return optionalPaths.some((path) => message === `Failed to load resource: the server responded with a status of 502 (Bad Gateway) @ ${origin}${path}`);
}
export function isStaticPreviewReadinessResponse(status: number, responseUrl: string, studioUrl: string): boolean {
  const origin = localPreviewOrigin(studioUrl);
  if (origin === null || status !== 502) return false;
  return [
    `${origin}/api/health/ready`,
    `${origin}/api/health/capabilities`,
    `${origin}/api/studio-realtime/tickets`,
  ].includes(responseUrl);
}
