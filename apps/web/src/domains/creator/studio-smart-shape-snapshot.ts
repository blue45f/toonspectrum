import { STUDIO_CRDT_METADATA_MAX_BYTES } from "./live/studio-crdt-document-constants";
import { payloadMetadataByteLength } from "./live/studio-crdt-payload-metadata";
import { studioDrawElementToCrdtStroke } from "./live/studio-crdt-draw-bridge";
import { resolveStudioSmartShapeBrushEffectAvailability } from "./studio-smart-shape-brush-effect";

import type { DrawEl, El } from "./studio-element-model";

export const STUDIO_SMART_SHAPE_EDIT_KINDS = ["line", "curve", "polyline", "rect", "ellipse", "polygon"] as const;
export type StudioSmartShapeEditKind = (typeof STUDIO_SMART_SHAPE_EDIT_KINDS)[number];
export interface StudioSmartShapeEditSnapshot {
  version: 1;
  kind: StudioSmartShapeEditKind;
  /** Exact authored stroke, without another nested correction snapshot. */
  original: DrawEl;
}
export const STUDIO_SMART_SHAPE_EDIT_MAX_COORDINATES = 16_384;
const MAX_SNAPSHOT_BYTES = 1_000_000;

export function studioSmartShapeEditReason(stroke: DrawEl | null | undefined): string | null {
  if (!stroke) return "교정할 펜 스트로크를 먼저 그려 주세요.";
  if (stroke.smartShape !== undefined && !readStudioSmartShapeSnapshot(stroke)) return "저장된 도형 원본이 손상되어 교정할 수 없어요.";
  if ((stroke.kind ?? "freehand") !== "freehand") return "자유선 스트로크를 선택해 주세요.";
  if (!Array.isArray(stroke.points) || stroke.points.length < 4 || stroke.points.length % 2 !== 0
    || stroke.points.length > STUDIO_SMART_SHAPE_EDIT_MAX_COORDINATES
    || stroke.points.some((point) => !Number.isFinite(point) || Math.abs(point) > 1_000_000)) {
    return "이 스트로크의 좌표 또는 크기로는 도형을 편집할 수 없어요.";
  }
  if (resolveStudioSmartShapeBrushEffectAvailability(stroke).status !== "available") {
    return "이 브러시는 원래 획을 보존해야 해서 도형 교정을 지원하지 않아요.";
  }
  try {
    if (JSON.stringify(stroke).length > MAX_SNAPSHOT_BYTES) return "원본을 보존하기에 스트로크가 너무 커요.";
    const withSnapshot = stroke.smartShape ? stroke : { ...stroke, smartShape: { version: 1, kind: "line", original: stroke } };
    if (payloadMetadataByteLength(studioDrawElementToCrdtStroke("smart-shape-check", withSnapshot).payload) > STUDIO_CRDT_METADATA_MAX_BYTES) {
      return "원본을 함께 저장하기에는 스트로크가 너무 커요. 더 짧은 스트로크를 그려 주세요.";
    }
  } catch { return "원본 스트로크를 읽을 수 없어요."; }
  return null;
}

export function readStudioSmartShapeSnapshot(stroke: DrawEl): StudioSmartShapeEditSnapshot | null {
  const value = stroke.smartShape;
  if (!value || value.version !== 1 || !STUDIO_SMART_SHAPE_EDIT_KINDS.includes(value.kind)
    || !value.original || value.original.type !== "draw" || value.original.id !== stroke.id
    || value.original.smartShape !== undefined || studioSmartShapeEditReason(value.original)) return null;
  return value;
}

/** A selected corrected stroke can be reopened; otherwise the most recent drawing is authoritative. */
export function recentStudioSmartShapeStroke(elements: readonly El[], selectedId?: string | null): DrawEl | null {
  const selected = elements.find((element) => element.id === selectedId);
  if (selected?.type === "draw" && readStudioSmartShapeSnapshot(selected)) return selected;
  return elements.findLast((element): element is DrawEl => element.type === "draw") ?? null;
}

