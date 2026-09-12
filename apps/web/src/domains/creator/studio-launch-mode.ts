/** A launch hint changes UI preferences only, never the drawing document or engine. */
export type StudioLaunchDensity = "focus" | "full";
export function readStudioLaunchDensity(search: string): StudioLaunchDensity | null {
  const values = new URLSearchParams(search).getAll("uiMode");
  if (values.length !== 1) return null;
  return values[0] === "simple" ? "focus" : values[0] === "studio" ? "full" : null;
}

export function applyStudioLaunchDensity<T extends { general: { densityMode: "simple" | "full" | "focus" } }>(
  settings: T,
  requested: StudioLaunchDensity | null,
): T {
  return requested && settings.general.densityMode !== requested
    ? { ...settings, general: { ...settings.general, densityMode: requested } }
    : settings;
}
