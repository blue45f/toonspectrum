/**
 * Studio Brush Math Utilities
 * Handles freehand stroke point thinning, smoothing, and pencil jitter.
 */

// Simple deterministic hash function for pencil jitter (flashing-free noise)
function hash(n: number): number {
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

/**
 * Thins and smooths a list of 2D points [x0, y0, x1, y1, ...].
 * 1. Thinning: discards points that are too close to the previous point.
 * 2. Smoothing: applies a weighted moving average to remove high-frequency jitter.
 */
export function processFreehandPoints(points: number[]): number[] {
  if (points.length < 4) return points;

  // 1. Light point-thinning (distance thresholding)
  const thinned: number[] = [points[0], points[1]];
  let lastX = points[0];
  let lastY = points[1];
  
  for (let i = 2; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x === undefined || y === undefined) continue;

    const dist = Math.hypot(x - lastX, y - lastY);
    // Keep point if it is at least 3 pixels away or it is the very last point in the path
    if (dist >= 3 || i === points.length - 2) {
      thinned.push(x, y);
      lastX = x;
      lastY = y;
    }
  }

  // 2. Bezier-like smoothing (weighted moving average)
  if (thinned.length < 6) return thinned;
  const smoothed: number[] = [thinned[0], thinned[1]];

  for (let i = 2; i < thinned.length - 2; i += 2) {
    const prevX = thinned[i - 2]!;
    const prevY = thinned[i - 1]!;
    const currX = thinned[i]!;
    const currY = thinned[i + 1]!;
    const nextX = thinned[i + 2]!;
    const nextY = thinned[i + 3]!;

    // 25% prev, 50% current, 25% next
    const sx = 0.25 * prevX + 0.5 * currX + 0.25 * nextX;
    const sy = 0.25 * prevY + 0.5 * currY + 0.25 * nextY;
    smoothed.push(sx, sy);
  }

  smoothed.push(thinned[thinned.length - 2]!, thinned[thinned.length - 1]!);
  return smoothed;
}

/**
 * Applies a stable deterministic jitter to points [x0, y0, ...] to simulate a pencil texture.
 */
export function processPencilPoints(points: number[]): number[] {
  const output: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x === undefined || y === undefined) continue;

    // Stable, deterministic offset between -0.75 and 0.75 pixels
    const dx = (hash(i * 17 + 5) - 0.5) * 1.5;
    const dy = (hash(i * 31 + 13) - 0.5) * 1.5;
    output.push(x + dx, y + dy);
  }
  return output;
}
