export const CLOUDFLARE_STATIC_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const CLOUDFLARE_R2_LARGE_ASSET_BUCKET = "toonspectrum-public-assets";
export const CLOUDFLARE_R2_LARGE_ASSET_BINDING = "LARGE_ASSETS";
export const CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL =
  "public, max-age=31536000, immutable";

export const CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS = [
  "assets/opencascade.wasm-*.wasm",
  "assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb",
  "brand/toonstudio-product-tour.mp4",
] as const;

export const CLOUDFLARE_LARGE_ASSET_ENCODINGS = ["br", "gzip"] as const;
export type CloudflareLargeAssetEncoding =
  (typeof CLOUDFLARE_LARGE_ASSET_ENCODINGS)[number];

export interface CloudflareLargeAssetDescriptor {
  readonly contentType: string;
}

const MODULAR_STREET_SEATING_PATH =
  "/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb";
const PRODUCT_TOUR_PATH = "/brand/toonstudio-product-tour.mp4";
const OPENCASCADE_PATH_PATTERN =
  /^\/assets\/opencascade\.wasm-[A-Za-z0-9_-]+\.wasm$/u;

export function cloudflareLargeAssetDescriptor(
  pathname: string,
): CloudflareLargeAssetDescriptor | null {
  if (pathname === MODULAR_STREET_SEATING_PATH) {
    return { contentType: "model/gltf-binary" };
  }
  if (pathname === PRODUCT_TOUR_PATH) {
    return { contentType: "video/mp4" };
  }
  if (OPENCASCADE_PATH_PATTERN.test(pathname)) {
    return { contentType: "application/wasm" };
  }
  return null;
}

export function isCloudflareOversizedAssetPath(pathname: string): boolean {
  return cloudflareLargeAssetDescriptor(pathname) !== null;
}

export function supportsCloudflareStaticSidecar(pathname: string): boolean {
  return pathname !== PRODUCT_TOUR_PATH && isCloudflareOversizedAssetPath(pathname);
}

export function cloudflareLargeAssetKey(pathname: string): string | null {
  return cloudflareLargeAssetDescriptor(pathname)
    ? pathname.replace(/^\/+/, "")
    : null;
}

export function cloudflareLargeAssetSidecarPath(
  pathname: string,
  encoding: CloudflareLargeAssetEncoding,
): string {
  return `${pathname}.${encoding === "br" ? "br" : "gz"}`;
}
