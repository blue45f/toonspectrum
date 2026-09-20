/** Stable active state for the four global workspace destinations. */
export function workspaceNavigationActiveId(pathname: string): string | null {
  const path = (pathname.split(/[?#]/u, 1)[0] ?? "/").replace(/\/+$/u, "") || "/";
  if (path === "/" || path === "/home" || /^\/studio\/p\/[^/]+\/space$/u.test(path)) return "workspace-home";
  const matches = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  if (["/team", "/collaborate"].some(matches)) return "workspace-team";
  if (["/studio", "/production"].some(matches)) return "studio";
  const explore = [
    "/hub", "/showcase", "/create", "/discover", "/explore", "/ranking", "/market",
    "/research", "/community", "/learn", "/opportunities", "/fortune", "/library",
    "/search", "/title", "/author", "/calendar", "/recommend", "/insights",
    "/reviews", "/now", "/play", "/events",
  ];
  return explore.some(matches) ? "workspace-hub" : null;
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
  if (!["/home", "/team", "/hub"].includes(href)) return href;
  const params = new URLSearchParams();
  if (context.personal) params.set("scope", "personal");
  else if (context.projectId) params.set("project", context.projectId);
  return params.size ? `${href}?${params.toString()}` : href;
}
