/**
 * The locally spawned Vite preview intentionally has no API server. Its proxy
 * therefore answers the collaboration-ticket request with 502. Keep this
 * environment-only absence out of drawing/runtime failures while retaining it
 * as explicit report evidence. External origins and every other error remain
 * failures.
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
  return error.text.includes("502 (Bad Gateway)")
    && error.text.includes(ticketUrl)
    && error.text.includes("Failed to load resource");
}
