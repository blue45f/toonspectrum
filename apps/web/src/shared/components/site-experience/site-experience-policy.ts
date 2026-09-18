export type ExperienceMode = "vivid" | "calm";
export type ExperienceLocale = string;export const EXPERIENCE_MODE_KEY = "toonstudio:site-experience:v1";

export function parseExperienceMode(value: string | null): ExperienceMode {
  return value === "calm" ? "calm" : "vivid";
}

function normalizedExperiencePath(pathname: string): string {
  return pathname.replace(/\/+$/u, "").toLowerCase() || "/";
}

/** Editors and administrative tools never inherit promotional chrome or effects. */
export function supportsSiteExperience(pathname: string): boolean {
  const path = normalizedExperiencePath(pathname);
  return !/^\/(?:studio|shaper|brush-lab|music|production|admin)(?:\/|$)/u.test(path);
}

const STUDIO_ROUTE_GUIDE_PATHS = new Set([
  "/studio", "/studio/ai-settings", "/studio/assets", "/studio/ecosystem", "/studio/growth-ip",
  "/studio/engines", "/studio/environment", "/studio/immersive", "/studio/import", "/studio/jobs",
  "/studio/manual", "/studio/new", "/studio/templates", "/studio/toolchain",
]);

/**
 * Route-purpose scenes may explain document-like Studio pages, but never cover an immersive
 * editor, asset authoring tool, review room, renderer, or administration surface.
 */
export function supportsRoutePurposeScene(pathname: string): boolean {
  const path = normalizedExperiencePath(pathname);
  // The creator home already owns a full visual hero and brand film; a second guide card
  // above it duplicates the page purpose and creates an artificial top-spacing gap.
  if (path === "/") return false;
  if (supportsSiteExperience(path)) return true;
  if (STUDIO_ROUTE_GUIDE_PATHS.has(path) || path.startsWith("/studio/manual/")) return true;
  return /^\/studio\/p\/[^/]+\/(?:overview|story|production|assets|review|export|settings)$/u.test(path);
}
