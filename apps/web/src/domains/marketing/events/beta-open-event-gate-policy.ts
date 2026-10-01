import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";

import { BETA_OPEN_EVENT } from "./event-catalog";

/** 영상 재생기와 챕터 목록을 가리면 시청 흐름이 끊기므로 홍보영상 페이지에는 띄우지 않는다. */
const MEDIA_PAGES = new Set(["/product-tour", "/brand-film"]);

/**
 * The public root is the product's orientation screen. Keep first-visit promotion
 * available on discovery pages without covering the primary service explanation.
 */
export function betaOpenEventGateEligible(pathname: string): boolean {
  if (!BETA_OPEN_EVENT.firstVisitExposure) return false;
  const normalized = pathname.toLowerCase().replace(/\/+$/u, "") || "/";
  if (normalized === "/" || normalized === "/events" || normalized.startsWith("/events/")) return false;
  if (MEDIA_PAGES.has(normalized)) return false;
  return isPublicCreativeRoute(normalized);
}
