const OPTIONAL_PREVIEW_API_PATHS = new Set([
  "/api/auth/session",
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
  "/api/analytics/traffic/",
  "/api/analytics/traffic/page-view",
]);

/** Only the optional backend of this exact, locally spawned static preview may be absent. */
export function isOptionalStudioPreviewApiError(message: string, previewUrl: string): boolean {
  let preview: URL;
  try {
    preview = new URL(previewUrl);
  } catch {
    return false;
  }
  if (preview.protocol !== "http:" || preview.hostname !== "127.0.0.1" || !preview.port) return false;
  for (const match of message.matchAll(/(?:https?|wss?):\/\/[^\s"'<>]+/gu)) {
    let resource: URL;
    try {
      resource = new URL(match[0]);
    } catch {
      continue;
    }
    if (resource.origin === preview.origin && OPTIONAL_PREVIEW_API_PATHS.has(resource.pathname)) return true;
    if (
      resource.protocol === "ws:"
      && resource.host === preview.host
      && resource.pathname === "/socket.io/"
      && resource.search === "?EIO=4&transport=websocket"
      && /Connection closed before receiving a handshake response|Unexpected response code: 400/u.test(message)
    ) return true;
  }
  return false;
}
