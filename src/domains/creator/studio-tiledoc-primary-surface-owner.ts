export type StudioTiledDocPrimarySurfaceOwner =
  | "canvas2d-fallback"
  | "none"
  | "tiledoc-webgpu";

/** One primary owner per raster-document island; Vello remains selection-overlay owner only. */
export function resolveStudioTiledDocPrimarySurfaceOwner(
  backend: "fallback" | "pending" | "webgpu",
  presentationAuthorized: boolean
): StudioTiledDocPrimarySurfaceOwner {
  if (!presentationAuthorized || backend === "pending") return "none";
  return backend === "webgpu" ? "tiledoc-webgpu" : "canvas2d-fallback";
}
