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
