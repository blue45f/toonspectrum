export type SiteRouteProduct = "studio" | "spectrum" | "docs";
export type SiteRoutePurpose = "create" | "discover" | "learn" | "connect" | "manage" | "trust";
export type SiteRouteMaturity = "stable" | "beta" | "experimental";
export type SiteRouteAccess = "public" | "sign-in" | "project";
export type SiteRouteDevice = "responsive" | "desktop-first";

export interface SiteRouteMetadata {
  readonly canonicalPath: string;
  readonly product: SiteRouteProduct;
  readonly purpose: SiteRoutePurpose;
  readonly maturity: SiteRouteMaturity;
  readonly access: SiteRouteAccess;
  readonly device: SiteRouteDevice;
  readonly projectContext: "none" | "optional" | "required";
}

/**
 * Historical URLs remain routable, but navigation, search and analytics must use one canonical
 * destination. Keeping the aliases here prevents the site directory, recent history and command
 * palette from each inventing a different answer.
 */
export const SITE_ROUTE_ALIASES = {
  "/brush-lab": "/studio/assets/brushes/new",
  "/challenges": "/showcase/challenges",
  "/create": "/showcase",
  "/create/challenges": "/showcase/challenges",
  "/create/promo": "/showcase/promo",
  "/creator-hub": "/studio",
  "/creator-hub/references": "/research/assets",
  "/make": "/studio/new",
  "/music": "/studio/assets/audio",
  "/publishing": "/studio/publish",
  "/studio/brush-lab": "/studio/assets/brushes/new",
} as const satisfies Readonly<Record<string, string>>;

const pathMatches = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);
const pathMatchesAny = (pathname: string, routes: readonly string[]) => routes.some((route) => pathMatches(pathname, route));

export function canonicalSitePath(input: string): string {
  const pathname = input.split(/[?#]/u, 1)[0] || "/";
  const normalized = pathname !== "/" ? pathname.replace(/\/+$/u, "") || "/" : "/";
  return SITE_ROUTE_ALIASES[normalized as keyof typeof SITE_ROUTE_ALIASES] ?? normalized;
}

const DOC_ROUTES = [
  "/about",
  "/accessibility",
  "/contact",
  "/copyright",
  "/design",
  "/feedback",
  "/guide",
  "/help",
  "/privacy",
  "/sitemap",
  "/support",
  "/terms",
] as const;

const STUDIO_PUBLIC_ROUTES = [
  "/collaborate",
  "/learn",
  "/market",
  "/now",
  "/opportunities",
  "/references",
  "/research",
  "/showcase",
  "/story-lab",
  "/studio",
] as const;

const LEARNING_ROUTES = ["/about/workflow", "/learn", "/references", "/research"] as const;
const CONNECT_ROUTES = ["/collaborate", "/community", "/contact", "/feedback", "/messages", "/showcase", "/support"] as const;
const MANAGE_ROUTES = ["/library", "/me", "/my", "/settings"] as const;
const TRUST_ROUTES = ["/about", "/accessibility", "/copyright", "/design", "/guide", "/help", "/privacy", "/sitemap", "/terms"] as const;
const CREATE_ROUTES = ["/market", "/now", "/opportunities", "/story-lab", "/studio"] as const;

const EXPERIMENTAL_ROUTES = [
  "/read/spatial",
  "/studio/3d/dcc/sculpt",
  "/studio/ai-lab",
  "/studio/ai-runtime",
  "/studio/character-convert",
  "/studio/generate",
  "/studio/lift3d",
] as const;

const BETA_ROUTES = [
  "/insights",
  "/market/fit",
  "/showcase/promo",
  "/studio/3d",
  "/studio/animation",
  "/studio/bg3d",
  "/studio/character",
  "/studio/ecosystem",
  "/studio/poser",
  "/studio/storyworld",
] as const;

const SIGN_IN_ROUTES = [
  "/collaborate/new",
  "/community/promote/new",
  "/library",
  "/market/library",
  "/market/manage",
  "/market/publish",
  "/market/wishlist",
  "/me",
  "/messages",
  "/my",
  "/settings/ai",
] as const;

const PROJECT_ROUTES = [
  "/studio/ecosystem",
  "/studio/jobs",
  "/studio/present",
  "/studio/publish",
  "/studio/review",
  "/studio/share",
  "/studio/versions",
] as const;

const OPTIONAL_PROJECT_ROUTES = [
  "/market/compare",
  "/market/fit",
  "/research",
  "/studio/assets",
  "/studio/manual",
  "/studio/projects",
  "/studio/toolchain",
] as const;

const DESKTOP_FIRST_ROUTES = [
  "/showcase/promo",
  "/studio/3d",
  "/studio/animation",
  "/studio/assets/brushes/new",
  "/studio/bg3d",
  "/studio/character",
  "/studio/ecosystem/viewer",
  "/studio/lift3d",
  "/studio/poser",
] as const;

export function resolveSiteRouteMetadata(input: string): SiteRouteMetadata {
  const canonicalPath = canonicalSitePath(input);
  const product: SiteRouteProduct = pathMatchesAny(canonicalPath, DOC_ROUTES)
    ? "docs"
    : pathMatchesAny(canonicalPath, STUDIO_PUBLIC_ROUTES)
      ? "studio"
      : "spectrum";

  let purpose: SiteRoutePurpose = "discover";
  if (pathMatchesAny(canonicalPath, TRUST_ROUTES)) purpose = "trust";
  else if (pathMatchesAny(canonicalPath, MANAGE_ROUTES)) purpose = "manage";
  else if (pathMatchesAny(canonicalPath, CONNECT_ROUTES)) purpose = "connect";
  else if (pathMatchesAny(canonicalPath, LEARNING_ROUTES)) purpose = "learn";
  else if (pathMatchesAny(canonicalPath, CREATE_ROUTES)) purpose = "create";

  const maturity: SiteRouteMaturity = pathMatchesAny(canonicalPath, EXPERIMENTAL_ROUTES)
    ? "experimental"
    : pathMatchesAny(canonicalPath, BETA_ROUTES)
      ? "beta"
      : "stable";

  const access: SiteRouteAccess = pathMatchesAny(canonicalPath, PROJECT_ROUTES)
    ? "project"
    : pathMatchesAny(canonicalPath, SIGN_IN_ROUTES)
      ? "sign-in"
      : "public";

  const projectContext = pathMatchesAny(canonicalPath, PROJECT_ROUTES)
    ? "required"
    : pathMatchesAny(canonicalPath, OPTIONAL_PROJECT_ROUTES)
      ? "optional"
      : "none";

  return {
    canonicalPath,
    product,
    purpose,
    maturity,
    access,
    device: pathMatchesAny(canonicalPath, DESKTOP_FIRST_ROUTES) ? "desktop-first" : "responsive",
    projectContext,
  };
}

export function siteRouteMetadataSearchText(metadata: SiteRouteMetadata): string {
  return [
    metadata.product,
    metadata.purpose,
    metadata.maturity,
    metadata.access,
    metadata.device,
    metadata.projectContext,
  ].join(" ");
}
