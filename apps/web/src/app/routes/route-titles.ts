import { useEffect } from "react";

import "./reference-labels";
import { shouldAppRouterOwnDocumentTitle } from "./app-route-title-ownership";
import { CREATOR_RESOURCE_TITLES } from "./creator-resource-titles";

import { useI18n, useT } from "@/shared/lib/i18n";
import { decodePathSegment } from "@/shared/lib/decode-path-segment";
import { resolveSiteRouteAuthority } from "@/shared/lib/site-route-authority";
import { canonicalSitePath } from "@/shared/lib/site-route-metadata";
import { isStudioRoutePathname } from "@/domains/creator/studio-workspace-route";
import { PRODUCT_IDENTITY, resolveProductLocale, type ProductLocale } from "@/shared/lib/product-identity";

// Static route browser titles. Detail pages that own richer content titles remain responsible for
// updating the document, while this table still provides an accessible route-level fallback.
export const STATIC_TITLES: Record<string, string> = {
  "/": "",
  "/ranking": "route.ranking",
  "/search": "route.search",
  "/references": "route.references",
  "/recommend": "route.recommend",
  "/explore": "route.explore",
  "/random": "route.random",
  "/feedback": "route.feedback",
  "/tags": "route.tags",
  "/calendar": "route.calendar",
  "/reviews": "route.reviews",
  "/community": "route.community",
  "/community/cafes": "route.community_cafes",
  "/market": "route.market",
  "/market/browse": "route.marketBrowse",
  "/market/publish": "route.marketPublish",
  "/market/manage": "route.marketManage",
  "/market/library": "route.marketLibrary",
  "/market/wishlist": "route.marketWishlist",
  "/admin/community": "route.adminCommunity",
  "/admin/members": "route.adminMembers",
  "/library": "route.library",
  "/compare": "route.compare",
  "/insights": "route.insights",
  "/authors": "route.authors",
  "/news": "route.news",
  "/about": "route.about",
  "/about/workflow": "route.about",
  "/about/technology": "route.about",
  "/about/technology/story": "route.about",
  "/about/technology/guides": "route.about",
  "/about/technology/references": "route.about",
  "/about/technology/deck": "route.about",
  "/about/technology/videos": "route.about",
  "/about/technology/licenses": "route.about",
  "/about/principles": "route.about",
  "/design": "route.design",
  "/sitemap": "route.sitemap",
  "/guide": "route.guide",
  "/settings": "route.settings",
  "/admin": "route.admin",
  "/terms": "route.terms",
  "/privacy": "route.privacy",
  "/copyright": "route.copyright",
  "/contact": "route.contact",
  "/support": "route.support",
  "/create": "route.create",
  "/showcase": "route.create",
  "/studio": "route.studio",
  "/shaper": "route.shaper",
  "/me": "route.me",
  "/fortune": "route.fortune",
  "/play": "route.play",
};

type Translator = ReturnType<typeof useT>;

export function resolveRouteTitle(pathname: string, t: Translator, productLocale?: ProductLocale): string {
  const canonicalPath = canonicalSitePath(pathname);
  if (canonicalPath === "/") return productLocale ? PRODUCT_IDENTITY[productLocale].seoTitle : `${t("app.name")} · ${t("home.creatorTitle")}`;
  if (Object.hasOwn(CREATOR_RESOURCE_TITLES, canonicalPath)) return CREATOR_RESOURCE_TITLES[canonicalPath];
  const authority = resolveSiteRouteAuthority(canonicalPath);
  if (authority) return t(authority.titleKey);
  if (canonicalPath in STATIC_TITLES) {
    const titleKey = STATIC_TITLES[canonicalPath];
    return titleKey ? t(titleKey) : t("app.name");
  }
  if (canonicalPath.startsWith("/author/")) return decodePathSegment(canonicalPath.slice(8));
  if (canonicalPath.startsWith("/pencafe/")) return `${decodePathSegment(canonicalPath.slice(9))} ${t("route.pencafeSuffix")}`;
  if (canonicalPath.startsWith("/community/")) return t("route.community");
  if (canonicalPath.startsWith("/market/resource/")) return t("route.market");
  if (canonicalPath.startsWith("/admin/")) return t("route.admin");
  if (canonicalPath === "/me" || canonicalPath.startsWith("/me/")) return t("route.me");
  if (isStudioRoutePathname(canonicalPath)) return t("route.studio");
  return t("app.name");
}

export function useRouteTitle(pathname: string, search: string): string {
  const t = useT();
  const language = useI18n((state) => state.lang);
  const title = resolveRouteTitle(pathname, t, resolveProductLocale(language));
  useEffect(() => {
    if (!shouldAppRouterOwnDocumentTitle({ pathname, search })) return;
    if (pathname === "/") {
      document.title = title;
      return;
    }
    document.title = title === t("app.name") ? title : `${title} · ${t("app.name")}`;
  }, [pathname, search, t, title]);
  return title;
}
