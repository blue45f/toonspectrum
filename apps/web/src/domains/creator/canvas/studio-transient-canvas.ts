interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

const surfaceSizes = new WeakMap<HTMLCanvasElement, CanvasSize>();

function resize(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

/** Keep idle overlay bindings ready without allocating a viewport until a frame arrives. */
export function configureStudioTransientCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): void {
  const wasRegistered = surfaceSizes.has(canvas);
  surfaceSizes.set(canvas, { width, height });
  if (wasRegistered && (canvas.width > 1 || canvas.height > 1)) {
    resize(canvas, width, height);
  } else {
    resize(canvas, 1, 1);
  }
}

/** Allocate at the registered DPR before drawing, preserving the original pixel geometry. */
export function activateStudioTransientCanvas(canvas: HTMLCanvasElement): void {
  const size = surfaceSizes.get(canvas);
  if (size) resize(canvas, size.width, size.height);
}

/** Called only after the renderer relinquishes its frame or the document acknowledges it. */
export function releaseStudioTransientCanvas(canvas: HTMLCanvasElement): void {
  if (surfaceSizes.has(canvas)) resize(canvas, 1, 1);
}
