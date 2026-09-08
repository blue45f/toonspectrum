/** Minimum project reader required by the stored brush program, without loading renderer code. */
export type StudioProjectFileVersion = 2 | 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiresTaperSpacingReader(element: unknown): boolean {
  return isRecord(element) && element.type === "draw"
    && isRecord(element.brushDynamics)
    && element.brushDynamics.depositPipeline === "causal-deposit-v4-taper-spacing";
}

export function minimumStudioProjectFileVersion(
  pages: readonly unknown[],
  master: unknown,
): StudioProjectFileVersion {
  return pages.some((page) => isRecord(page) && Array.isArray(page.elements)
      && page.elements.some(requiresTaperSpacingReader))
    || (isRecord(master) && Array.isArray(master.elements)
      && master.elements.some(requiresTaperSpacingReader))
    ? 3 : 2;
}
