export interface StudioDrawCompletionInput {
  kind?: "freehand" | "line" | "rect" | "ellipse" | "star" | "arrow" | "triangle" | "polygon";
  points: readonly number[];
}
/**
 * A freehand tap is a valid paint/erase dot. Geometric tools still require a minimum drag so an
 * accidental click does not create an invisible shape in history.
 */
export function isCompleteStudioDrawOp(input: StudioDrawCompletionInput): boolean {
  const kind = input.kind ?? "freehand";
  if (kind === "freehand") return input.points.length >= 2;
  const [x1 = 0, y1 = 0, x2 = x1, y2 = y1] = input.points;
  if (kind === "line") return Math.hypot(x2 - x1, y2 - y1) >= 3;
  return Math.abs(x2 - x1) >= 3 && Math.abs(y2 - y1) >= 3;
}
