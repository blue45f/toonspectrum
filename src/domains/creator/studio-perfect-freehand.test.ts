import { beforeAll, describe, expect, it } from "vitest";

import {
  buildStudioPerfectFreehandOutline,
  buildStudioPerfectFreehandPathData,
  loadStudioPerfectFreehandStroker,
  peekStudioPerfectFreehandStroker,
  resolveStudioPerfectFreehandProfile,
  STUDIO_PERFECT_FREEHAND_PROFILES,
  studioPerfectFreehandOutlineToPathData,
  studioPerfectFreehandStrokeOptions,
  type StudioPerfectFreehandStroker,
} from "./studio-perfect-freehand";

// 로더 상태는 모듈 전역이므로, 로드 전 peek 검증이 항상 첫 테스트로 실행돼야 한다.
describe("loadStudioPerfectFreehandStroker / peekStudioPerfectFreehandStroker", () => {
  it("로드 전에는 null, 로드 후에는 같은 함수를 캐시한다", async () => {
    expect(peekStudioPerfectFreehandStroker()).toBeNull();
    const stroker = await loadStudioPerfectFreehandStroker();
    expect(typeof stroker).toBe("function");
    expect(peekStudioPerfectFreehandStroker()).toBe(stroker);
    await expect(loadStudioPerfectFreehandStroker()).resolves.toBe(stroker);
  });
});

describe("resolveStudioPerfectFreehandProfile", () => {
  it("퍼펙트 브러시 id에만 프로필을 반환한다(그 외 렌더러는 기존 경로 유지)", () => {
    expect(resolveStudioPerfectFreehandProfile("perfect-ink")).toBe(
      STUDIO_PERFECT_FREEHAND_PROFILES["perfect-ink"]
    );
    expect(resolveStudioPerfectFreehandProfile("perfect-marker")).toBe(
      STUDIO_PERFECT_FREEHAND_PROFILES["perfect-marker"]
    );
    expect(resolveStudioPerfectFreehandProfile("pen")).toBeNull();
    expect(resolveStudioPerfectFreehandProfile("calligraphy")).toBeNull();
    expect(resolveStudioPerfectFreehandProfile("")).toBeNull();
    expect(resolveStudioPerfectFreehandProfile(null)).toBeNull();
    expect(resolveStudioPerfectFreehandProfile(42)).toBeNull();
  });

  it("잉크는 테이퍼·강한 thinning, 마커는 캡 마감·약한 thinning으로 서로 다른 실행 프로필이다", () => {
    const ink = STUDIO_PERFECT_FREEHAND_PROFILES["perfect-ink"];
    const marker = STUDIO_PERFECT_FREEHAND_PROFILES["perfect-marker"];
    expect(ink.taperStartFactor).toBeGreaterThan(0);
    expect(ink.taperEndFactor).toBeGreaterThan(0);
    expect(marker.taperStartFactor).toBe(0);
    expect(marker.taperEndFactor).toBe(0);
    expect(ink.thinning).toBeGreaterThan(marker.thinning);
  });
});

describe("studioPerfectFreehandStrokeOptions", () => {
  it("굵기를 size로 클램프하고 필압 배열이 없을 때만 속도 시뮬레이션을 켠다", () => {
    const profile = STUDIO_PERFECT_FREEHAND_PROFILES["perfect-ink"];
    const withPressure = studioPerfectFreehandStrokeOptions(profile, 12, true);
    expect(withPressure.size).toBe(12);
    expect(withPressure.simulatePressure).toBe(false);
    expect(withPressure.last).toBe(true);
    expect(withPressure.start?.taper).toBe(12 * profile.taperStartFactor);
    expect(withPressure.end?.taper).toBe(12 * profile.taperEndFactor);

    const simulated = studioPerfectFreehandStrokeOptions(profile, Number.NaN, false);
    expect(simulated.size).toBe(6);
    expect(simulated.simulatePressure).toBe(true);
    expect(studioPerfectFreehandStrokeOptions(profile, 100_000, true).size).toBe(400);
  });

  it("짧거나 무효한 segmentLength에서는 양끝 테이퍼를 비활성화한다", () => {
    const profile = STUDIO_PERFECT_FREEHAND_PROFILES["perfect-ink"];
    expect(studioPerfectFreehandStrokeOptions(profile, 12, true, 3).start?.taper).toBe(0);
    expect(studioPerfectFreehandStrokeOptions(profile, 12, true, 12).end?.taper).toBe(0);
    expect(studioPerfectFreehandStrokeOptions(profile, 12, true, Number.NaN).start?.taper).toBe(0);
    expect(studioPerfectFreehandStrokeOptions(profile, 12, true, Number.POSITIVE_INFINITY).end?.taper).toBe(0);

    const long = studioPerfectFreehandStrokeOptions(profile, 12, true, 40);
    expect(long.start?.taper).toBe(12 * profile.taperStartFactor);
    expect(long.end?.taper).toBe(12 * profile.taperEndFactor);
  });
});

describe("studioPerfectFreehandOutlineToPathData", () => {
  it("아웃라인 폴리곤을 M/Q 중점 곡선 체인 + Z로 직렬화한다", () => {
    const d = studioPerfectFreehandOutlineToPathData([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(d.startsWith("M0 0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("Q10 0 10 5");
    // 마지막 세그먼트는 첫 정점으로 되감아 폴리곤을 닫는다.
    expect(d).toContain("Q0 10 0 5");
  });

  it("정점 3개 미만·비유한 좌표는 빈 문자열(렌더러 폴백)", () => {
    expect(studioPerfectFreehandOutlineToPathData([])).toBe("");
    expect(studioPerfectFreehandOutlineToPathData([[0, 0], [1, 1]])).toBe("");
    expect(
      studioPerfectFreehandOutlineToPathData([[0, 0], [Number.NaN, 1], [2, 2]])
    ).toBe("");
    expect(
      studioPerfectFreehandOutlineToPathData([[0, 0], [Infinity, 1], [2, 2]])
    ).toBe("");
    expect(studioPerfectFreehandOutlineToPathData([[0, 0], [1], [2, 2]])).toBe("");
  });

  it("좌표를 소수 둘째 자리로 반올림해 결정적으로 직렬화한다", () => {
    const d = studioPerfectFreehandOutlineToPathData([
      [0.005, 1.114],
      [2.006, 3.339],
      [4.001, 5.008],
    ]);
    expect(d).toContain("M0.01 1.11");
    expect(d).not.toMatch(/\d\.\d{3,}/);
  });
});

describe("buildStudioPerfectFreehandOutline / PathData (실제 getStroke 주입)", () => {
  const inkProfile = STUDIO_PERFECT_FREEHAND_PROFILES["perfect-ink"];
  const markerProfile = STUDIO_PERFECT_FREEHAND_PROFILES["perfect-marker"];
  // 수평 직선 — 아웃라인 굵기(y 범위) 측정이 쉬운 기준 지오메트리.
  const linePoints = Array.from({ length: 21 }, (_, i) => [i * 5, 50]).flat();
  let stroker: StudioPerfectFreehandStroker;

  beforeAll(async () => {
    stroker = await loadStudioPerfectFreehandStroker();
  });

  function outlineHalfWidthInWindow(
    outline: number[][],
    minX: number,
    maxX: number
  ): number {
    let widest = 0;
    for (const [x, y] of outline) {
      if (x! >= minX && x! <= maxX) widest = Math.max(widest, Math.abs(y! - 50));
    }
    return widest;
  }

  it("같은 입력은 항상 같은 패스 문자열을 만든다(협업 복제본·재렌더 결정성)", () => {
    const input = {
      points: linePoints,
      pressures: [0.2, 0.5, 0.9, 0.4, 0.7],
      strokeWidth: 12,
      profile: inkProfile,
    };
    const first = buildStudioPerfectFreehandPathData(stroker, input);
    const second = buildStudioPerfectFreehandPathData(stroker, input);
    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
    // 필압 배열이 없어도(속도 시뮬레이션) 여전히 결정적이다.
    const simulated = { ...input, pressures: null };
    expect(buildStudioPerfectFreehandPathData(stroker, simulated)).toBe(
      buildStudioPerfectFreehandPathData(stroker, simulated)
    );
  });

  it("두 브러시 프로필은 같은 획에서 서로 다른 패스를 만든다(중복 렌더러 감사 지원)", () => {
    const base = { points: linePoints, pressures: [0.6], strokeWidth: 12 };
    expect(
      buildStudioPerfectFreehandPathData(stroker, { ...base, profile: inkProfile })
    ).not.toBe(
      buildStudioPerfectFreehandPathData(stroker, { ...base, profile: markerProfile })
    );
  });

  it("필압이 높을수록 아웃라인이 굵어진다(thinning 단조성)", () => {
    const light = buildStudioPerfectFreehandOutline(stroker, {
      points: linePoints,
      pressures: Array(21).fill(0.2),
      strokeWidth: 12,
      profile: inkProfile,
    });
    const heavy = buildStudioPerfectFreehandOutline(stroker, {
      points: linePoints,
      pressures: Array(21).fill(0.9),
      strokeWidth: 12,
      profile: inkProfile,
    });
    const lightWidth = outlineHalfWidthInWindow(light, 40, 60);
    const heavyWidth = outlineHalfWidthInWindow(heavy, 40, 60);
    expect(lightWidth).toBeGreaterThan(0);
    expect(heavyWidth).toBeGreaterThan(lightWidth);
  });

  it("잉크 프로필은 양끝 테이퍼로 끝이 중앙보다 가늘다(마커 프로필은 균일에 가깝다)", () => {
    const constantPressure = Array(21).fill(0.7);
    const ink = buildStudioPerfectFreehandOutline(stroker, {
      points: linePoints,
      pressures: constantPressure,
      strokeWidth: 12,
      profile: inkProfile,
    });
    const inkStart = outlineHalfWidthInWindow(ink, 0, 10);
    const inkMiddle = outlineHalfWidthInWindow(ink, 45, 55);
    expect(inkMiddle).toBeGreaterThan(0);
    expect(inkStart).toBeLessThan(inkMiddle * 0.8);

    const marker = buildStudioPerfectFreehandOutline(stroker, {
      points: linePoints,
      pressures: constantPressure,
      strokeWidth: 12,
      profile: markerProfile,
    });
    const markerStart = outlineHalfWidthInWindow(marker, 0, 10);
    const markerMiddle = outlineHalfWidthInWindow(marker, 45, 55);
    expect(markerStart).toBeGreaterThan(markerMiddle * 0.6);
  });

  it("생성된 패스는 유효한 M/Q…Z 명령과 유한 좌표만 담는다", () => {
    const d = buildStudioPerfectFreehandPathData(stroker, {
      points: linePoints,
      pressures: [0.4, 0.8],
      strokeWidth: 9,
      profile: inkProfile,
    });
    expect(d).toMatch(/^M-?\d/);
    expect(d).toContain("Q");
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toMatch(/^[MQZ0-9 .-]+$/);
    for (const token of d.match(/-?\d+(?:\.\d+)?/g) ?? []) {
      expect(Number.isFinite(Number(token))).toBe(true);
    }
  });

  it("유효한 점이 2개 미만이거나 비유한 좌표뿐이면 빈 결과로 폴백을 알린다", () => {
    const base = { pressures: null, strokeWidth: 9, profile: inkProfile };
    expect(buildStudioPerfectFreehandOutline(stroker, { ...base, points: [] })).toEqual([]);
    expect(
      buildStudioPerfectFreehandOutline(stroker, { ...base, points: [5, 5] })
    ).toEqual([]);
    expect(
      buildStudioPerfectFreehandOutline(stroker, {
        ...base,
        points: [Number.NaN, Number.NaN, 0, 0],
      })
    ).toEqual([]);
    expect(
      buildStudioPerfectFreehandPathData(stroker, { ...base, points: [5, 5] })
    ).toBe("");
  });

  it("필압 배열 길이가 달라도 점 개수에 맞춰 재표본한다", () => {
    const twoSamples = buildStudioPerfectFreehandPathData(stroker, {
      points: linePoints,
      pressures: [0.2, 0.9],
      strokeWidth: 12,
      profile: inkProfile,
    });
    expect(twoSamples.length).toBeGreaterThan(0);
    const nanSamples = buildStudioPerfectFreehandPathData(stroker, {
      points: linePoints,
      pressures: [Number.NaN, Number.NaN],
      strokeWidth: 12,
      profile: inkProfile,
    });
    expect(nanSamples.length).toBeGreaterThan(0);
  });

  it("짧은 두 점 획에서도 테이퍼 비활성 상태로 안정적인 바운딩 박스를 만든다", () => {
    const shortStroke = buildStudioPerfectFreehandOutline(stroker, {
      points: [20, 20, 27, 27],
      pressures: [0.5, 0.5],
      strokeWidth: 9,
      profile: STUDIO_PERFECT_FREEHAND_PROFILES["perfect-ink"],
    });
    const xs = shortStroke.flatMap((point) => point[0] ?? []);
    const ys = shortStroke.flatMap((point) => point[1] ?? []);
    expect(shortStroke.length).toBeGreaterThan(0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
    const shortPath = buildStudioPerfectFreehandPathData(stroker, {
      points: [20, 20, 27, 27],
      pressures: [0.5, 0.5],
      strokeWidth: 9,
      profile: STUDIO_PERFECT_FREEHAND_PROFILES["perfect-ink"],
    });
    expect(shortPath).toContain("Q");
    expect(shortPath).toContain("Z");
  });
});
