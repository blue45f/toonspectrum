/** Small synchronous allowlist; binary metadata stays behind the marketplace loading boundary. */
const MODEL_REFS: ReadonlySet<string> = new Set([
  "studio-3d-asset:cc0/polyhaven-painted-wooden-chair-01",
  "studio-3d-asset:cc0/polyhaven-wooden-display-shelves-01",
  "studio-3d-asset:cc0/polyhaven-ceramic-vase-04",
]);

export function isStudioMarketplaceCc0ModelRef(value: unknown): value is string {
  return typeof value === "string" && MODEL_REFS.has(value);
}
