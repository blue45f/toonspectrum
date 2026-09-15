import { studioExternalReviewHref } from "@/domains/creator/studio-route-registry";

export function studioReviewLinkHref(token: string): string {
  const relative = studioExternalReviewHref(token);
  return typeof window === "undefined"
    ? relative
    : new URL(relative, window.location.origin).toString();
}
