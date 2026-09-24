/**
 * The locally spawned Vite preview intentionally has no authenticated realtime
 * API session. Depending on the local preview/proxy path, the collaboration
 * ticket request is rejected as 401/403 or cannot reach an API and returns 502.
 * Keep only that exact environment-only ticket failure out of drawing/runtime
 * failures while retaining it as explicit report evidence. External origins and
 * every other error remain failures.
 *
 * @param {{ channel: string, text: string }} error
 * @param {{ origin: string, spawnedPreview: boolean }} options
 */
export function isExpectedLocalPreviewRuntimeNoise(error, options) {
  if (!options.spawnedPreview || error.channel !== "console") return false;
  let origin;
  try {
    origin = new URL(options.origin);
  } catch {
    return false;
  }
  if (
    origin.protocol !== "http:"
    || (origin.hostname !== "127.0.0.1"
      && origin.hostname !== "localhost"
      && origin.hostname !== "[::1]")
  ) return false;
  const ticketUrl = `${origin.origin}/api/studio-realtime/tickets`;
  const expectedStatus = ["401 (Unauthorized)", "403 (Forbidden)", "502 (Bad Gateway)"]
    .some((status) => error.text.includes(status));
  return expectedStatus
    && error.text.includes(ticketUrl)
    && error.text.includes("Failed to load resource");
}
