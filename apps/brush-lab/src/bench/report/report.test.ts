import { describe, expect, it } from "vitest";

import { presetById } from "../../engine/presets/catalog";
import { CpuReferenceLane } from "../../lanes/cpu-reference-lane";
import { buildFixture } from "../fixtures/stroke-fixtures";
import { runFixture } from "../runner/run-fixture";
import { alphaFieldImage, fakeEnv, fakeReceipt } from "../testing/synthetic-images";

import { buildReport, computeReportMetrics, hasStrokeLatency, reportEnvironmentOf, thresholdContextOf } from "./build-report";
import { brushCertificationReportSchema, emptyMetrics, flattenMetrics, parseReport } from "./report-schema";
import {
  adler32,
  crc32,
  deserializeReport,
  inflateStored,
  labImageToPngBytes,
  pngBytesToLabImage,
  pngChunks,
  reportFileName,
  safeFileSegment,
  serializeReport,
  yyyymmddOf,
  zlibStored,
} from "./serialize";
import {
  compareWithOp,
  familyThresholdSpecs,
  GLOBAL_THRESHOLDS,
  judge,
  metricKeyOf,
  overallVerdict,
  thresholdsFor,
} from "./thresholds";

import type { BuildReportInput } from "./build-report";
import type { BrushCertificationReport } from "./report-schema";
import type { ThresholdContext } from "./thresholds";

const SIZE = 64;
const WALL = (): number => Date.UTC(2026, 9, 1, 12, 0, 0);

async function goldenInput(presetId = "pencil-hb", fixtureId: "line" | "slow-pressure-ramp" = "line"): Promise<BuildReportInput & { lane: CpuReferenceLane }> {
  const program = presetById(presetId);
  const fixture = buildFixture(fixtureId, { width: SIZE, height: SIZE });
  const lane = new CpuReferenceLane();
  const env = fakeEnv();
  const run = await runFixture({ lane, env, fixture, program, seed: 1, disposeLane: false });
  return {
    lane,
    fixture,
    program,
    out: run.image,
    linear: run.linear,
    receipt: run.receipt,
    env,
    clock: env.clock,
    frames: run.frames,
    capability: run.capability,
    seed: 1,
    elapsedMs: run.elapsedMs,
    wallClock: WALL,
  };
}

describe("인증 리포트 스키마·판정", () => {
  it("골든 리포트가 스키마를 통과하고 필수 필드·버전이 틀리면 거부된다", async () => {
    const input = await goldenInput();
    const report = await buildReport(input);
    input.lane.dispose();
    expect(report.labSchemaVersion).toBe("1.0.0");
    expect(report.laneId).toBe("cpu-reference");
    expect(report.createdAt).toBe("2026-10-01T12:00:00.000Z");
    expect(report.brushConfigHash).toHaveLength(64);
    expect(report.pixelHash).toHaveLength(16);
    expect(report.pixelSha256).toHaveLength(64);
    expect(report.environment.node).toBe(process.versions.node);
    expect(report.environment.userAgent).toBe("vitest/node");
    expect(report.canvas).toEqual({ width: SIZE, height: SIZE, dpr: 1 });
    expect(report.sampleCount).toBe(input.fixture.samples.length);
    expect(report.dabCount).toBe(input.receipt.dabCount);
    expect(parseReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
    expect(() => parseReport({ ...report, labSchemaVersion: "0.9.0" })).toThrow();
    const { pixelSha256: _dropped, ...missing } = report;
    expect(() => parseReport(missing)).toThrow();
    expect(() => parseReport({ ...report, laneId: "unknown-lane" })).toThrow();
    expect(() => parseReport({ ...report, verdict: "MAYBE" })).toThrow();
    expect(brushCertificationReportSchema.safeParse({ ...report, brushConfigHash: "short" }).success).toBe(false);
  });

  it("verdict 규칙: FAIL > UNAVAILABLE > PASS, null·비유한은 UNAVAILABLE", () => {
    const thresholds = { "a.x": { op: ">=" as const, threshold: 1 }, "b.y": { op: "<=" as const, threshold: 0.5 }, "c.z:max": { op: "<=" as const, threshold: 2 } };
    expect(judge({ "a.x": 1, "b.y": 0.2, "c.z": 1 }, thresholds).verdict).toBe("PASS");
    const unavailable = judge({ "a.x": 1, "b.y": null, "c.z": 1 }, thresholds);
    expect(unavailable.verdict).toBe("UNAVAILABLE");
    expect(unavailable.verdicts["b.y"]).toBe("UNAVAILABLE");
    const fail = judge({ "a.x": 0.5, "b.y": null, "c.z": Number.NaN }, thresholds);
    expect(fail.verdict).toBe("FAIL");
    expect(fail.verdicts).toEqual({ "a.x": "FAIL", "b.y": "UNAVAILABLE", "c.z:max": "UNAVAILABLE" });
    expect(overallVerdict(["PASS", "UNAVAILABLE"])).toBe("UNAVAILABLE");
    expect(overallVerdict(["PASS", "UNAVAILABLE", "FAIL"])).toBe("FAIL");
    expect(overallVerdict([])).toBe("PASS");
    expect(metricKeyOf("family.strandSeparation:max")).toBe("family.strandSeparation");
    expect(compareWithOp(1, ">=", 1)).toBe(true);
    expect(compareWithOp(1.1, "<=", 1)).toBe(false);
  });

  it("임계값 표는 fixture·레인 종류·전제 조건으로 걸러지고 가족 임계값은 :max 한정자를 붙인다", () => {
    const base: ThresholdContext = {
      family: "spray",
      fixtureId: "line",
      laneKind: "baseline",
      hasReference: false,
      hasDeterminism: false,
      hasPressureVariation: false,
      hasHiRes: false,
      hasTaper: false,
    };
    const t = thresholdsFor(base);
    expect(t["render.edgeStaircaseEnergy"]).toEqual({ op: "<=", threshold: 0.5 });
    expect(t["render.fuzzyMismatchPct"]).toBeUndefined();
    expect(t["handfeel.latencyP95Ms"]).toBeUndefined();
    expect(t["handfeel.pressureMonotonicity"]).toBeUndefined();
    expect(t["family.strandSeparation"]).toEqual({ op: ">=", threshold: 0.1 });
    expect(t["family.strandSeparation:max"]).toEqual({ op: "<=", threshold: 0.9 });
    const full = thresholdsFor({ ...base, family: "ink", fixtureId: "slow-pressure-ramp", laneKind: "candidate", hasReference: true, hasDeterminism: true, hasPressureVariation: true, hasHiRes: true, hasTaper: true });
    expect(full["render.fuzzyMismatchPct"]).toEqual({ op: "<=", threshold: 0.5 });
    expect(full["render.deltaEP99"]).toEqual({ op: "<=", threshold: 1 });
    expect(full["render.determinism"]).toEqual({ op: ">=", threshold: 1 });
    expect(full["handfeel.latencyP95Ms"]).toEqual({ op: "<=", threshold: 16.7 });
    expect(full["handfeel.pressureMonotonicity"]).toEqual({ op: ">=", threshold: 0.95 });
    expect(full["texture.resolutionConsistency"]).toBeDefined();
    expect(full["family.edgeTransitionWidthPx"]).toBeUndefined();
    expect(familyThresholdSpecs("spray").map((s) => s.id)).toEqual(["family.strandSeparation", "family.strandSeparation:max"]);
    expect(new Set(GLOBAL_THRESHOLDS.map((s) => s.id)).size).toBe(GLOBAL_THRESHOLDS.length);
  });

  it("flattenMetrics·emptyMetrics", () => {
    const flat = flattenMetrics(emptyMetrics());
    expect(flat["render.determinism"]).toBeNull();
    expect(flat["perf.frameCount"]).toBeNull();
    expect(Object.keys(flat).length).toBe(5 + 9 + 13 + 11);
  });
});

describe("buildReport", () => {
  it("참조·재실행·고해상도 입력으로 비교 지표가 채워지고 null 지표마다 사유가 있다", async () => {
    const input = await goldenInput("ink-g-pen", "slow-pressure-ramp");
    const rerun = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture: input.fixture, program: input.program, seed: 1 });
    const hiRes = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture: buildFixture("slow-pressure-ramp", { width: SIZE * 2, height: SIZE * 2 }), program: input.program, seed: 1 });
    const report = await buildReport({
      ...input,
      reference: { laneId: "cpu-reference", image: rerun.image, linear: rerun.linear },
      rerun: rerun.image,
      hiRes: hiRes.image,
    });
    input.lane.dispose();
    expect(report.referenceLaneId).toBe("cpu-reference");
    expect(report.metrics.render.coverageIoU).toBe(1);
    expect(report.metrics.render.deltaEP99).toBe(0);
    expect(report.metrics.render.fuzzyMismatchPct).toBe(0);
    expect(report.metrics.render.determinism).toBe(1);
    expect(report.metrics.texture.grainContrastPreservation).toBeCloseTo(1, 9);
    expect(report.metrics.texture.resolutionConsistency).not.toBeNull();
    expect(report.metrics.handfeel.pressureMonotonicity).not.toBeNull();
    expect(report.metrics.handfeel.latencyP95Ms).not.toBeNull();
    expect(report.metrics.handfeel.taperEndWidthRatio).not.toBeNull();
    expect(report.metrics.perf.frameCount).toBe(input.receipt.frameTimesMs.length);
    expect(report.metrics.perf.gpuTimeMs).toBeNull();
    expect(report.verdicts["render.determinism"]).toBe("PASS");
    expect(report.verdicts["render.fuzzyMismatchPct"]).toBe("PASS");
    expect(report.thresholds["handfeel.pressureMonotonicity"]).toBeDefined();
    expect(report.metrics.family).toHaveProperty("edgeTransitionWidthPx");
    for (const [key, value] of Object.entries(flattenMetrics(report.metrics))) {
      if (value === null) expect(report.metricNotes[key], key).toBeDefined();
    }
    expect(hasStrokeLatency(input.lane)).toBe(true);
    expect(report.verdict).toMatch(/^(PASS|FAIL|UNAVAILABLE)$/);
  });

  it("참조 없는 리포트는 비교 지표가 null이고 사유를 적으며 이미지 크기 불일치는 RangeError", async () => {
    const input = await goldenInput();
    const built = computeReportMetrics(input);
    expect(built.metrics.render.coverageIoU).toBeNull();
    expect(built.notes["render.coverageIoU"]).toContain("참조");
    expect(built.notes["render.determinism"]).toBeDefined();
    expect(built.metrics.perf.inputToSubmitP50Ms).not.toBeNull();
    const ctx = thresholdContextOf(input);
    expect(ctx.hasReference).toBe(false);
    expect(ctx.hasTaper).toBe(true);
    await expect(buildReport({ ...input, out: alphaFieldImage(8, 8, () => 1) })).rejects.toThrow(RangeError);
    input.lane.dispose();
    const env = reportEnvironmentOf({ clock: { now: () => 0 } }, undefined);
    expect(env.userAgent).toContain("node/");
    expect(env.adapterInfo).toBeNull();
    const withCap = reportEnvironmentOf({ clock: { now: () => 0 }, userAgent: "ua" }, { laneId: "cpu-reference", status: "supported", reasons: [], adapterInfo: { vendor: "v", architecture: "a", device: "d", description: "x" }, features: ["f"], limits: { l: 1 }, softwareRenderer: false });
    expect(withCap).toMatchObject({ userAgent: "ua", features: ["f"], limits: { l: 1 }, softwareRenderer: false });
  });

  it("elapsedMs가 없으면 프레임 합을 쓰고 영수증 timingSource가 리포트에 남는다", async () => {
    const input = await goldenInput();
    const { elapsedMs: _omit, frames: _frames, ...rest } = input;
    const report = await buildReport({ ...rest, receipt: fakeReceipt({ dabCount: input.receipt.dabCount, timingSource: "performance-now" }) });
    input.lane.dispose();
    expect(report.metrics.perf.elapsedMs).toBe(10);
    expect(report.metricNotes["perf.elapsedMs:source"]).toBeDefined();
    expect(report.timingSource).toBe("performance-now");
  });
});

describe("직렬화·파일명·PNG", () => {
  async function golden(): Promise<BrushCertificationReport> {
    const input = await goldenInput();
    const report = await buildReport(input);
    input.lane.dispose();
    return report;
  }

  it("serializeReport는 키를 정렬하고 두 번 직렬화해도 같은 문자열이며 왕복 파싱된다", async () => {
    const report = await golden();
    const text = serializeReport(report);
    expect(serializeReport(report)).toBe(text);
    expect(text.endsWith("\n")).toBe(true);
    const keys = Object.keys(JSON.parse(text) as Record<string, unknown>);
    expect(keys).toEqual([...keys].sort());
    expect(deserializeReport(text)).toEqual(report);
    const compact = serializeReport(report, { indent: 0 });
    expect(compact.includes("\n  ")).toBe(false);
    const shuffled = { ...report, verdict: report.verdict, laneId: report.laneId };
    expect(serializeReport(shuffled)).toBe(text);
  });

  it("reportFileName은 <presetId>-<laneId>-<YYYYMMDD>.json이고 안전하지 않은 문자는 _로 바꾼다", async () => {
    const report = await golden();
    expect(reportFileName(report)).toBe("pencil-hb-cpu-reference-20261001.json");
    expect(reportFileName({ ...report, presetId: "captured:live" })).toBe("captured_live-cpu-reference-20261001.json");
    expect(safeFileSegment("///")).toBe("unnamed");
    expect(yyyymmddOf("2026-10-01T23:59:59.000Z")).toBe("20261001");
    expect(() => yyyymmddOf("not-a-date")).toThrow(RangeError);
  });

  it("PNG 인코더: 시그니처·IHDR/IDAT/IEND·CRC·Adler-32·stored 블록 분할·픽셀 왕복", () => {
    const img = alphaFieldImage(200, 100, (x, y) => ((x + y) % 7) / 6);
    const png = labImageToPngBytes(img);
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks = pngChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    for (const c of chunks) expect(c.crcOk).toBe(true);
    const ihdr = chunks[0]?.data ?? new Uint8Array();
    expect(Array.from(ihdr.subarray(0, 8))).toEqual([0, 0, 0, 200, 0, 0, 0, 100]);
    expect(Array.from(ihdr.subarray(8, 13))).toEqual([8, 6, 0, 0, 0]);
    const idat = chunks[1]?.data ?? new Uint8Array();
    expect(idat[0]).toBe(0x78);
    expect(idat[1]).toBe(0x01);
    const raw = inflateStored(idat);
    expect(raw.length).toBe((200 * 4 + 1) * 100);
    expect(raw.length).toBeGreaterThan(65535);
    expect(pngBytesToLabImage(png)).toEqual(img);
    expect(labImageToPngBytes(img)).toEqual(png);
    expect(() => labImageToPngBytes({ width: 0, height: 1, data: new Uint8ClampedArray(0) })).toThrow(RangeError);
    expect(() => pngChunks(new Uint8Array(8))).toThrow(RangeError);
  });

  it("crc32·adler32·zlibStored 참조값", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(crc32(bytes)).toBe(0xcbf43926);
    expect(adler32(new TextEncoder().encode("Wikipedia"))).toBe(0x11e60398);
    expect(crc32(new Uint8Array(0))).toBe(0);
    const stream = zlibStored(bytes);
    expect(Array.from(stream.subarray(0, 7))).toEqual([0x78, 0x01, 0x01, 9, 0, 0xf6, 0xff]);
    expect(inflateStored(stream)).toEqual(bytes);
    const corrupted = Uint8Array.from(stream);
    corrupted[7] = 0;
    expect(() => inflateStored(corrupted)).toThrow(RangeError);
  });
});
