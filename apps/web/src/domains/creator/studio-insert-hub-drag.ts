import { svgToDataUrl } from "./studio-characters";
import type {
  StudioInsertDragPayload,
  StudioWritableDataTransfer,
} from "./studio-insert-drag-core";
import {
  writeStudioAssetDragPayload,
  writeStudioInsertDragPayload,
} from "./studio-insert-drag-writer";
import {
  planStudioObjectInsertPlacement,
  type StudioObjectInsertItem,
  type StudioObjectInsertPlacementPlan,
} from "./studio-object-insert-catalog";
import { writeStudioObjectInsertDragPayload } from "./studio-object-insert-drag";
import {
  parseStudioAssetDragPayload,
  serializeStudioLocalAssetDragPayload,
} from "./studio-shared-asset-drag";

import type { StudioInsertHubEntry } from "./studio-insert-hub-model";

export type StudioInsertHubDragDescriptor =
  | {
      readonly kind: "insert";
      readonly payload: StudioInsertDragPayload;
    }
  | {
      readonly kind: "asset";
      readonly serializedPayload: string;
    }
  | {
      readonly kind: "object-3d";
      readonly item: StudioObjectInsertItem;
      readonly plan: StudioObjectInsertPlacementPlan;
    };

export interface StudioInsertHubDragInput {
  readonly entry: StudioInsertHubEntry;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

const OBVIOUSLY_UNSAFE_SVG_PATTERN =
  /<(?:script|foreignObject|iframe|object|embed|audio|video|animate|set)\b|\son[a-z][\w:.-]*\s*=|(?:java|vb)script\s*:/iu;

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validatedAssetDescriptor(
  src: string,
  width: number,
  height: number,
): StudioInsertHubDragDescriptor | null {
  if (!isPositiveFinite(width) || !isPositiveFinite(height)) return null;
  const serializedPayload = serializeStudioLocalAssetDragPayload({
    src,
    width,
    height,
  });
  const parsed = parseStudioAssetDragPayload(serializedPayload);
  if (!parsed || parsed.source !== "local") return null;
  return { kind: "asset", serializedPayload };
}

/**
 * Cheap render-time capability check. Expensive data URL/SVG validation remains
 * deferred to dragstart so a large insertion catalog is not serialized eagerly.
 */
export function canDragStudioInsertHubEntry(
  entry: StudioInsertHubEntry,
): boolean {
  if (entry.kind === "action") {
    return entry.actionId === "text" || entry.actionId === "bubble";
  }
  const source = entry.item.source;
  if (source.kind === "local") {
    return (
      source.value.dataUrl.startsWith("data:image/") &&
      isPositiveFinite(source.value.width) &&
      isPositiveFinite(source.value.height)
    );
  }
  if (source.kind === "element") {
    return (
      /^\s*<svg(?:\s|>)/iu.test(source.value.svg) &&
      !OBVIOUSLY_UNSAFE_SVG_PATTERN.test(source.value.svg) &&
      isPositiveFinite(source.value.width) &&
      isPositiveFinite(source.value.height)
    );
  }
  return source.kind === "object-3d" && source.value.id.trim().length > 0;
}

export function resolveStudioInsertHubDragDescriptor({
  entry,
  canvasWidth,
  canvasHeight,
}: StudioInsertHubDragInput): StudioInsertHubDragDescriptor | null {
  if (!canDragStudioInsertHubEntry(entry)) return null;
  if (entry.kind === "action") {
    if (entry.actionId === "text") {
      return { kind: "insert", payload: { kind: "text" } };
    }
    return {
      kind: "insert",
      payload: { kind: "bubble", variant: "speech" },
    };
  }

  const source = entry.item.source;
  try {
    if (source.kind === "local") {
      return validatedAssetDescriptor(
        source.value.dataUrl,
        source.value.width,
        source.value.height,
      );
    }
    if (source.kind === "element") {
      return validatedAssetDescriptor(
        svgToDataUrl(source.value.svg),
        source.value.width,
        source.value.height,
      );
    }
    if (source.kind === "object-3d") {
      if (!isPositiveFinite(canvasWidth) || !isPositiveFinite(canvasHeight)) {
        return null;
      }
      const plan = planStudioObjectInsertPlacement({
        itemId: source.value.id,
        canvasWidth,
        canvasHeight,
        existingCount: 0,
      });
      if (!plan) return null;
      return { kind: "object-3d", item: source.value, plan };
    }
  } catch {
    return null;
  }
  return null;
}

export function writeStudioInsertHubDragDescriptor(
  dataTransfer: StudioWritableDataTransfer,
  descriptor: StudioInsertHubDragDescriptor,
): void {
  if (descriptor.kind === "insert") {
    writeStudioInsertDragPayload(dataTransfer, descriptor.payload);
    return;
  }
  if (descriptor.kind === "asset") {
    writeStudioAssetDragPayload(dataTransfer, descriptor.serializedPayload);
    return;
  }
  writeStudioObjectInsertDragPayload(dataTransfer, {
    item: descriptor.item,
    plan: descriptor.plan,
  });
}

/**
 * Resolve, validate, and write a direct-drag payload as one fail-closed operation.
 * A false result means the browser drag must be cancelled without mutating Studio.
 */
export function writeStudioInsertHubDragPayload(
  dataTransfer: StudioWritableDataTransfer,
  input: StudioInsertHubDragInput,
): boolean {
  const descriptor = resolveStudioInsertHubDragDescriptor(input);
  if (!descriptor) return false;
  try {
    writeStudioInsertHubDragDescriptor(dataTransfer, descriptor);
    return true;
  } catch {
    return false;
  }
}
