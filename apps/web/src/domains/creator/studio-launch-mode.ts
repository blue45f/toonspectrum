import type { StudioRememberedPrimaryTool } from "./studio-initial-primary-tool";

/** A launch hint changes UI preferences only, never the drawing document or engine. */
export type StudioLaunchDensity = "focus" | "simple" | "full";
export function readStudioLaunchDensity(search: string): StudioLaunchDensity | null {
  const values = new URLSearchParams(search).getAll("uiMode");
  if (values.length !== 1) return null;
  return values[0] === "focus" || values[0] === "simple" ? "focus"
    : values[0] === "basic" || values[0] === "standard" ? "simple"
      : values[0] === "full" || values[0] === "studio" ? "full" : null;
}

/** Explicit launch intent wins once, without overwriting the user's remembered tool. */
export function readStudioLaunchPrimaryTool(search: string): StudioRememberedPrimaryTool | null {
  const values = new URLSearchParams(search).getAll("startTool");
  if (values.length !== 1) return null;
  return values[0] === "draw" || values[0] === "select" ? values[0] : null;
}

export function applyStudioLaunchDensity<T extends { general: { densityMode: "simple" | "full" | "focus" } }>(
  settings: T,
  requested: StudioLaunchDensity | null,
): T {
  return requested && settings.general.densityMode !== requested
    ? { ...settings, general: { ...settings.general, densityMode: requested } }
    : settings;
}
