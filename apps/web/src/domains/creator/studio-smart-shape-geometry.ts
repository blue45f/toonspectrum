/** Existing point handles share page coordinates; Shift snaps a moved point relative to its neighbor. */
export function moveStudioSmartShapePoint(points: readonly number[], index: number, x: number, y: number, snap = false): number[] {
  if (!Number.isFinite(x) || !Number.isFinite(y) || index < 0 || index * 2 + 1 >= points.length) return [...points];
  const next = [...points], neighbor = index === 0 ? 2 : (index - 1) * 2;
  if (snap) {
    const dx = x - points[neighbor]!, dy = y - points[neighbor + 1]!;
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * Math.PI / 12;
    const length = Math.hypot(dx, dy);
    x = points[neighbor]! + Math.cos(angle) * length; y = points[neighbor + 1]! + Math.sin(angle) * length;
  }
  next[index * 2] = x; next[index * 2 + 1] = y;
  // Keep explicit closure atomic when either copy of the endpoint moves.
  if (points.length > 4 && points[0] === points.at(-2) && points[1] === points.at(-1)) {
    if (index === 0) { next[next.length - 2] = x; next[next.length - 1] = y; }
    if (index * 2 === points.length - 2) { next[0] = x; next[1] = y; }
  }
  return next;
}
