/**
 * studio-dual-brush.ts
 *
 * Clip Studio Paint식 "이중 브러시"의 원리를 재해석한 모델 모듈.
 * UI는 복제하지 않고, "기본 팁 + 질감 팁 결합"이라는 UX 패턴만 구현한다.
 *
 * 모델:
 * - 기본 팁: 기존 `studio-natural-media-brushes.ts`의 내추럴 미디어 프리셋 id 참조
 * - 질감 팁: Canvas2D 노이즈로 절차 생성한 그레이스케일 타일 (외부 이미지 불필요)
 * - 결합: blendMode(multiply/screen/overlay) + textureStrength(0..1) + textureScale
 *
 * 설계:
 * - 질감 타일 생성은 순수 함수 (Float32Array, 0..1) → 테스트 가능
 * - Canvas/DOM 렌더링 헬퍼는 브라우저 가드(`typeof document`) 포함
 * - 시드 고정 노이즈 → 같은 id/시드는 항상 같은 타일 (재생성 불필요, 캐시 가능)
 */

import type { StudioNaturalMediaBrushId } from "./studio-natural-media-brushes";

/* ------------------------------------------------------------------ */
/* 결합 모드·질감 종류                                                  */
/* ------------------------------------------------------------------ */

/** 이중 브러시 결합 모드. Canvas2D globalCompositeOperation과 1:1 매핑. */
export type StudioDualBrushBlendMode = "multiply" | "screen" | "overlay";

export type StudioDualBrushTextureId =
  | "paper"
  | "canvas-weave"
  | "sand"
  | "fibers"
  | "grain"
  | "mesh";

export interface StudioDualBrushTexture {
  readonly id: StudioDualBrushTextureId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 권장 기본 타일 크기(px). 패턴 타일 한 변. */
  readonly tileSize: number;
}

/** 절차적 질감 6종. 전부 시드 기반 노이즈로 생성, 외부 에셋 없음. */
export const STUDIO_DUAL_BRUSH_TEXTURES: ReadonlyArray<StudioDualBrushTexture> =
  Object.freeze([
    {
      id: "paper",
      labelKo: "종이결",
      labelEn: "Paper grain",
      descriptionKo: "부드러운 저주파 결. 수채화·연필에 어울리는 종이 질감.",
      descriptionEn: "Soft low-frequency grain. Paper feel for watercolor and pencil.",
      tileSize: 128,
    },
    {
      id: "canvas-weave",
      labelKo: "캔버스",
      labelEn: "Canvas weave",
      descriptionKo: "촘촘한 직조결. 유화·마커 채색에 깊이를 더한다.",
      descriptionEn: "Tight woven pattern. Adds depth to oil and marker fills.",
      tileSize: 128,
    },
    {
      id: "sand",
      labelKo: "모래",
      labelEn: "Sand",
      descriptionKo: "고운 고주파 입자. 스프레이·에어브러시 톤에.",
      descriptionEn: "Fine high-frequency particles. For spray and airbrush tones.",
      tileSize: 128,
    },
    {
      id: "fibers",
      labelKo: "섬유결",
      labelEn: "Fibers",
      descriptionKo: "한 방향으로 빳빳하게 난 결. 털·수염 같은 질감 표현에.",
      descriptionEn: "Stiff directional streaks. Fur and bristle textures.",
      tileSize: 128,
    },
    {
      id: "grain",
      labelKo: "입자",
      labelEn: "Grain",
      descriptionKo: "중간 대비의 거친 입자. 목탄·파스텔의 번짐에.",
      descriptionEn: "Medium-contrast coarse grain. Charcoal and pastel smudges.",
      tileSize: 128,
    },
    {
      id: "mesh",
      labelKo: "그물결",
      labelEn: "Mesh",
      descriptionKo: "규칙적인 격자. 메카·패턴 채색의 기계적 질감에.",
      descriptionEn: "Regular grid. Mechanical texture for mecha and pattern fills.",
      tileSize: 128,
    },
  ]);

export function getDualBrushTexture(
  id: StudioDualBrushTextureId,
): StudioDualBrushTexture | undefined {
  return STUDIO_DUAL_BRUSH_TEXTURES.find((t) => t.id === id);
}

/* ------------------------------------------------------------------ */
/* 이중 브러시 설정 모델                                                 */
/* ------------------------------------------------------------------ */

export interface StudioDualBrushConfig {
  /** 기본 팁: 내추럴 미디어 프리셋 id. */
  readonly baseBrushId: StudioNaturalMediaBrushId;
  /** 질감 팁. */
  readonly textureId: StudioDualBrushTextureId;
  readonly blendMode: StudioDualBrushBlendMode;
  /** 0..1 — 질감이 브러시에 미치는 강도. */
  readonly textureStrength: number;
  /** 0.25..4 — 질감 타일 스케일 (작을수록 촘촘). */
  readonly textureScale: number;
}

export const STUDIO_DUAL_BRUSH_DEFAULTS = {
  textureStrength: 0.5,
  textureScale: 1,
  minStrength: 0,
  maxStrength: 1,
  minScale: 0.25,
  maxScale: 4,
} as const;

export function validateDualBrushConfig(
  config: StudioDualBrushConfig,
): { readonly ok: boolean; readonly errors: ReadonlyArray<string> } {
  const errors: string[] = [];
  if (!getDualBrushTexture(config.textureId)) {
    errors.push(`알 수 없는 질감 id: ${String(config.textureId)}`);
  }
  if (!["multiply", "screen", "overlay"].includes(config.blendMode)) {
    errors.push(`알 수 없는 결합 모드: ${String(config.blendMode)}`);
  }
  if (
    !Number.isFinite(config.textureStrength) ||
    config.textureStrength < STUDIO_DUAL_BRUSH_DEFAULTS.minStrength ||
    config.textureStrength > STUDIO_DUAL_BRUSH_DEFAULTS.maxStrength
  ) {
    errors.push("질감 강도는 0..1 범위여야 합니다.");
  }
  if (
    !Number.isFinite(config.textureScale) ||
    config.textureScale < STUDIO_DUAL_BRUSH_DEFAULTS.minScale ||
    config.textureScale > STUDIO_DUAL_BRUSH_DEFAULTS.maxScale
  ) {
    errors.push("질감 스케일은 0.25..4 범위여야 합니다.");
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/* ------------------------------------------------------------------ */
/* 조합 프리셋 3종                                                       */
/* ------------------------------------------------------------------ */

export type StudioDualBrushComboId = "bristle-fibers" | "marker-canvas" | "watercolor-paper";

export interface StudioDualBrushCombo {
  readonly id: StudioDualBrushComboId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly config: StudioDualBrushConfig;
}

/** "털 브러시 + 빳빳한 결" 등 대표 조합 3종. */
export const STUDIO_DUAL_BRUSH_COMBOS: ReadonlyArray<StudioDualBrushCombo> =
  Object.freeze([
    {
      id: "bristle-fibers",
      labelKo: "털 브러시 + 빳빳한 결",
      labelEn: "Bristle + stiff grain",
      descriptionKo: "목탄 팁에 섬유결을 오버레이. 동물의 털·수염 묘사에.",
      descriptionEn: "Charcoal tip with fiber overlay. Great for fur and whiskers.",
      config: {
        baseBrushId: "charcoal",
        textureId: "fibers",
        blendMode: "overlay",
        textureStrength: 0.65,
        textureScale: 0.8,
      },
    },
    {
      id: "marker-canvas",
      labelKo: "마커 + 캔버스결",
      labelEn: "Marker + canvas",
      descriptionKo: "마커 팁에 캔버스 직조를 곱셈 결합. 유화 같은 채색 질감.",
      descriptionEn: "Marker tip multiplied with canvas weave. Oil-paint-like fills.",
      config: {
        baseBrushId: "marker",
        textureId: "canvas-weave",
        blendMode: "multiply",
        textureStrength: 0.45,
        textureScale: 1.2,
      },
    },
    {
      id: "watercolor-paper",
      labelKo: "수채 스프레이 + 종이결",
      labelEn: "Watercolor spray + paper",
      descriptionKo: "스프레이 팁에 종이결을 스크린 결합. 은은한 종이 번짐.",
      descriptionEn: "Spray tip screened with paper grain. Soft paper bloom.",
      config: {
        baseBrushId: "spray",
        textureId: "paper",
        blendMode: "screen",
        textureStrength: 0.55,
        textureScale: 1,
      },
    },
  ]);

export function getDualBrushCombo(
  id: StudioDualBrushComboId,
): StudioDualBrushCombo | undefined {
  return STUDIO_DUAL_BRUSH_COMBOS.find((c) => c.id === id);
}

/* ------------------------------------------------------------------ */
/* 시드 기반 밸류 노이즈 (순수 함수)                                       */
/* ------------------------------------------------------------------ */

/** 결정적 2D 해시 → 0..1. */
function hash2(x: number, y: number, seed: number): number {
  let h = (seed + Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 보간된 밸류 노이즈. x, y는 실수 좌표. */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 옥타브 합성 노이즈 → 0..1. */
function fbm(x: number, y: number, seed: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += amplitude * valueNoise(x * frequency, y * frequency, seed + i * 1013);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

/* ------------------------------------------------------------------ */
/* 절차적 질감 타일 생성 (순수 함수, 0..1 Float32Array)                      */
/* ------------------------------------------------------------------ */

export interface GenerateTextureTileOptions {
  readonly size?: number;
  readonly seed?: number;
}

/**
 * 질감 타일 한 변 size px의 그레이스케일 타일 생성.
 * 반환값은 size*size 길이, 0..1 (0=어두움, 1=밝음).
 * 같은 id/시드/크기는 항상 동일한 결과를 낸다.
 */
export function generateTextureTile(
  id: StudioDualBrushTextureId,
  options: GenerateTextureTileOptions = {},
): Float32Array {
  const texture = getDualBrushTexture(id);
  const size = Math.max(8, Math.min(512, Math.floor(options.size ?? texture?.tileSize ?? 128)));
  const seed = options.seed ?? id.length * 7919 + 17;
  const tile = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = x / size;
      const ny = y / size;
      let v: number;
      switch (id) {
        case "paper": {
          // 부드러운 저주파 종이결: 대비 낮게
          const n = fbm(nx * 4, ny * 4, seed, 4);
          v = 0.5 + (n - 0.5) * 0.36;
          break;
        }
        case "canvas-weave": {
          // 촘촘한 직조: sin 격자 + 미세 노이즈
          const weave =
            Math.sin(nx * Math.PI * 24) * Math.sin(ny * Math.PI * 24);
          const n = fbm(nx * 8, ny * 8, seed, 2);
          v = 0.5 + weave * 0.22 + (n - 0.5) * 0.18;
          break;
        }
        case "sand": {
          // 고운 고주파 입자
          const n = valueNoise(nx * 64, ny * 64, seed);
          v = 0.5 + (n - 0.5) * 0.5;
          break;
        }
        case "fibers": {
          // 한 방향(x축)으로 늘인 결
          const n = fbm(nx * 3, ny * 28, seed, 4);
          v = 0.5 + (n - 0.5) * 0.62;
          break;
        }
        case "grain": {
          // 중간 대비 거친 입자
          const n = fbm(nx * 16, ny * 16, seed, 3);
          v = 0.5 + (n - 0.5) * 0.8;
          break;
        }
        case "mesh": {
          // 규칙 격자 + 살짝의 노이즈
          const gx = Math.abs(Math.sin(nx * Math.PI * 16));
          const gy = Math.abs(Math.sin(ny * Math.PI * 16));
          const grid = Math.min(gx, gy);
          const n = fbm(nx * 6, ny * 6, seed, 2);
          v = 0.45 + grid * 0.4 + (n - 0.5) * 0.12;
          break;
        }
        default: {
          v = fbm(nx * 8, ny * 8, seed, 3);
        }
      }
      tile[y * size + x] = Math.max(0, Math.min(1, v));
    }
  }
  return tile;
}

/* ------------------------------------------------------------------ */
/* 결합 연산 (순수 함수)                                                   */
/* ------------------------------------------------------------------ */

/** 단일 픽셀 결합: base(브러시 색, 0..1) × texture(0..1). */
export function blendDualBrushValue(
  base: number,
  texture: number,
  mode: StudioDualBrushBlendMode,
): number {
  const b = Math.max(0, Math.min(1, base));
  const t = Math.max(0, Math.min(1, texture));
  switch (mode) {
    case "multiply":
      return b * t;
    case "screen":
      return 1 - (1 - b) * (1 - t);
    case "overlay":
      return b < 0.5
        ? 2 * b * t
        : 1 - 2 * (1 - b) * (1 - t);
    default:
      return b;
  }
}

/**
 * 결합 결과에 강도(strength)를 적용: 결과와 원본을 선형 보간.
 * strength=0이면 질감 없음, 1이면 질감 100%.
 */
export function applyDualBrushStrength(
  base: number,
  blended: number,
  strength: number,
): number {
  const s = Math.max(0, Math.min(1, strength));
  return base + (blended - base) * s;
}

/* ------------------------------------------------------------------ */
/* Canvas 렌더링 헬퍼 (브라우저 전용)                                      */
/* ------------------------------------------------------------------ */

/** 그레이스케일 타일 → 회색조 캔버스. 브라우저가 아니면 null. */
export function createTextureCanvasTile(
  tile: Float32Array,
  size: number,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < tile.length; i += 1) {
    const g = Math.round(tile[i] * 255);
    image.data[i * 4] = g;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = g;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * 스트로크 마스크 위에 질감 패턴을 결합 모드로 합성한 캔버스를 만든다.
 * - strokeCanvas: 이미 그려진 스트로크 (같은 크기)
 * - textureTile: generateTextureTile 결과
 */
export function compositeDualBrushStroke(
  strokeCanvas: HTMLCanvasElement,
  textureTile: Float32Array,
  tileSize: number,
  config: Pick<
    StudioDualBrushConfig,
    "blendMode" | "textureStrength" | "textureScale"
  >,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const { width, height } = strokeCanvas;
  const tileCanvas = createTextureCanvasTile(textureTile, tileSize);
  if (!tileCanvas) return null;

  const scaled = Math.max(1, Math.round(tileSize * config.textureScale));
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = width;
  patternCanvas.height = height;
  const pctx = patternCanvas.getContext("2d");
  if (!pctx) return null;
  const pattern = pctx.createPattern(tileCanvas, "repeat");
  if (!pattern) return null;
  pctx.save();
  pctx.scale(scaled / tileSize, scaled / tileSize);
  pctx.fillStyle = pattern;
  pctx.fillRect(0, 0, width * (tileSize / scaled), height * (tileSize / scaled));
  pctx.restore();

  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  const rctx = result.getContext("2d");
  if (!rctx) return null;
  rctx.drawImage(strokeCanvas, 0, 0);
  rctx.globalCompositeOperation = config.blendMode;
  rctx.globalAlpha = Math.max(0, Math.min(1, config.textureStrength));
  rctx.drawImage(patternCanvas, 0, 0);
  rctx.globalAlpha = 1;
  rctx.globalCompositeOperation = "source-over";
  return result;
}
