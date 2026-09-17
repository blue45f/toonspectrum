import {
  canonicalSitePath,
  resolveSiteRouteAuthority,
  type SiteRouteAccess,
  type SiteRouteDevice,
  type SiteRouteMaturity,
  type SiteRouteProduct,
  type SiteRouteProjectContext,
  type SiteRoutePurpose,
} from "./site-route-authority";

export { canonicalSitePath, SITE_ROUTE_ALIASES } from "./site-route-authority";
export type {
  SiteRouteAccess,
  SiteRouteDevice,
  SiteRouteMaturity,
  SiteRouteProduct,
  SiteRouteProjectContext,
  SiteRoutePurpose,
} from "./site-route-authority";

export interface SiteRouteMetadata {
  readonly canonicalPath: string;
  readonly product: SiteRouteProduct;
  readonly purpose: SiteRoutePurpose;
  readonly maturity: SiteRouteMaturity;
  readonly access: SiteRouteAccess;
  readonly device: SiteRouteDevice;
  readonly projectContext: SiteRouteProjectContext;
}

const pathMatches = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);
const pathMatchesAny = (pathname: string, routes: readonly string[]) => routes.some((route) => pathMatches(pathname, route));

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
  "/",
  "/brand-film",
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
const TRUST_ROUTES = ["/about", "/about/principles", "/accessibility", "/copyright", "/design", "/guide", "/help", "/privacy", "/sitemap", "/terms"] as const;
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

const STUDIO_NAVIGATION_DOC_ROUTES = ["/about/technology", "/help"] as const;

export function resolveSiteRouteMetadata(input: string): SiteRouteMetadata {
  const canonicalPath = canonicalSitePath(input);
  const authority = resolveSiteRouteAuthority(canonicalPath);
  if (authority) {
    return {
      canonicalPath,
      product: authority.product,
      purpose: authority.purpose,
      maturity: authority.maturity,
      access: authority.access,
      device: authority.device,
      projectContext: authority.projectContext,
    };
  }
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


/** Resolve the product navigation shell from canonical route metadata instead of duplicating route prefixes. */
export function resolveSiteRouteNavigationContext(input: string): "studio" | "spectrum" {
  const canonicalPath = canonicalSitePath(input);
  const metadata = resolveSiteRouteMetadata(canonicalPath);
  return metadata.product === "studio" || pathMatchesAny(canonicalPath, STUDIO_NAVIGATION_DOC_ROUTES)
    ? "studio"
    : "spectrum";
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
