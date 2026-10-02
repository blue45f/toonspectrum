import { perfSampleFromReceipts, summarizePerf } from "../../bench/metrics/perf-metrics";
import { coverageIoU, fuzzyMismatchPct, pixelHash, pixelSha256 } from "../../bench/metrics/render-metrics";
import { brushCertificationReportSchema, emptyMetrics, flattenMetrics } from "../../bench/report/report-schema";
import { judge, thresholdsFor } from "../../bench/report/thresholds";
import { compareLanes } from "../../bench/runner/ab-compare";
import { runFixture } from "../../bench/runner/run-fixture";
import { canonicalJson, utf8Bytes } from "../../engine/core/hash";
import { brushConfigHash } from "../../engine/presets/program-schema";

import type { BrushCertificationReport } from "../../bench/report/report-schema";
import type { LabImage } from "../../engine/core/types";
import type { BenchRunner, BuildReportInput } from "../state/bench-runner";

/**
 * 테스트용 bench 러너. `runFixture`·`compareLanes`는 실제 bench 구현을 쓰고,
 * 리포트 생성·직렬화·PNG 인코딩만 UI 계약(스펙 §16)에 맞춘 단순 구현으로 대체한다.
 * 리포트는 `brushCertificationReportSchema`로 검증해 돌려주므로 UI가 스키마 유효 JSON을 다루는지 확인할 수 있다.
 */

/** PNG 시그니처 8바이트 + 폭·높이 + 픽셀 바이트. 실제 디코딩 가능한 PNG가 아닌 테스트 스텁이다. */
export const MOCK_PNG_SIGNATURE: readonly number[] = [137, 80, 78, 71, 13, 10, 26, 10];

export function mockLabImageToPngBytes(img: LabImage): Uint8Array {
  const out = new Uint8Array(MOCK_PNG_SIGNATURE.length + 8 + img.data.byteLength);
  out.set(MOCK_PNG_SIGNATURE, 0);
  const view = new DataView(out.buffer);
  view.setUint32(8, img.width, false);
  view.setUint32(12, img.height, false);
  out.set(img.data, 16);
  return out;
}

export function mockReportFileName(report: BrushCertificationReport): string {
  const stamp = report.createdAt.slice(0, 10).replace(/-/gu, "");
  return `${report.presetId}-${report.laneId}-${stamp}.json`;
}

export function mockSerializeReport(report: BrushCertificationReport): string {
  return canonicalJson(report);
}

/** 스키마 유효 리포트. 지표는 perf·결정성(rerun)·참조 비교(reference)만 채우고 나머지는 null(사유 기록)로 둔다. */
export async function mockBuildReport(input: BuildReportInput): Promise<BrushCertificationReport> {
  const { lane, fixture, program, out, receipt, env } = input;
  const metrics = emptyMetrics();
  const perf = summarizePerf(perfSampleFromReceipts(receipt, input.frames ?? [], input.elapsedMs ?? Math.max(1, receipt.frameTimesMs.length)));
  metrics.perf.dabsPerSecond = perf.dabsPerSecond;
  metrics.perf.frameCount = perf.frameCount;
  metrics.perf.frameP50Ms = perf.frameP50Ms;
  metrics.perf.frameP95Ms = perf.frameP95Ms;
  metrics.perf.frameMaxMs = perf.frameMaxMs;
  metrics.perf.elapsedMs = perf.elapsedMs;
  metrics.perf.submitCount = perf.submitCount;
  metrics.perf.gpuTimeMs = perf.gpuTimeMs;
  metrics.perf.inputToSubmitP50Ms = perf.inputToSubmitP50Ms;
  metrics.perf.inputToSubmitP95Ms = perf.inputToSubmitP95Ms;
  if (input.rerun) metrics.render.determinism = pixelHash(input.rerun) === pixelHash(out) ? 1 : 0;
  if (input.reference) {
    metrics.render.coverageIoU = coverageIoU(out, input.reference.image);
    metrics.render.fuzzyMismatchPct = fuzzyMismatchPct(out.data, input.reference.image.data, out.width, out.height);
  }
  const thresholds = thresholdsFor({
    family: program.family,
    fixtureId: fixture.id,
    laneKind: lane.kind,
    hasReference: input.reference !== undefined,
    hasDeterminism: input.rerun !== undefined,
    hasPressureVariation: false,
    hasHiRes: false,
    hasTaper: false,
  });
  const { verdicts, verdict } = judge(flattenMetrics(metrics), thresholds);
  const createdAt = new Date(Math.max(0, Math.floor(input.clock.now()))).toISOString();
  const report = {
    labSchemaVersion: "1.0.0",
    laneId: lane.id,
    laneKind: lane.kind,
    laneStatus: lane.status,
    engineVersion: lane.engineVersion,
    createdAt,
    environment: {
      userAgent: env.userAgent ?? "unknown",
      adapterInfo: input.capability?.adapterInfo ?? null,
      features: input.capability ? [...input.capability.features] : [],
      limits: input.capability ? { ...input.capability.limits } : {},
      softwareRenderer: input.capability?.softwareRenderer ?? null,
      node: null,
    },
    fixtureId: fixture.id,
    fixtureSeed: fixture.seed,
    seed: input.seed ?? 0,
    presetId: program.id,
    presetFamily: program.family,
    brushConfigHash: await brushConfigHash(program),
    canvas: { width: out.width, height: out.height, dpr: 1 },
    frameMs: input.frameMs ?? 1000 / 60,
    sampleCount: fixture.samples.length,
    dabCount: receipt.dabCount,
    timingSource: receipt.timingSource,
    referenceLaneId: input.reference?.laneId ?? null,
    metrics,
    metricNotes: { "texture.grainContrastPreservation": "모의 러너는 질감 지표를 계산하지 않는다" },
    thresholds,
    verdicts,
    verdict,
    pixelHash: pixelHash(out),
    pixelSha256: await pixelSha256(out),
  };
  return brushCertificationReportSchema.parse(report);
}

export interface MockRunnerOptions {
  /** 설정 시 buildReport가 이 오류를 던진다(오류 경로 테스트). */
  failBuildReport?: Error;
}

export function createMockRunner(opts: MockRunnerOptions = {}): BenchRunner {
  return {
    runFixture,
    compareLanes,
    buildReport: (input) => {
      if (opts.failBuildReport) return Promise.reject(opts.failBuildReport);
      return mockBuildReport(input);
    },
    serializeReport: mockSerializeReport,
    reportFileName: mockReportFileName,
    labImageToPngBytes: mockLabImageToPngBytes,
  };
}

/** JSON 문자열 → 바이트 길이(테스트의 Blob 크기 검사용). */
export function jsonByteLength(json: string): number {
  return utf8Bytes(json).byteLength;
}
