import { isStudioWorkspaceRoutePathname } from "@/domains/creator/studio-workspace-route";

/**
 * Routes that own their own mobile chrome (toolbars, sheets and keyboard avoidance).
 *
 * The Studio product home, new/import flows, assets and project management keep global navigation.
 * Only actual editor workspaces hide SiteHeader bottom tabs and global floating controls.
 */
export function isImmersiveMobileRoute(pathname: string): boolean {
  return isStudioWorkspaceRoutePathname(pathname);
}
