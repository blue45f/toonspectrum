import { describe, expect, it } from "vitest";

import { buildFixture, FIXTURE_IDS } from "../bench/fixtures/stroke-fixtures";
import { pixelHash } from "../bench/metrics/render-metrics";
import { runFixture } from "../bench/runner/run-fixture";
import { alphaSum, fakeEnv } from "../bench/testing/synthetic-images";
import { encodeLabImage } from "../engine/core/color";
import { InvalidStateError } from "../engine/core/errors";
import { presetById } from "../engine/presets/catalog";

import { CpuReferenceLane, createCpuReferenceLane } from "./cpu-reference-lane";

const SIZE = 128;
/** 스냅샷 대표 프리셋 4종(건식·잉크·마커·에어브러시). 습식은 느려서 runner·report 테스트에서만 다룬다. */
const SNAPSHOT_PRESETS = ["pencil-hb", "ink-g-pen", "marker-alcohol", "airbrush"] as const;

describe("cpu-reference 레인", () => {
  it("probe는 항상 supported이고 레지스트리 메타가 맞다", async () => {
    const lane = createCpuReferenceLane();
    const report = await lane.probe({ clock: { now: () => 0 } });
    expect(report).toMatchObject({ laneId: "cpu-reference", status: "supported", reasons: [] });
    expect(lane.kind).toBe("baseline");
    expect(lane.status).toBe("implemented");
    expect(lane.engineVersion.length).toBeGreaterThan(0);
  });

  it("9 fixture × 대표 프리셋 4종 픽셀 해시 스냅샷(결정성 기준선)", async () => {
    const hashes: Record<string, string> = {};
    for (const presetId of SNAPSHOT_PRESETS) {
      const program = presetById(presetId);
      for (const id of FIXTURE_IDS) {
        const fixture = buildFixture(id, { width: SIZE, height: SIZE });
        const run = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
        expect(run.receipt.overflowDabs).toBe(0);
        expect(alphaSum(run.image)).toBeGreaterThan(0);
        hashes[`${presetId}/${id}`] = pixelHash(run.image);
      }
    }
    expect(new Set(Object.values(hashes)).size).toBe(Object.keys(hashes).length);
    expect(hashes).toMatchSnapshot();
  }, 120000);

  it("같은 입력을 두 번 실행하면 픽셀·선형 버퍼가 같고 산포 프리셋은 시드가 다르면 다르다", async () => {
    const program = presetById("pencil-hb");
    const fixture = buildFixture("curve", { width: SIZE, height: SIZE });
    const a = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 7 });
    const b = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 7 });
    expect(pixelHash(a.image)).toBe(pixelHash(b.image));
    expect(a.linear).toEqual(b.linear);
    const spray = presetById("spray-splatter");
    const s7 = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program: spray, seed: 7 });
    const s8 = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program: spray, seed: 8 });
    expect(pixelHash(s7.image)).not.toBe(pixelHash(s8.image));
    expect(a.linear).not.toBeNull();
    expect(encodeLabImage(a.linear ?? new Float32Array(), SIZE, SIZE)).toEqual(a.image);
  });

  it("addSamples 분할 호출(프레임)과 일괄 호출의 결과가 같다(건식 프리셋)", async () => {
    const program = presetById("pencil-hb");
    const fixture = buildFixture("zigzag", { width: SIZE, height: SIZE });
    const split = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
    const lane = new CpuReferenceLane();
    await lane.init(fakeEnv(), { width: SIZE, height: SIZE, dpr: 1, tileSize: 16, seed: 1 });
    lane.beginStroke(program, 1);
    const receipt = lane.addSamples(fixture.samples);
    expect(receipt.frameIndex).toBe(0);
    expect(receipt.submitCount).toBe(1);
    expect(receipt.inputToSubmitMs).not.toBeNull();
    const end = await lane.endStroke();
    const bulk = await lane.readback();
    expect(pixelHash(bulk)).toBe(pixelHash(split.image));
    expect(end.dabCount).toBe(split.receipt.dabCount);
    expect(end.submitCount).toBe(2);
    expect(split.receipt.submitCount).toBe(split.frames.length + 1);
    expect(lane.strokeLatency().length).toBeGreaterThan(0);
    const stats = lane.stats();
    expect(stats.strokes).toBe(1);
    expect(stats.dabs).toBe(end.dabCount);
    expect(stats.lastReceipt).toEqual(end);
    lane.dispose();
  });

  it("두 번째 획은 같은 문서 위에 누적되고 dispose 후·init 전 호출은 InvalidStateError", async () => {
    const program = presetById("ink-g-pen");
    const line = buildFixture("line", { width: SIZE, height: SIZE });
    const curve = buildFixture("curve", { width: SIZE, height: SIZE });
    const lane = new CpuReferenceLane();
    expect(() => lane.beginStroke(program, 1)).toThrow(InvalidStateError);
    await lane.init(fakeEnv(), { width: SIZE, height: SIZE, dpr: 1, tileSize: 16, seed: 1 });
    expect(() => lane.addSamples(line.samples)).toThrow(InvalidStateError);
    lane.beginStroke(program, 1);
    expect(() => lane.beginStroke(program, 1)).toThrow(InvalidStateError);
    lane.addSamples(line.samples);
    await lane.endStroke();
    const first = alphaSum(await lane.readback());
    lane.beginStroke(program, 2);
    lane.addSamples(curve.samples);
    await lane.endStroke();
    const second = alphaSum(await lane.readback());
    expect(second).toBeGreaterThan(first);
    expect(lane.stats().strokes).toBe(2);
    expect(lane.currentSurface()).not.toBeNull();
    lane.dispose();
    expect(lane.currentSurface()).toBeNull();
    await expect(lane.readback()).rejects.toBeInstanceOf(InvalidStateError);
    await expect(lane.init(fakeEnv(), { width: 8, height: 8, dpr: 1, tileSize: 16, seed: 1 })).rejects.toBeInstanceOf(InvalidStateError);
    expect(() => lane.addSamples(line.samples)).toThrow(InvalidStateError);
  });

  it("습식 프리셋도 레인 계약대로 끝나며 영수증 타일 수가 양수다", async () => {
    const program = presetById("watercolor-wet");
    const fixture = buildFixture("fast-flick", { width: 64, height: 64 });
    const run = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
    expect(run.receipt.poolTilesUsed).toBeGreaterThan(0);
    expect(run.receipt.timingSource).toBe("unavailable");
    expect(run.receipt.gpuTimeMs).toBeNull();
    expect(alphaSum(run.image)).toBeGreaterThan(0);
  }, 60000);
});
