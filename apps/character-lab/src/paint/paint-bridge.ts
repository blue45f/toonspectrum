/**
 * paint 도메인 ↔ 셸(스토어·엔진·뷰포트) 다리. Babylon을 모르며 엔진 호출은 전부 콜백으로 주입받는다.
 *
 * - `createPaintUndoHandler`: state/lab-store `createLabStore({ onPaintUndo })`에 꽂는 핸들러.
 *   history undo/redo가 넘긴 토큰을 레이어에 적용하고 역토큰을 돌려준 뒤 레이어를 엔진에 올린다.
 * - `createPointerPaintDriver`: 뷰포트 포인터(pointerdown/move/up) → `engine.pick` → UV 스트로크 →
 *   `engine.updatePaintTexture` → pointerup에서 토큰 **1개**를 commit(`dispatch({ type: "paint/stroke" })`).
 *   활성 부위(PaintSession.activePart)가 아닌 표면이나 빈 공간을 지나면 세그먼트를 끊고(가로지르는 선 없음),
 *   다시 활성 부위에 닿으면 새 세그먼트를 시작하되 토큰은 하나로 병합한다(1 포인터 스트로크 = 1 undo).
 * - `clientToNdc` / `normalizePointerPressure`: 포인터 이벤트 → NDC·압력 변환(순수).
 */
import { PAINTABLE_PART_ROLES } from "../contracts";

import { mergeUndoTokens } from "./paint-layer";

import type { PaintLayer, PaintUndoToken, PartRole, PickHit } from "../contracts";
import type { PaintSession } from "./paint-session";

/** 변경된 레이어를 엔진 텍스처로 올린다(`CharacterEngine.updatePaintTexture`). */
export type PaintLayerUploader = (layer: PaintLayer) => void;

export type PaintUndoDirection = "undo" | "redo";

/** state/lab-store `PaintUndoHandler`와 구조적으로 같다(도메인 교차 import 금지라 여기서 재선언). */
export type PaintUndoHandler = (token: PaintUndoToken, direction: PaintUndoDirection) => PaintUndoToken | undefined;

/**
 * 토큰을 세션 레이어에 적용(undo/redo 모두 "타일 교체")하고 역토큰을 돌려준다. 레이어가 없으면 undefined
 * (스토어는 기존 토큰을 유지한다). 적용에 성공하면 해당 부위 레이어를 업로드한다.
 */
export function createPaintUndoHandler(session: PaintSession, upload: PaintLayerUploader): PaintUndoHandler {
  return (token) => {
    const inverse = session.applyToken(token);
    if (!inverse) return undefined;
    upload(session.layer(token.part));
    return inverse;
  };
}

// ---------------------------------------------------------------- 포인터 → NDC · 압력

export interface ClientRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 클라이언트 좌표 → NDC [-1, 1](y 위쪽 양수, `CharacterEngine.pick` 입력). 사각형 크기가 0이면 null.
 * 범위 밖 좌표는 클램프하지 않는다(엔진 pick이 null을 돌려준다).
 */
export function clientToNdc(clientX: number, clientY: number, rect: ClientRect): readonly [number, number] | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = 1 - ((clientY - rect.top) / rect.height) * 2;
  return [x, y];
}

export interface PointerPressureSource {
  readonly pointerType: string;
  readonly pressure: number;
}

/** 펜은 실제 압력(0..1), 마우스·터치는 1(브라우저가 마우스에 0.5를 보고하므로 보정). */
export function normalizePointerPressure(event: PointerPressureSource): number {
  if (event.pointerType === "pen") {
    const pressure = Number.isFinite(event.pressure) ? event.pressure : 0;
    return pressure < 0 ? 0 : pressure > 1 ? 1 : pressure;
  }
  return 1;
}

// ---------------------------------------------------------------- 포인터 드로잉 드라이버

export interface PointerPaintPorts {
  /** NDC → 픽 결과(`engine.pick`). 엔진이 없으면 null을 돌려주는 함수를 넘긴다. */
  readonly pick: (ndcX: number, ndcY: number) => PickHit | null;
  readonly upload: PaintLayerUploader;
  /** 스트로크 종료 시 토큰 1개(`dispatch({ type: "paint/stroke", undoToken })`). */
  readonly commit: (token: PaintUndoToken) => void;
}

export interface PointerSample {
  readonly ndcX: number;
  readonly ndcY: number;
  /** 0..1 (`normalizePointerPressure`) */
  readonly pressure: number;
}

export interface PointerPaintDriver {
  /** pointerdown 이후 pointerup/cancel 전이면 true */
  readonly active: boolean;
  /** 현재 세그먼트가 활성 부위 위에 있으면 true */
  readonly touching: boolean;
  /** 이번 포인터 스트로크에서 스탬프한 dab 수 */
  readonly dabCount: number;
  /** pointerdown. 활성 부위에 닿았으면 첫 dab을 찍고 true. 진행 중이던 스트로크는 먼저 끝낸다(commit). */
  down(sample: PointerSample): boolean;
  /** pointermove. 추가된 dab 수. */
  move(sample: PointerSample): number;
  /** pointerup. 병합 토큰을 commit하고 돌려준다(칠한 타일이 없으면 null, commit 없음). */
  up(): PaintUndoToken | null;
  /** pointercancel. 이번 스트로크를 되돌리고(업로드) commit하지 않는다. */
  cancel(): void;
}

function isPaintable(role: PartRole): boolean {
  return PAINTABLE_PART_ROLES.includes(role);
}

export function createPointerPaintDriver(session: PaintSession, ports: PointerPaintPorts): PointerPaintDriver {
  let active = false;
  let touching = false;
  let dabCount = 0;
  let tokens: PaintUndoToken[] = [];
  let part: PartRole = session.getState().activePart;

  const closeSegment = (): void => {
    if (!touching) return;
    const token = session.endStroke();
    if (token) tokens.push(token);
    touching = false;
  };

  const hitOnActivePart = (sample: PointerSample): PickHit | null => {
    const hit = ports.pick(sample.ndcX, sample.ndcY);
    if (!hit || hit.role !== part || !isPaintable(hit.role)) return null;
    return hit;
  };

  const stamp = (sample: PointerSample, hit: PickHit): number => {
    const dab = { u: hit.uv[0], v: hit.uv[1], pressure: sample.pressure };
    let added: number;
    if (touching) {
      added = session.extendStroke(dab);
    } else {
      session.beginStroke(dab, part);
      touching = true;
      added = 1;
    }
    if (added > 0) {
      dabCount += added;
      ports.upload(session.layer(part));
    }
    return added;
  };

  const reset = (): void => {
    active = false;
    touching = false;
    dabCount = 0;
    tokens = [];
  };

  const finish = (commit: boolean): PaintUndoToken | null => {
    closeSegment();
    const merged = mergeUndoTokens(tokens);
    const result = merged && merged.tiles.length > 0 ? merged : null;
    if (result) {
      if (commit) ports.commit(result);
      else {
        session.applyToken(result);
        ports.upload(session.layer(result.part));
      }
    }
    reset();
    return result;
  };

  return {
    get active() {
      return active;
    },
    get touching() {
      return touching;
    },
    get dabCount() {
      return dabCount;
    },
    down(sample) {
      if (active) finish(true);
      active = true;
      part = session.getState().activePart;
      const hit = hitOnActivePart(sample);
      if (!hit) return false;
      stamp(sample, hit);
      return true;
    },
    move(sample) {
      if (!active) return 0;
      const hit = hitOnActivePart(sample);
      if (!hit) {
        closeSegment();
        return 0;
      }
      return stamp(sample, hit);
    },
    up() {
      if (!active) return null;
      return finish(true);
    },
    cancel() {
      if (!active) return;
      finish(false);
    },
  };
}
