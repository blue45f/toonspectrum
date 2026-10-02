import { describe, expect, it } from "vitest";

import { assertCanvasSize, CANVAS_PRESET_IDS, CANVAS_PRESETS, DEFAULT_CANVAS } from "./canvas-presets";
import {
  capturedStrokeToFixture,
  parseCapturedStroke,
  parseStrokeFixture,
  serializeCapturedStroke,
  serializeFixture,
  strokeFixtureSchema,
} from "./fixture-schema";
import {
  buildAllFixtures,
  buildFixture,
  FIXTURE_IDS,
  fixtureDescription,
  fixtureHasPressureVariation,
  isFixtureId,
  PRESSURE_FLOOR,
  PRESSURE_VARIATION_MIN_RANGE,
} from "./stroke-fixtures";

import type { CapturedStroke } from "./fixture-schema";

const CANVAS = { width: 256, height: 256 };

describe("획 fixture 9종", () => {
  it("9종 id가 모두 다르고 설명이 있다", () => {
    expect(FIXTURE_IDS.length).toBe(9);
    expect(new Set(FIXTURE_IDS).size).toBe(9);
    for (const id of FIXTURE_IDS) {
      expect(fixtureDescription(id).length).toBeGreaterThan(0);
      expect(isFixtureId(id)).toBe(true);
    }
    expect(isFixtureId("nope")).toBe(false);
  });

  it("샘플 수·tMs 단조·압력 범위·phase 순서(down…up)·좌표 범위를 만족한다", () => {
    for (const fixture of buildAllFixtures(CANVAS)) {
      const n = fixture.samples.length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(fixture.samples[0]?.phase).toBe("down");
      expect(fixture.samples[n - 1]?.phase).toBe("up");
      for (let i = 0; i < n; i += 1) {
        const s = fixture.samples[i];
        if (!s) throw new Error("missing sample");
        if (i > 0 && i < n - 1) expect(s.phase).toBe("move");
        if (i > 0) expect(s.tMs).toBeGreaterThan(fixture.samples[i - 1]?.tMs ?? -1);
        expect(s.pressure).toBeGreaterThanOrEqual(PRESSURE_FLOOR);
        expect(s.pressure).toBeLessThanOrEqual(1);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(CANVAS.width);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(CANVAS.height);
        expect(Math.abs(s.tiltXDeg)).toBeLessThanOrEqual(90);
        expect(Math.abs(s.tiltYDeg)).toBeLessThanOrEqual(90);
        expect(s.twistDeg).toBeGreaterThanOrEqual(0);
        expect(s.twistDeg).toBeLessThanOrEqual(359);
        expect(s.source).toBe("raw");
        expect(s.pointerType).toBe("pen");
      }
      expect(() => strokeFixtureSchema.parse(fixture)).not.toThrow();
    }
  });

  it("같은 (id, canvas)면 두 번 생성해도 deep-equal이고 캔버스가 다르면 좌표만 스케일된다", () => {
    for (const id of FIXTURE_IDS) {
      expect(buildFixture(id, CANVAS)).toEqual(buildFixture(id, CANVAS));
    }
    const small = buildFixture("line", { width: 128, height: 128 });
    const large = buildFixture("line", { width: 256, height: 256 });
    expect(small.samples.length).toBe(large.samples.length);
    expect((large.samples[10]?.x ?? 0) / (small.samples[10]?.x ?? 1)).toBeCloseTo(2, 6);
    expect(large.samples[10]?.tMs).toBe(small.samples[10]?.tMs);
  });

  it("프로파일별 특성: 시간·표본율·의도 경로·압력 모양", () => {
    const flick = buildFixture("fast-flick", CANVAS);
    const flickEnd = flick.samples[flick.samples.length - 1]?.tMs ?? 0;
    expect(flickEnd).toBeLessThanOrEqual(80);
    expect(flickEnd).toBeGreaterThan(80 - 1000 / 240);
    expect(flick.samples.length).toBe(20);
    expect(flick.sampleRateHz).toBe(240);
    const ramp = buildFixture("slow-pressure-ramp", CANVAS);
    const mid = ramp.samples[Math.floor(ramp.samples.length / 2)];
    expect(mid?.pressure).toBeCloseTo(1, 2);
    expect(ramp.samples[0]?.pressure).toBe(PRESSURE_FLOOR);
    const corner = buildFixture("corner-square", CANVAS);
    expect(corner.intendedPath?.length).toBe(4);
    expect(corner.intendedPath?.[0]).toEqual([64, 64]);
    const tilt = buildFixture("tilt-sweep", CANVAS);
    expect(tilt.samples[0]?.tiltXDeg).toBeCloseTo(-55, 6);
    expect(tilt.samples[tilt.samples.length - 1]?.tiltXDeg).toBeCloseTo(55, 6);
    expect(tilt.samples[tilt.samples.length - 1]?.twistDeg).toBe(180);
    const tremor = buildFixture("tremor", CANVAS);
    expect(tremor.samples.length).toBe(901);
    const offLine = tremor.samples.filter((s) => Math.abs(s.y - 128) > 0.5).length;
    expect(offLine).toBeGreaterThan(100);
    expect(buildFixture("spiral", CANVAS).intendedPath).toBeUndefined();
  });

  it("압력 변화 판정: 램프·소용돌이·곡선은 참, 직선·지그재그·tremor는 거짓", () => {
    expect(PRESSURE_VARIATION_MIN_RANGE).toBe(0.25);
    expect(fixtureHasPressureVariation(buildFixture("slow-pressure-ramp", CANVAS))).toBe(true);
    expect(fixtureHasPressureVariation(buildFixture("spiral", CANVAS))).toBe(true);
    expect(fixtureHasPressureVariation(buildFixture("curve", CANVAS))).toBe(true);
    expect(fixtureHasPressureVariation(buildFixture("fast-flick", CANVAS))).toBe(true);
    expect(fixtureHasPressureVariation(buildFixture("line", CANVAS))).toBe(false);
    expect(fixtureHasPressureVariation(buildFixture("zigzag", CANVAS))).toBe(false);
    expect(fixtureHasPressureVariation(buildFixture("tremor", CANVAS))).toBe(false);
  });

  it("스키마 왕복: serializeFixture → parseStrokeFixture가 deep-equal이고 결정적이다", () => {
    const fixture = buildFixture("curve", CANVAS);
    const text = serializeFixture(fixture);
    expect(serializeFixture(buildFixture("curve", CANVAS))).toBe(text);
    expect(parseStrokeFixture(JSON.parse(text))).toEqual(fixture);
    expect(() => parseStrokeFixture({ ...fixture, samples: [] })).toThrow();
    expect(() => parseStrokeFixture({ ...fixture, width: 0 })).toThrow();
  });

  it("캡처 획 스키마: 버전 불일치 거부, fixture 변환 시 표본율은 중앙 간격으로 추정한다", () => {
    const base = buildFixture("line", CANVAS);
    const captured: CapturedStroke = {
      version: "1.0.0",
      userAgent: "test",
      pointerType: "pen",
      width: 256,
      height: 256,
      capturedAt: "2026-10-01",
      samples: base.samples.map((s, i) => ({ ...s, tMs: i * 8 })),
    };
    expect(parseCapturedStroke(JSON.parse(serializeCapturedStroke(captured)))).toEqual(captured);
    expect(() => parseCapturedStroke({ ...captured, version: "0.9.0" })).toThrow();
    const fixture = capturedStrokeToFixture(captured, "live");
    expect(fixture.id).toBe("captured:live");
    expect(fixture.sampleRateHz).toBeCloseTo(125, 6);
    expect(fixture.samples.length).toBe(captured.samples.length);
    expect(fixture.samples[0]).not.toBe(captured.samples[0]);
  });

  it("캔버스 프리셋: small/medium/large, dpr 1, 크기 검증", () => {
    expect(CANVAS_PRESET_IDS).toEqual(["small", "medium", "large"]);
    expect(CANVAS_PRESETS.small.width).toBe(256);
    expect(CANVAS_PRESETS.large.height).toBe(1024);
    expect(DEFAULT_CANVAS).toBe(CANVAS_PRESETS.medium);
    expect(() => assertCanvasSize({ width: 0, height: 10 })).toThrow(RangeError);
    expect(() => assertCanvasSize({ width: 10.5, height: 10 })).toThrow(RangeError);
    expect(() => assertCanvasSize(CANVAS)).not.toThrow();
  });
});
