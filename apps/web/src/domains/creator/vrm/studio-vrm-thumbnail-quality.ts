const PRODUCTION_THUMBNAIL_PREFIX = "/assets/3d/characters/thumbnails/";
const PRODUCTION_THUMBNAIL_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

/**
 * Default catalogue cards must use a real, deployment-owned image. Generated initials, data URLs,
 * object URLs and legacy paths remain valid as diagnostic/upload fallbacks but are not production
 * discovery evidence.
 */
export function isStudioVrmProductionThumbnailUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith(PRODUCTION_THUMBNAIL_PREFIX)) {
    return false;
  }
  if (value.length > 512 || value.includes("\\") || value.includes("?") || value.includes("#")) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }

  const encodedRelative = value.slice(PRODUCTION_THUMBNAIL_PREFIX.length);
  let relative: string;
  try {
    relative = decodeURIComponent(encodedRelative);
  } catch {
    return false;
  }
  for (let index = 0; index < relative.length; index += 1) {
    const code = relative.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  if (relative.includes("\\") || relative.includes("?") || relative.includes("#")) {
    return false;
  }

  const segments = relative.split("/");
  if (
    !relative
    || relative.startsWith("/")
    || segments.some((part) => !part || part === "." || part === "..")
  ) {
    return false;
  }
  const extension = segments.at(-1)?.split(".").pop()?.toLowerCase();
  return extension !== undefined && PRODUCTION_THUMBNAIL_EXTENSIONS.has(extension);
}
