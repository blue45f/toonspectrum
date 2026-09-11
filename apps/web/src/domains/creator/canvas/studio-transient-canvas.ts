interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

type StudioTransientCanvasState = "active" | "idle";

const surfaceSizes = new WeakMap<HTMLCanvasElement, CanvasSize>();

function resize(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

/**
 * Keep the compositor and visual-audit surface aligned with the backing-store lifecycle.
 * An idle 1×1 overlay contains no presentable pixels, so exposing its viewport-sized CSS box
 * would make it look like an undersized rendered canvas to browsers, audits and assistive tooling.
 */
function setPresentationState(
  canvas: HTMLCanvasElement,
  state: StudioTransientCanvasState,
): void {
  canvas.dataset.studioTransientCanvasState = state;
  canvas.style.visibility = state === "idle" ? "hidden" : "";
}

/** Keep idle overlay bindings ready without allocating or exposing a viewport until a frame arrives. */
export function configureStudioTransientCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  const wasRegistered = surfaceSizes.has(canvas);
  surfaceSizes.set(canvas, { width, height });
  if (wasRegistered && (canvas.width > 1 || canvas.height > 1)) {
    resize(canvas, width, height);
    setPresentationState(canvas, "active");
  } else {
    resize(canvas, 1, 1);
    setPresentationState(canvas, "idle");
  }
}

/** Allocate at the registered DPR and reveal the surface before drawing the next frame. */
export function activateStudioTransientCanvas(canvas: HTMLCanvasElement): void {
  const size = surfaceSizes.get(canvas);
  if (!size) return;
  resize(canvas, size.width, size.height);
  setPresentationState(canvas, "active");
}

/** Called only after the renderer relinquishes its frame or the document acknowledges it. */
export function releaseStudioTransientCanvas(canvas: HTMLCanvasElement): void {
  if (!surfaceSizes.has(canvas)) return;
  resize(canvas, 1, 1);
  setPresentationState(canvas, "idle");
}
