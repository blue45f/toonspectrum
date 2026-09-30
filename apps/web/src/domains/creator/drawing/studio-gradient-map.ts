/**
 * studio-gradient-map.ts
 *
 * CSP식 그라데이션 맵 색보정 모델.
 * 명도(밝기) → 컬러 그라데이션 매핑: 픽셀의 밝기를 그라데이션 상의 위치로 보고
 * 해당 색으로 치환한다. 명암 구조는 유지하고 색감만 바꾸는 방식.
 *
 * 설계:
 * - 프리셋 5종 (석양/심해/세피아/사이버펑크/모노크롬) + 커스텀 편집 모델
 * - 적용은 룩업테이블(LUT, 기본 256) 기반 → ImageData 한 번 순회로 O(N)
 * - 전부 순수 함수 (Uint8ClampedArray), Canvas ImageData와 직접 호환
 */

/** 그라데이션 정지점. position 0..1, color 0..255 RGB. */
export interface StudioGradientStop {
  readonly position: number;
  readonly color: readonly [number, number, number];
}

export type StudioGradientMapPresetId =
  | "sunset"
  | "deep-sea"
  | "sepia"
  | "cyberpunk"
  | "monochrome";

export interface StudioGradientMapPreset {
  readonly id: StudioGradientMapPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 어두움(0) → 밝음(1) 순서. */
  readonly stops: ReadonlyArray<StudioGradientStop>;
}

/** 프리셋 5종. */
export const STUDIO_GRADIENT_MAP_PRESETS: ReadonlyArray<StudioGradientMapPreset> =
  Object.freeze([
    {
      id: "sunset",
      labelKo: "석양",
      labelEn: "Sunset",
      descriptionKo: "짙은 남색 그림자에서 주황빛 하이라이트로. 노을 장면에.",
      descriptionEn: "Deep navy shadows to orange highlights. For sunset scenes.",
      stops: [
        { position: 0, color: [25, 16, 66] },
        { position: 0.35, color: [122, 44, 96] },
        { position: 0.65, color: [232, 110, 68] },
        { position: 1, color: [255, 224, 178] },
      ],
    },
    {
      id: "deep-sea",
      labelKo: "심해",
      labelEn: "Deep sea",
      descriptionKo: "먹빛 심연에서 청록빛 수면으로. 밤·수중 장면에.",
      descriptionEn: "Inky abyss to teal surface. For night and underwater scenes.",
      stops: [
        { position: 0, color: [4, 12, 24] },
        { position: 0.4, color: [12, 52, 84] },
        { position: 0.7, color: [24, 128, 148] },
        { position: 1, color: [178, 236, 224] },
      ],
    },
    {
      id: "sepia",
      labelKo: "세피아",
      labelEn: "Sepia",
      descriptionKo: "갈색 톤의 회상 장면. 오래된 사진 느낌.",
      descriptionEn: "Brownish flashback tone. Aged-photo feel.",
      stops: [
        { position: 0, color: [42, 28, 16] },
        { position: 0.5, color: [128, 92, 52] },
        { position: 1, color: [244, 224, 188] },
      ],
    },
    {
      id: "cyberpunk",
      labelKo: "사이버펑크",
      labelEn: "Cyberpunk",
      descriptionKo: "마젠타 그림자 + 시안 하이라이트. 네온 도시의 밤.",
      descriptionEn: "Magenta shadows, cyan highlights. Neon city nights.",
      stops: [
        { position: 0, color: [24, 8, 44] },
        { position: 0.35, color: [128, 24, 148] },
        { position: 0.65, color: [32, 196, 220] },
        { position: 1, color: [255, 244, 214] },
      ],
    },
    {
      id: "monochrome",
      labelKo: "모노크롬",
      labelEn: "Monochrome",
      descriptionKo: "순수 흑백. 잉크 만화·명암 교정에.",
      descriptionEn: "Pure black and white. For ink manga and value checks.",
      stops: [
        { position: 0, color: [0, 0, 0] },
        { position: 1, color: [255, 255, 255] },
      ],
    },
  ]);

export function getGradientMapPreset(
  id: StudioGradientMapPresetId,
): StudioGradientMapPreset | undefined {
  return STUDIO_GRADIENT_MAP_PRESETS.find((p) => p.id === id);
}

/* ------------------------------------------------------------------ */
/* 검증·편집 모델                                                         */
/* ------------------------------------------------------------------ */

export function validateGradientStops(
  stops: ReadonlyArray<StudioGradientStop>,
): { readonly ok: boolean; readonly errors: ReadonlyArray<string> } {
  const errors: string[] = [];
  if (stops.length < 2) errors.push("정지점은 2개 이상이어야 합니다.");
  if (stops.length > 16) errors.push("정지점은 16개 이하여야 합니다.");
  for (const stop of stops) {
    if (!Number.isFinite(stop.position) || stop.position < 0 || stop.position > 1) {
      errors.push("정지점 위치는 0..1 범위여야 합니다.");
      break;
    }
    for (const c of stop.color) {
      if (!Number.isFinite(c) || c < 0 || c > 255) {
        errors.push("색상 채널은 0..255 범위여야 합니다.");
        break;
      }
    }
  }
  const positions = stops.map((s) => s.position);
  const sorted = [...positions].sort((a, b) => a - b);
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i] !== sorted[i]) {
      errors.push("정지점은 위치 오름차순이어야 합니다.");
      break;
    }
  }
  if (new Set(positions.map((p) => p.toFixed(6))).size !== positions.length) {
    errors.push("정지점 위치가 중복됩니다.");
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/** 정지점 정렬 (위치 오름차순). */
export function sortGradientStops(
  stops: ReadonlyArray<StudioGradientStop>,
): StudioGradientStop[] {
  return [...stops].sort((a, b) => a.position - b.position);
}

/**
 * 커스텀 그라데이션 편집 모델.
 * 불변 스냅샷 + 순수 연산 (add/move/remove/recolor).
 */
export interface StudioCustomGradientModel {
  readonly stops: ReadonlyArray<StudioGradientStop>;
  readonly addStop: (stop: StudioGradientStop) => StudioCustomGradientModel;
  readonly moveStop: (index: number, position: number) => StudioCustomGradientModel;
  readonly recolorStop: (
    index: number,
    color: readonly [number, number, number],
  ) => StudioCustomGradientModel;
  readonly removeStop: (index: number) => StudioCustomGradientModel;
}

function makeCustomGradientModel(
  stops: ReadonlyArray<StudioGradientStop>,
): StudioCustomGradientModel {
  const normalized = sortGradientStops(stops);
  return {
    stops: Object.freeze(normalized),
    addStop: (stop) => makeCustomGradientModel([...normalized, stop]),
    moveStop: (index, position) =>
      makeCustomGradientModel(
        normalized.map((s, i) => (i === index ? { ...s, position } : s)),
      ),
    recolorStop: (index, color) =>
      makeCustomGradientModel(
        normalized.map((s, i) => (i === index ? { ...s, color } : s)),
      ),
    removeStop: (index) =>
      makeCustomGradientModel(normalized.filter((_, i) => i !== index)),
  };
}

/** 프리셋에서 시작하는 커스텀 모델 생성. */
export function createCustomGradientModel(
  initial: ReadonlyArray<StudioGradientStop>,
): StudioCustomGradientModel {
  return makeCustomGradientModel(initial);
}

/* ------------------------------------------------------------------ */
/* LUT 빌드 + 적용 (성능: 룩업테이블)                                      */
/* ------------------------------------------------------------------ */

export const STUDIO_GRADIENT_MAP_LUT_SIZE = 256;

/**
 * 정지점 → RGB LUT 빌드. size*3 길이 Uint8Array (R,G,B 연속).
 * 정지점 사이 선형 보간.
 */
export function buildGradientMapLut(
  stops: ReadonlyArray<StudioGradientStop>,
  size: number = STUDIO_GRADIENT_MAP_LUT_SIZE,
): Uint8Array {
  const sorted = sortGradientStops(stops);
  const lut = new Uint8Array(Math.max(2, Math.floor(size)) * 3);
  const n = lut.length / 3;
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : i / (n - 1);
    let left = sorted[0];
    let right = sorted[sorted.length - 1];
    for (let s = 0; s < sorted.length - 1; s += 1) {
      if (t >= sorted[s].position && t <= sorted[s + 1].position) {
        left = sorted[s];
        right = sorted[s + 1];
        break;
      }
    }
    const span = right.position - left.position;
    const f = span <= 0 ? 0 : (t - left.position) / span;
    for (let c = 0; c < 3; c += 1) {
      lut[i * 3 + c] = Math.round(left.color[c] + (right.color[c] - left.color[c]) * f);
    }
  }
  return lut;
}

/** Rec.601 명도 → 0..1. */
export function luminanceOf(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export interface ApplyGradientMapOptions {
  /** true면 알파를 유지한다 (기본 true). */
  readonly preserveAlpha?: boolean;
}

/**
 * RGBA 버퍼에 그라데이션 맵 적용. 새 Uint8ClampedArray 반환 (원본 불변).
 * 명도 → LUT 인덱스로 매핑. 알파는 기본 유지.
 */
export function applyGradientMapToRgba(
  rgba: Uint8ClampedArray,
  lut: Uint8Array,
  options: ApplyGradientMapOptions = {},
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  const entries = Math.floor(lut.length / 3);
  const preserveAlpha = options.preserveAlpha ?? true;
  for (let i = 0; i + 3 < rgba.length + 1; i += 4) {
    const lum = luminanceOf(rgba[i], rgba[i + 1], rgba[i + 2]);
    const idx = Math.max(0, Math.min(entries - 1, Math.round(lum * (entries - 1))));
    out[i] = lut[idx * 3];
    out[i + 1] = lut[idx * 3 + 1];
    out[i + 2] = lut[idx * 3 + 2];
    out[i + 3] = preserveAlpha ? rgba[i + 3] : 255;
  }
  return out;
}

/**
 * hex(#rrggbb) 정지점 목록 → LUT. UI 컬러피커 연동용.
 */
export function buildLutFromHexStops(
  stops: ReadonlyArray<{ readonly position: number; readonly hex: string }>,
): Uint8Array {
  const parsed: StudioGradientStop[] = stops.map((s) => {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(s.hex.trim());
    const v = m ? parseInt(m[1], 16) : 0;
    return {
      position: s.position,
      color: [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const,
    };
  });
  return buildGradientMapLut(parsed);
}

/** RGB → "#rrggbb". */
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
