/**
 * VRM 텍스처 페인팅 — 획 단위 언두(영역 델타).
 *
 * 4K 아틀라스 하나가 64 MiB 다. 획마다 전체 스냅샷을 쌓으면 몇 획 만에 메모리가 끝난다.
 * 그래서 이 모듈은 **건드린 영역만** 기록한다.
 *
 * 동작:
 *  1) 획 시작 시 레코더를 만들고, dab 을 칠하기 **직전** 그 dab 의 사각형을 `record()` 한다.
 *  2) 레코더는 해당 사각형이 걸치는 64×64 타일을 최초 1 회만 통째로 복사해 둔다
 *     (copy-on-write). 같은 타일을 다시 칠해도 추가 비용이 없다.
 *  3) 획이 끝나면 `finish()` 가 기록된 사각형들의 합집합 rect 와 before/after 픽셀을 낸다.
 *
 * 호출 계약(테스트로 고정): 레코딩 세션 동안 대상 버퍼는 **`record()` 로 신고한 영역 밖을
 * 변경해서는 안 된다.** 합집합 rect 안이지만 기록되지 않은 타일의 before 는 "현재 값"에서
 * 읽는데, 그 영역은 변경되지 않았어야 정확하기 때문이다.
 */

import {
  clipStudioVrmTextureRect,
  isStudioVrmTextureBuffer,
  isStudioVrmTextureRectEmpty,
  readStudioVrmTextureRegion,
  unionStudioVrmTextureRect,
  writeStudioVrmTextureRegion,
  EMPTY_STUDIO_VRM_TEXTURE_RECT,
} from "./studio-vrm-texture-paint-ops";
import {
  isStudioVrmTextureSize,
  type StudioVrmTextureRect,
  type StudioVrmTextureSize,
} from "./studio-vrm-texture-uv";

export const STUDIO_VRM_TEXTURE_UNDO_TILE_SIZE = 64;

export type StudioVrmTextureUndoDirection = "undo" | "redo";

export interface StudioVrmTextureUndoEntry {
  readonly rect: StudioVrmTextureRect;
  /** rect 크기의 획 이전 RGBA. */
  readonly before: Uint8ClampedArray;
  /** rect 크기의 획 이후 RGBA. */
  readonly after: Uint8ClampedArray;
}

export interface StudioVrmTextureUndoRecorder {
  /** 이 사각형을 칠하기 **전에** 호출한다. */
  record(rect: StudioVrmTextureRect): void;
  recordAll(rects: readonly StudioVrmTextureRect[]): void;
  /** 획 종료 — before/after 델타를 만든다. 기록이 없으면 null. */
  finish(): StudioVrmTextureUndoEntry | null;
  /** 획 취소 — 기록해 둔 타일을 원래대로 되돌린다. 되돌린 타일 수를 반환. */
  cancel(): number;
  readonly recordedTileCount: number;
  readonly recordedBytes: number;
}

function normalizedTileSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return STUDIO_VRM_TEXTURE_UNDO_TILE_SIZE;
  return Math.max(8, Math.min(512, Math.floor(value)));
}

/**
 * 레코더는 `source` 를 살아 있는 버퍼로 계속 참조한다(호출자가 그 자리에서 변경한다).
 * 크기/버퍼가 맞지 않으면 null.
 */
export function createStudioVrmTextureUndoRecorder(
  source: Uint8ClampedArray,
  size: StudioVrmTextureSize,
  tileSize: number = STUDIO_VRM_TEXTURE_UNDO_TILE_SIZE,
): StudioVrmTextureUndoRecorder | null {
  if (!isStudioVrmTextureSize(size)) return null;
  if (!isStudioVrmTextureBuffer(source, size)) return null;

  const tile = normalizedTileSize(tileSize);
  const tilesPerRow = Math.ceil(size.width / tile);
  const tilesPerColumn = Math.ceil(size.height / tile);
  const snapshots = new Map<number, Uint8ClampedArray>();
  let bounds: StudioVrmTextureRect = EMPTY_STUDIO_VRM_TEXTURE_RECT;
  let finished = false;

  const tileRect = (tileX: number, tileY: number): StudioVrmTextureRect => {
    const x = tileX * tile;
    const y = tileY * tile;
    return {
      x,
      y,
      width: Math.min(tile, size.width - x),
      height: Math.min(tile, size.height - y),
    };
  };

  const captureTile = (tileX: number, tileY: number): void => {
    const key = tileY * tilesPerRow + tileX;
    if (snapshots.has(key)) return;
    const pixels = readStudioVrmTextureRegion(source, size, tileRect(tileX, tileY));
    if (pixels) snapshots.set(key, pixels);
  };

  const record = (rect: StudioVrmTextureRect): void => {
    if (finished) return;
    const clipped = clipStudioVrmTextureRect(rect, size);
    if (isStudioVrmTextureRectEmpty(clipped)) return;
    bounds = unionStudioVrmTextureRect(bounds, clipped);
    const firstTileX = Math.floor(clipped.x / tile);
    const lastTileX = Math.min(tilesPerRow - 1, Math.floor((clipped.x + clipped.width - 1) / tile));
    const firstTileY = Math.floor(clipped.y / tile);
    const lastTileY = Math.min(
      tilesPerColumn - 1,
      Math.floor((clipped.y + clipped.height - 1) / tile),
    );
    for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
      for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
        captureTile(tileX, tileY);
      }
    }
  };

  const readBefore = (rect: StudioVrmTextureRect): Uint8ClampedArray => {
    const out = new Uint8ClampedArray(rect.width * rect.height * 4);
    for (let row = 0; row < rect.height; row += 1) {
      const y = rect.y + row;
      const tileY = Math.floor(y / tile);
      for (let column = 0; column < rect.width; column += 1) {
        const x = rect.x + column;
        const tileX = Math.floor(x / tile);
        const snapshot = snapshots.get(tileY * tilesPerRow + tileX);
        const target = (row * rect.width + column) * 4;
        if (snapshot) {
          const local = tileRect(tileX, tileY);
          const offset = ((y - local.y) * local.width + (x - local.x)) * 4;
          out[target] = snapshot[offset]!;
          out[target + 1] = snapshot[offset + 1]!;
          out[target + 2] = snapshot[offset + 2]!;
          out[target + 3] = snapshot[offset + 3]!;
          continue;
        }
        // 기록되지 않은 타일 = 이 획이 건드리지 않은 영역 → 현재 값이 곧 이전 값이다.
        const offset = (y * size.width + x) * 4;
        out[target] = source[offset]!;
        out[target + 1] = source[offset + 1]!;
        out[target + 2] = source[offset + 2]!;
        out[target + 3] = source[offset + 3]!;
      }
    }
    return out;
  };

  return {
    record,
    recordAll(rects: readonly StudioVrmTextureRect[]): void {
      for (const rect of rects) record(rect);
    },
    finish(): StudioVrmTextureUndoEntry | null {
      if (finished) return null;
      finished = true;
      if (isStudioVrmTextureRectEmpty(bounds)) return null;
      const rect = clipStudioVrmTextureRect(bounds, size);
      if (isStudioVrmTextureRectEmpty(rect)) return null;
      const after = readStudioVrmTextureRegion(source, size, rect);
      if (!after) return null;
      return { rect, before: readBefore(rect), after };
    },
    cancel(): number {
      if (finished) return 0;
      finished = true;
      let restored = 0;
      for (const [key, pixels] of snapshots) {
        const tileX = key % tilesPerRow;
        const tileY = Math.floor(key / tilesPerRow);
        if (writeStudioVrmTextureRegion(source, size, tileRect(tileX, tileY), pixels)) {
          restored += 1;
        }
      }
      snapshots.clear();
      return restored;
    },
    get recordedTileCount(): number {
      return snapshots.size;
    },
    get recordedBytes(): number {
      let bytes = 0;
      for (const pixels of snapshots.values()) bytes += pixels.byteLength;
      return bytes;
    },
  };
}

/** 델타를 되돌리거나(undo) 다시 적용한다(redo). 크기가 안 맞으면 false. */
export function applyStudioVrmTextureUndoEntry(
  target: Uint8ClampedArray,
  size: StudioVrmTextureSize,
  entry: StudioVrmTextureUndoEntry,
  direction: StudioVrmTextureUndoDirection,
): boolean {
  if (!isStudioVrmTextureBuffer(target, size)) return false;
  const pixels = direction === "undo" ? entry.before : entry.after;
  if (pixels.length !== entry.rect.width * entry.rect.height * 4) return false;
  return writeStudioVrmTextureRegion(target, size, entry.rect, pixels);
}

/** 이 델타가 차지하는 바이트(전체 텍스처 스냅샷 대비 얼마나 작은지 계측·예산용). */
export function studioVrmTextureUndoEntryBytes(entry: StudioVrmTextureUndoEntry): number {
  return entry.before.byteLength + entry.after.byteLength;
}
