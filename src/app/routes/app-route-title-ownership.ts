import { isStudioWorkspaceLocation } from "@/src/domains/creator/studio-workspace-route";

export interface AppRouteTitleLocation {
  readonly pathname: string;
  readonly search?: string;
}

/**
 * AppRouter owns generic/dynamic route titles. Editor-style children retain title ownership so a
 * nested route transition cannot overwrite a document title whose source state did not change.
 */
export function shouldAppRouterOwnDocumentTitle({
  pathname,
  search = "",
}: AppRouteTitleLocation): boolean {
  if (pathname.startsWith("/title/")) return false;
  if (pathname.startsWith("/create/")) return false;
  if (pathname.startsWith("/u/")) return false;
  if (pathname.startsWith("/community/cafes/")) return false;
  if (pathname.startsWith("/community/post/")) return false;
  if (pathname === "/studio/tools-companion") return false;
  return !isStudioWorkspaceLocation({ pathname, search });
}
