import { createEmptyCharacterSurfaceInkDocument } from "./character-surface-ink";

import type { CharacterSurfaceInkDocument } from "./character-surface-ink";

export const CHARACTER_SURFACE_INK_SQLITE_NAMESPACE = "studio-character-surface-ink-v12";
const pending = new Map<string, Promise<unknown>>();
const MAX_STORED_BYTES = 4 * 1024 * 1024;
const MAX_LAYERS = 32;
const MAX_STROKES = 2_000;
const MAX_ANCHORS = 100_000;

function enqueue<T>(modelKey: string, operation: () => Promise<T>): Promise<T> {
  const result = (pending.get(modelKey) ?? Promise.resolve()).then(operation, operation);
  pending.set(modelKey, result);
  const retire = () => { if (pending.get(modelKey) === result) pending.delete(modelKey); };
  void result.then(retire, retire);
  return result;
}

async function acquireInkStorage() {
  const { acquireStudioLocalDatabase } = await import("../../studio-local-database-runtime");
  return (await acquireStudioLocalDatabase()).asAsyncKeyValueStore(CHARACTER_SURFACE_INK_SQLITE_NAMESPACE);
}

function isFiniteTuple(value: unknown, length: number): boolean {
  return Array.isArray(value)
    && value.length === length
    && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isUnit(value: unknown): boolean {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isIndex(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isStyle(value: unknown): boolean {
  return isRecord(value)
    && isText(value.color)
    && (value.widthMode === "surface" || value.widthMode === "screen")
    && isFiniteNumber(value.baseWidth) && value.baseWidth > 0
    && [value.opacity, value.taperStart, value.taperEnd, value.pressureWidth,
      value.pressureOpacity, value.smoothing].every(isUnit)
    && isFiniteNumber(value.surfaceOffset)
    && (value.cap === "round" || value.cap === "square")
    && (value.join === "round" || value.join === "bevel")
    && typeof value.frontFacesOnly === "boolean";
}

export function parseCharacterSurfaceInkDocument(raw: string | null): CharacterSurfaceInkDocument {
  if (!raw) return createEmptyCharacterSurfaceInkDocument();
  if (new TextEncoder().encode(raw).byteLength > MAX_STORED_BYTES) {
    throw new Error("저장된 3D 펜선 데이터가 허용 크기를 넘었습니다.");
  }
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new Error("3D 펜선 문서가 올바르지 않습니다.");
  const document = value;
  if (document.version !== 1 || !Array.isArray(document.layers) || document.layers.length > MAX_LAYERS) {
    throw new Error("3D 펜선 문서 버전을 읽을 수 없습니다.");
  }
  let strokes = 0;
  let anchors = 0;
  for (const layer of document.layers) {
    if (!isRecord(layer) || !isText(layer.layerId) || !isText(layer.name)
      || typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean"
      || !isUnit(layer.opacity) || (layer.blendMode !== "normal" && layer.blendMode !== "multiply")
      || !Array.isArray(layer.strokes)) throw new Error("3D 펜선 레이어가 올바르지 않습니다.");
    strokes += layer.strokes.length;
    if (strokes > MAX_STROKES) throw new Error("3D 펜선 데이터가 안전 한도를 넘었습니다.");
    for (const stroke of layer.strokes) {
      if (!isRecord(stroke) || !isText(stroke.strokeId) || !isText(stroke.meshAssetId)
        || !isText(stroke.topologyRevision) || !isStyle(stroke.style)
        || !["valid", "needs-reprojection", "orphaned"].includes(String(stroke.status))
        || !Array.isArray(stroke.anchors) || stroke.anchors.length < 2) throw new Error("3D 펜선 획이 올바르지 않습니다.");
      anchors += stroke.anchors.length;
      if (anchors > MAX_ANCHORS) throw new Error("3D 펜선 데이터가 안전 한도를 넘었습니다.");
      for (const anchor of stroke.anchors) {
        if (!isRecord(anchor) || anchor.meshAssetId !== stroke.meshAssetId
          || anchor.topologyRevision !== stroke.topologyRevision
          || !isIndex(anchor.primitiveIndex) || !isIndex(anchor.triangleIndex)
          || !isUnit(anchor.pressure) || !isFiniteNumber(anchor.width) || anchor.width <= 0) {
          throw new Error("3D 펜선 표면점이 올바르지 않습니다.");
        }
        if (!isFiniteTuple(anchor.barycentric, 3)
          || !isFiniteTuple(anchor.localNormal, 3)
          || !isFiniteTuple(anchor.localTangent, 3)
          || !isFiniteTuple(anchor.skinIndices, 4)
          || !(anchor.skinIndices as number[]).every((index) => isIndex(index) && index <= 65535)
          || !isFiniteTuple(anchor.skinWeights, 4)
          || !(anchor.skinWeights as number[]).every(isUnit)) {
          throw new Error("3D 펜선 표면점 좌표가 올바르지 않습니다.");
        }
      }
    }
  }
  if (strokes > MAX_STROKES || anchors > MAX_ANCHORS) throw new Error("3D 펜선 데이터가 안전 한도를 넘었습니다.");
  return document as unknown as CharacterSurfaceInkDocument;
}

export function loadCharacterSurfaceInkDocument(modelKey: string): Promise<CharacterSurfaceInkDocument> {
  return enqueue(modelKey, async () => parseCharacterSurfaceInkDocument(await (await acquireInkStorage()).get(modelKey)));
}

export async function saveCharacterSurfaceInkDocument(modelKey: string, document: CharacterSurfaceInkDocument): Promise<void> {
  const serialized = JSON.stringify(document);
  if (new TextEncoder().encode(serialized).byteLength > MAX_STORED_BYTES) {
    return Promise.reject(new Error("3D 펜선 저장 공간이 가득 찼습니다."));
  }
  parseCharacterSurfaceInkDocument(serialized);
  return enqueue(modelKey, async () => (await acquireInkStorage()).set(modelKey, serialized));
}
