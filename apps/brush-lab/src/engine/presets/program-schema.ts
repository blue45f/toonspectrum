import { z } from "zod";

import { canonicalJson, fnv1a64, sha256Hex, utf8Bytes } from "../core/hash";
import { DEFAULT_PAPER_SPEC } from "../texture/paper-grain";
import { SAMPLING_FILTERS } from "../texture/sampling";
import { wetParamsSchema } from "../wet/params";

import type { Curve } from "../core/curve";
import type { DepositionModel, TipKind } from "../core/types";
import type { ColorDynamicsSpec } from "../dynamics/color-dynamics";
import type { DynamicInput, DynamicMapping } from "../dynamics/mapping-curves";
import type { ScatterSpec } from "../dynamics/scatter";
import type { InputPipelineConfig } from "../input/input-pipeline";
import type { ContactModelKind, PhysicsSpec } from "../physics/physics-model";
import type { BlendMode } from "../raster/composite";
import type { PaperSpec } from "../texture/paper-grain";
import type { TipParams } from "../texture/tip-generators";
import type { WetParams } from "../wet/params";

/**
 * 브러시 프로그램(프리셋) 스키마. zod는 engine/ 안에서 이 파일과 wet/params.ts에서만 쓴다.
 * `normalizeProgram`은 부분 입력을 기본값으로 채우고 검증한다.
 */

export const BRUSH_FAMILIES = [
  "pencil",
  "ballpoint",
  "ink",
  "marker",
  "chalk",
  "charcoal",
  "conte",
  "crayon",
  "watercolor",
  "gouache",
  "oil",
  "acrylic",
  "airbrush",
  "spray",
  "hatch",
  "halftone",
  "texture",
  "smudge",
  "eraser",
  "special",
] as const;
export type BrushFamily = (typeof BRUSH_FAMILIES)[number];

export const TIP_KINDS = [
  "round",
  "flat",
  "bristle-strands",
  "texture-stamp",
  "noise",
  "hatch",
  "stipple",
  "particle",
] as const satisfies readonly TipKind[];
/** 타입 수준 완전성 검사: TipKind에 있는데 TIP_KINDS에 없는 값이 있으면 컴파일 오류. */
export const TIP_KINDS_COMPLETE: Exclude<TipKind, (typeof TIP_KINDS)[number]> extends never
  ? true
  : never = true;

export const DEPOSITION_MODELS = [
  "dry-stamp",
  "airbrush",
  "spray",
  "bristle",
  "hatch-halftone",
  "smudge",
  "eraser",
  "impasto",
  "wet-flow",
] as const satisfies readonly DepositionModel[];
export const DEPOSITION_MODELS_COMPLETE: Exclude<
  DepositionModel,
  (typeof DEPOSITION_MODELS)[number]
> extends never
  ? true
  : never = true;

const BLEND_MODES = ["normal", "multiply", "erase", "max"] as const satisfies readonly BlendMode[];
const DYNAMIC_INPUTS = [
  "pressure",
  "velocity",
  "tiltAltitude",
  "tiltAzimuth",
  "twist",
  "direction",
  "strokeProgress",
  "random",
  "constant",
] as const satisfies readonly DynamicInput[];
const CONTACT_KINDS = [
  "hertz",
  "felt",
  "bristle",
  "nib",
  "graphite",
  "none",
] as const satisfies readonly ContactModelKind[];
const ROTATION_FOLLOW = ["none", "direction", "tilt"] as const;
export type RotationFollow = (typeof ROTATION_FOLLOW)[number];

export interface BrushTipSpec {
  kind: TipKind;
  /** 지름(px). */
  sizePx: number;
  hardness: number;
  aspect: number;
  angleRad: number;
  /** 초타원 지수. */
  shapeExp: number;
  seed: number;
  params: TipParams;
}

export interface BrushDepositionSpec {
  model: DepositionModel;
  flow: number;
  opacity: number;
  /** dab 간격(최대 반경 배율). */
  spacing: number;
  /**
   * 시간 기반 dab(초당). 정지·저속에서도 이 비율로 dab이 쌓인다(잉크 고임·에어브러시 누적).
   * 0이면 거리 기반만(건식 매체). libmypaint dabs_per_second 개념(ISC, 코드 미복제).
   */
  timeDabsPerSecond: number;
  blend: BlendMode;
  dual: BrushTipSpec | null;
}

export interface BrushEdgeSpec {
  curve: Curve;
  wetEdge: number;
  dryBreakup: number;
  taperStartPx: number;
  taperEndPx: number;
  aaMode: "analytic";
}

export interface BrushStrokeDynamics {
  size: DynamicMapping[];
  flow: DynamicMapping[];
  rotationFollow: RotationFollow;
  scatter: ScatterSpec;
}

export interface BrushProgram {
  id: string;
  name: string;
  family: BrushFamily;
  description: string;
  tip: BrushTipSpec;
  paper: PaperSpec;
  deposition: BrushDepositionSpec;
  edge: BrushEdgeSpec;
  colorDynamics: ColorDynamicsSpec;
  strokeDynamics: BrushStrokeDynamics;
  physics: PhysicsSpec;
  wet: WetParams | null;
  input: Partial<InputPipelineConfig>;
}

const curveSchema = z.array(z.number()).min(1);

const tipParamsSchema = z.object({
  hardness: z.number().min(0).max(1).default(0.8),
  aspect: z.number().positive().default(1),
  strands: z.number().int().min(1).optional(),
  density: z.number().min(0).max(1).optional(),
  angle: z.number().optional(),
  frequency: z.number().positive().optional(),
  octaves: z.number().int().min(1).max(8).optional(),
});

const tipSchema = z.object({
  kind: z.enum(TIP_KINDS).default("round"),
  sizePx: z.number().positive().default(12),
  hardness: z.number().min(0).max(1).default(0.8),
  aspect: z.number().positive().default(1),
  angleRad: z.number().default(0),
  shapeExp: z.number().min(1).default(2),
  seed: z.number().int().min(0).default(1),
  params: tipParamsSchema.prefault({}),
});

const paperSchema = z.object({
  enabled: z.boolean().default(DEFAULT_PAPER_SPEC.enabled),
  scale: z.number().positive().default(DEFAULT_PAPER_SPEC.scale),
  rotationRad: z.number().default(DEFAULT_PAPER_SPEC.rotationRad),
  roughness: z.number().min(0).max(1).default(DEFAULT_PAPER_SPEC.roughness),
  absorbency: z.number().min(0).max(1).default(DEFAULT_PAPER_SPEC.absorbency),
  pressureInfluence: z.number().min(0).max(1).default(DEFAULT_PAPER_SPEC.pressureInfluence),
  filter: z.enum(SAMPLING_FILTERS).default(DEFAULT_PAPER_SPEC.filter),
  seed: z.number().int().min(0).default(DEFAULT_PAPER_SPEC.seed),
});

const depositionSchema = z.object({
  model: z.enum(DEPOSITION_MODELS).default("dry-stamp"),
  flow: z.number().min(0).max(1).default(0.8),
  opacity: z.number().min(0).max(1).default(1),
  spacing: z.number().min(0.01).max(4).default(0.15),
  timeDabsPerSecond: z.number().min(0).max(240).default(0),
  blend: z.enum(BLEND_MODES).default("normal"),
  dual: tipSchema.nullable().default(null),
});

const edgeSchema = z.object({
  curve: curveSchema.default([0, 1]),
  wetEdge: z.number().min(0).max(1).default(0),
  dryBreakup: z.number().min(0).max(1).default(0),
  taperStartPx: z.number().min(0).default(0),
  taperEndPx: z.number().min(0).default(0),
  aaMode: z.literal("analytic").default("analytic"),
});

const colorDynamicsSchema = z.object({
  hueJitter: z.number().min(0).max(1).default(0),
  satJitter: z.number().min(0).max(1).default(0),
  valJitter: z.number().min(0).max(1).default(0),
  perDab: z.boolean().default(false),
  kmMixing: z.boolean().default(false),
});

const dynamicMappingSchema = z.object({
  input: z.enum(DYNAMIC_INPUTS),
  curve: curveSchema,
  min: z.number(),
  max: z.number(),
});

const scatterSchema = z.object({
  positionPx: z.number().min(0).default(0),
  angleRad: z.number().min(0).default(0),
  scale: z.number().min(0).max(1).default(0),
  countJitter: z.number().min(0).max(1).default(0),
});

const strokeDynamicsSchema = z.object({
  size: z.array(dynamicMappingSchema).default([]),
  flow: z.array(dynamicMappingSchema).default([]),
  rotationFollow: z.enum(ROTATION_FOLLOW).default("none"),
  scatter: scatterSchema.prefault({}),
});

const nibSchema = z.object({
  stiffness: z.number().positive().default(180),
  damping: z.number().min(0).default(0),
  threshold: z.number().min(0).max(1).default(0.05),
  gapMax: z.number().min(0).default(6),
  widthGain: z.number().min(0).default(1),
  baseWidth: z.number().min(0).default(0.8),
  aspect: z.number().positive().default(1),
});

const bristleSchema = z.object({
  spreadGain: z.number().min(0).default(1.5),
  tiltGain: z.number().min(0).default(0.6),
  followTauMs: z.number().min(0).default(30),
  strands: z.number().int().min(1).default(24),
});

const graphiteSchema = z.object({
  contactGain: z.number().min(0).default(1),
  bumpThreshold: z.number().min(0).max(0.99).default(0.3),
});

const velocitySchema = z.object({
  vMax: z.number().positive().default(6),
  vBreak: z.number().min(0).default(2.5),
  vSlow: z.number().min(0).default(0.3),
  gamma: z.number().positive().default(0.6),
  waterBase: z.number().min(0).max(1).default(0),
  slowGain: z.number().min(0).max(1).default(0),
});

const frictionSchema = z.object({
  mu0: z.number().min(0).default(0.1),
  muGrain: z.number().min(0).default(0.2),
  jitterGain: z.number().min(0).default(0.4),
  flowLoss: z.number().min(0).max(1).default(0.15),
});

const physicsSchema = z.object({
  contact: z.enum(CONTACT_KINDS).default("hertz"),
  exponent: z.number().positive().default(3),
  baseRadius: z.number().positive().default(1),
  hysteresisUpMs: z.number().min(0).default(12),
  hysteresisDownMs: z.number().min(0).default(40),
  nib: nibSchema.optional(),
  bristle: bristleSchema.optional(),
  graphite: graphiteSchema.optional(),
  velocity: velocitySchema.prefault({}),
  friction: frictionSchema.prefault({}),
});

const oneEuroSchema = z.object({
  minCutoff: z.number().positive(),
  beta: z.number().min(0),
  dCutoff: z.number().positive(),
});

const deviceProfileSchema = z.object({
  id: z.string(),
  label: z.string(),
  pressureCurve: curveSchema,
  deadZone: z.number().min(0).max(1),
  pressureGamma: z.number().positive(),
  tiltXOffsetDeg: z.number(),
  tiltYOffsetDeg: z.number(),
});

const inputConfigSchema = z
  .object({
    profile: deviceProfileSchema.optional(),
    oneEuro: z
      .object({ position: oneEuroSchema, pressure: oneEuroSchema, tilt: oneEuroSchema })
      .optional(),
    cornerPreserve: z
      .object({
        enabled: z.boolean(),
        curvatureGain: z.number().min(0),
        slowSpeedPxPerMs: z.number().min(0),
        slowCutoffScale: z.number().positive(),
        cornerCurvature: z.number().min(0),
      })
      .optional(),
    prediction: z.object({ enabled: z.boolean(), horizonMs: z.number().min(0) }).optional(),
    velocitySmoothing: z.number().min(0).max(1).optional(),
    endpointTailSamples: z.number().int().min(0).optional(),
  })
  .default({});

export const brushProgramSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  family: z.enum(BRUSH_FAMILIES),
  description: z.string().default(""),
  tip: tipSchema.prefault({}),
  paper: paperSchema.prefault({}),
  deposition: depositionSchema.prefault({}),
  edge: edgeSchema.prefault({}),
  colorDynamics: colorDynamicsSchema.prefault({}),
  strokeDynamics: strokeDynamicsSchema.prefault({}),
  physics: physicsSchema.prefault({}),
  wet: wetParamsSchema.nullable().default(null),
  input: inputConfigSchema,
});

export type BrushProgramInput = z.input<typeof brushProgramSchema>;

/** 기본값 채움 + 검증. 실패는 ZodError로 던진다(무음 보정 없음). */
export function normalizeProgram(input: unknown): BrushProgram {
  const parsed: BrushProgram = brushProgramSchema.parse(input);
  return parsed;
}

/** sha256(canonicalJson(program)) — 리포트용 64자리 hex. */
export function brushConfigHash(program: BrushProgram): Promise<string> {
  return sha256Hex(utf8Bytes(canonicalJson(program)));
}

/** fnv1a64(canonicalJson(program)) — UI 즉시 표시용. */
export function brushConfigHashSync(program: BrushProgram): string {
  return fnv1a64(utf8Bytes(canonicalJson(program)));
}
