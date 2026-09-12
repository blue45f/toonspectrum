import { studioRouteOwnsDocumentTitle } from "@/domains/creator/studio-router/studio-route-manifest";

export interface AppRouteTitleLocation {
  readonly pathname: string;
  readonly search?: string;
}

/**
 * AppRouter owns generic/dynamic route titles. Editor-style and administration children retain
 * title ownership so nested route transitions can expose the exact active workspace title.
 */
export function shouldAppRouterOwnDocumentTitle({
  pathname,
  search = "",
}: AppRouteTitleLocation): boolean {
  if (pathname.startsWith("/title/")) return false;
  if (pathname.startsWith("/create/")) return false;
  // Canonical showcase details render the same title-owning children as legacy /create URLs.
  if (/^\/showcase\/(?:work|series)\/[^/]+\/?$/u.test(pathname) || pathname === "/showcase/challenges") return false;
  if (pathname === "/learn" || pathname.startsWith("/learn/")) return false;
  if (pathname.startsWith("/u/")) return false;
  if (pathname.startsWith("/community/cafes/")) return false;
  if (pathname.startsWith("/community/post/")) return false;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return false;
  if (pathname === "/studio/manual" || pathname.startsWith("/studio/manual/")) return false;
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    return !studioRouteOwnsDocumentTitle({ pathname, search });
  }
  return true;
}
