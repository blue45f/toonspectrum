export const CLOUDFLARE_STATIC_MAX_FILE_BYTES = 25 * 1024 * 1024;

export const CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS = [
  "assets/opencascade.wasm-*.wasm",
  "assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb",
] as const;

const MODULAR_STREET_SEATING_PATH =
  "/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb";
const OPENCASCADE_PATH_PATTERN =
  /^\/assets\/opencascade\.wasm-[A-Za-z0-9_-]+\.wasm$/u;

/**
 * Cloudflare Static Assets rejects individual files larger than 25 MiB.
 * These immutable paths stay on the application origin until R2 is enabled,
 * while all other static traffic remains on the free Static Assets path.
 */
export function isCloudflareOversizedAssetPath(pathname: string): boolean {
  return pathname === MODULAR_STREET_SEATING_PATH
    || OPENCASCADE_PATH_PATTERN.test(pathname);
}
