/**
 * 페인트 세션: 패널(PaintPanel)과 뷰포트(드로잉 포인터)가 공유하는 브러시 설정·활성 부위·부위별 레이어.
 * React 밖의 작은 외부 스토어(subscribe/getState)이며 Babylon을 모른다.
 * 엔진 업로드(engine.updatePaintTexture)는 호출 측(셸/ViewportPane)이 레이어 revision 변화를 보고 수행한다.
 */
import { DEFAULT_BRUSH, PAINTABLE_PART_ROLES, PAINT_LAYER_DEFAULT_SIZE } from "../contracts";
import { normalizeHex } from "../shared/color";

import { applyUndoToken, clonePaintLayer, createPaintLayer, createTileSnapshotSet, MAX_BRUSH_RADIUS_PX, MIN_BRUSH_RADIUS_PX, snapshotAllTiles, toUndoToken } from "./paint-layer";
import { createStrokeSession } from "./stroke-session";

import type { BrushDab, BrushSettings, PaintLayer, PaintUndoToken, PartRole } from "../contracts";
import type { MutablePaintLayer } from "./paint-layer";
import type { StrokeSession } from "./stroke-session";

export interface PaintSessionState {
  readonly brush: BrushSettings;
  readonly activePart: PartRole;
  readonly wrap: boolean;
  /** 생성된 레이어(부위 → 레이어). 참조는 변경마다 새 Map. */
  readonly layers: ReadonlyMap<PartRole, PaintLayer>;
  readonly strokeActive: boolean;
  /** 상태 변경마다 증가 */
  readonly version: number;
}

export interface PaintSessionOptions {
  readonly brush?: Partial<BrushSettings>;
  readonly activePart?: PartRole;
  readonly wrap?: boolean;
  readonly layerSize?: number;
}

export interface PaintSession {
  getState(): PaintSessionState;
  subscribe(listener: () => void): () => void;
  setBrush(patch: Partial<BrushSettings>): void;
  setActivePart(part: PartRole): void;
  setWrap(wrap: boolean): void;
  /** 부위 레이어(없으면 생성) */
  layer(part: PartRole): MutablePaintLayer;
  /** 활성 부위 레이어에 스트로크를 시작한다. 진행 중인 스트로크가 있으면 먼저 닫고 그 토큰을 버린다(호출 측 오류). */
  beginStroke(dab: BrushDab, part?: PartRole): void;
  extendStroke(dab: BrushDab): number;
  /** 스트로크를 닫고 undo 토큰을 돌려준다(진행 중이 아니면 null). 토큰은 호출 측이 "paint/stroke"로 dispatch한다. */
  endStroke(): PaintUndoToken | null;
  /** history undo/redo가 넘긴 토큰을 레이어에 적용하고 역토큰을 돌려준다. 레이어가 없으면 null. */
  applyToken(token: PaintUndoToken): PaintUndoToken | null;
  /** 레시피 불러오기 등으로 레이어 전체를 교체한다(복사). */
  replaceLayers(layers: readonly PaintLayer[]): void;
  /** 레이어를 비우고 비우기 전 상태의 undo 토큰을 돌려준다(레이어가 없거나 이미 비어 있으면 null). */
  clearLayer(part: PartRole): PaintUndoToken | null;
  /** 저장·PSD용 레이어 목록(생성 순) */
  layersForExport(): PaintLayer[];
}

export function clampBrush(brush: BrushSettings, patch: Partial<BrushSettings>): BrushSettings {
  const color = patch.color === undefined ? brush.color : (normalizeHex(patch.color) ?? brush.color);
  const clamp = (value: number | undefined, fallback: number, min: number, max: number): number =>
    value === undefined || !Number.isFinite(value) ? fallback : Math.min(max, Math.max(min, value));
  return {
    radiusPx: clamp(patch.radiusPx, brush.radiusPx, MIN_BRUSH_RADIUS_PX, MAX_BRUSH_RADIUS_PX),
    color,
    opacity: clamp(patch.opacity, brush.opacity, 0, 1),
    hardness: clamp(patch.hardness, brush.hardness, 0, 1),
    spacing: clamp(patch.spacing, brush.spacing, 0.02, 4),
  };
}

export function createPaintSession(options: PaintSessionOptions = {}): PaintSession {
  const layerSize = options.layerSize ?? PAINT_LAYER_DEFAULT_SIZE;
  const layers = new Map<PartRole, MutablePaintLayer>();
  const listeners = new Set<() => void>();
  let brush = clampBrush(DEFAULT_BRUSH, options.brush ?? {});
  let activePart: PartRole = options.activePart ?? PAINTABLE_PART_ROLES[0] ?? "skin";
  let wrap = options.wrap ?? true;
  let stroke: StrokeSession | null = null;
  let version = 0;
  let snapshot: PaintSessionState | null = null;

  const invalidate = (): void => {
    version += 1;
    snapshot = null;
    for (const listener of listeners) listener();
  };

  const ensureLayer = (part: PartRole): MutablePaintLayer => {
    const existing = layers.get(part);
    if (existing) return existing;
    const created = createPaintLayer(part, layerSize, layerSize);
    layers.set(part, created);
    return created;
  };

  return {
    getState() {
      if (!snapshot) {
        snapshot = { brush, activePart, wrap, layers: new Map(layers), strokeActive: stroke !== null, version };
      }
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setBrush(patch) {
      brush = clampBrush(brush, patch);
      invalidate();
    },
    setActivePart(part) {
      if (!PAINTABLE_PART_ROLES.includes(part)) {
        throw new Error(`부위 "${part}"에는 페인트할 수 없습니다.`);
      }
      activePart = part;
      invalidate();
    },
    setWrap(next) {
      wrap = next;
      invalidate();
    },
    layer(part) {
      const created = !layers.has(part);
      const layer = ensureLayer(part);
      if (created) invalidate();
      return layer;
    },
    beginStroke(dab, part = activePart) {
      if (stroke) stroke.end();
      const layer = ensureLayer(part);
      stroke = createStrokeSession(layer, brush, { wrap });
      stroke.begin(dab);
      invalidate();
    },
    extendStroke(dab) {
      if (!stroke) return 0;
      const count = stroke.extend(dab);
      if (count > 0) invalidate();
      return count;
    },
    endStroke() {
      if (!stroke) return null;
      const token = stroke.end();
      stroke = null;
      invalidate();
      return token;
    },
    applyToken(token) {
      const layer = layers.get(token.part);
      if (!layer) return null;
      const inverse = applyUndoToken(layer, token);
      invalidate();
      return inverse;
    },
    replaceLayers(next) {
      if (stroke) {
        stroke.end();
        stroke = null;
      }
      layers.clear();
      for (const layer of next) layers.set(layer.part, clonePaintLayer(layer));
      invalidate();
    },
    clearLayer(part) {
      const layer = layers.get(part);
      if (!layer || layer.rgba.every((b) => b === 0)) return null;
      const snapshots = createTileSnapshotSet(layer);
      snapshotAllTiles(snapshots);
      layer.rgba.fill(0);
      layer.revision += 1;
      invalidate();
      return toUndoToken(snapshots);
    },
    layersForExport() {
      return [...layers.values()];
    },
  };
}

let defaultSession: PaintSession | null = null;

/** 앱 전역 기본 세션(지연 생성). 테스트는 createPaintSession으로 독립 세션을 만든다. */
export function getDefaultPaintSession(): PaintSession {
  if (!defaultSession) defaultSession = createPaintSession();
  return defaultSession;
}
