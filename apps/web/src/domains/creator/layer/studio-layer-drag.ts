import type { LayerSelectionDropSide } from "../studio-layers";

export interface StudioLayerDragItemLike {
  id: string;
  groupId?: string;
}

export type StudioLayerDragSourceGroup = string | null | "mixed";

export type StudioLayerDragPayload =
  | {
      kind: "items";
      ids: readonly string[];
      sourceGroupId: StudioLayerDragSourceGroup;
      label: string;
    }
  | {
      kind: "group";
      ids: readonly string[];
      groupId: string;
      sourceGroupId: string;
      label: string;
    };

export type StudioLayerDropIntent =
  | {
      kind: "around";
      mode: "units" | "to-root";
      targetKey: string;
      targetId: string;
      side: LayerSelectionDropSide;
    }
  | {
      kind: "around";
      mode: "within-group" | "into-group";
      targetKey: string;
      targetId: string;
      side: LayerSelectionDropSide;
      groupId: string;
    }
  | {
      kind: "into-group";
      targetKey: string;
      groupId: string;
    };

export function studioLayerDragSourceGroup(
  items: readonly StudioLayerDragItemLike[],
  ids: readonly string[]
): StudioLayerDragSourceGroup {
  const requested = new Set(ids);
  let found = false;
  let common: string | null = null;
  for (const item of items) {
    if (!requested.has(item.id)) continue;
    const next = item.groupId ?? null;
    if (!found) {
      common = next;
      found = true;
      continue;
    }
    if (common !== next) return "mixed";
  }
  return common;
}

export function studioLayerDropSideFromPointer(
  clientY: number,
  top: number,
  height: number
): LayerSelectionDropSide {
  return clientY < top + Math.max(1, height) / 2 ? "front" : "back";
}

export function resolveStudioLayerItemDropIntent(input: {
  payload: StudioLayerDragPayload;
  targetKey: string;
  targetId: string;
  targetGroupId: string | null;
  side: LayerSelectionDropSide;
}): StudioLayerDropIntent | null {
  const { payload, targetKey, targetId, targetGroupId, side } = input;
  if (payload.ids.includes(targetId)) return null;

  if (payload.kind === "group") {
    if (targetGroupId === payload.groupId) return null;
    return { kind: "around", mode: "units", targetKey, targetId, side };
  }

  if (payload.sourceGroupId === "mixed") {
    return { kind: "around", mode: "units", targetKey, targetId, side };
  }

  if (targetGroupId !== null) {
    return payload.sourceGroupId === targetGroupId
      ? {
          kind: "around",
          mode: "within-group",
          targetKey,
          targetId,
          side,
          groupId: targetGroupId,
        }
      : {
          kind: "around",
          mode: "into-group",
          targetKey,
          targetId,
          side,
          groupId: targetGroupId,
        };
  }

  return typeof payload.sourceGroupId === "string"
    ? { kind: "around", mode: "to-root", targetKey, targetId, side }
    : { kind: "around", mode: "units", targetKey, targetId, side };
}

export function resolveStudioLayerGroupDropIntent(input: {
  payload: StudioLayerDragPayload;
  targetKey: string;
  targetGroupId: string;
  targetId: string | null;
  relativeY: number;
}): StudioLayerDropIntent | null {
  const { payload, targetKey, targetGroupId, targetId } = input;
  const relativeY = Math.max(0, Math.min(1, input.relativeY));
  if (payload.kind === "group" && payload.groupId === targetGroupId) return null;

  const centerDrop = relativeY >= 0.28 && relativeY <= 0.72;
  if (
    payload.kind === "items" &&
    payload.sourceGroupId !== "mixed" &&
    payload.sourceGroupId !== targetGroupId &&
    centerDrop
  ) {
    return { kind: "into-group", targetKey, groupId: targetGroupId };
  }
  if (!targetId) return null;

  const side: LayerSelectionDropSide = relativeY < 0.5 ? "front" : "back";
  if (payload.kind === "group") {
    return { kind: "around", mode: "units", targetKey, targetId, side };
  }
  if (payload.sourceGroupId === targetGroupId) return null;
  if (payload.sourceGroupId === "mixed") {
    return { kind: "around", mode: "units", targetKey, targetId, side };
  }
  return typeof payload.sourceGroupId === "string"
    ? { kind: "around", mode: "to-root", targetKey, targetId, side }
    : { kind: "around", mode: "units", targetKey, targetId, side };
}

export function studioLayerDropIntentEqual(
  left: StudioLayerDropIntent | null,
  right: StudioLayerDropIntent | null
): boolean {
  if (left === right) return true;
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === "into-group" && right.kind === "into-group") {
    return left.targetKey === right.targetKey && left.groupId === right.groupId;
  }
  if (left.kind !== "around" || right.kind !== "around") return false;
  const leftGroupId = "groupId" in left ? left.groupId : null;
  const rightGroupId = "groupId" in right ? right.groupId : null;
  return (
    left.mode === right.mode &&
    left.targetKey === right.targetKey &&
    left.targetId === right.targetId &&
    left.side === right.side &&
    leftGroupId === rightGroupId
  );
}
