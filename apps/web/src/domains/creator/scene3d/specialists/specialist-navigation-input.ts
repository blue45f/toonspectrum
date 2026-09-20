import { specialistOptionsSchema } from "./specialist-contract";
import { navigationBuildSettings } from "./specialist-navigation-path";
import type { NavigationOptions } from "./specialist-navigation-path";

type Point = [number, number, number];
export type NavigationInputResult =
  | { readonly ok: true; readonly options: NavigationOptions }
  | { readonly ok: false; readonly reason: "waypoints" | "settings" };

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Empty comma fields must never turn into a coordinate zero via Number(""). */
export function parseNavigationWaypoints(text: string): Point[] | null {
  if (text.length > 1024) return null;
  if (!text.trim()) return [];
  const lines = text.trim().split(/\r?\n/);
  if (lines.length > 8) return null;
  const points: Point[] = [];
  for (const line of lines) {
    const tokens = line.includes(",")
      ? line.split(",").map((token) => token.trim())
      : line.trim().split(/\s+/);
    if (tokens.length !== 3 || tokens.some((token) => !DECIMAL.test(token))) return null;
    const values = tokens.map(Number);
    if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 10000)) return null;
    points.push([values[0]!, values[1]!, values[2]!]);
  }
  return points;
}

/** UI preflight shares the worker schema and actual voxel constraints. */
export function parseNavigationInput(
  input: Omit<NavigationOptions, "kind" | "waypoints">,
  waypointText: string,
): NavigationInputResult {
  const waypoints = parseNavigationWaypoints(waypointText);
  if (waypoints === null) return { ok: false, reason: "waypoints" };
  const parsed = specialistOptionsSchema.safeParse({ ...input, kind: "navigation", waypoints });
  if (!parsed.success || parsed.data.kind !== "navigation") return { ok: false, reason: "settings" };
  try {
    navigationBuildSettings(parsed.data);
    const stops = [parsed.data.start, ...waypoints, parsed.data.end];
    if (stops.every((point) => Math.hypot(
      point[0] - stops[0]![0], point[1] - stops[0]![1], point[2] - stops[0]![2],
    ) <= 1e-6)) return { ok: false, reason: "settings" };
    return { ok: true, options: parsed.data };
  } catch {
    return { ok: false, reason: "settings" };
  }
}
