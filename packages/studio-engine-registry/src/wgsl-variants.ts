import { compileEffectGraph } from "./effect-compiler";

import type { ProviderBenchmarkRegistry } from "./benchmark-registry";
import type { EffectCompileMode } from "./effect-compiler";
import type { EngineCapabilityRegistry } from "./registry";
import type {
  EffectGraphIR,
  EffectNodeIR,
} from "@toonspectrum/studio-project-model";

/**
 * WGSL variant compiler (V12 lane 5 `WESL_SHADER_PLATFORM` 재개 조건 1단계).
 *
 * ADR-0011 은 WESL 레인을 "커스텀 WGSL variant 생성 표면이 없다"는 이유로
 * 격리했다. 이 모듈이 그 표면이다: EffectGraphIR → compileEffectGraph 산출의
 * 연속 색보정 서브체인을 **단일 컴퓨트 패스 WGSL** 로 융합해 variant 소스를
 * 결정적으로 생성한다. 이후 WESL/wesl-rs 도입 시 이 생성물이 모듈화·@if
 * specialization 의 입력이 된다.
 *
 * 시맨틱 원본 (재발명 금지 — src/domains/creator/studio-gpu-filter-kernels.ts
 * 의 정적 커널과 동일 규약, 테스트가 앱 모듈과 직접 대조해 드리프트를 막는다):
 *  - 픽셀은 rgba8 바이트를 u32 로 패킹한 storage buffer(텍스처 unorm 미사용).
 *  - 바인딩: 0=src(read) · 1=dst(read_write) · 2=params(uniform) ·
 *    3=lut(read, LUT 스테이지가 있을 때만) — 정적 커널과 동일.
 *  - workgroup_size 64, 디스패치 행 16384 스레드(`gid.y * 16384u + gid.x`).
 *  - 스테이지 경계 양자화 `clamp(round(v), 0, 255)` — WGSL round 는
 *    round-half-to-even 이라 Uint8ClampedArray(ToUint8Clamp) 대입과 동일 규칙.
 *    융합 커널은 각 스테이지 사이에서 이 양자화를 그대로 수행하므로, 결과는
 *    "정적 커널을 순차 디스패치한 것"과 스테이지 단위로 등가다.
 *  - 밝기/대비: nativeBrighten→nativeContrast 를 스테이지 경계 양자화까지
 *    포함해 f64 로 재현한 256칸 LUT(정수 조회 — CPU 와 비트 동일).
 *  - HSL: nativeHSL(konva verbatim)의 3×3 행렬 + luminance 오프셋. 계수는
 *    f64 로 계산해 uniform 에 싣고 픽셀별로는 dot 만 수행.
 *  - 레벨/커브: 기존 CPU LUT 빌더(studio-levels / studio-curves)가 구운
 *    채널별 256칸 LUT 를 그대로 조회(비트 동일). 이 모듈은 LUT 를 다시
 *    계산하지 않는다 — 값은 호출부(앱)가 소유하고, 여기서는 융합만 한다.
 *  - 컬러 밸런스: applyColorBalance verbatim(GAIN 1.275 포함).
 *
 * variantKey 는 "연산 시퀀스 + 파라미터 구조"의 해시다. 파라미터 **값**은
 * uniform/LUT 스토리지로 바인딩되므로 키에 들어가지 않는다 — 같은 구조의
 * 슬라이더 드래그가 셰이더 재컴파일을 일으키지 않아야 한다는 계약.
 */

// ---------------------------------------------------------------------------
// 공용 상수 — 정적 커널(studio-gpu-filter-kernels.ts)과 반드시 일치해야 한다.
// 테스트(wgsl-variants.test.ts)가 앱 모듈의 상수와 직접 대조한다.
// ---------------------------------------------------------------------------

/** WGSL `@workgroup_size` 리터럴과 일치(정적 커널과 동일 값). */
export const WGSL_VARIANT_WORKGROUP_SIZE = 64;

/** 1 디스패치 행이 담당하는 스레드 수 — WGSL `16384u` 리터럴과 일치. */
export const WGSL_VARIANT_DISPATCH_ROW_THREADS = 16384;

/** bind group 0 바인딩 인덱스 — 정적 커널의 STUDIO_GPU_FILTER_BINDINGS 와 동일. */
export const WGSL_VARIANT_BINDINGS = {
  src: 0,
  dst: 1,
  params: 2,
  lut: 3,
} as const;

/** uniform 첫 4바이트 = pixelCount(u32 LE) — 패커는 0 자리표시자를 쓴다. */
export const WGSL_VARIANT_PIXEL_COUNT_OFFSET = 0;

/** LUT 스테이지 1개가 차지하는 u32 엔트리 수(r 0..255, g 256..511, b 512..767). */
export const WGSL_VARIANT_LUT_STRIDE = 768;

/** uniform 헤더(pixel_count + 패딩 3) 바이트 수. */
const UNIFORM_HEADER_BYTES = 16;

/** vec4<f32> 3개짜리 스테이지 블록(HSL 행렬 / 컬러밸런스 존) 바이트 수. */
const VEC4_TRIPLE_BYTES = 48;

// ---------------------------------------------------------------------------
// 연산 스펙 타입
// ---------------------------------------------------------------------------

/** 채널별 256칸 바이트 LUT — buildChannelLevelsLuts / buildCurveChannelLuts 산출. */
export interface WgslLut3 {
  readonly r: ArrayLike<number>;
  readonly g: ArrayLike<number>;
  readonly b: ArrayLike<number>;
}

export interface WgslBrightnessContrastOp {
  readonly op: "brightness-contrast";
  /** buildImageFilters 규약: clampFinite(-0.8..0.8) * 255 오프셋. */
  readonly brightness?: number;
  /** buildImageFilters 규약: clampFinite(-80..80) → ((c+100)/100)^2 계수. */
  readonly contrast?: number;
}

export interface WgslHslOp {
  readonly op: "hsl";
  /** clampFinite(-1..1) 뒤 2^s 배율. */
  readonly saturation?: number;
  /** 0..359 로 래핑되는 색상 회전(도). */
  readonly hue?: number;
  /** luminance * 127 오프셋. */
  readonly luminance?: number;
}

export interface WgslLevelsOp {
  readonly op: "levels";
  /** studio-levels buildChannelLevelsLuts 가 구운 LUT (값 소유는 호출부). */
  readonly lut: WgslLut3;
}

export interface WgslCurvesOp {
  readonly op: "curves";
  /** studio-curves buildCurveChannelLuts 가 구운 LUT (값 소유는 호출부). */
  readonly lut: WgslLut3;
}

export type WgslRgbShift = readonly [number, number, number];

export interface WgslColorBalanceOp {
  readonly op: "color-balance";
  /** 각 채널 -100..100 클램프(normalizeColorBalance 규약), 누락 존은 [0,0,0]. */
  readonly shadows?: WgslRgbShift;
  readonly midtones?: WgslRgbShift;
  readonly highlights?: WgslRgbShift;
}

export type WgslFilterOpSpec =
  | WgslBrightnessContrastOp
  | WgslHslOp
  | WgslLevelsOp
  | WgslCurvesOp
  | WgslColorBalanceOp;

export type WgslFilterOpKind = WgslFilterOpSpec["op"];

/** composeWgslVariant 가 융합할 수 있는 연산 목록(에러 메시지에도 실린다). */
export const WGSL_VARIANT_SUPPORTED_OPS: readonly WgslFilterOpKind[] = [
  "brightness-contrast",
  "hsl",
  "levels",
  "curves",
  "color-balance",
];

// ---------------------------------------------------------------------------
// 에러 — 조용한 손실 금지: 미지원/구조 불량은 전부 명시 예외다.
// ---------------------------------------------------------------------------

export class WgslVariantComposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WgslVariantComposeError";
  }
}

export class UnsupportedWgslOpError extends WgslVariantComposeError {
  readonly supportedOps: readonly WgslFilterOpKind[];

  constructor(readonly op: string) {
    super(
      `unsupported WGSL variant op: "${op}" — supported ops: ${WGSL_VARIANT_SUPPORTED_OPS.join(", ")}`,
    );
    this.name = "UnsupportedWgslOpError";
    this.supportedOps = WGSL_VARIANT_SUPPORTED_OPS;
  }
}

// ---------------------------------------------------------------------------
// 스테이지 레이아웃 — 구조(연산 시퀀스 + 파라미터 존재 여부)만으로 결정된다.
// ---------------------------------------------------------------------------

export interface WgslVariantStageLayout {
  readonly op: WgslFilterOpKind;
  /** vec4 블록 시작 오프셋(HSL/컬러밸런스), LUT 스테이지는 null. */
  readonly uniformOffset: number | null;
  /** LUT 스토리지 안의 u32 시작 인덱스(LUT 스테이지), 그 외 null. */
  readonly lutBase: number | null;
}

export interface ComposedWgslVariant {
  readonly wgsl: string;
  /** 연산 시퀀스+파라미터 구조 해시 — 값이 아닌 구조만 반영한다. */
  readonly variantKey: string;
  readonly entryPoint: "main";
  /** 파이프라인 캐시 키(정적 커널의 shaderId 규약과 동일 용도). */
  readonly shaderId: string;
  readonly bindings: typeof WGSL_VARIANT_BINDINGS;
  readonly usesLut: boolean;
  /** LUT 스토리지 버퍼 총 u32 엔트리 수(스테이지당 768). */
  readonly lutEntryCount: number;
  readonly uniformByteLength: number;
  readonly stages: readonly WgslVariantStageLayout[];
  /** variantKey 가 해시하는 정규화 구조 문자열(디버그·중복판정 근거). */
  readonly structure: string;
}

function isLutOp(spec: WgslFilterOpSpec): spec is WgslLevelsOp | WgslCurvesOp {
  return spec.op === "levels" || spec.op === "curves";
}

function assertKnownOp(spec: WgslFilterOpSpec): void {
  if (!WGSL_VARIANT_SUPPORTED_OPS.includes(spec.op)) {
    throw new UnsupportedWgslOpError((spec as { op: string }).op);
  }
}

function assertLut3(lut: WgslLut3, opLabel: string): void {
  for (const channel of ["r", "g", "b"] as const) {
    const table = lut[channel];
    if (table.length !== 256) {
      throw new WgslVariantComposeError(
        `${opLabel}: channel "${channel}" LUT must have exactly 256 entries, got ${table.length}`,
      );
    }
    for (let i = 0; i < 256; i += 1) {
      const value = table[i];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255) {
        throw new WgslVariantComposeError(
          `${opLabel}: channel "${channel}" LUT entry ${i} must be an integer byte 0..255, got ${String(value)}`,
        );
      }
    }
  }
}

// 파라미터 "구조" = 값이 제공된 키의 정렬 목록. 값 자체는 구조가 아니다.
function structureOf(spec: WgslFilterOpSpec): string {
  switch (spec.op) {
    case "brightness-contrast": {
      const keys: string[] = [];
      if (spec.brightness !== undefined) keys.push("brightness");
      if (spec.contrast !== undefined) keys.push("contrast");
      return `brightness-contrast[${keys.join(",")}]`;
    }
    case "hsl": {
      const keys: string[] = [];
      if (spec.hue !== undefined) keys.push("hue");
      if (spec.luminance !== undefined) keys.push("luminance");
      if (spec.saturation !== undefined) keys.push("saturation");
      return `hsl[${keys.join(",")}]`;
    }
    case "levels":
      return "levels[lut256x3]";
    case "curves":
      return "curves[lut256x3]";
    case "color-balance": {
      const keys: string[] = [];
      if (spec.highlights !== undefined) keys.push("highlights");
      if (spec.midtones !== undefined) keys.push("midtones");
      if (spec.shadows !== undefined) keys.push("shadows");
      return `color-balance[${keys.join(",")}]`;
    }
  }
}

const OP_SHORT_CODE: Record<WgslFilterOpKind, string> = {
  "brightness-contrast": "bc",
  hsl: "hsl",
  levels: "lv",
  curves: "cv",
  "color-balance": "cb",
};

// FNV-1a 32-bit — 결정적 구조 해시(브라우저/노드 공용, 의존성 없음).
function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

interface StagePlan {
  readonly spec: WgslFilterOpSpec;
  readonly layout: WgslVariantStageLayout;
}

function planStages(ops: readonly WgslFilterOpSpec[]): {
  stages: StagePlan[];
  uniformByteLength: number;
  lutEntryCount: number;
} {
  if (ops.length === 0) {
    throw new WgslVariantComposeError(
      "cannot compose a WGSL variant from an empty op chain",
    );
  }
  let uniformCursor = UNIFORM_HEADER_BYTES;
  let lutCursor = 0;
  const stages: StagePlan[] = [];
  for (const spec of ops) {
    assertKnownOp(spec);
    if (isLutOp(spec)) {
      assertLut3(spec.lut, spec.op);
      stages.push({
        spec,
        layout: { op: spec.op, uniformOffset: null, lutBase: lutCursor },
      });
      lutCursor += WGSL_VARIANT_LUT_STRIDE;
      continue;
    }
    if (spec.op === "brightness-contrast") {
      stages.push({
        spec,
        layout: { op: spec.op, uniformOffset: null, lutBase: lutCursor },
      });
      lutCursor += WGSL_VARIANT_LUT_STRIDE;
      continue;
    }
    stages.push({
      spec,
      layout: { op: spec.op, uniformOffset: uniformCursor, lutBase: null },
    });
    uniformCursor += VEC4_TRIPLE_BYTES;
  }
  return { stages, uniformByteLength: uniformCursor, lutEntryCount: lutCursor };
}

// ---------------------------------------------------------------------------
// WGSL 생성 — 순수 문자열 조립(랜덤·시간 없음 → 같은 ops 는 항상 같은 소스).
// ---------------------------------------------------------------------------

// 정적 커널의 WGSL_BYTE_HELPERS 와 동일한 텍스트(0..255 바이트 공간 헬퍼).
const WGSL_BYTE_HELPERS = /* wgsl */ `
fn studio_unpack_r(texel : u32) -> f32 { return f32(texel & 0xffu); }
fn studio_unpack_g(texel : u32) -> f32 { return f32((texel >> 8u) & 0xffu); }
fn studio_unpack_b(texel : u32) -> f32 { return f32((texel >> 16u) & 0xffu); }
fn studio_unpack_a(texel : u32) -> u32 { return (texel >> 24u) & 0xffu; }

fn studio_quantize_byte(value : f32) -> u32 {
  return u32(clamp(round(value), 0.0, 255.0));
}

fn studio_repack(r : u32, g : u32, b : u32, a : u32) -> u32 {
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}
`;

function emitParamsStruct(stages: readonly StagePlan[]): string {
  const lines = [
    "struct Params {",
    "  pixel_count : u32,",
    "  _pad0 : u32,",
    "  _pad1 : u32,",
    "  _pad2 : u32,",
  ];
  stages.forEach((stage, index) => {
    if (stage.spec.op === "hsl") {
      lines.push(
        `  s${index}_row_r : vec4<f32>,`,
        `  s${index}_row_g : vec4<f32>,`,
        `  s${index}_row_b : vec4<f32>,`,
      );
    } else if (stage.spec.op === "color-balance") {
      lines.push(
        `  s${index}_shadows : vec4<f32>,`,
        `  s${index}_midtones : vec4<f32>,`,
        `  s${index}_highlights : vec4<f32>,`,
      );
    }
  });
  lines.push("}");
  return lines.join("\n");
}

function emitLutStage(stageIndex: number, op: WgslFilterOpKind, lutBase: number): string {
  const base = lutBase;
  return [
    `  // stage ${stageIndex}: ${op} (lut base ${base})`,
    `  r = lut[${base}u + r] & 0xffu;`,
    `  g = lut[${base + 256}u + g] & 0xffu;`,
    `  b = lut[${base + 512}u + b] & 0xffu;`,
  ].join("\n");
}

function emitHslStage(stageIndex: number): string {
  return [
    `  // stage ${stageIndex}: hsl (nativeHSL matrix rows via uniform)`,
    "  {",
    "    let p = vec4<f32>(f32(r), f32(g), f32(b), 1.0);",
    `    let hr = studio_quantize_byte(dot(p, params.s${stageIndex}_row_r));`,
    `    let hg = studio_quantize_byte(dot(p, params.s${stageIndex}_row_g));`,
    `    let hb = studio_quantize_byte(dot(p, params.s${stageIndex}_row_b));`,
    "    r = hr;",
    "    g = hg;",
    "    b = hb;",
    "  }",
  ].join("\n");
}

function emitColorBalanceStage(stageIndex: number): string {
  const s = `params.s${stageIndex}_shadows`;
  const m = `params.s${stageIndex}_midtones`;
  const h = `params.s${stageIndex}_highlights`;
  return [
    `  // stage ${stageIndex}: color-balance (applyColorBalance verbatim)`,
    "  {",
    "    let rf = f32(r);",
    "    let gf = f32(g);",
    "    let bf = f32(b);",
    "    let t = (0.299 * rf + 0.587 * gf + 0.114 * bf) / 255.0;",
    "    let sw = (1.0 - t) * (1.0 - t);",
    "    let hw = t * t;",
    "    let mid = 2.0 * t - 1.0;",
    "    let mw = max(0.0, 1.0 - mid * mid);",
    `    r = studio_quantize_byte(rf + (sw * ${s}.x + mw * ${m}.x + hw * ${h}.x) * STUDIO_COLOR_BALANCE_GAIN);`,
    `    g = studio_quantize_byte(gf + (sw * ${s}.y + mw * ${m}.y + hw * ${h}.y) * STUDIO_COLOR_BALANCE_GAIN);`,
    `    b = studio_quantize_byte(bf + (sw * ${s}.z + mw * ${m}.z + hw * ${h}.z) * STUDIO_COLOR_BALANCE_GAIN);`,
    "  }",
  ].join("\n");
}

function emitWgsl(
  stages: readonly StagePlan[],
  usesLut: boolean,
  variantKey: string,
  structure: string,
): string {
  const hasColorBalance = stages.some((stage) => stage.spec.op === "color-balance");
  const parts: string[] = [
    `// wgsl-variant ${variantKey}`,
    `// structure: ${structure}`,
    emitParamsStruct(stages),
    "",
    "@group(0) @binding(0) var<storage, read> src : array<u32>;",
    "@group(0) @binding(1) var<storage, read_write> dst : array<u32>;",
    "@group(0) @binding(2) var<uniform> params : Params;",
  ];
  if (usesLut) {
    parts.push("@group(0) @binding(3) var<storage, read> lut : array<u32>;");
  }
  if (hasColorBalance) {
    parts.push("", "const STUDIO_COLOR_BALANCE_GAIN : f32 = 1.275;");
  }
  parts.push(WGSL_BYTE_HELPERS.trimEnd());
  const body: string[] = [
    `@compute @workgroup_size(${WGSL_VARIANT_WORKGROUP_SIZE})`,
    "fn main(@builtin(global_invocation_id) gid : vec3<u32>) {",
    `  let i = gid.y * ${WGSL_VARIANT_DISPATCH_ROW_THREADS}u + gid.x;`,
    "  if (i >= params.pixel_count) { return; }",
    "  let texel = src[i];",
    "  var r : u32 = texel & 0xffu;",
    "  var g : u32 = (texel >> 8u) & 0xffu;",
    "  var b : u32 = (texel >> 16u) & 0xffu;",
    "  let a = studio_unpack_a(texel);",
  ];
  stages.forEach((stage, index) => {
    const { spec, layout } = stage;
    if (layout.lutBase !== null) {
      body.push(emitLutStage(index, spec.op, layout.lutBase));
    } else if (spec.op === "hsl") {
      body.push(emitHslStage(index));
    } else if (spec.op === "color-balance") {
      body.push(emitColorBalanceStage(index));
    }
  });
  body.push("  dst[i] = studio_repack(r, g, b, a);", "}");
  parts.push("", body.join("\n"), "");
  return parts.join("\n");
}

/**
 * 지원 연산 체인을 단일 컴퓨트 패스 WGSL 로 융합한다. 같은 ops(구조·값 동일)는
 * 항상 같은 소스와 같은 variantKey 를 낳고, 값만 다른 ops 는 같은 소스·같은
 * 키에 다른 uniform/LUT 데이터만 낳는다.
 */
export function composeWgslVariant(ops: readonly WgslFilterOpSpec[]): ComposedWgslVariant {
  const { stages, uniformByteLength, lutEntryCount } = planStages(ops);
  const structure = `v1:${stages.map((stage) => structureOf(stage.spec)).join("|")}`;
  const codes = stages.map((stage) => OP_SHORT_CODE[stage.spec.op]).join(".");
  const variantKey = `wgslfx-v1-${codes}-${fnv1a32(structure)}`;
  const usesLut = lutEntryCount > 0;
  return {
    wgsl: emitWgsl(stages, usesLut, variantKey, structure),
    variantKey,
    entryPoint: "main",
    shaderId: `wgsl-variant/${variantKey}`,
    bindings: WGSL_VARIANT_BINDINGS,
    usesLut,
    lutEntryCount,
    uniformByteLength,
    stages: stages.map((stage) => stage.layout),
    structure,
  };
}

// ---------------------------------------------------------------------------
// 값 패킹 — 파라미터 값을 uniform/LUT 스토리지로. 수식은 정적 커널 패커 verbatim.
// ---------------------------------------------------------------------------

// buildImageFilters 의 isActiveNumber / clampFinite 복제(정적 커널 패커와 동일).
function isActiveNumber(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function clampFinite(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// normalizeColorBalance 의 채널 클램프 복제: 숫자 아님/비유한 → 0, -100..100.
function clampShift(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.min(100, Math.max(-100, raw));
}

interface HslCoefficients {
  rr: number; rg: number; rb: number;
  gr: number; gg: number; gb: number;
  br: number; bg: number; bb: number;
  l: number;
}

// packStudioGpuHslParams 의 attrs 계산 + nativeHSL 행렬 계수 수식 verbatim(f64).
function hslCoefficients(spec: WgslHslOp): HslCoefficients {
  const saturationAttr = isActiveNumber(spec.saturation)
    ? clampFinite(spec.saturation as number, -1, 1)
    : 0;
  const hueAttr = isActiveNumber(spec.hue)
    ? (((spec.hue as number) % 360) + 360) % 360
    : 0;
  const luminanceAttr =
    typeof spec.luminance === "number" && Number.isFinite(spec.luminance)
      ? spec.luminance
      : 0;

  const v = 1;
  const s = Math.pow(2, saturationAttr);
  const h = Math.abs(hueAttr + 360) % 360;
  const l = luminanceAttr * 127;
  const vsu = v * s * Math.cos((h * Math.PI) / 180);
  const vsw = v * s * Math.sin((h * Math.PI) / 180);
  return {
    rr: 0.299 * v + 0.701 * vsu + 0.167 * vsw,
    rg: 0.587 * v - 0.587 * vsu + 0.33 * vsw,
    rb: 0.114 * v - 0.114 * vsu - 0.497 * vsw,
    gr: 0.299 * v - 0.299 * vsu - 0.328 * vsw,
    gg: 0.587 * v + 0.413 * vsu + 0.035 * vsw,
    gb: 0.114 * v - 0.114 * vsu + 0.293 * vsw,
    br: 0.299 * v - 0.3 * vsu + 1.25 * vsw,
    bg: 0.587 * v - 0.586 * vsu - 1.05 * vsw,
    bb: 0.114 * v + 0.886 * vsu - 0.2 * vsw,
    l,
  };
}

/**
 * variant uniform 패킹 — pixelCount 는 0 자리표시자(디스패치 직전
 * patchWgslVariantPixelCount 로 패치). HSL 행렬/컬러밸런스 존 수식은 정적 커널
 * 패커와 동일한 f64 계산이다.
 */
export function packWgslVariantUniform(ops: readonly WgslFilterOpSpec[]): ArrayBuffer {
  const { stages, uniformByteLength } = planStages(ops);
  const uniform = new ArrayBuffer(uniformByteLength);
  const view = new DataView(uniform);
  for (const { spec, layout } of stages) {
    if (layout.uniformOffset === null) continue;
    const offset = layout.uniformOffset;
    if (spec.op === "hsl") {
      const c = hslCoefficients(spec);
      const writeRow = (rowOffset: number, c0: number, c1: number, c2: number): void => {
        view.setFloat32(rowOffset, c0, true);
        view.setFloat32(rowOffset + 4, c1, true);
        view.setFloat32(rowOffset + 8, c2, true);
        view.setFloat32(rowOffset + 12, c.l, true);
      };
      writeRow(offset, c.rr, c.rg, c.rb);
      writeRow(offset + 16, c.gr, c.gg, c.gb);
      writeRow(offset + 32, c.br, c.bg, c.bb);
    } else if (spec.op === "color-balance") {
      const zones = [spec.shadows, spec.midtones, spec.highlights];
      zones.forEach((zone, zoneIndex) => {
        const zoneOffset = offset + zoneIndex * 16;
        view.setFloat32(zoneOffset, clampShift(zone?.[0]), true);
        view.setFloat32(zoneOffset + 4, clampShift(zone?.[1]), true);
        view.setFloat32(zoneOffset + 8, clampShift(zone?.[2]), true);
        view.setFloat32(zoneOffset + 12, 0, true);
      });
    }
  }
  return uniform;
}

/** uniform 의 pixelCount(u32 LE, offset 0) 패치 — 정적 커널과 동일 규약. */
export function patchWgslVariantPixelCount(uniform: ArrayBuffer, pixelCount: number): void {
  new DataView(uniform).setUint32(WGSL_VARIANT_PIXEL_COUNT_OFFSET, pixelCount >>> 0, true);
}

// 밝기/대비 256칸 LUT — packStudioGpuBrightnessContrastLut verbatim:
// lut[i] = u8clamp( contrast_f64( u8clamp( i + brightness*255 ) ) ).
function brightnessContrastLutBytes(spec: WgslBrightnessContrastOp): Uint8ClampedArray {
  const applyBrightness = isActiveNumber(spec.brightness);
  const applyContrast = isActiveNumber(spec.contrast);
  const brightnessOffset = applyBrightness
    ? clampFinite(spec.brightness as number, -0.8, 0.8) * 255
    : 0;
  const contrastAdjust = applyContrast
    ? Math.pow((clampFinite(spec.contrast as number, -80, 80) + 100) / 100, 2)
    : 1;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i += 1) {
    lut[i] = applyBrightness ? i + brightnessOffset : i;
    if (applyContrast) {
      const value = ((lut[i]! / 255 - 0.5) * contrastAdjust + 0.5) * 255;
      lut[i] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
  }
  return lut;
}

/**
 * variant LUT 스토리지 패킹 — LUT 스테이지 순서대로 768칸씩 이어붙인다.
 * 밝기/대비는 정적 커널과 동일한 수식으로 여기서 굽고, 레벨/커브는 호출부가
 * 기존 CPU 빌더로 구운 바이트를 그대로 싣는다. LUT 스테이지가 없으면 null.
 */
export function packWgslVariantLut(ops: readonly WgslFilterOpSpec[]): Uint32Array | null {
  const { stages, lutEntryCount } = planStages(ops);
  if (lutEntryCount === 0) return null;
  const packed = new Uint32Array(lutEntryCount);
  for (const { spec, layout } of stages) {
    if (layout.lutBase === null) continue;
    const base = layout.lutBase;
    if (spec.op === "brightness-contrast") {
      const lut = brightnessContrastLutBytes(spec);
      for (let i = 0; i < 256; i += 1) {
        const byte = lut[i]!;
        packed[base + i] = byte;
        packed[base + 256 + i] = byte;
        packed[base + 512 + i] = byte;
      }
    } else if (isLutOp(spec)) {
      for (let i = 0; i < 256; i += 1) {
        packed[base + i] = spec.lut.r[i]! & 0xff;
        packed[base + 256 + i] = spec.lut.g[i]! & 0xff;
        packed[base + 512 + i] = spec.lut.b[i]! & 0xff;
      }
    }
  }
  return packed;
}

/** 항등 LUT — enumerate 의 구조 표면(값은 실행 시점에 호출부가 바인딩). */
export function identityWgslLut3(): WgslLut3 {
  const identity = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i += 1) identity[i] = i;
  return { r: identity, g: identity, b: identity };
}

// ---------------------------------------------------------------------------
// CPU 참조 구현 — 정적 커널의 CPU 원본과 동일 시맨틱(f64 + 스테이지 경계
// Uint8ClampedArray 양자화). GPU 수치 정합성 판정의 기준값이다.
// ---------------------------------------------------------------------------

function evaluateBrightnessContrast(
  data: Uint8ClampedArray,
  spec: WgslBrightnessContrastOp,
): void {
  // nativeBrighten: data[i] += brightness*255 (Uint8ClampedArray 대입 양자화).
  if (isActiveNumber(spec.brightness)) {
    const offset = clampFinite(spec.brightness as number, -0.8, 0.8) * 255;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i]! + offset;
      data[i + 1] = data[i + 1]! + offset;
      data[i + 2] = data[i + 2]! + offset;
    }
  }
  // nativeContrast verbatim: (v/255 - 0.5)*adjust + 0.5 → *255, 명시 클램프.
  if (isActiveNumber(spec.contrast)) {
    const adjust = Math.pow((clampFinite(spec.contrast as number, -80, 80) + 100) / 100, 2);
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c += 1) {
        const value = ((data[i + c]! / 255 - 0.5) * adjust + 0.5) * 255;
        data[i + c] = value < 0 ? 0 : value > 255 ? 255 : value;
      }
    }
  }
}

function evaluateHsl(data: Uint8ClampedArray, spec: WgslHslOp): void {
  const c = hslCoefficients(spec);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    data[i] = c.rr * r + c.rg * g + c.rb * b + c.l;
    data[i + 1] = c.gr * r + c.gg * g + c.gb * b + c.l;
    data[i + 2] = c.br * r + c.bg * g + c.bb * b + c.l;
  }
}

function evaluateLut(data: Uint8ClampedArray, lut: WgslLut3): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut.r[data[i]!]! & 0xff;
    data[i + 1] = lut.g[data[i + 1]!]! & 0xff;
    data[i + 2] = lut.b[data[i + 2]!]! & 0xff;
  }
}

function evaluateColorBalance(data: Uint8ClampedArray, spec: WgslColorBalanceOp): void {
  const gain = 1.275; // COLOR_BALANCE_GAIN — applyColorBalance/WGSL 상수와 동일.
  const sR = clampShift(spec.shadows?.[0]);
  const sG = clampShift(spec.shadows?.[1]);
  const sB = clampShift(spec.shadows?.[2]);
  const mR = clampShift(spec.midtones?.[0]);
  const mG = clampShift(spec.midtones?.[1]);
  const mB = clampShift(spec.midtones?.[2]);
  const hR = clampShift(spec.highlights?.[0]);
  const hG = clampShift(spec.highlights?.[1]);
  const hB = clampShift(spec.highlights?.[2]);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const t = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const sW = (1 - t) * (1 - t);
    const hW = t * t;
    const mid = 2 * t - 1;
    const mW = Math.max(0, 1 - mid * mid);
    data[i] = r + (sW * sR + mW * mR + hW * hR) * gain;
    data[i + 1] = g + (sW * sG + mW * mG + hW * hG) * gain;
    data[i + 2] = b + (sW * sB + mW * mB + hW * hB) * gain;
  }
}

/**
 * 순수 TS 참조 — ops 를 순서대로 적용한 rgba 결과(f64 수식 + 스테이지 경계
 * Uint8ClampedArray 양자화). 브라우저 프로브가 GPU 결과를 이 값과 대조한다.
 */
export function evaluateVariantOnPixels(
  ops: readonly WgslFilterOpSpec[],
  rgba: Uint8Array | Uint8ClampedArray,
): Uint8ClampedArray {
  if (rgba.length % 4 !== 0) {
    throw new WgslVariantComposeError(
      `rgba length must be a multiple of 4, got ${rgba.length}`,
    );
  }
  // planStages 로 구조 검증(미지원 op·불량 LUT 는 여기서 명시 실패).
  planStages(ops);
  const data = new Uint8ClampedArray(rgba);
  for (const spec of ops) {
    switch (spec.op) {
      case "brightness-contrast":
        evaluateBrightnessContrast(data, spec);
        break;
      case "hsl":
        evaluateHsl(data, spec);
        break;
      case "levels":
      case "curves":
        evaluateLut(data, spec.lut);
        break;
      case "color-balance":
        evaluateColorBalance(data, spec);
        break;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// EffectGraphIR 연결 — compileEffectGraph 산출에서 융합 가능 서브체인 추출.
// ---------------------------------------------------------------------------

function numberParam(node: EffectNodeIR, key: string): number | undefined {
  const value = node.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function zoneParam(
  node: EffectNodeIR,
  zone: "shadows" | "midtones" | "highlights",
): WgslRgbShift | undefined {
  const r = numberParam(node, `${zone}R`);
  const g = numberParam(node, `${zone}G`);
  const b = numberParam(node, `${zone}B`);
  if (r === undefined && g === undefined && b === undefined) return undefined;
  return [r ?? 0, g ?? 0, b ?? 0];
}

/**
 * EffectNodeIR → WGSL variant 연산 스펙 매핑(op 꼬리 기준, 미지원은 null).
 *
 * 레벨/커브는 EffectGraphIR 의 평면 파라미터로 LUT 값을 실을 수 없으므로
 * **항등 LUT 자리표시자**로 매핑한다 — enumerate 는 컴파일 게이트용 "구조"
 * 표면이고, 실제 LUT 값은 실행 시점에 앱의 기존 빌더(studio-levels /
 * studio-curves)가 바인딩한다(정적 커널 경로와 동일한 소유권).
 */
export function wgslOpFromEffectNode(node: EffectNodeIR): WgslFilterOpSpec | null {
  const tail = node.op.split(".").at(-1) ?? node.op;
  switch (tail) {
    case "brightness-contrast":
    case "brightness":
    case "contrast": {
      const spec: { op: "brightness-contrast"; brightness?: number; contrast?: number } = {
        op: "brightness-contrast",
      };
      const brightness = numberParam(node, "brightness");
      const contrast = numberParam(node, "contrast");
      if (brightness !== undefined) spec.brightness = brightness;
      if (contrast !== undefined) spec.contrast = contrast;
      return spec;
    }
    case "hsl": {
      const spec: { op: "hsl"; saturation?: number; hue?: number; luminance?: number } = {
        op: "hsl",
      };
      const saturation = numberParam(node, "saturation");
      const hue = numberParam(node, "hue");
      const luminance = numberParam(node, "luminance");
      if (saturation !== undefined) spec.saturation = saturation;
      if (hue !== undefined) spec.hue = hue;
      if (luminance !== undefined) spec.luminance = luminance;
      return spec;
    }
    case "levels":
      return { op: "levels", lut: identityWgslLut3() };
    case "curve":
    case "curves":
      return { op: "curves", lut: identityWgslLut3() };
    case "color-balance": {
      const spec: {
        op: "color-balance";
        shadows?: WgslRgbShift;
        midtones?: WgslRgbShift;
        highlights?: WgslRgbShift;
      } = { op: "color-balance" };
      const shadows = zoneParam(node, "shadows");
      const midtones = zoneParam(node, "midtones");
      const highlights = zoneParam(node, "highlights");
      if (shadows !== undefined) spec.shadows = shadows;
      if (midtones !== undefined) spec.midtones = midtones;
      if (highlights !== undefined) spec.highlights = highlights;
      return spec;
    }
    default:
      return null;
  }
}

export interface WgslVariantSubchain {
  /** 실행 순서상 연속인 융합 대상 노드들. */
  readonly nodeIds: readonly string[];
  /** 현재 이 노드들을 소유한 프로바이더(들) — 융합 시 copy 전이가 사라지는 근거. */
  readonly providerIds: readonly string[];
  readonly variantKey: string;
}

export interface WgslVariantEnumeration {
  /** variantKey 로 dedup 된 컴파일 대상 variant 집합. */
  readonly variants: readonly ComposedWgslVariant[];
  /** 그래프에서 발견된 융합 가능 서브체인 전부(중복 구조 포함). */
  readonly subchains: readonly WgslVariantSubchain[];
  /** 컴파일 계획에는 있으나 WGSL 융합 미지원이라 제외된 노드(조용한 손실 금지). */
  readonly skippedNodeIds: readonly string[];
}

export interface EnumerateVariantsOptions {
  readonly mode?: EffectCompileMode;
  readonly benchmarks?: ProviderBenchmarkRegistry;
  readonly minVisualQuality?: number;
  /** 노드→스펙 매핑 오버라이드(기본 wgslOpFromEffectNode). */
  readonly resolveNode?: (node: EffectNodeIR) => WgslFilterOpSpec | null;
}

/**
 * compileEffectGraph 산출(프로바이더 서브체인)을 실행 순서로 훑어, WGSL 로
 * 융합 가능한 연속 노드 구간마다 variant 를 생성한다. 서브체인은 프로바이더
 * 그룹 경계를 넘어 이어질 수 있다 — 융합 커널이 그 경계의 copy 전이를
 * 없애는 것이 목적이므로 경계는 run 을 끊지 않는다. 같은 구조의 서브체인은
 * variantKey 로 dedup 되어 "모든 variant compile" 게이트의 대상 집합이 된다.
 */
export function enumerateVariantsForGraph(
  graph: EffectGraphIR,
  registry: EngineCapabilityRegistry,
  options: EnumerateVariantsOptions = {},
): WgslVariantEnumeration {
  const plan = compileEffectGraph(graph, registry, {
    mode: options.mode ?? "final",
    benchmarks: options.benchmarks,
    minVisualQuality: options.minVisualQuality,
  });
  const resolve = options.resolveNode ?? wgslOpFromEffectNode;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  const variantsByKey = new Map<string, ComposedWgslVariant>();
  const subchains: WgslVariantSubchain[] = [];
  const skippedNodeIds: string[] = [];

  let runSpecs: WgslFilterOpSpec[] = [];
  let runNodeIds: string[] = [];
  let runProviderIds: string[] = [];

  const closeRun = (): void => {
    if (runSpecs.length === 0) return;
    const variant = composeWgslVariant(runSpecs);
    if (!variantsByKey.has(variant.variantKey)) {
      variantsByKey.set(variant.variantKey, variant);
    }
    subchains.push({
      nodeIds: runNodeIds,
      providerIds: [...new Set(runProviderIds)],
      variantKey: variant.variantKey,
    });
    runSpecs = [];
    runNodeIds = [];
    runProviderIds = [];
  };

  for (const group of plan.groups) {
    for (const nodeId of group.nodeIds) {
      const node = byId.get(nodeId);
      if (!node) {
        // compileEffectGraph 가 검증한 그래프라 실제로는 도달 불가 — 방어적 명시.
        throw new WgslVariantComposeError(
          `compiled plan references unknown node "${nodeId}"`,
        );
      }
      const spec = resolve(node);
      if (spec === null) {
        closeRun();
        skippedNodeIds.push(nodeId);
        continue;
      }
      runSpecs.push(spec);
      runNodeIds.push(nodeId);
      runProviderIds.push(group.providerId);
    }
  }
  closeRun();

  return {
    variants: [...variantsByKey.values()],
    subchains,
    skippedNodeIds,
  };
}
