import type { BrowserCompatibilityResult } from "../compat/browser-check";

const WEBGL_FEATURE = "WebGL 3D Graphic Engine";

const GRAPHICS_ROUTE_PREFIXES = [
  "/studio/bg3d",
  "/studio/poser",
  "/studio/character",
  "/studio/lift3d",
  "/studio/immersive",
  "/studio/generate",
  "/studio/ai-lab",
  "/read/spatial",
] as const;

function routeMatches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Graphics compatibility should interrupt only the feature that needs graphics. */
export function isGraphicsCapabilityRoute(pathname: string): boolean {
  return GRAPHICS_ROUTE_PREFIXES.some((prefix) => routeMatches(pathname, prefix));
}

/**
 * Keep public discovery, project management and 2D creation usable when only WebGL is missing.
 * Core browser gaps and genuinely legacy engines still receive the global compatibility warning.
 */
export function shouldPromptForBrowserCompatibility(
  pathname: string,
  result: BrowserCompatibilityResult,
): boolean {
  if (!result.recommendUpdate) return false;
  if (result.isLegacy) return true;

  const missingCoreFeature = result.missingFeatures.some((feature) => feature !== WEBGL_FEATURE);
  if (missingCoreFeature) return true;

  return result.missingFeatures.includes(WEBGL_FEATURE)
    && isGraphicsCapabilityRoute(pathname);
}
