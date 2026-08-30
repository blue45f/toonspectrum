export type StudioCommunityMarketplaceView = "community" | "mine" | "share";

export function resolveStudioCommunityMarketplaceInitialView(
  searchParams: Pick<URLSearchParams, "get">,
): StudioCommunityMarketplaceView {
  const requestedView = searchParams.get("communityView");
  if (requestedView === "mine" || requestedView === "share") {
    return requestedView;
  }
  return "community";
}
