/** Lightweight UI/pointer contract kept outside the on-demand pixel engine. */
export const STUDIO_LIQUIFY_MODES = [
  "push",
  "twirl-clockwise",
  "twirl-counterclockwise",
  "pinch",
  "bloat",
] as const;

export type StudioLiquifyMode = (typeof STUDIO_LIQUIFY_MODES)[number];

export const LIQUIFY_RADIUS_RANGE = { min: 20, max: 240, step: 5 } as const;
export const LIQUIFY_RADIUS_DEFAULT = 80;
export const LIQUIFY_STRENGTH_RANGE = { min: 10, max: 100, step: 5 } as const;
export const LIQUIFY_STRENGTH_DEFAULT = 50;

const LIQUIFY_MODE_SET: ReadonlySet<string> = new Set(STUDIO_LIQUIFY_MODES);

export function normalizeStudioLiquifyMode(mode: unknown): StudioLiquifyMode {
  return typeof mode === "string" && LIQUIFY_MODE_SET.has(mode)
    ? (mode as StudioLiquifyMode)
    : "push";
}
