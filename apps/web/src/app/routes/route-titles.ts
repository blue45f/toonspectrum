import { useEffect } from "react";

import "./reference-labels";
import { shouldAppRouterOwnDocumentTitle } from "./app-route-title-ownership";
import { CREATOR_RESOURCE_TITLES } from "./creator-resource-titles";

import { useT } from "@/shared/lib/i18n";
import { decodePathSegment } from "@/shared/lib/decode-path-segment";
import { canonicalSitePath } from "@/shared/lib/site-route-metadata";
import { isStudioRoutePathname } from "@/domains/creator/studio-workspace-route";

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

export function resolveRouteTitle(pathname: string, t: Translator): string {
  const canonicalPath = canonicalSitePath(pathname);
  if (canonicalPath === "/") return `${t("app.name")} · ${t("home.creatorTitle")}`;
  if (Object.hasOwn(CREATOR_RESOURCE_TITLES, canonicalPath)) return CREATOR_RESOURCE_TITLES[canonicalPath];
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
  const title = resolveRouteTitle(pathname, t);
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
