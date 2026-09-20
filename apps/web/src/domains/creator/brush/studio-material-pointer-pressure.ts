/** Raw material pressure: shared by real Studio input and the authoring test pad. */
function unit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value)) : fallback;
}

export function normalizeStudioMaterialPointerPressure(pointerType: unknown, pressure: unknown): number {
  return pointerType === "mouse" ? 0.5 : unit(pressure, 0.5);
}

/** A pen lift reports zero: extending its endpoint retains the last real contact. */
export function resolveStudioMaterialReleasePressure(
  pointerType: unknown, pressure: unknown, lastContact: unknown,
): number {
  if (pointerType === "pen" && !(typeof pressure === "number" && pressure > 0 && pressure <= 1)) {
    return unit(lastContact, 0.5);
  }
  return normalizeStudioMaterialPointerPressure(pointerType, pressure);
}
