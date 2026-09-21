import { pushRecentColor } from "../studio-color-utils";

export type StudioRecentColorChange =
  | { readonly type: "remember"; readonly color: string }
  | { readonly type: "clear" }
  | { readonly type: "retry" };
export interface StudioPendingRecentColors {
  readonly cleared: boolean;
  readonly colors: string[];
}
export function emptyStudioRecentColorIntents(): StudioPendingRecentColors {
  return { cleared: false, colors: [] };
}
/** Keep at most the same 12 colors as the public history, even after prolonged storage failure. */
export function reduceStudioRecentColorIntents(pending: StudioPendingRecentColors, change: StudioRecentColorChange): StudioPendingRecentColors {
  if (change.type === "retry") return pending;
  if (change.type === "clear") return { cleared: true, colors: [] };
  return { ...pending, colors: pushRecentColor(pending.colors, change.color) };
}
export function replayStudioRecentColorIntents(stored: string[], pending: StudioPendingRecentColors): string[] {
  return [...pending.colors].reverse().reduce((colors, color) => pushRecentColor(colors, color), pending.cleared ? [] : stored);
}
export function applyStudioRecentColorChange(colors: string[], change: StudioRecentColorChange): string[] {
  return change.type === "remember" ? pushRecentColor(colors, change.color) : change.type === "clear" ? [] : [...colors];
}
