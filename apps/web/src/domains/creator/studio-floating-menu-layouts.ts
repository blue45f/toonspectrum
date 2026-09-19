import {
  STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
  type StudioFloatingSurfaceDock,
  type StudioFloatingSurfaceLayout,
} from "./studio-floating-surface";

function floatingMenuLayout(
  xRatio: number,
  yRatio: number,
  width: number,
  height: number,
  dock: StudioFloatingSurfaceDock = "free",
): StudioFloatingSurfaceLayout {
  return Object.freeze({
    version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
    xRatio,
    yRatio,
    width,
    height,
    dock,
    positionLocked: false,
    sizeLocked: false,
  });
}

/** Content-aware first-open geometry for Studio's long-lived, non-modal floating menus. */
export const STUDIO_FLOATING_MENU_LAYOUTS = Object.freeze({
  viewOptions: floatingMenuLayout(0, 0.16, 560, 720, "left"),
  asset: floatingMenuLayout(0.02, 0.08, 1080, 760),
  bubble: floatingMenuLayout(0.08, 0.12, 460, 620),
  scene: floatingMenuLayout(0.06, 0.1, 480, 680),
  style: floatingMenuLayout(0.08, 0.12, 420, 600),
  ai: floatingMenuLayout(0.62, 0.08, 560, 720),
} satisfies Readonly<Record<
  "viewOptions" | "asset" | "bubble" | "scene" | "style" | "ai",
  StudioFloatingSurfaceLayout
>>);
