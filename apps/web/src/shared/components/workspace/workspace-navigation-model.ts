import { canonicalSitePath } from "@/shared/lib/site-route-authority";

/** Stable active state for the five global destinations shared by every shell. */
export function workspaceNavigationActiveId(pathname: string): string | null {
  const path = canonicalSitePath(pathname);
  if (path === "/" || path === "/home" || path === "/studio/space" || /^\/studio\/p\/[^/]+\/space$/u.test(path)) return "workspace-home";
  const matches = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  if (["/studio", "/production", "/story-lab", "/publish"].some(matches)) return "studio";
  if (["/team", "/collaborate", "/community", "/showcase", "/create", "/reviews", "/events", "/pencafe"].some(matches)) return "community";
  const explore = [
    "/hub", "/discover", "/explore", "/ranking", "/market", "/research",
    "/learn", "/opportunities", "/fortune", "/library", "/search", "/title", "/author",
    "/calendar", "/recommend", "/insights", "/now", "/play", "/news", "/tags", "/authors", "/references", "/compare", "/random",
  ];
  if (explore.some(matches)) return "explore";
  const all = [
    "/sitemap", "/help", "/settings", "/about", "/support", "/contact", "/business",
    "/accessibility", "/copyright", "/design", "/guide", "/product-tour", "/brand-film",
    "/my", "/me", "/messages", "/notifications",
  ];
  return all.some(matches) ? "all-menu" : null;
}

/** Navigation context is a pointer, never a grant of access or document authority. */
export interface WorkspaceNavigationContext {
  readonly projectId?: string | null;
  readonly personal?: boolean;
}

export function workspaceNavigationContext(pathname: string, search: string): WorkspaceNavigationContext {
  const match = /^\/studio\/p\/([^/]+)(?:\/|$)/u.exec(pathname);
  if (match) {
    // Keep malformed identities explicit rather than silently selecting another work.
    try { return { projectId: decodeURIComponent(match[1]!) }; }
    catch { return { projectId: match[1]! }; }
  }
  const params = new URLSearchParams(search);
  return params.get("scope") === "personal" ? { personal: true }
    : { projectId: params.get("project") };
}

/** Carry only workspace identity; panels, tabs and arbitrary URL values stay local. */
export function workspaceNavigationHref(href: string, context: WorkspaceNavigationContext): string {
  if (!["/", "/home", "/team", "/hub"].includes(href)) return href;
  const params = new URLSearchParams();
  if (context.personal) params.set("scope", "personal");
  else if (context.projectId) params.set("project", context.projectId);
  return params.size ? `${href}?${params.toString()}` : href;
}
