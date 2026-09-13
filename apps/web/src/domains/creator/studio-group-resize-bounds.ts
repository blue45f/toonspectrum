import type { StudioGroupUniformResizeBounds } from "./studio-group-uniform-resize";

/** Shared begin/commit guard. Keep geometry validation outside the editor host. */
export function finitePositiveGroupResizeBounds(
  bounds: StudioGroupUniformResizeBounds,
): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}
