/**
 * 스크린톤 레이어 모델 (T6) — 2026-09-30
 *
 * CSP 벤치마킹: 선택 영역에 붙이는 "톤 레이어" 타입.
 * 기존 `studio-halftone.ts`의 Halftone(픽셀 단위 하프톤 필터 — 이미지 전체에 거는 효과)과
 * 달리, 이 모듈은 "선택 영역 마스크 + 톤 파라미터"로 구성된 레이어 모델을 정의한다.
 * 실제 canvas 2D 렌더링은 `screentone-render.ts`의 renderScreentone이 담당한다.
 *
 * 네이밍 충돌 방지를 위해 모든 공개 식별자는 ScreentoneLayer* 네임스페이스를 쓴다.
 * (HalftonePattern의 "circle"|"line"|"diamond"|"cross"와 값 일부가 겹치지만 타입이 다르다.)
 */

// ---------------------------------------------------------------------------
// 톤 파라미터 타입·기본값·범위
// ---------------------------------------------------------------------------

/** 망점 종류 — 도트(dot) / 사선(line) / 모래망점(sand, 노이즈) / 격자(cross). */
export type ScreentoneToneKind = "dot" | "line" | "sand" | "cross";

/** 그라데이션 톤 방식 — 없음 / 선형(linear, 방향 각도) / 방사형(radial). */
export type ScreentoneGradientKind = "none" | "linear" | "radial";

/**
 * 그라데이션 톤 설정.
 *   kind       그라데이션 방식.
 *   direction  linear 진행 방향(도, 0=→, 90=↓) — 0..360.
 *   fromDensity 시작점 농도 0..100 (%).
 *   toDensity    끝점 농도 0..100 (%).
 * 그라데이션이 켜져 있으면(kind != "none") 기본 농도(density) 대신
 * from→to 농도가 영역에 걸쳐 보간된다.
 */
export type ScreentoneGradient = {
  kind: ScreentoneGradientKind;
  direction: number;
  fromDensity: number;
  toDensity: number;
};

/**
 * 스크린톤 레이어 파라미터.
 *   kind     망점 종류.
 *   lines    선 수 10..60 — 클수록 촘촘한 망점.
 *   density  농도 0..100 (%) — 그라데이션 off일 때의 균일 농도.
 *   angle    망점 회전각 0..180 (도).
 *   seed     모래망점(sand)용 결정적 시드 — 같은 시드는 항상 같은 노이즈.
 *   gradient 그라데이션 톤 설정.
 */
export type ScreentoneLayer = {
  kind: ScreentoneToneKind;
  lines: number;
  density: number;
  angle: number;
  seed: number;
  gradient: ScreentoneGradient;
};

/** 기본 톤 — 30선 도트, 농도 40%, 45°, 그라데이션 없음. */
export const DEFAULT_SCREENTONE_LAYER: ScreentoneLayer = {
  kind: "dot",
  lines: 30,
  density: 40,
  angle: 45,
  seed: 1,
  gradient: { kind: "none", direction: 0, fromDensity: 20, toDensity: 60 },
};

export const SCREENTONE_LINES_RANGE = { min: 10, max: 60, step: 1 } as const;
export const SCREENTONE_DENSITY_RANGE = { min: 0, max: 100, step: 1 } as const;
export const SCREENTONE_ANGLE_RANGE = { min: 0, max: 180, step: 1 } as const;
export const SCREENTONE_SEED_RANGE = { min: 0, max: 9999, step: 1 } as const;
export const SCREENTONE_GRADIENT_DIRECTION_RANGE = { min: 0, max: 360, step: 1 } as const;

// 유효 집합(외부 입력 검증용).
const SCREENTONE_KINDS: readonly ScreentoneToneKind[] = ["dot", "line", "sand", "cross"];
const SCREENTONE_GRADIENT_KINDS: readonly ScreentoneGradientKind[] = ["none", "linear", "radial"];

// ---------------------------------------------------------------------------
// 정규화·항등 판정
// ---------------------------------------------------------------------------

function clampNumber(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

/**
 * 과거 저장본/외부 입력 안전장치 — 누락 키는 기본값, 숫자 아님은 기본값,
 * 범위 밖 숫자는 각 범위로 클램프, kind는 허용된 4종만(그 외는 "dot").
 */
export function normalizeScreentoneLayer(p?: Partial<ScreentoneLayer> | null): ScreentoneLayer {
  const src = p && typeof p === "object" ? p : {};
  const kind = SCREENTONE_KINDS.includes(src.kind as ScreentoneToneKind)
    ? (src.kind as ScreentoneToneKind)
    : DEFAULT_SCREENTONE_LAYER.kind;
  const gsrc = src.gradient && typeof src.gradient === "object" ? src.gradient : {};
  const gkind = SCREENTONE_GRADIENT_KINDS.includes(gsrc.kind as ScreentoneGradientKind)
    ? (gsrc.kind as ScreentoneGradientKind)
    : DEFAULT_SCREENTONE_LAYER.gradient.kind;
  return {
    kind,
    lines: clampNumber(src.lines, SCREENTONE_LINES_RANGE.min, SCREENTONE_LINES_RANGE.max, DEFAULT_SCREENTONE_LAYER.lines),
    density: clampNumber(
      src.density,
      SCREENTONE_DENSITY_RANGE.min,
      SCREENTONE_DENSITY_RANGE.max,
      DEFAULT_SCREENTONE_LAYER.density
    ),
    angle: clampNumber(src.angle, SCREENTONE_ANGLE_RANGE.min, SCREENTONE_ANGLE_RANGE.max, DEFAULT_SCREENTONE_LAYER.angle),
    seed: clampNumber(src.seed, SCREENTONE_SEED_RANGE.min, SCREENTONE_SEED_RANGE.max, DEFAULT_SCREENTONE_LAYER.seed),
    gradient: {
      kind: gkind,
      direction: clampNumber(
        gsrc.direction,
        SCREENTONE_GRADIENT_DIRECTION_RANGE.min,
        SCREENTONE_GRADIENT_DIRECTION_RANGE.max,
        DEFAULT_SCREENTONE_LAYER.gradient.direction
      ),
      fromDensity: clampNumber(
        gsrc.fromDensity,
        SCREENTONE_DENSITY_RANGE.min,
        SCREENTONE_DENSITY_RANGE.max,
        DEFAULT_SCREENTONE_LAYER.gradient.fromDensity
      ),
      toDensity: clampNumber(
        gsrc.toDensity,
        SCREENTONE_DENSITY_RANGE.min,
        SCREENTONE_DENSITY_RANGE.max,
        DEFAULT_SCREENTONE_LAYER.gradient.toDensity
      ),
    },
  };
}

/** 톤이 아무것도 그리지 않는 항등 설정인지 — 균일 농도 0이고 그라데이션도 0이면 true. */
export function isIdentityScreentoneLayer(layer: ScreentoneLayer): boolean {
  if (layer.density > 0) return false;
  const g = layer.gradient;
  if (g.kind === "none") return true;
  return g.fromDensity <= 0 && g.toDensity <= 0;
}

// ---------------------------------------------------------------------------
// 선택 영역 → 톤 레이어 생성 (순수 함수)
// ---------------------------------------------------------------------------

/** 사각 선택 — 캔버스 좌표계(px). width/height는 0 이상. */
export type ScreentoneSelectionRect = {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
};

/** 마스크 선택 — 길이 width*height, 값 0..1(범위 밖은 클램프). */
export type ScreentoneSelectionMask = {
  kind: "mask";
  mask: ArrayLike<number>;
  width: number;
  height: number;
};

export type ScreentoneSelection = ScreentoneSelectionRect | ScreentoneSelectionMask;

/** 선택 영역에 붙일 톤 레이어 인스턴스 — 정규화된 파라미터 + 래스터화된 커버리지 마스크. */
export type ScreentoneToneInstance = {
  layer: ScreentoneLayer;
  /** 선택 영역 커버리지 0..1 — Float32Array(width*height). */
  mask: Float32Array;
  width: number;
  height: number;
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 선택 영역에 스크린톤 레이어를 붙인다 — 순수 함수(DOM/canvas 의존 없음).
 *
 *  - rect: 캔버스 크기로 래스터화. 픽셀 중심이 사각형 안에 들면 1, 밖이면 0.
 *    사각형이 캔버스를 벗어나면 경계에서 잘린다.
 *  - mask: 값을 0..1로 클램프해 그대로 쓴다(부분 선택/페더 지원).
 *
 * 크기가 유효하지 않거나(0 이하) 마스크 길이가 맞지 않으면 RangeError.
 */
export function applyToneToSelection(
  selection: ScreentoneSelection,
  params?: Partial<ScreentoneLayer> | null
): ScreentoneToneInstance {
  const layer = normalizeScreentoneLayer(params);

  if (selection.kind === "mask") {
    const width = Math.floor(selection.width);
    const height = Math.floor(selection.height);
    if (!(width > 0) || !(height > 0)) {
      throw new RangeError("선택 마스크 크기가 올바르지 않습니다.");
    }
    if (selection.mask.length !== width * height) {
      throw new RangeError("선택 마스크 길이가 너비×높이와 다릅니다.");
    }
    const mask = new Float32Array(width * height);
    for (let i = 0; i < mask.length; i++) {
      const v: number = selection.mask[i] as number;
      mask[i] = clamp01(typeof v === "number" && Number.isFinite(v) ? v : 0);
    }
    return { layer, mask, width, height };
  }

  // --- rect ---
  const canvasWidth = Math.floor(selection.canvasWidth);
  const canvasHeight = Math.floor(selection.canvasHeight);
  if (!(canvasWidth > 0) || !(canvasHeight > 0)) {
    throw new RangeError("선택 영역 캔버스 크기가 올바르지 않습니다.");
  }
  const mask = new Float32Array(canvasWidth * canvasHeight);
  const x0 = selection.x;
  const y0 = selection.y;
  const x1 = selection.x + selection.width;
  const y1 = selection.y + selection.height;
  for (let py = 0; py < canvasHeight; py++) {
    for (let px = 0; px < canvasWidth; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      if (cx >= x0 && cx < x1 && cy >= y0 && cy < y1) {
        mask[py * canvasWidth + px] = 1;
      }
    }
  }
  return { layer, mask, width: canvasWidth, height: canvasHeight };
}

// ---------------------------------------------------------------------------
// 프리셋
// ---------------------------------------------------------------------------

export type ScreentoneLayerPreset = { id: string; label: string; tip: string; value: ScreentoneLayer };

/** 모든 value는 normalizeScreentoneLayer 통과(범위 안). */
export const SCREENTONE_LAYER_PRESETS: ScreentoneLayerPreset[] = [
  {
    id: "standard-dot",
    label: "표준 도트",
    tip: "30선 도트 톤 — 일반적인 만화 스크린톤.",
    value: normalizeScreentoneLayer({ kind: "dot", lines: 30, density: 40, angle: 45 }),
  },
  {
    id: "fine-dot",
    label: "미세 도트",
    tip: "60선 미세 도트 — 고해상도용 가는 톤.",
    value: normalizeScreentoneLayer({ kind: "dot", lines: 60, density: 30, angle: 45 }),
  },
  {
    id: "coarse-line",
    label: "굵은 사선",
    tip: "15선 사선 톤 — 속도선·효과선 질감.",
    value: normalizeScreentoneLayer({ kind: "line", lines: 15, density: 50, angle: 90 }),
  },
  {
    id: "sand-grain",
    label: "모래망점",
    tip: "노이즈 입자 톤 — 거친 질감 표현.",
    value: normalizeScreentoneLayer({ kind: "sand", lines: 40, density: 35, seed: 7 }),
  },
  {
    id: "linear-gradient",
    label: "선형 그라데이션",
    tip: "왼쪽 10% → 오른쪽 70% 도트 그라데이션 톤.",
    value: normalizeScreentoneLayer({
      kind: "dot",
      lines: 30,
      angle: 45,
      gradient: { kind: "linear", direction: 0, fromDensity: 10, toDensity: 70 },
    }),
  },
];
