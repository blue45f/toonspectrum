/**
 * 배치 dab 렌더러 (canvas2d 스탬프 엔진용).
 *
 * 기존 `studio-brush-stamp-engine.ts`의 dab당 핫패스를 draw op 시퀀스로 계획해
 * 캔버스 상태 변경을 최소화한다:
 * - 알파 런 그룹핑: 연속된 동일 알파(1/255 양자화)는 globalAlpha 1회 설정
 * - 회전 팁: save/translate/rotate/drawImage/restore(5호출) 대신
 *   setTransform(cos,sin,-sin,cos,x,y) + drawImage(2호출)
 * - 팁 스프라이트: flush당 고유 tipKey 1회 조회
 * - 연필 지터: dab 인덱스 해시를 8개 변형으로 양자화해 변형별 스프라이트 베이크 가능
 *
 * 결정성 계약: 모든 무작위 요소는 dab 인덱스에서 유도한 해시로만 만든다.
 * 배치 계획은 draw 순서만 바꾸지 않으므로 픽셀 결과는 기존과 동일하다.
 */

/** 연필 그레인 지터 변형 수 (스프라이트 사전 베이크용). */
export const STUDIO_DAB_BATCH_PENCIL_VARIANTS = 8 as const;

/** 알파 양자화 단계 (1/255). */
const ALPHA_QUANTUM = 1 / 255;

export interface StudioDabBatchItem {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
  /** 회전 팁 라디안. 없으면 회전 없음. */
  readonly tipRotationRadians?: number;
  /** 팁 스프라이트 캐시 키 (예: `pencil:v3:r12`). */
  readonly tipKey: string;
  /** blit 목적지 크기 (팁 스프라이트 스케일 보정 후). */
  readonly tipWidth: number;
  readonly tipHeight: number;
}

export type StudioDabDrawOp =
  | { readonly op: "setAlpha"; readonly alpha: number }
  | { readonly op: "setTransform"; readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number }
  | { readonly op: "resetTransform" }
  | { readonly op: "blit"; readonly tipKey: string; readonly dx: number; readonly dy: number; readonly dw: number; readonly dh: number };

/** dab 인덱스에서 유도한 결정적 해시 (스탬프 엔진의 stampJitter 규약과 동일 계열). */
export function studioDabBatchHash(index: number, salt: number): number {
  let hash = (Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c5d) >>> 0;
  hash ^= hash >>> 12;
  return (hash >>> 0) / 4294967296;
}

/** 연필 dab의 지터 변형을 8개 중 하나로 양자화한다. 같은 인덱스는 항상 같은 변형. */
export function studioDabBatchPencilVariant(index: number): number {
  return Math.floor(studioDabBatchHash(index, 77) * STUDIO_DAB_BATCH_PENCIL_VARIANTS)
    % STUDIO_DAB_BATCH_PENCIL_VARIANTS;
}

/** 알파를 1/255 단위로 양자화한다. */
export function studioDabBatchQuantizeAlpha(alpha: number): number {
  if (!Number.isFinite(alpha)) return 0;
  return Math.min(1, Math.max(0, Math.round(alpha / ALPHA_QUANTUM) * ALPHA_QUANTUM));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * dab 시퀀스를 draw op 시퀀스로 계획한다.
 * - 연속된 동일 양자화 알파는 하나의 setAlpha로 묶는다.
 * - 회전 팁은 setTransform/blit/resetTransform 3-op으로, 비회전은 blit 1-op으로.
 */
export function planStudioDabBatch(
  items: readonly StudioDabBatchItem[],
): readonly StudioDabDrawOp[] {
  const ops: StudioDabDrawOp[] = [];
  let currentAlpha = Number.NaN;
  for (const item of items) {
    const alpha = studioDabBatchQuantizeAlpha(item.alpha);
    if (alpha !== currentAlpha) {
      ops.push({ op: "setAlpha", alpha });
      currentAlpha = alpha;
    }
    const rotation = item.tipRotationRadians;
    if (rotation && Number.isFinite(rotation) && rotation !== 0) {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      ops.push({ op: "setTransform", a: cos, b: sin, c: -sin, d: cos, e: item.x, f: item.y });
      ops.push({
        op: "blit",
        tipKey: item.tipKey,
        dx: -item.tipWidth / 2,
        dy: -item.tipHeight / 2,
        dw: item.tipWidth,
        dh: item.tipHeight,
      });
      ops.push({ op: "resetTransform" });
    } else {
      ops.push({
        op: "blit",
        tipKey: item.tipKey,
        dx: item.x - item.tipWidth / 2,
        dy: item.y - item.tipHeight / 2,
        dw: item.tipWidth,
        dh: item.tipHeight,
      });
    }
  }
  return Object.freeze(ops);
}

export interface StudioDabBatchTipResolver {
  /** tipKey로 스프라이트를 조회한다. 없으면 null (호출자가 폴백 렌더). */
  resolveTip(tipKey: string): unknown;
}

export interface StudioDabBatchContext {
  globalAlpha: number;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  drawImage(tip: unknown, dx: number, dy: number, dw: number, dh: number): void;
}

export interface StudioDabBatchFlushResult {
  readonly drawn: number;
  readonly skippedMissingTip: number;
  readonly uniqueTips: number;
}

/**
 * 계획된 op 시퀀스를 실행한다. 팁 조회는 flush당 고유 키 1회로 배치한다.
 * 컨텍스트는 CanvasRenderingContext2D의 부분집합이라 테스트에서 목으로 대체 가능하다.
 */
export function flushStudioDabBatch(
  context: StudioDabBatchContext,
  ops: readonly StudioDabDrawOp[],
  resolver: StudioDabBatchTipResolver,
): StudioDabBatchFlushResult {
  const tipCache = new Map<string, unknown>();
  let drawn = 0;
  let skippedMissingTip = 0;
  for (const op of ops) {
    switch (op.op) {
      case "setAlpha":
        context.globalAlpha = op.alpha;
        break;
      case "setTransform":
        context.setTransform(op.a, op.b, op.c, op.d, op.e, op.f);
        break;
      case "resetTransform":
        context.setTransform(1, 0, 0, 1, 0, 0);
        break;
      case "blit": {
        let tip = tipCache.get(op.tipKey);
        if (tip === undefined) {
          tip = resolver.resolveTip(op.tipKey) ?? null;
          tipCache.set(op.tipKey, tip);
        }
        if (tip === null) {
          skippedMissingTip += 1;
          break;
        }
        context.drawImage(tip, op.dx, op.dy, op.dw, op.dh);
        drawn += 1;
        break;
      }
    }
  }
  return Object.freeze({ drawn, skippedMissingTip, uniqueTips: tipCache.size });
}

/** 배치 전후의 상태 변경 횟수를 추정해 최적화 효과를 검증하는 진단용 카운터. */
export function countStudioDabBatchStateChanges(
  ops: readonly StudioDabDrawOp[],
): { readonly setAlpha: number; readonly setTransform: number; readonly blit: number } {
  let setAlpha = 0;
  let setTransform = 0;
  let blit = 0;
  for (const op of ops) {
    if (op.op === "setAlpha") setAlpha += 1;
    else if (op.op === "setTransform" || op.op === "resetTransform") setTransform += 1;
    else blit += 1;
  }
  return Object.freeze({ setAlpha, setTransform, blit });
}

/** 기존 방식(dab당 globalAlpha 설정)의 상태 변경 횟수 — 비교 기준선. */
export function countStudioDabNaiveStateChanges(itemCount: number): {
  readonly setAlpha: number;
  readonly saveRestore: number;
} {
  return Object.freeze({ setAlpha: itemCount, saveRestore: itemCount * 2 });
}

export function sanitizeStudioDabBatchItem(
  candidate: Partial<StudioDabBatchItem> & { tipKey: string },
): StudioDabBatchItem | null {
  const x = finiteOr(candidate.x ?? Number.NaN, Number.NaN);
  const y = finiteOr(candidate.y ?? Number.NaN, Number.NaN);
  const radius = finiteOr(candidate.radius ?? Number.NaN, Number.NaN);
  const tipWidth = finiteOr(candidate.tipWidth ?? Number.NaN, Number.NaN);
  const tipHeight = finiteOr(candidate.tipHeight ?? Number.NaN, Number.NaN);
  if (![x, y, radius, tipWidth, tipHeight].every((value) => Number.isFinite(value) && value >= 0)) {
    return null;
  }
  if (radius === 0 || tipWidth === 0 || tipHeight === 0) return null;
  const rotation = candidate.tipRotationRadians;
  return Object.freeze({
    x,
    y,
    radius,
    alpha: studioDabBatchQuantizeAlpha(candidate.alpha ?? 1),
    ...(rotation !== undefined ? { tipRotationRadians: rotation } : {}),
    tipKey: candidate.tipKey,
    tipWidth,
    tipHeight,
  });
}
