import { createEmptyCharacterSurfaceInkDocument } from "./character-surface-ink";

import type { CharacterSurfaceInkAnchor, CharacterSurfaceInkDocument } from "./character-surface-ink";

const STORAGE_PREFIX = "toonstudio.character-surface-ink.v1:";
const MAX_STORED_BYTES = 4 * 1024 * 1024;
const MAX_LAYERS = 32;
const MAX_STROKES = 2_000;
const MAX_ANCHORS = 100_000;

function storageKey(modelKey: string): string {
  return `${STORAGE_PREFIX}${modelKey}`;
}

function isFiniteTuple(value: unknown, length: number): boolean {
  return Array.isArray(value)
    && value.length === length
    && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

export function parseCharacterSurfaceInkDocument(raw: string | null): CharacterSurfaceInkDocument {
  if (!raw) return createEmptyCharacterSurfaceInkDocument();
  if (new TextEncoder().encode(raw).byteLength > MAX_STORED_BYTES) {
    throw new Error("저장된 3D 펜선 데이터가 허용 크기를 넘었습니다.");
  }
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("3D 펜선 문서가 올바르지 않습니다.");
  const document = value as Partial<CharacterSurfaceInkDocument>;
  if (document.version !== 1 || !Array.isArray(document.layers) || document.layers.length > MAX_LAYERS) {
    throw new Error("3D 펜선 문서 버전을 읽을 수 없습니다.");
  }
  let strokes = 0;
  let anchors = 0;
  for (const layer of document.layers) {
    if (!layer || typeof layer !== "object" || !Array.isArray(layer.strokes)) throw new Error("3D 펜선 레이어가 올바르지 않습니다.");
    strokes += layer.strokes.length;
    for (const stroke of layer.strokes) {
      if (!stroke || typeof stroke !== "object" || !Array.isArray(stroke.anchors)) throw new Error("3D 펜선 획이 올바르지 않습니다.");
      anchors += stroke.anchors.length;
      for (const anchor of stroke.anchors) {
        if (!anchor || typeof anchor !== "object") throw new Error("3D 펜선 표면점이 올바르지 않습니다.");
        const candidate = anchor as Partial<CharacterSurfaceInkAnchor>;
        if (!isFiniteTuple(candidate.barycentric, 3)
          || !isFiniteTuple(candidate.localNormal, 3)
          || !isFiniteTuple(candidate.localTangent, 3)
          || !isFiniteTuple(candidate.skinIndices, 4)
          || !isFiniteTuple(candidate.skinWeights, 4)) {
          throw new Error("3D 펜선 표면점 좌표가 올바르지 않습니다.");
        }
      }
    }
  }
  if (strokes > MAX_STROKES || anchors > MAX_ANCHORS) throw new Error("3D 펜선 데이터가 안전 한도를 넘었습니다.");
  return document as CharacterSurfaceInkDocument;
}

export function loadCharacterSurfaceInkDocument(modelKey: string): CharacterSurfaceInkDocument {
  if (typeof window === "undefined") return createEmptyCharacterSurfaceInkDocument();
  return parseCharacterSurfaceInkDocument(window.localStorage.getItem(storageKey(modelKey)));
}

export function saveCharacterSurfaceInkDocument(modelKey: string, document: CharacterSurfaceInkDocument): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(document);
  if (new TextEncoder().encode(serialized).byteLength > MAX_STORED_BYTES) {
    throw new Error("3D 펜선 저장 공간이 가득 찼습니다.");
  }
  window.localStorage.setItem(storageKey(modelKey), serialized);
}
