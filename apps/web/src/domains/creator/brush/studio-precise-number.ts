function decimalPlaces(step: number): number {
  const normalized = String(step);
  const exponent = normalized.match(/e-(\d+)$/iu);
  if (exponent) return Number(exponent[1]);
  return normalized.includes(".") ? normalized.split(".")[1]?.length ?? 0 : 0;
}

export function normalizeStudioPreciseNumber(
  candidate: number,
  min: number,
  max: number,
  step: number,
): number {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max >= safeMin ? max : safeMin;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const finite = Number.isFinite(candidate) ? candidate : safeMin;
  const units = Math.round((finite - safeMin) / safeStep);
  const snapped = safeMin + units * safeStep;
  return Number(Math.min(safeMax, Math.max(safeMin, snapped)).toFixed(decimalPlaces(safeStep)));
}

export function formatStudioPreciseNumber(value: number, step: number): string {
  const places = decimalPlaces(step);
  return places > 0 ? value.toFixed(places) : String(Math.round(value));
}
