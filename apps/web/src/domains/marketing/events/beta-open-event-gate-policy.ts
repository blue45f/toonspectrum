import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";

import { BETA_OPEN_EVENT } from "./event-catalog";

/**
 * The public root is the product's orientation screen. Keep first-visit promotion
 * available on discovery pages without covering the primary service explanation.
 */
export function betaOpenEventGateEligible(pathname: string): boolean {
  if (!BETA_OPEN_EVENT.firstVisitExposure) return false;
  if (pathname === "/" || pathname === "/events" || pathname.startsWith("/events/")) return false;
  return isPublicCreativeRoute(pathname);
}
