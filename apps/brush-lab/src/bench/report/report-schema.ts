import { z } from "zod";

import { LAB_SCHEMA_VERSION } from "../../engine/core/version";

/**
 * 브러시 인증 리포트 스키마(labSchemaVersion 1.0.0, zod).
 * 모든 지표 값은 number | null이며 null의 사유는 `metricNotes[<group>.<key>]`에 기록한다.
 * 임계값·판정은 `report/thresholds.ts`가 만들고, 이 파일은 구조만 고정한다.
 */

export const LAB_REPORT_SCHEMA_VERSION = LAB_SCHEMA_VERSION;

export const LANE_ID_VALUES = [
  "canvas2d",
  "platform-baseline",
  "cpu-reference",
  "webgpu-compute",
  "webgpu-instanced",
  "webgl2-instanced",
  "wasm-cpu",
  "wasm-gpu-hybrid",
] as const;

export const LANE_KIND_VALUES = ["baseline", "candidate", "comparison"] as const;
export const LANE_STATUS_VALUES = ["implemented", "browser-verification-required", "reserved"] as const;
export const TIMING_SOURCE_VALUES = [
  "timestamp-query",
  "submitted-work-done",
  "performance-now",
  "unavailable",
] as const;

export const VERDICT_VALUES = ["PASS", "FAIL", "UNAVAILABLE"] as const;
export type Verdict = (typeof VERDICT_VALUES)[number];

export const THRESHOLD_OPS = [">=", "<="] as const;
export type ThresholdOp = (typeof THRESHOLD_OPS)[number];

export const TEXTURE_METRIC_KEYS = [
  "grainContrastPreservation",
  "highFrequencyEnergyRatio",
  "seamScore",
  "pressureGrainMonotonicity",
  "resolutionConsistency",
] as const;
export type TextureMetricKey = (typeof TEXTURE_METRIC_KEYS)[number];

export const RENDER_METRIC_KEYS = [
  "edgeStaircaseEnergy",
  "opacityAccumulationError",
  "coverageIoU",
  "deltaEMean",
  "deltaEP99",
  "deltaEMax",
  "fuzzyMismatchPct",
  "determinism",
  "edgeTransitionWidthPx",
] as const;
export type RenderMetricKey = (typeof RENDER_METRIC_KEYS)[number];

export const HANDFEEL_METRIC_KEYS = [
  "latencyP50Ms",
  "latencyP95Ms",
  "pressureMonotonicity",
  "pressureLinearityR2",
  "hysteresisWidth",
  "taperQuality",
  "taperEndWidthRatio",
  "slowSpeedJitterRms",
  "cornerDeviationPx",
  "cornerOvershootPx",
  "speedConsistencyCv",
  "lineWidthMeanPx",
  "lineWidthCv",
] as const;
export type HandfeelMetricKey = (typeof HANDFEEL_METRIC_KEYS)[number];

export const PERF_METRIC_KEYS = [
  "dabsPerSecond",
  "frameCount",
  "frameP50Ms",
  "frameP95Ms",
  "frameMaxMs",
  "elapsedMs",
  "submitCount",
  "gpuTimeMs",
  "memoryBytes",
  "inputToSubmitP50Ms",
  "inputToSubmitP95Ms",
] as const;
export type PerfMetricKey = (typeof PERF_METRIC_KEYS)[number];

const nullableNumber = z.number().nullable();

function metricGroupSchema<const K extends readonly string[]>(
  keys: K,
): z.ZodObject<Record<K[number], typeof nullableNumber>> {
  const shape = Object.fromEntries(keys.map((k) => [k, nullableNumber])) as Record<
    K[number],
    typeof nullableNumber
  >;
  return z.object(shape);
}

export const textureMetricsSchema = metricGroupSchema(TEXTURE_METRIC_KEYS);
export const renderMetricsSchema = metricGroupSchema(RENDER_METRIC_KEYS);
export const handfeelMetricsSchema = metricGroupSchema(HANDFEEL_METRIC_KEYS);
export const perfMetricsSchema = metricGroupSchema(PERF_METRIC_KEYS);
/** 가족 지표는 가족마다 키가 다르므로 record. */
export const familyMetricsSchema = z.record(z.string(), nullableNumber);

export const reportMetricsSchema = z.object({
  texture: textureMetricsSchema,
  render: renderMetricsSchema,
  handfeel: handfeelMetricsSchema,
  perf: perfMetricsSchema,
  family: familyMetricsSchema,
});
export type ReportMetrics = z.infer<typeof reportMetricsSchema>;

export const adapterInfoSchema = z.object({
  vendor: z.string(),
  architecture: z.string(),
  device: z.string(),
  description: z.string(),
});

export const reportEnvironmentSchema = z.object({
  userAgent: z.string(),
  adapterInfo: adapterInfoSchema.nullable(),
  features: z.array(z.string()),
  limits: z.record(z.string(), z.number()),
  softwareRenderer: z.boolean().nullable(),
  /** Node 버전(브라우저면 null). */
  node: z.string().nullable(),
});
export type ReportEnvironment = z.infer<typeof reportEnvironmentSchema>;

export const thresholdRuleSchema = z.object({
  op: z.enum(THRESHOLD_OPS),
  threshold: z.number(),
});
export type ThresholdRule = z.infer<typeof thresholdRuleSchema>;

export const brushCertificationReportSchema = z.object({
  labSchemaVersion: z.literal(LAB_REPORT_SCHEMA_VERSION),
  laneId: z.enum(LANE_ID_VALUES),
  laneKind: z.enum(LANE_KIND_VALUES),
  laneStatus: z.enum(LANE_STATUS_VALUES),
  engineVersion: z.string().min(1),
  createdAt: z.iso.datetime(),
  environment: reportEnvironmentSchema,
  fixtureId: z.string().min(1),
  fixtureSeed: z.number().int().nonnegative(),
  seed: z.number().int().nonnegative(),
  presetId: z.string().min(1),
  presetFamily: z.string().min(1),
  brushConfigHash: z.string().length(64),
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    dpr: z.number().positive(),
  }),
  frameMs: z.number().positive(),
  sampleCount: z.number().int().nonnegative(),
  dabCount: z.number().int().nonnegative(),
  timingSource: z.enum(TIMING_SOURCE_VALUES),
  /** 참조 레인 ID(ΔE·IoU·퍼지 비교 대상). 없으면 null. */
  referenceLaneId: z.enum(LANE_ID_VALUES).nullable(),
  metrics: reportMetricsSchema,
  /** null 지표의 사유(`<group>.<key>` → 한글 사유). */
  metricNotes: z.record(z.string(), z.string()),
  thresholds: z.record(z.string(), thresholdRuleSchema),
  verdicts: z.record(z.string(), z.enum(VERDICT_VALUES)),
  /** 하나라도 FAIL → FAIL; FAIL 없고 UNAVAILABLE 있으면 UNAVAILABLE; 아니면 PASS. */
  verdict: z.enum(VERDICT_VALUES),
  pixelHash: z.string().length(16),
  pixelSha256: z.string().length(64),
});
export type BrushCertificationReport = z.infer<typeof brushCertificationReportSchema>;

/** JSON(파싱 결과) → 리포트. 실패는 ZodError. */
export function parseReport(input: unknown): BrushCertificationReport {
  return brushCertificationReportSchema.parse(input);
}

/** 지표 키 `<group>.<key>` 평탄화. */
export function flattenMetrics(metrics: ReportMetrics): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [group, values] of Object.entries(metrics)) {
    for (const [key, value] of Object.entries(values)) out[`${group}.${key}`] = value;
  }
  return out;
}

/** 빈 지표 그룹(모두 null). */
export function emptyMetrics(): ReportMetrics {
  const fill = <K extends string>(keys: readonly K[]): Record<K, number | null> => {
    const out = {} as Record<K, number | null>;
    for (const k of keys) out[k] = null;
    return out;
  };
  return {
    texture: fill(TEXTURE_METRIC_KEYS),
    render: fill(RENDER_METRIC_KEYS),
    handfeel: fill(HANDFEEL_METRIC_KEYS),
    perf: fill(PERF_METRIC_KEYS),
    family: {},
  };
}
