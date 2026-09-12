import type { StudioReleaseSchedule } from "./studio-release-schedule";

export interface StudioReleaseScheduleRuntime {
  normalizeStudioReleaseSchedule: (value: unknown) => StudioReleaseSchedule;
}

let runtimePromise: Promise<StudioReleaseScheduleRuntime> | null = null;

/**
 * Keeps the full release planner (schema, time-zone validation, iCalendar helpers) out of the
 * Studio route's initial graph. Project hydration and the publication workspace share one
 * retryable request once schedule data is actually needed.
 */
export function loadStudioReleaseScheduleRuntime(): Promise<StudioReleaseScheduleRuntime> {
  if (runtimePromise) return runtimePromise;

  const request = import("./studio-release-schedule")
    .then(({ normalizeStudioReleaseSchedule }) => ({ normalizeStudioReleaseSchedule }))
    .catch((error: unknown) => {
      runtimePromise = null;
      throw error;
    });
  runtimePromise = request;
  return request;
}

export function preloadStudioReleaseScheduleRuntime(): void {
  void loadStudioReleaseScheduleRuntime();
}

/** A fresh, schema-valid blank value without loading the optional planning engine. */
export function createEmptyStudioReleaseScheduleSnapshot(): StudioReleaseSchedule {
  return { version: 1, items: [] };
}

/** Only the exact empty snapshot can avoid the planner; unknown/non-empty data must be validated. */
export function isEmptyStudioReleaseScheduleSnapshot(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  return keys.length === 2
    && keys.includes("version")
    && keys.includes("items")
    && candidate.version === 1
    && Array.isArray(candidate.items)
    && candidate.items.length === 0;
}

export async function normalizeStudioReleaseScheduleDeferred(
  value: unknown,
): Promise<StudioReleaseSchedule> {
  if (value == null || isEmptyStudioReleaseScheduleSnapshot(value)) {
    return createEmptyStudioReleaseScheduleSnapshot();
  }
  const { normalizeStudioReleaseSchedule } = await loadStudioReleaseScheduleRuntime();
  return normalizeStudioReleaseSchedule(value);
}
