/**
 * Stamp-based brush engine (canvas2d).
 *
 * 에어브러시·연필·잉크·수채 마커를 dab(도장) 시퀀스로 그린다. 프로급 드로잉 앱들의 공통
 * 구조로, 증분 렌더링(새 dab 만 추가)과 자연스럽게 맞는다 — 라이브 오버레이와 커밋 렌더가
 * 이 모듈의 같은 함수를 사용해 픽셀 규약이 완전히 일치한다.
 *
 * 결정성 계약: 모든 무작위 요소(연필 그레인 지터 등)는 스탬프 인덱스에서 유도한 해시로만
 * 만든다. 같은 입력(points/pressures/style)이면 증분이든 전체 재생이든 동일한 픽셀이 나온다.
 * 이 계약 덕에 뷰포트 리플레이·커밋 핸드오프에서 획의 모양이 변하지 않는다.
 *
 * Hybrid OSS tips: airbrush/watercolor tip pixels come from studio-oss-brush-kernels
 * (Klecks multi-octave spray/chalk DNA + equal-area scatter), not pure CSS gradients.
 */

import { resolveStudioBrushEngineLaneStampTuning } from "./studio-brush-engine-lane-catalog";
import {
  studioOssDirectionalWaxSample,
  studioOssKlecksChalkCoverage,
  studioOssSprayTipCoverage,
  studioOssWatercolorTipCoverage,
} from "./studio-oss-brush-kernels";
import {
  getStudioPaperPresetV1,
  isStudioPaperPresetIdV1,
  resolveStudioPaperMediaModulationV1,
} from "./studio-paper-media-profile-v1";

import type { StudioBrushEngineLaneStampTuning } from "./studio-brush-engine-lane-catalog";
import type {
  StudioPaperMediumV1,
  StudioPaperPresetIdV1,
  StudioPaperPresetV1,
} from "./studio-paper-media-profile-v1";

export type StudioStampBrushKind =
  | "airbrush"
  | "pencil"
  | "ink"
  | "watercolor"
  | "mypaint"
  | "krita-auto"
  /** Verified dry-media stamps (Klecks chalk / directional wax / libmypaint charcoal DNA). */
  | "crayon"
  | "chalk"
  | "charcoal"
  | "pastel";

/**
 * One logical stamp stroke may be replayed from an imported/collaborative document. A finite cap
 * prevents a single enormous segment from monopolising the main thread while remaining far above
 * the amount of detail visible in a normal Studio viewport.
 */
export const STUDIO_STAMP_BRUSH_MAX_DABS = 100_000;

/** 스탬프 엔진을 쓰는 브러시 프리셋 id → 종류. 그 외 id 는 null(기존 패밀리 파이프라인). */
export function resolveStudioStampBrushKind(
  brushId: string | undefined
): StudioStampBrushKind | null {
  if (!brushId) return null;
  switch (brushId) {
    case "ink-brush":
      return "ink";
    case "airbrush-fine":
    case "airbrush-soft":
      return "airbrush";
    case "pencil-grain":
      return "pencil";
    case "wash-brush":
      return "watercolor";
    case "mypaint-smudge-oil":
    case "mypaint-watercolor-expressive":
      return "mypaint";
    case "krita-auto-soft":
    case "krita-dual-pattern":
      return "krita-auto";
    case "gouache--flat-stamp":
      return "ink";
    case "watercolor--edge-stamp":
      return "watercolor";
    case "airbrush--stamp-soft":
      return "airbrush";
    case "pencil--stamp-grain":
      return "pencil";
    // 검증된 OSS 드라이 미디어 스탬프 레인(의도적 유사 변종). 코어 id(crayon/chalk/charcoal/
    // pastel)는 dynamic-dabs 엔진 계약을 유지하고, `--*-stamp` 레인만 이 walker를 탄다 —
    // 같은 재료라도 스탬프 beds 의 필기감(겹침 빌드업·왁스 골)이 달라 둘 다 제품 가치가 있다.
    case "crayon--klecks-stamp":
      return "crayon";
    case "chalk--klecks-stamp":
      return "chalk";
    case "charcoal--mypaint-stamp":
      return "charcoal";
    case "pastel--soft-stamp":
      return "pastel";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Opt-in W7 paper tooth program — dry stamp lanes (2026-08-13 brush quality wave, F1)
// ---------------------------------------------------------------------------

/**
 * 카탈로그 스탬프 튜닝이 레인별로 핀하는 종이 프로그램 id.
 * wetEdgeBloomProgramId 와 같은 규약: 프로그램 id 가 없는 레인의 dab 계획은 종이 배선
 * 이전과 비트 단위로 동일하다(회귀 테스트가 이 계약을 고정한다).
 */
export type StudioStampPaperProgramId = "dry-peak-catch-v1";

export interface StudioStampPaperProgram {
  /**
   * 프로그램이 실제로 렌더하는 매체만 등재한다(레인 정직성 정책). 미등재 kind 로 프로그램을
   * 핀해도 결합이 만들어지지 않아 정확한 항등으로 fail-closed 한다.
   */
  readonly mediumByKind: Readonly<
    Partial<Record<StudioStampBrushKind, StudioPaperMediumV1>>
  >;
  /** 레인이 종이를 고정하지 않았을 때의 기본 낱장 — W7 기본 지도에서 유도한 값. */
  readonly defaultPresetIdByKind: Readonly<
    Partial<Record<StudioStampBrushKind, StudioPaperPresetIdV1>>
  >;
}

/**
 * dry-peak-catch-v1: W7 peak-catch(건식) — 저필압은 종이 봉우리에만 안료가 걸리고
 * (드라이브러시 스파클), 고필압은 골까지 메운다. 기본 낱장은 크레용·초크·목탄이 판화지
 * (깊은 알갱이 이빨), 파스텔이 켄트지(고운 미세 이빨)다.
 */
export const STUDIO_STAMP_PAPER_PROGRAMS: Readonly<
  Record<StudioStampPaperProgramId, StudioStampPaperProgram>
> = Object.freeze({
  "dry-peak-catch-v1": Object.freeze({
    mediumByKind: Object.freeze({
      crayon: "crayon",
      chalk: "chalk",
      charcoal: "charcoal",
      pastel: "pastel",
    }),
    defaultPresetIdByKind: Object.freeze({
      crayon: "printmaking",
      chalk: "printmaking",
      charcoal: "printmaking",
      pastel: "kent",
    }),
  }),
});

export function resolveStudioStampPaperProgram(
  programId: string | null | undefined,
): StudioStampPaperProgram | null {
  if (!programId) return null;
  return (
    STUDIO_STAMP_PAPER_PROGRAMS as Record<string, StudioStampPaperProgram>
  )[programId] ?? null;
}

/** 스타일에 상주하는 해석 완료 종이 결합 — 프로그램을 핀한 레인의 스타일만 이 필드를 가진다. */
export interface StudioStampPaperGrainStyle {
  readonly programId: StudioStampPaperProgramId;
  readonly presetId: StudioPaperPresetIdV1;
  readonly preset: StudioPaperPresetV1;
  readonly medium: StudioPaperMediumV1;
  /** (programId, presetId)에서 유도한 결정적 낱장 시드 — 같은 레인·같은 종이 = 같은 낱장. */
  readonly seed: number;
}

/**
 * 낱장 시드 — FNV-1a(programId:presetId). 종이는 문서에 깔린 한 장이므로 획·시각과 무관하게
 * 고정이어야 라이브 오버레이·커밋 재생·SVG 내보내기가 같은 이빨 패턴을 읽는다.
 */
function studioStampPaperSheetSeed(programId: string, presetId: string): number {
  const key = `${programId}:${presetId}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 레인 스탬프 튜닝의 종이 핀을 스타일 결합으로 해석한다. 프로그램 미핀, 미등재 kind,
 * 알 수 없는 프리셋 id 는 전부 null(정확한 항등)로 fail-closed 한다.
 */
export function resolveStudioStampPaperGrainStyle(
  kind: StudioStampBrushKind,
  lane: Pick<
    StudioBrushEngineLaneStampTuning,
    "paperProgramId" | "paperPresetId"
  > | null,
): StudioStampPaperGrainStyle | null {
  const programId = lane?.paperProgramId;
  const program = resolveStudioStampPaperProgram(programId);
  if (!programId || !program) return null;
  const medium = program.mediumByKind[kind];
  const presetId = lane?.paperPresetId ?? program.defaultPresetIdByKind[kind];
  if (!medium || !isStudioPaperPresetIdV1(presetId)) return null;
  return Object.freeze({
    programId,
    presetId,
    preset: getStudioPaperPresetV1(presetId),
    medium,
    seed: studioStampPaperSheetSeed(programId, presetId),
  });
}

/**
 * W7 peak-catch 침착 스케일(0..1) — 핀된 레인의 dab 알파에 곱한다. 순수·결정적:
 * 같은 (paper, x, y, pressure)는 항상 같은 값이라 증분/재생/SVG 픽셀 규약이 유지된다.
 *
 * 종이는 문서 좌표에 고정된 낱장이다(웻 레인·다이나믹 레인의 종이 침착과 동일 규약).
 * 알려진 갭(F1): 대칭 팬에서 Canvas(studio-stamp-symmetry-rendering)는 원본 계획 하나를
 * 컨텍스트 변환으로 복제하고 SVG는 변환된 변주 좌표로 재계획하므로, 비항등 대칭 사본의
 * 침착 패턴이 두 표면에서 다르게 나온다(항등 사본 = 실제 획은 정확히 일치). 정합 방법은
 * 대칭 렌더러를 다이나믹 레인처럼 변주별 재계획으로 맞추는 것 — 별도 후속 작업으로 추적한다.
 */
function stampPaperDepositScale(
  paper: StudioStampPaperGrainStyle,
  x: number,
  y: number,
  pressure: number,
): number {
  return resolveStudioPaperMediaModulationV1({
    medium: paper.medium,
    preset: paper.preset,
    pressure,
    x,
    y,
    seed: paper.seed,
  }).depositScale;
}

export interface StudioStampBrushStyle {
  readonly kind: StudioStampBrushKind;
  readonly color: string;
  /** 문서 px 기준 기본 지름(스트로크 굵기 슬라이더와 동일 단위). */
  readonly size: number;
  /** 전체 획 불투명도(0..1) — dab flow 와 곱해진다. */
  readonly opacity: number;
  /** dab 하나의 도포량(0..1). 낮을수록 겹칠수록 진해지는 빌드업 브러시가 된다. */
  readonly flow: number;
  /** 팁 경도(0..1): 1=가장자리 선명, 0=가장 부드러운 페더. */
  readonly hardness: number;
  /** 필압 0에서의 크기 비율(0..1) — Min size. */
  readonly minSizeRatio: number;
  /**
   * dab 지름 대비 스탬프 간격 비율.
   * 생략 시 kind 기본값(STAMP_SPACING_RATIO)을 사용한다.
   */
  readonly spacingRatio?: number;
  /**
   * W7 종이 결합(peak-catch). 카탈로그 튜닝이 paperProgramId 를 핀한 레인에서만 존재하며,
   * 없으면 dab 알파 산식이 종이 배선 이전과 비트 단위로 같다.
   */
  readonly paperGrain?: StudioStampPaperGrainStyle;
}

/** dab 지름 대비 스탬프 간격 비율 — 종류별 질감을 만드는 1차 변수. */
const STAMP_SPACING_RATIO: Record<StudioStampBrushKind, number> = {
  // Klecks/Kleki airbrush: dense soft dabs keep the mist continuous.
  airbrush: 0.12,
  pencil: 0.24,
  ink: 0.32,
  // Wet wash: dense stations so the OSS wet-edge ring forms a continuous front.
  watercolor: 0.09,
  mypaint: 0.2,
  "krita-auto": 0.15,
  // Verified dry-media stamps: denser than pencil so wax/chalk beds stay continuous without
  // polygon union expansion.
  crayon: 0.16,
  chalk: 0.14,
  charcoal: 0.18,
  pastel: 0.13,
};

/** 종류별 기본 파라미터 — UI 슬라이더의 초기값이자 스타일 미지정 필드의 폴백. */
export const STUDIO_STAMP_BRUSH_DEFAULTS: Record<
  StudioStampBrushKind,
  Pick<StudioStampBrushStyle, "flow" | "hardness" | "minSizeRatio">
> = {
  // Klecks spray DNA: low per-dab flow so grit tip builds by overlap.
  airbrush: { flow: 0.16, hardness: 0.06, minSizeRatio: 0.7 },
  pencil: { flow: 0.62, hardness: 0.85, minSizeRatio: 0.35 },
  ink: { flow: 1, hardness: 1, minSizeRatio: 0.08 },
  watercolor: { flow: 0.26, hardness: 0.28, minSizeRatio: 0.55 },
  mypaint: { flow: 0.75, hardness: 0.6, minSizeRatio: 0.25 },
  "krita-auto": { flow: 0.85, hardness: 0.75, minSizeRatio: 0.3 },
  // Wax scrape: moderate flow so tooth builds without flooding.
  crayon: { flow: 0.72, hardness: 0.88, minSizeRatio: 0.4 },
  // Klecks chalk powder: lower flow, soft mineral rim.
  chalk: { flow: 0.38, hardness: 0.22, minSizeRatio: 0.55 },
  // libmypaint charcoal DNA: higher grit, medium hardness.
  charcoal: { flow: 0.55, hardness: 0.48, minSizeRatio: 0.32 },
  // Krita soft pastel cake.
  pastel: { flow: 0.48, hardness: 0.35, minSizeRatio: 0.5 },
};

function parseCssRgbColor(
  color: string,
): Readonly<{ r: number; g: number; b: number }> | null {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(color.trim());
  if (hex) {
    const raw = hex[1]!;
    const full = raw.length === 3
      ? [...raw].map((c) => `${c}${c}`).join("")
      : raw;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/iu.exec(color);
  if (!rgb) return null;
  return {
    r: Math.round(Number(rgb[1])),
    g: Math.round(Number(rgb[2])),
    b: Math.round(Number(rgb[3])),
  };
}

/** OSS 질감 팁을 굽는 스탬프 종류(잉크·mypaint·krita-auto 는 그라디언트 팁을 유지한다). */
export type StudioStampOssTexturedTipKind =
  | "airbrush"
  | "watercolor"
  | "crayon"
  | "chalk"
  | "charcoal"
  | "pastel";

/** 캐시 가능한 dab 을 위해 고정한 팁 로컬 스트로크 축. 라이브 경로는 배치 지터로 회전감을 얻는다. */
const OSS_TIP_DIRECTION_RADIANS = -Math.PI / 5;

/**
 * OSS 질감 팁의 픽셀 커버리지(순수·결정적) — (nx, ny)는 팁 반경으로 정규화한 좌표.
 * rasterizeOssTexturedTip 이 이 함수로 ImageData 를 굽고, 테스트가 같은 함수를 그리드
 * 샘플링해 질감 분산·종류 간 구분·경도 응답을 고정한다.
 *
 * 종류별 질감 의도:
 * - airbrush: Klecks 스프레이 — 소프트 엔벨로프 × 멀티 옥타브 그릿(겹쳐도 입자감 유지).
 * - watercolor: 소프트 바디 + 웻엣지 링(r≈0.92 어두운 띠) × 과립.
 * - crayon: 방향성 왁스 베드. 림은 wax 노이즈로 반경 끝까지 너덜너덜하게 닿고(잘린 원판 금지),
 *   경도가 오르면 눌린 왁스 플래토가 넓어지며 scrape 골이 종이 이를 드러낸다.
 * - chalk: Klecks genBrushAlpha01 이 질감 마스터. 경도는 파우더 바디의 어깨 지수만 조인다
 *   (경도↑ = 판판하게 눌린 사이드스틱, 경도↓ = 가장자리로 흩어지는 가루).
 * - charcoal: libmypaint charcoal.myb DNA — wax.grit 이 이(tooth), scrape 가 종이 보임 골,
 *   Klecks 파우더가 바디. 경도가 낮을수록 파우더 엣지가 길게 풀린다.
 * - pastel: 소프트 케이크 — smoothstep 벨벳 어깨 × 굵은 파우더. 초크보다 결이 곱고 균일하다.
 */
export function studioStampOssTipCoverage(
  kind: StudioStampOssTexturedTipKind,
  normalizedX: number,
  normalizedY: number,
  seed: number,
  hardness: number,
): number {
  const hard = clamp01(hardness);
  const radial = Math.hypot(normalizedX, normalizedY);
  if (kind === "airbrush") {
    return studioOssSprayTipCoverage(normalizedX, normalizedY, seed, hard);
  }
  if (kind === "watercolor") {
    return studioOssWatercolorTipCoverage(normalizedX, normalizedY, seed, hard);
  }
  if (kind === "chalk") {
    const klecks = studioOssKlecksChalkCoverage(normalizedX, normalizedY, seed);
    const shoulder = clamp01(1 - radial);
    const body = shoulder ** (0.4 + (1 - hard) * 0.9);
    return clamp01(klecks * (0.5 + 0.5 * body));
  }
  if (kind === "crayon") {
    const wax = studioOssDirectionalWaxSample(
      normalizedX,
      normalizedY,
      OSS_TIP_DIRECTION_RADIANS,
      seed,
    );
    const rimWobble = (wax.wax - 0.5) * 0.24;
    const plateau = 0.42 + hard * 0.3;
    const shoulderWidth = Math.max(0.14, 1 - plateau);
    const disk = clamp01(1 - (radial + rimWobble - plateau) / shoulderWidth);
    return clamp01(disk * (0.34 + 0.66 * wax.wax) * (1 - wax.scrape * 0.55));
  }
  if (kind === "charcoal") {
    const wax = studioOssDirectionalWaxSample(
      normalizedX,
      normalizedY,
      OSS_TIP_DIRECTION_RADIANS,
      seed ^ 0xc4,
    );
    const chalkPowder = studioOssKlecksChalkCoverage(normalizedX, normalizedY, seed ^ 0xa1);
    const body = clamp01(1 - radial) ** (0.55 + (1 - hard) * 0.95);
    const packed = 0.28 * chalkPowder + 0.5 * wax.wax + 0.42 * wax.grit;
    return clamp01(body * packed * (1 - wax.scrape * 0.38));
  }
  // pastel
  const chalkPowder = studioOssKlecksChalkCoverage(normalizedX, normalizedY, seed ^ 0xb7);
  const shoulder = clamp01(1 - radial * (0.8 + hard * 0.25));
  const velvet = shoulder * shoulder * (3 - 2 * shoulder);
  return clamp01(velvet * (0.45 + 0.55 * chalkPowder) * (0.72 + 0.28 * hard));
}

/**
 * Bake an OSS multi-octave tip into ImageData (Klecks chalk/spray/wax structure).
 * Falls back to null when the context cannot allocate ImageData (jsdom stubs).
 */
function rasterizeOssTexturedTip(
  ctx: CanvasRenderingContext2D,
  kind: StudioStampOssTexturedTipKind,
  color: string,
  radius: number,
  hardness: number,
  seed: number,
): boolean {
  const channels = parseCssRgbColor(color);
  if (!channels || typeof ctx.createImageData !== "function") return false;
  const size = Math.max(4, Math.round(radius * 2 + 4));
  const image = ctx.createImageData(size, size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const invR = 1 / Math.max(1e-6, radius);
  const data = image.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - cx) * invR;
      const ny = (y - cy) * invR;
      const coverage = studioStampOssTipCoverage(kind, nx, ny, seed, hardness);
      const offset = (y * size + x) * 4;
      data[offset] = channels.r;
      data[offset + 1] = channels.g;
      data[offset + 2] = channels.b;
      data[offset + 3] = Math.round(clamp01(coverage) * 255);
    }
  }
  if (typeof ctx.putImageData !== "function") return false;
  ctx.putImageData(image, 0, 0);
  return true;
}


/** 사용자 조절 가능한 스탬프 파라미터(부분 지정) — DrawEl.stamp 로 획에 영속화된다. */
export interface StudioStampBrushTuning {
  readonly flow?: number;
  readonly hardness?: number;
  readonly minSize?: number;
}

/** 종류별 기본값 위에 획 단위 튜닝을 얹어 최종 스타일을 만든다(값은 0..1 로 클램프). */
export function resolveStudioStampBrushStyle(
  kind: StudioStampBrushKind,
  base: { color: string; size: number; opacity: number },
  tuning?: StudioStampBrushTuning | null,
  brushId?: string | null,
): StudioStampBrushStyle {
  const defaults = STUDIO_STAMP_BRUSH_DEFAULTS[kind];
  const lane = resolveStudioBrushEngineLaneStampTuning(brushId);
  const pick = (value: number | undefined, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : fallback;
  const sizeScale = lane?.sizeScale ?? 1;
  // 종이 프로그램 핀은 레인 카탈로그 전용이다 — 핀이 없으면 필드 자체가 없어서 dab 계획이
  // 종이 배선 이전과 비트 단위로 같다(비핀 레인 회귀 계약).
  const paperGrain = resolveStudioStampPaperGrainStyle(kind, lane);
  return {
    kind,
    color: base.color,
    size: Math.max(1, base.size * sizeScale),
    opacity: Math.min(1, Math.max(0, base.opacity)),
    flow: Math.max(0.03, pick(tuning?.flow, lane?.flow ?? defaults.flow)),
    hardness: pick(tuning?.hardness, lane?.hardness ?? defaults.hardness),
    minSizeRatio: pick(tuning?.minSize, lane?.minSizeRatio ?? defaults.minSizeRatio),
    spacingRatio: Math.max(0.03, Math.min(1, lane?.spacingRatio ?? STAMP_SPACING_RATIO[kind])),
    ...(paperGrain ? { paperGrain } : {}),
  };
}

/** 스탬프 인덱스 → [0,1) 결정적 지터. 증분/재생 동일성을 위해 Math.random 금지. */
export function stampJitter(seed: number, salt: number): number {
  let h = (Math.imul(seed + 1, 374761393) + Math.imul(salt + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizedPressure(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp01(value) : 0.5;
}

function normalizedDabLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return STUDIO_STAMP_BRUSH_MAX_DABS;
  }
  return Math.min(STUDIO_STAMP_BRUSH_MAX_DABS, Math.max(0, Math.floor(value)));
}

function pressureRadius(style: StudioStampBrushStyle, pressure: number): number {
  const ratio = clamp01(style.minSizeRatio) + (1 - clamp01(style.minSizeRatio)) * clamp01(pressure);
  return Math.max(0.35, (style.size / 2) * ratio);
}

/**
 * 잉크 브러시의 속도 감쇠: 빠르게 그을수록 가늘어진다(리얼 딥펜 규약).
 * speed 는 "샘플 간 이동 거리 / 기본 크기" 무차원 값.
 */
function inkVelocityFactor(normalizedSpeed: number): number {
  return Math.min(1, Math.max(0.35, 1.12 - normalizedSpeed * 0.22));
}

export interface StudioStampWalkerState {
  lastX: number;
  lastY: number;
  lastPressure: number;
  /** 다음 스탬프까지 남은 거리(이월). */
  residual: number;
  /** 지금까지 찍은 스탬프 수 — 결정적 지터의 시드. */
  stampIndex: number;
}

/**
 * Canvas와 SVG가 공유하는 논리 dab. 연필의 종이 그레인 점이나 수채의 웻엣지 링처럼
 * 종류별 세부 마크는 이 한 dab에서 결정적으로 파생한다.
 */
export interface StudioStampBrushDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha: number;
  /** 결정적 그레인 지터 시드. 시작 탭은 항상 0이다. */
  readonly index: number;
}

export function beginStampWalker(x: number, y: number, pressure: number): StudioStampWalkerState {
  return { lastX: x, lastY: y, lastPressure: pressure, residual: 0, stampIndex: 0 };
}

function stampDotPlan(
  style: StudioStampBrushStyle,
  x: number,
  y: number,
  pressure: number,
  index: number
): StudioStampBrushDab {
  const baseAlpha = clamp01(style.flow) * clamp01(style.opacity);
  return {
    x,
    y,
    radius: pressureRadius(style, pressure),
    // 종이 프로그램을 핀한 레인만 W7 peak-catch 침착을 곱한다(planner 레벨 — Canvas·SVG 공유).
    alpha: style.paperGrain
      ? clamp01(
          baseAlpha
          * stampPaperDepositScale(style.paperGrain, x, y, normalizedPressure(pressure)),
        )
      : baseAlpha,
    index,
  };
}

const dabTipCanvasCache = new Map<string, HTMLCanvasElement>();
const MAX_DAB_TIP_CACHE_SIZE = 128;

function getCachedDabTipCanvas(
  kind: StudioStampBrushKind,
  color: string,
  radius: number,
  hardness: number
): HTMLCanvasElement | null {
  const roundedRadius = Math.max(1, Math.round(radius));
  const roundedHardness = Math.round(hardness * 20) / 20;
  const key = `${kind}:${color}:${roundedRadius}:${roundedHardness}`;
  const existing = dabTipCanvasCache.get(key);
  if (existing) return existing;

  if (typeof document === "undefined") return null;
  const size = roundedRadius * 2 + 4;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = roundedRadius;

  if (
    kind === "airbrush"
    || kind === "watercolor"
    || kind === "crayon"
    || kind === "chalk"
    || kind === "charcoal"
    || kind === "pastel"
  ) {
    const tipSeed =
      (Math.imul(roundedRadius + 1, 0x9e37) ^ Math.imul(Math.round(roundedHardness * 100) + 1, 0x85eb))
      >>> 0;
    const baked = rasterizeOssTexturedTip(
      ctx,
      kind,
      color,
      r,
      roundedHardness,
      tipSeed,
    );
    if (!baked) {
      // jsdom / headless stubs without ImageData — soft gradient fallback.
      const gradient = ctx.createRadialGradient(cx, cy, r * roundedHardness * 0.85, cx, cy, r);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (kind === "watercolor") {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.25, r * 0.06);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (kind === "mypaint") {
    const gradient = ctx.createRadialGradient(cx, cy, r * roundedHardness * 0.5, cx, cy, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.8, color);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "krita-auto") {
    const gradient = ctx.createRadialGradient(cx, cy, r * roundedHardness * 0.7, cx, cy, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (dabTipCanvasCache.size >= MAX_DAB_TIP_CACHE_SIZE) {
    const firstKey = dabTipCanvasCache.keys().next().value;
    if (firstKey) dabTipCanvasCache.delete(firstKey);
  }
  dabTipCanvasCache.set(key, canvas);
  return canvas;
}

function drawDab(
  context: CanvasRenderingContext2D,
  style: StudioStampBrushStyle,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  index: number
): void {
  const kind = style.kind;
  const hardness = clamp01(style.hardness);
  const isRealCanvas =
    typeof window !== "undefined" &&
    typeof (context.canvas as unknown) === "object" &&
    context.canvas !== null;

  if (kind === "pencil") {
    const jx = (stampJitter(index, 11) - 0.5) * radius * 0.5;
    const jy = (stampJitter(index, 23) - 0.5) * radius * 0.5;
    const dabRadius = radius * (0.82 + 0.18 * stampJitter(index, 41));
    let fillStyle: string | CanvasGradient = style.color;
    if (typeof context.createRadialGradient === "function") {
      const gradient = context.createRadialGradient(
        x + jx,
        y + jy,
        dabRadius * 0.25,
        x + jx,
        y + jy,
        dabRadius
      );
      if (gradient && typeof gradient.addColorStop === "function") {
        gradient.addColorStop(0, style.color);
        gradient.addColorStop(0.72, style.color);
        gradient.addColorStop(1, "transparent");
        fillStyle = gradient;
      }
    }
    context.globalAlpha = alpha * (0.7 + 0.3 * stampJitter(index, 37));
    context.fillStyle = fillStyle;
    context.beginPath();
    context.arc(x + jx, y + jy, dabRadius, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = alpha * 0.45;
    for (let grain = 0; grain < 2; grain += 1) {
      const gx = x + (stampJitter(index, 53 + grain) - 0.5) * radius * 2.4;
      const gy = y + (stampJitter(index, 67 + grain) - 0.5) * radius * 2.4;
      context.beginPath();
      context.arc(gx, gy, radius * 0.2, 0, Math.PI * 2);
      context.fill();
    }
    return;
  }

  if (isRealCanvas) {
    const cachedTip = getCachedDabTipCanvas(kind, style.color, radius, hardness);
    if (cachedTip) {
      let dabAlpha = alpha;
      if (kind === "mypaint") dabAlpha = alpha * 0.9;
      else if (kind === "krita-auto") dabAlpha = alpha * 0.95;
      else if (kind === "crayon") dabAlpha = alpha * 0.92;
      else if (kind === "chalk") dabAlpha = alpha * 0.88;
      else if (kind === "charcoal") dabAlpha = alpha * 0.9;
      else if (kind === "pastel") dabAlpha = alpha * 0.9;
      context.globalAlpha = dabAlpha;
      context.drawImage(cachedTip, x - cachedTip.width / 2, y - cachedTip.height / 2);
      // Spray grit is baked into the OSS tip raster (Klecks multi-octave coverage).
      // Extra micro-arcs would break plan/render dab-count parity contracts.
      return;
    }
  }

  if (kind === "airbrush" || kind === "watercolor") {
    if (typeof context.createRadialGradient === "function") {
      const gradient = context.createRadialGradient(x, y, radius * hardness * 0.85, x, y, radius);
      if (gradient && typeof gradient.addColorStop === "function") {
        gradient.addColorStop(0, style.color);
        gradient.addColorStop(1, "transparent");
        context.fillStyle = gradient;
      } else {
        context.fillStyle = style.color;
      }
    } else {
      context.fillStyle = style.color;
    }
    context.globalAlpha = alpha;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    if (kind === "watercolor") {
      context.globalAlpha = alpha * 0.12;
      context.strokeStyle = style.color;
      context.lineWidth = Math.max(0.25, radius * 0.06);
      context.beginPath();
      context.arc(x, y, radius * 0.94, 0, Math.PI * 2);
      context.stroke();
    }
    return;
  }

  if (kind === "mypaint" || kind === "krita-auto") {
    if (typeof context.createRadialGradient === "function") {
      const gradient = context.createRadialGradient(
        x,
        y,
        radius * hardness * (kind === "mypaint" ? 0.5 : 0.7),
        x,
        y,
        radius
      );
      if (gradient && typeof gradient.addColorStop === "function") {
        gradient.addColorStop(0, style.color);
        gradient.addColorStop(kind === "mypaint" ? 0.8 : 1, style.color);
        gradient.addColorStop(1, "transparent");
        context.fillStyle = gradient;
      } else {
        context.fillStyle = style.color;
      }
    } else {
      context.fillStyle = style.color;
    }
    context.globalAlpha = alpha * (kind === "mypaint" ? 0.9 : 0.95);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.globalAlpha = alpha;
  context.fillStyle = style.color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

/**
 * 이전 점 → 새 점 구간을 스탬프 간격으로 걸으며 dab 을 찍는다(증분의 핵심 단위).
 * 호출 측이 context 의 save/restore 와 좌표 변환을 소유한다.
 */
export function walkStampSegment(
  context: CanvasRenderingContext2D,
  style: StudioStampBrushStyle,
  state: StudioStampWalkerState,
  x: number,
  y: number,
  pressure: number,
  maximumDabs = STUDIO_STAMP_BRUSH_MAX_DABS
): void {
  walkStampSegmentPlan(style, state, x, y, pressure, normalizedDabLimit(maximumDabs), (dab) => {
    drawDab(context, style, dab.x, dab.y, dab.radius, dab.alpha, dab.index);
  });
}

/**
 * 이전 점→새 점을 걷는 순수 계획 코어. Canvas 증분 렌더와 SVG 내보내기가 이 함수를
 * 공유하므로 잔여 간격·잉크 속도 감쇠·지터 인덱스가 장치와 무관하게 동일하다.
 */
function walkStampSegmentPlan(
  style: StudioStampBrushStyle,
  state: StudioStampWalkerState,
  x: number,
  y: number,
  pressure: number,
  maximumDabs: number,
  emit: (dab: StudioStampBrushDab) => void
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const safePressure = normalizedPressure(pressure);
  const dx = x - state.lastX;
  const dy = y - state.lastY;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= 0) return;
  const speedFactor = style.kind === "ink"
    ? inkVelocityFactor(distance / Math.max(1, style.size))
    : 1;
  const baseAlpha = clamp01(style.flow) * clamp01(style.opacity);
  const paperGrain = style.paperGrain ?? null;
  let travelled = state.residual;
  const spacingOf = (p: number): number =>
    Math.max(0.5, pressureRadius(style, p) * 2 * (style.spacingRatio ?? STAMP_SPACING_RATIO[style.kind]));
  // 의도적 변경(2026-07-23 스트로크 렌더 품질 감사): 시작 도트(index 0)를 이미 소비한 fresh
  // walker(stampIndex > 0, residual 0)는 t=0에서 시작점 위에 dab을 한 번 더 찍지 않는다.
  // 기존에는 도트와 같은 좌표에 중복 dab이 얹혀 반투명 브러시(airbrush/watercolor/저불투명
  // ink)의 획 머리가 본문보다 진해졌다. GPU 잉크 플래너(legacy·V2·V3)는 모두 "시작 도트 후
  // 한 간격 뒤 첫 dab" 규약이며, 이 코어는 라이브 오버레이·커밋 재생·SVG 내보내기가 공유하므로
  // 세 경로의 증분/재생 픽셀 동일성 계약은 그대로 유지된다. 도트 없이 워커만 시작한 호출
  // (stampIndex === 0)은 기존처럼 t=0 dab을 찍는다.
  if (travelled === 0 && state.stampIndex > 0) {
    travelled = spacingOf(state.lastPressure);
  }
  while (travelled <= distance && state.stampIndex < maximumDabs) {
    const t = distance === 0 ? 0 : travelled / distance;
    const px = state.lastX + dx * t;
    const py = state.lastY + dy * t;
    const p = state.lastPressure + (safePressure - state.lastPressure) * t;
    const radius = pressureRadius(style, p) * speedFactor;
    emit({
      x: px,
      y: py,
      radius,
      // 종이 스테이션 샘플: 핀된 레인만 dab 위치의 W7 peak-catch 침착을 곱한다. 저필압은
      // 봉우리만 받아 이빨이 드러나고, 고필압은 골까지 잠겨 스케일이 1로 수렴한다.
      alpha: paperGrain
        ? clamp01(baseAlpha * stampPaperDepositScale(paperGrain, px, py, p))
        : baseAlpha,
      index: state.stampIndex,
    });
    state.stampIndex += 1;
    travelled += spacingOf(p);
  }
  state.residual = state.stampIndex >= maximumDabs ? 0 : travelled - distance;
  state.lastX = x;
  state.lastY = y;
  state.lastPressure = safePressure;
}

/** 시작점의 단일 dab(탭 도트). */
export function stampStrokeDot(
  context: CanvasRenderingContext2D,
  style: StudioStampBrushStyle,
  x: number,
  y: number,
  pressure: number
): void {
  const dab = stampDotPlan(style, x, y, pressure, 0);
  drawDab(context, style, dab.x, dab.y, dab.radius, dab.alpha, dab.index);
}

/**
 * 전체 획을 논리 dab 배열로 계획한다. DOM/Canvas에 의존하지 않는 결정적 함수라 SVG,
 * 서버 썸네일, 향후 WebGPU 파이프라인에서도 같은 footprint를 재사용할 수 있다.
 */
export function planStudioStampBrushDabs(
  style: StudioStampBrushStyle,
  points: readonly number[],
  pressures: readonly number[] | undefined,
  maximumDabs = STUDIO_STAMP_BRUSH_MAX_DABS
): StudioStampBrushDab[] {
  const limit = normalizedDabLimit(maximumDabs);
  if (limit === 0) return [];
  let total = 0;
  for (let index = 0; index + 1 < points.length; index += 2) {
    if (!Number.isFinite(points[index]) || !Number.isFinite(points[index + 1])) break;
    total += 1;
  }
  if (total === 0) return [];
  const pressureAt = (index: number): number => normalizedPressure(pressures?.[index]);
  const dabs: StudioStampBrushDab[] = [
    stampDotPlan(style, points[0]!, points[1]!, pressureAt(0), 0),
  ];
  if (total === 1) return dabs;
  const state = beginStampWalker(points[0]!, points[1]!, pressureAt(0));
  state.stampIndex = 1;
  for (let index = 1; index < total; index += 1) {
    walkStampSegmentPlan(
      style,
      state,
      points[index * 2]!,
      points[index * 2 + 1]!,
      pressureAt(index),
      limit,
      (dab) => dabs.push(dab)
    );
    if (state.stampIndex >= limit) break;
  }
  return dabs;
}

/** Draws an already bounded deterministic plan without changing its coordinates. */
export function drawStudioStampBrushDabs(
  context: CanvasRenderingContext2D,
  style: StudioStampBrushStyle,
  dabs: readonly StudioStampBrushDab[]
): void {
  for (const dab of dabs) {
    drawDab(context, style, dab.x, dab.y, dab.radius, dab.alpha, dab.index);
  }
}

/**
 * 전체 획 렌더(커밋 경로/재생용) — 증분 워커와 같은 수학·같은 지터 시드를 쓰므로
 * 라이브 오버레이가 그린 픽셀과 동일하다.
 */
export function drawStampStroke(
  context: CanvasRenderingContext2D,
  style: StudioStampBrushStyle,
  points: readonly number[],
  pressures: readonly number[] | undefined,
  maximumDabs = STUDIO_STAMP_BRUSH_MAX_DABS
): void {
  // Canvas 재생은 긴 획에서도 배열을 추가 할당하지 않고 스트리밍한다. planner와 같은
  // walkStampSegmentPlan 코어를 쓰므로 출력 규약은 동일하다.
  const limit = normalizedDabLimit(maximumDabs);
  if (limit === 0) return;
  let total = 0;
  for (let index = 0; index + 1 < points.length; index += 2) {
    if (!Number.isFinite(points[index]) || !Number.isFinite(points[index + 1])) break;
    total += 1;
  }
  if (total === 0) return;
  const pressureAt = (index: number): number => normalizedPressure(pressures?.[index]);
  stampStrokeDot(context, style, points[0]!, points[1]!, pressureAt(0));
  if (total === 1) return;
  const state = beginStampWalker(points[0]!, points[1]!, pressureAt(0));
  state.stampIndex = 1;
  for (let index = 1; index < total; index += 1) {
    walkStampSegment(
      context,
      style,
      state,
      points[index * 2]!,
      points[index * 2 + 1]!,
      pressureAt(index),
      limit
    );
    if (state.stampIndex >= limit) break;
  }
}
