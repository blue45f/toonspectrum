/**
 * The locally spawned Vite preview intentionally runs with no API backend at all,
 * so two same-origin API calls are expected to fail there and nowhere else:
 *
 * - the collaboration ticket request, rejected as 401/403 or unreachable (502),
 *   because there is no authenticated realtime session;
 * - the capabilities probe, which 502s because the proxy has no upstream, and
 *   which the editor already degrades from (the editor root still mounts and
 *   drawing cycles still paint once the editor boots).
 *
 * Keep only those exact environment-only failures out of drawing/runtime failures
 * while retaining them as explicit report evidence. External origins, any other
 * endpoint, and every non-console error remain failures.
 *
 * @param {{ channel: string, text: string }} error
 * @param {{ origin: string, spawnedPreview: boolean }} options
 */
const EXPECTED_LOCAL_PREVIEW_API_PATHS = [
  "/api/studio-realtime/tickets",
  "/api/health/capabilities",
];

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
  const matchesExpectedApiPath = EXPECTED_LOCAL_PREVIEW_API_PATHS.some((path) =>
    error.text.includes(`${origin.origin}${path}`),
  );
  const expectedStatus = ["401 (Unauthorized)", "403 (Forbidden)", "502 (Bad Gateway)"]
    .some((status) => error.text.includes(status));
  return expectedStatus
    && matchesExpectedApiPath
    && error.text.includes("Failed to load resource");
}
