/**
 * Drei View renders with a positive frame priority and temporarily disables autoClear. That also
 * suppresses R3F's root render, so the shared canvas needs one explicit clear before any View draws.
 * A negative priority keeps the callback ahead of every View without taking over the render loop.
 */
export const STUDIO_BG3D_VIEW_FRAME_CLEAR_PRIORITY = -100;

export interface StudioBg3dViewFrameClearRenderer {
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
  setScissorTest(enabled: boolean): void;
}

interface StudioBg3dCanvasSize {
  width: number;
  height: number;
  top: number;
  left: number;
}

export function syncStudioBg3dCanvasOrigin(
  canvas: Pick<HTMLCanvasElement, "getBoundingClientRect">,
  size: StudioBg3dCanvasSize,
  setSize: (width: number, height: number, top: number, left: number) => void,
): void {
  const { top, left } = canvas.getBoundingClientRect();
  if (top === size.top && left === size.left) return;
  // CSS translations do not notify ResizeObserver. Drei measures its tracked views each frame,
  // so its canvas origin must follow the same movement. Keep R3F's measured resolution intact.
  setSize(size.width, size.height, top, left);
}

export function clearStudioBg3dViewFrame(renderer: StudioBg3dViewFrameClearRenderer): void {
  // A previous View leaves its viewport in place. Disabling scissor makes this clear cover the
  // complete shared framebuffer in both the single-view and four-view layouts.
  renderer.setScissorTest(false);
  renderer.clear(true, true, true);
}
