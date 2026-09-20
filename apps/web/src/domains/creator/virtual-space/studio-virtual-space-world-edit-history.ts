import { useState } from "react";
import type { StudioVirtualSpaceWorldManifest, StudioWorldPropDefinition } from "./studio-virtual-space-world-manifest";

export const STUDIO_WORLD_HISTORY_LIMIT = 30;
const HISTORY_BUDGET = 6 * 1024 * 1024;
type Manifest = StudioVirtualSpaceWorldManifest;
interface Frame { readonly value: Manifest; readonly size: number }
export interface StudioWorldEditHistory {
  readonly past: readonly Frame[];
  readonly present: Frame;
  readonly future: readonly Frame[];
}
const frame = (value: Manifest): Frame => ({ value, size: JSON.stringify(value).length * 2 });
function bounded(frames: readonly Frame[], budget: number): readonly Frame[] {
  const kept: Frame[] = [];
  for (let index = frames.length - 1; index >= 0 && kept.length < STUDIO_WORLD_HISTORY_LIMIT; index -= 1) {
    const item = frames[index]!;
    if (item.size > budget) break;
    budget -= item.size;
    kept.unshift(item);
  }
  return kept;
}
export function createStudioWorldEditHistory(value: Manifest): StudioWorldEditHistory {
  return { past: [], present: frame(value), future: [] };
}
export function recordStudioWorldEdit(history: StudioWorldEditHistory, value: Manifest): StudioWorldEditHistory {
  if (history.present.value === value || JSON.stringify(history.present.value) === JSON.stringify(value)) return history;
  const present = frame(value);
  return { past: bounded([...history.past, history.present], HISTORY_BUDGET - present.size), present, future: [] };
}
export function stepStudioWorldEdit(history: StudioWorldEditHistory, direction: "undo" | "redo"): StudioWorldEditHistory {
  const source = direction === "undo" ? history.past : history.future;
  const present = source.at(-1);
  if (!present) return history;
  const remaining = source.slice(0, -1);
  const budget = HISTORY_BUDGET - present.size - remaining.reduce((sum, item) => sum + item.size, 0);
  const destination = bounded([...(direction === "undo" ? history.future : history.past), history.present], budget);
  return direction === "undo" ? { past: remaining, present, future: destination }
    : { past: destination, present, future: remaining };
}
/** Object movement and its authored world-space collider are one edit, not two. */
export function patchStudioWorldProp(prop: StudioWorldPropDefinition, patch: Partial<StudioWorldPropDefinition>): StudioWorldPropDefinition {
  const dx = (patch.x ?? prop.x) - prop.x;
  const dy = (patch.y ?? prop.y) - prop.y;
  const follows = prop.collider && !Object.prototype.hasOwnProperty.call(patch, "collider") && (dx !== 0 || dy !== 0);
  return { ...prop, ...patch, ...(follows ? { collider: { ...prop.collider!, x: prop.collider!.x + dx, y: prop.collider!.y + dy } } : {}) };
}

/** Ephemeral editing only: history never posts a publication or writes browser storage. */
export function useStudioWorldEditHistory({ manifest, projectId, basePublishedRevisionId, disabled, onChange }: {
  readonly manifest: Manifest;
  readonly projectId: string;
  readonly basePublishedRevisionId?: string | null;
  readonly disabled: boolean;
  readonly onChange: (value: Manifest) => void;
}) {
  const scope = JSON.stringify([projectId, basePublishedRevisionId === undefined ? ["unbased"] : basePublishedRevisionId, disabled]);
  const [state, setState] = useState(() => ({ scope, history: createStudioWorldEditHistory(manifest) }));
  let current = state;
  // Reset during rendering so a new work/publication cannot briefly expose an old undo action.
  if (state.scope !== scope || state.history.present.value !== manifest) {
    current = { scope, history: createStudioWorldEditHistory(manifest) };
    setState(current);
  }
  const apply = (history: StudioWorldEditHistory) => {
    if (disabled || history === current.history) return;
    setState({ scope, history });
    onChange(history.present.value);
  };
  return {
    canUndo: !disabled && current.history.past.length > 0,
    canRedo: !disabled && current.history.future.length > 0,
    change: (value: Manifest) => apply(recordStudioWorldEdit(current.history, value)),
    undo: () => apply(stepStudioWorldEdit(current.history, "undo")),
    redo: () => apply(stepStudioWorldEdit(current.history, "redo")),
  };
}
