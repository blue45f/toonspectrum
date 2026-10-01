import { brushConfigHash } from "../../engine/presets/program-schema";
import { paperFor } from "../../engine/raster/reference-renderer";
import { fixtureHasPressureVariation } from "../fixtures/stroke-fixtures";
import {
  computeFamilyMetrics,
  CPU_SYNTHETIC_FAMILY_KEYS,
  grainPressureMonotonicityOf,
  overlapAccumulationErrorOf,
} from "../metrics/family-metrics";
import {
  centerlineFromImage,
  cornerAccuracyFromImage,
  expectedTaperWidth,
  frameLatency,
  inputToPixelLatency,
  lineWidthCurve,
  pressureResponse,
  slowSpeedJitterRms,
  speedBucketCoverage,
  speedConsistency,
  taperQuality,
  taperShape,
  widthsAtSamples,
} from "../metrics/handfeel-metrics";
import { mean, polylineLength, std } from "../metrics/lab-math";
import { perfSampleFromReceipts, summarizePerf } from "../metrics/perf-metrics";
import {
  coverageIoU,
  deltaEStatsImages,
  edgeStaircaseEnergy,
  edgeTransitionWidthPx,
  fuzzyMismatchPct,
  pixelHash,
  pixelSha256,
} from "../metrics/render-metrics";
import {
  grainContrastPreservation,
  highFrequencyEnergyRatio,
  resolutionConsistency,
  seamScore,
} from "../metrics/texture-metrics";

import { emptyMetrics, flattenMetrics, parseReport } from "./report-schema";
import { judge, thresholdsFor } from "./thresholds";

import type { BrushCertificationReport, ReportEnvironment, ReportMetrics } from "./report-schema";
import type { ThresholdContext } from "./thresholds";
import type { Clock, LabImage } from "../../engine/core/types";
import type { LatencyRecord } from "../../engine/input/input-pipeline";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneEnvironment,
  LaneId,
  StrokeReceipt,
} from "../../lanes/lane";
import type { StrokeFixture } from "../fixtures/stroke-fixtures";

/**
 * 인증 리포트 생성. 레인 실행 결과(이미지·영수증)와 fixture·프로그램·환경에서 지표 전부를 계산하고
 * 임계값 표로 판정한다. 측정 불가 지표는 null + `metricNotes`에 한글 사유를 남긴다(무음 생략 없음).
 *
 * 선택 입력:
 * - `reference`: 참조 레인 결과(ΔE·IoU·퍼지 불일치·그레인 대비 보존)
 * - `rerun`: 같은 입력 재실행 이미지(결정성 = 해시 동일 1/0)
 * - `hiRes`: 2배 캔버스 렌더(해상도 일관성)
 * - `frames`: 프레임 영수증(입력→제출 지연)
 * - `latency`: 입력 파이프라인 지연 기록(레인이 `strokeLatency()`를 제공하면 자동 사용)
 * - `wallClock`: createdAt용 epoch ms(결정성 테스트에서 주입). 기본 `Date.now`.
 */

/** 레인이 입력 파이프라인 지연 기록을 노출하면 리포트가 자동으로 쓴다(선택 계약). */
export interface LatencyReportingLane {
  strokeLatency(): readonly LatencyRecord[];
}

export function hasStrokeLatency(lane: object): lane is LatencyReportingLane {
  return typeof (lane as Partial<LatencyReportingLane>).strokeLatency === "function";
}

export interface ReportReference {
  laneId: LaneId;
  image: LabImage;
  /** 참조 레인의 선형 버퍼(선택, 현재 ΔE는 sRGB 이미지 기준으로 계산한다). */
  linear?: Float32Array | null;
}

export interface BuildReportInput {
  lane: Pick<BrushEngineLane, "id" | "kind" | "status" | "engineVersion">;
  fixture: StrokeFixture;
  program: BrushProgram;
  out: LabImage;
  linear: Float32Array | null;
  receipt: StrokeReceipt;
  env: LaneEnvironment;
  /** 성능 시계(러너와 같은 시계). `elapsedMs`가 없을 때 지표 계산 자체의 경과는 쓰지 않는다. */
  clock: Clock;
  reference?: ReportReference;
  rerun?: LabImage;
  hiRes?: LabImage;
  frames?: readonly DabBatchReceipt[];
  latency?: readonly LatencyRecord[];
  capability?: LaneCapabilityReport;
  seed?: number;
  frameMs?: number;
  elapsedMs?: number;
  memoryBytes?: number | null;
  /** epoch ms. 기본 `Date.now`. */
  wallClock?: () => number;
}

const DEFAULT_FRAME_MS = 1000 / 60;
const WIDTH_STATIONS = 32;
const CENTERLINE_STATIONS = 96;
const TAPER_STATIONS = 48;
const TAPER_STATIONS_MAX = 512;

function nodeVersion(): string | null {
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
  const v = proc?.versions?.node;
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function reportEnvironmentOf(env: LaneEnvironment, capability: LaneCapabilityReport | undefined): ReportEnvironment {
  return {
    userAgent: env.userAgent ?? (nodeVersion() ? `node/${nodeVersion()}` : "unknown"),
    adapterInfo: capability?.adapterInfo ?? null,
    features: capability ? [...capability.features] : [],
    limits: capability ? { ...capability.limits } : {},
    softwareRenderer: capability?.softwareRenderer ?? null,
    node: nodeVersion(),
  };
}

function finiteOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pathOf(fixture: StrokeFixture): readonly (readonly [number, number])[] {
  return fixture.intendedPath ?? fixture.samples.map((s) => [s.x, s.y] as const);
}

interface MetricBuild {
  metrics: ReportMetrics;
  notes: Record<string, string>;
}

function textureMetrics(input: BuildReportInput, b: MetricBuild): void {
  const { out, program, fixture } = input;
  const t = b.metrics.texture;
  if (input.reference) {
    t.grainContrastPreservation = finiteOrNull(grainContrastPreservation(input.reference.image, out));
  } else {
    b.notes["texture.grainContrastPreservation"] = "참조 레인 결과가 없어 그레인 대비 보존을 비교할 수 없다";
  }
  t.highFrequencyEnergyRatio = finiteOrNull(highFrequencyEnergyRatio(out));
  if (program.paper.enabled) {
    t.seamScore = finiteOrNull(seamScore(paperFor(program.paper)));
  } else {
    b.notes["texture.seamScore"] = "프리셋이 종이 그레인을 쓰지 않는다";
  }
  const mono = grainPressureMonotonicityOf(out, fixture, program);
  if (mono === null) {
    b.notes["texture.pressureGrainMonotonicity"] = fixtureHasPressureVariation(fixture)
      ? "압력 구간 표본이 부족해 단조성을 계산할 수 없다"
      : "이 fixture는 압력이 변하지 않는다(slow-pressure-ramp·spiral에서 측정)";
  } else {
    t.pressureGrainMonotonicity = finiteOrNull(mono);
  }
  if (input.hiRes) {
    t.resolutionConsistency = finiteOrNull(resolutionConsistency(out, input.hiRes));
  } else {
    b.notes["texture.resolutionConsistency"] = "2배 캔버스 렌더(hiRes)가 없다";
  }
}

function renderMetrics(input: BuildReportInput, b: MetricBuild): void {
  const { out, program, fixture } = input;
  const r = b.metrics.render;
  r.edgeStaircaseEnergy = finiteOrNull(edgeStaircaseEnergy(out));
  const overlap = overlapAccumulationErrorOf(program);
  if (overlap === null) {
    b.notes["render.opacityAccumulationError"] =
      "균일 커버리지 모델(dry-stamp + round/flat 팁)에서만 CPU 참조 합성으로 측정한다";
  } else {
    r.opacityAccumulationError = finiteOrNull(overlap);
    b.notes["render.opacityAccumulationError:source"] = "CPU 참조 래스터로 같은 자리 10회 dab 합성 검사(레인 비의존)";
  }
  if (input.reference) {
    const ref = input.reference.image;
    if (ref.width === out.width && ref.height === out.height) {
      r.coverageIoU = finiteOrNull(coverageIoU(out, ref));
      const de = deltaEStatsImages(out, ref);
      r.deltaEMean = finiteOrNull(de.mean);
      r.deltaEP99 = finiteOrNull(de.p99);
      r.deltaEMax = finiteOrNull(de.max);
      r.fuzzyMismatchPct = finiteOrNull(fuzzyMismatchPct(out.data, ref.data, out.width, out.height));
    } else {
      b.notes["render.coverageIoU"] = `참조 이미지 크기(${ref.width}×${ref.height})가 출력(${out.width}×${out.height})과 다르다`;
      b.notes["render.deltaEP99"] = b.notes["render.coverageIoU"];
      b.notes["render.fuzzyMismatchPct"] = b.notes["render.coverageIoU"];
    }
  } else {
    const why = "참조 레인 결과가 없다(A/B 비교에서만 측정)";
    b.notes["render.coverageIoU"] = why;
    b.notes["render.deltaEMean"] = why;
    b.notes["render.deltaEP99"] = why;
    b.notes["render.deltaEMax"] = why;
    b.notes["render.fuzzyMismatchPct"] = why;
  }
  if (input.rerun) {
    r.determinism = pixelHash(input.rerun) === pixelHash(out) ? 1 : 0;
  } else {
    b.notes["render.determinism"] = "재실행 이미지(rerun)가 없어 결정성을 판정하지 않았다";
  }
  const etw = edgeTransitionWidthPx(out, pathOf(fixture));
  if (etw === null) b.notes["render.edgeTransitionWidthPx"] = "의도 경로 정류장에 잉크가 없다";
  else r.edgeTransitionWidthPx = finiteOrNull(etw);
}

function handfeelMetrics(input: BuildReportInput, b: MetricBuild): void {
  const { out, program, fixture, receipt } = input;
  const h = b.metrics.handfeel;
  const frameTimes = receipt.frameTimesMs;

  // 지연: 입력 파이프라인 기록(필터 지연 + 프레임) 우선, 없으면 프레임 영수증(입력→제출 + 프레임).
  const latencyRecords = input.latency ?? (hasStrokeLatency(input.lane) ? input.lane.strokeLatency() : null);
  const latency =
    latencyRecords && latencyRecords.length > 0
      ? inputToPixelLatency(latencyRecords, frameTimes)
      : input.frames
        ? frameLatency(input.frames, frameTimes)
        : null;
  if (latency) {
    h.latencyP50Ms = finiteOrNull(latency.p50);
    h.latencyP95Ms = finiteOrNull(latency.p95);
  } else {
    const why = "지연 기록(입력 파이프라인 latency 또는 프레임 inputToSubmitMs)이 없다";
    b.notes["handfeel.latencyP50Ms"] = why;
    b.notes["handfeel.latencyP95Ms"] = why;
  }

  // 압력 응답(압력이 변하는 fixture에서만).
  if (fixtureHasPressureVariation(fixture)) {
    const widths = widthsAtSamples(out, fixture.samples);
    const pressures = fixture.samples.map((s) => s.pressure);
    const resp = pressureResponse(pressures, widths);
    h.pressureMonotonicity = finiteOrNull(resp.monotonicity);
    h.pressureLinearityR2 = finiteOrNull(resp.linearityR2);
    h.hysteresisWidth = finiteOrNull(resp.hysteresisWidth);
  } else {
    const why = "이 fixture는 압력이 변하지 않는다(slow-pressure-ramp·spiral·curve에서 측정)";
    b.notes["handfeel.pressureMonotonicity"] = why;
    b.notes["handfeel.pressureLinearityR2"] = why;
    b.notes["handfeel.hysteresisWidth"] = why;
  }

  // 선폭 곡선(의도 경로 기준).
  const path = pathOf(fixture);
  const total = polylineLength(path);
  const widths = total > 0 ? lineWidthCurve(out, path, WIDTH_STATIONS) : [];
  const inked = widths.filter((w) => w > 0);
  if (inked.length > 0) {
    const m = mean(inked);
    h.lineWidthMeanPx = finiteOrNull(m);
    h.lineWidthCv = finiteOrNull(m > 0 ? std(inked) / m : null);
  } else {
    b.notes["handfeel.lineWidthMeanPx"] = "의도 경로 정류장에 잉크가 없다";
    b.notes["handfeel.lineWidthCv"] = b.notes["handfeel.lineWidthMeanPx"];
  }

  // 테이퍼(프로그램에 끝/시작 테이퍼가 있을 때). 정류장 ≈1 px, 잉크가 끝난 뒤 정류장은 제외한다.
  const taperStart = program.edge.taperStartPx;
  const taperEnd = program.edge.taperEndPx;
  if ((taperStart > 0 || taperEnd > 0) && total > 0) {
    const stations = Math.max(TAPER_STATIONS, Math.min(TAPER_STATIONS_MAX, Math.ceil(total)));
    const tw = lineWidthCurve(out, path, stations);
    let wMax = 0;
    let lastInked = -1;
    tw.forEach((w, i) => {
      if (w > wMax) wMax = w;
      if (w > 0) lastInked = i;
    });
    if (wMax > 0 && lastInked >= 0) {
      const inked = tw.slice(0, lastInked + 1);
      const expected = inked.map((_, i) =>
        expectedTaperWidth((total * i) / (stations - 1), total, wMax, taperStart, taperEnd),
      );
      h.taperQuality = finiteOrNull(taperQuality(inked, expected));
      if (taperEnd > 0) h.taperEndWidthRatio = finiteOrNull(taperShape(inked).endWidthRatio);
      else b.notes["handfeel.taperEndWidthRatio"] = "프리셋에 끝 테이퍼(taperEndPx)가 없다";
    } else {
      b.notes["handfeel.taperQuality"] = "의도 경로에 잉크가 없다";
      b.notes["handfeel.taperEndWidthRatio"] = b.notes["handfeel.taperQuality"];
    }
  } else {
    const why = "프리셋에 테이퍼(taperStartPx/taperEndPx)가 없다";
    b.notes["handfeel.taperQuality"] = why;
    b.notes["handfeel.taperEndWidthRatio"] = why;
  }

  // 중심선 기반 지표(저속 떨림·모서리).
  const centerline = total > 0 ? centerlineFromImage(out, path, CENTERLINE_STATIONS) : [];
  if (centerline.length >= 5) {
    h.slowSpeedJitterRms = finiteOrNull(slowSpeedJitterRms(centerline));
  } else {
    b.notes["handfeel.slowSpeedJitterRms"] = "이미지 중심선을 추출할 잉크가 부족하다";
  }
  if (fixture.intendedPath && fixture.intendedPath.length >= 3 && inked.length > 0) {
    const acc = cornerAccuracyFromImage(out, fixture.intendedPath, mean(inked) / 2);
    if (acc.corners > 0) {
      h.cornerDeviationPx = finiteOrNull(acc.maxPx);
      if (acc.overshootPx === null) b.notes["handfeel.cornerOvershootPx"] = "둔각 모서리는 오버슈트를 측정하지 않는다";
      else h.cornerOvershootPx = finiteOrNull(acc.overshootPx);
    } else {
      b.notes["handfeel.cornerDeviationPx"] = "의도 경로에 꺾이는 정점이 없다";
      b.notes["handfeel.cornerOvershootPx"] = b.notes["handfeel.cornerDeviationPx"];
    }
  } else {
    const why = fixture.intendedPath && fixture.intendedPath.length >= 3
      ? "의도 경로에 잉크가 없어 모서리를 측정할 수 없다"
      : "의도 경로에 내부 정점(모서리)이 없다";
    b.notes["handfeel.cornerDeviationPx"] = why;
    b.notes["handfeel.cornerOvershootPx"] = why;
  }

  // 속도별 도포 일관성.
  const buckets = speedBucketCoverage(out, fixture.samples);
  if (buckets.coverage.length >= 2) {
    h.speedConsistencyCv = finiteOrNull(speedConsistency(buckets.coverage));
  } else {
    b.notes["handfeel.speedConsistencyCv"] = "속도 구간이 2개 미만이다(속도 변화가 없는 fixture)";
  }
}

function perfMetrics(input: BuildReportInput, b: MetricBuild): void {
  const { receipt } = input;
  const frames = input.frames ?? [];
  let elapsed = input.elapsedMs;
  if (elapsed === undefined) {
    elapsed = 0;
    for (const f of receipt.frameTimesMs) elapsed += f;
    b.notes["perf.elapsedMs:source"] = "elapsedMs 입력이 없어 프레임 시간 합을 썼다";
  }
  const summary = summarizePerf(perfSampleFromReceipts(receipt, frames, elapsed, input.memoryBytes ?? null));
  const p = b.metrics.perf;
  p.dabsPerSecond = finiteOrNull(summary.dabsPerSecond);
  p.frameCount = summary.frameCount;
  p.frameP50Ms = finiteOrNull(summary.frameP50Ms);
  p.frameP95Ms = finiteOrNull(summary.frameP95Ms);
  p.frameMaxMs = finiteOrNull(summary.frameMaxMs);
  p.elapsedMs = finiteOrNull(summary.elapsedMs);
  p.submitCount = summary.submitCount;
  p.gpuTimeMs = summary.gpuTimeMs;
  if (summary.gpuTimeMs === null) b.notes["perf.gpuTimeMs"] = `GPU 시간 측정 불가(timingSource=${receipt.timingSource})`;
  p.memoryBytes = summary.memoryBytes;
  if (summary.memoryBytes === null) b.notes["perf.memoryBytes"] = "메모리 사용량은 이 환경에서 측정하지 않는다(null 허용)";
  p.inputToSubmitP50Ms = summary.inputToSubmitP50Ms;
  p.inputToSubmitP95Ms = summary.inputToSubmitP95Ms;
  if (summary.inputToSubmitP50Ms === null) {
    const why = frames.length === 0 ? "프레임 영수증(frames)이 없다" : "프레임 영수증의 inputToSubmitMs가 모두 null이다";
    b.notes["perf.inputToSubmitP50Ms"] = why;
    b.notes["perf.inputToSubmitP95Ms"] = why;
  }
}

function familyMetrics(input: BuildReportInput, b: MetricBuild): void {
  const { out, program, fixture, receipt } = input;
  const values = computeFamilyMetrics(program.family, {
    out,
    fixture,
    program,
    receipt,
    ...(input.reference ? { ref: input.reference.image } : {}),
    linear: input.linear,
  });
  for (const [key, value] of Object.entries(values)) {
    const v = finiteOrNull(value);
    b.metrics.family[key] = v;
    if (v === null) b.notes[`family.${key}`] = "이 fixture·프리셋 조합에서 측정할 수 없다(압력 변화·잉크·테이퍼 부재 등)";
    if ((CPU_SYNTHETIC_FAMILY_KEYS as readonly string[]).includes(key)) {
      b.notes[`family.${key}:source`] = "CPU 참조 래스터로 합성 장면을 다시 렌더해 측정(레인 비의존)";
    }
  }
}

/** 지표 전부를 계산한다(리포트 조립 없이 지표·사유만 필요할 때). */
export function computeReportMetrics(input: BuildReportInput): MetricBuild {
  const b: MetricBuild = { metrics: emptyMetrics(), notes: {} };
  textureMetrics(input, b);
  renderMetrics(input, b);
  handfeelMetrics(input, b);
  perfMetrics(input, b);
  familyMetrics(input, b);
  return b;
}

export function thresholdContextOf(input: BuildReportInput): ThresholdContext {
  return {
    family: input.program.family,
    fixtureId: input.fixture.id,
    laneKind: input.lane.kind,
    hasReference: input.reference !== undefined,
    hasDeterminism: input.rerun !== undefined,
    hasPressureVariation: fixtureHasPressureVariation(input.fixture),
    hasHiRes: input.hiRes !== undefined,
    hasTaper: input.program.edge.taperStartPx > 0 || input.program.edge.taperEndPx > 0,
  };
}

/** 인증 리포트(스키마 검증 통과본). 입력 크기 불일치는 RangeError. */
export async function buildReport(input: BuildReportInput): Promise<BrushCertificationReport> {
  const { lane, fixture, program, out, receipt } = input;
  if (out.width !== fixture.width || out.height !== fixture.height) {
    throw new RangeError(
      `buildReport: image ${out.width}×${out.height} does not match fixture ${fixture.width}×${fixture.height}`,
    );
  }
  const built = computeReportMetrics(input);
  const thresholds = thresholdsFor(thresholdContextOf(input));
  const judgement = judge(flattenMetrics(built.metrics), thresholds);
  const [brushHash, sha] = await Promise.all([brushConfigHash(program), pixelSha256(out)]);
  const createdAt = new Date((input.wallClock ?? Date.now)()).toISOString();
  const report: BrushCertificationReport = {
    labSchemaVersion: "1.0.0",
    laneId: lane.id,
    laneKind: lane.kind,
    laneStatus: lane.status,
    engineVersion: lane.engineVersion,
    createdAt,
    environment: reportEnvironmentOf(input.env, input.capability),
    fixtureId: fixture.id,
    fixtureSeed: fixture.seed,
    seed: input.seed ?? 0,
    presetId: program.id,
    presetFamily: program.family,
    brushConfigHash: brushHash,
    canvas: { width: fixture.width, height: fixture.height, dpr: 1 },
    frameMs: input.frameMs ?? DEFAULT_FRAME_MS,
    sampleCount: fixture.samples.length,
    dabCount: receipt.dabCount,
    timingSource: receipt.timingSource,
    referenceLaneId: input.reference?.laneId ?? null,
    metrics: built.metrics,
    metricNotes: built.notes,
    thresholds,
    verdicts: judgement.verdicts,
    verdict: judgement.verdict,
    pixelHash: pixelHash(out),
    pixelSha256: sha,
  };
  return parseReport(report);
}
