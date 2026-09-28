import { PRODUCT_TOUR } from "./product-tour-content";

export function productTourFrameForSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(PRODUCT_TOUR.duration * PRODUCT_TOUR.fps - 1, Math.max(0, Math.floor(seconds * PRODUCT_TOUR.fps)));
}
export function parseProductTourLocation(search: string): { readonly seconds: number; readonly mode: "remotion" | "mp4" } {
  const params = new URLSearchParams(search);
  return {
    seconds: productTourFrameForSeconds(Number(params.get("t"))) / PRODUCT_TOUR.fps,
    mode: params.get("player") === "mp4" ? "mp4" : "remotion",
  };
}
export function updateProductTourLocation(seconds: number): void {
  const url = new URL(window.location.href);
  if (url.pathname !== "/product-tour") return;
  url.searchParams.set("t", String(Math.floor(productTourFrameForSeconds(seconds) / PRODUCT_TOUR.fps)));
  url.hash = "product-tour-video";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
