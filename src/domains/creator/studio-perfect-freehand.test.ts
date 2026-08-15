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

describe("loadStudioPerfectFreehandStroker / peekStudioPerfectFreehandStroker", () => {
  it("첫 동기 프레임부터 준비된 같은 스트로커를 반환한다", async () => {
    const peeked = peekStudioPerfectFreehandStroker();
    expect(typeof peeked).toBe("function");
    const stroker = await loadStudioPerfectFreehandStroker();
    expect(stroker).toBe(peeked);
    expect(peekStudioPerfectFreehandStroker()).toBe(stroker);
    await expect(loadStudioPerfectFreehandStroker()).resolves.toBe(stroker);
  });
});

describe("resolveStudioPerfectFreehandProfile", () => {
  it("퍼펙트 브러시와 네 가지 만화 펜을 연속 아웃라인 프로필로 해석한다", () => {
    expect(resolveStudioPerfectFreehandProfile("perfect-ink")).toBe(
      STUDIO_PERFECT_FREEHAND_PROFILES["perfect-ink"]
    );
    expect(resolveStudioPerfectFreehandProfile("perfect-marker")).toBe(
      STUDIO_PERFECT_FREEHAND_PROFILES["perfect-marker"]
    );
    for (const brushId of ["gpen", "mapping-pen", "kaburapen", "liner"]) {
      expect(resolveStudioPerfectFreehandProfile(brushId)).toBe(
        STUDIO_PERFECT_FREEHAND_PROFILES.gpen
      );
    }
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

  it("G펜 프로필은 기존 0.22 + 1.55p 폭 곡선을 연속 outline thinning으로 보존한다", () => {
    const gpen = STUDIO_PERFECT_FREEHAND_PROFILES.gpen;
    const perfectFreehandDiameterFactor = (pressure: number) =>
      1 + 2 * gpen.thinning * (pressure - 0.5);
    for (const pressure of [0, 0.1, 0.5, 0.9, 1]) {
      expect(perfectFreehandDiameterFactor(pressure)).toBeCloseTo(
        0.225 + pressure * 1.55,
        10
      );
    }
    expect(gpen.smoothing).toBeGreaterThan(0.6);
    expect(gpen.streamline).toBeLessThan(0.3);
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
  const gpenProfile = STUDIO_PERFECT_FREEHAND_PROFILES.gpen;
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

  it("G펜 급커브도 독립 캡슐 묶음이 아닌 하나의 닫힌 이차곡선 윤곽으로 만든다", () => {
    const arcPoints = Array.from({ length: 25 }, (_, index) => {
      const angle = Math.PI * 0.12 + (Math.PI * 1.35 * index) / 24;
      return [90 + Math.cos(angle) * 58, 90 + Math.sin(angle) * 58];
    }).flat();
    const path = buildStudioPerfectFreehandPathData(stroker, {
      points: arcPoints,
      pressures: Array(25).fill(0.68),
      strokeWidth: 11,
      profile: gpenProfile,
    });

    expect(path.match(/M/g)).toHaveLength(1);
    expect(path.match(/Q/g)?.length).toBeGreaterThan(12);
    expect(path.match(/Z/g)).toHaveLength(1);
    expect(path).not.toContain(" L");
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

  it("끝점이 시작점 근처로 돌아오는 긴 G펜도 누적 경로 길이로 테이퍼를 유지한다", () => {
    let receivedStartTaper: boolean | number | undefined;
    let receivedEndTaper: boolean | number | undefined;
    const captureOptions: StudioPerfectFreehandStroker = (_points, options) => {
      receivedStartTaper = options?.start?.taper;
      receivedEndTaper = options?.end?.taper;
      return [[0, 0], [2, 0], [1, 2]];
    };

    buildStudioPerfectFreehandOutline(captureOptions, {
      // 시작↔끝 chord는 1.4px뿐이지만 실제 C/loop 경로는 120px를 넘는다.
      points: [0, 0, 40, 0, 40, 40, 0, 40, 1, 1],
      pressures: Array(5).fill(0.6),
      strokeWidth: 12,
      profile: gpenProfile,
    });

    expect(receivedStartTaper).toBe(12 * gpenProfile.taperStartFactor);
    expect(receivedEndTaper).toBe(12 * gpenProfile.taperEndFactor);
  });
});

/**
 * 카탈로그가 "perfect-outline" 엔진이라고 선언한 레인은 실제로 그 엔진으로 그려져야 한다.
 *
 * 이 게이트가 없던 동안 pen--perfect-taper 와 calligraphy--perfect-chisel 이 조용히 빠져 있었다.
 * resolveStudioPerfectFreehandProfile 이 null 을 돌려주면 렌더러는 가변 폭 아웃라인 분기를 아예
 * 타지 않고 균일 굵기 폴리라인으로 떨어지는데, 선언과 다르다는 신호가 어디에도 없어서 두
 * 브러시는 테이퍼 없는 뭉툭한 시작·끝으로 출하돼 있었다. 브러시 id 를 여기 하드코딩하는 대신
 * 카탈로그를 원본으로 삼아, 앞으로 추가되는 레인도 같은 방식으로 빠지지 않게 한다.
 */
describe("perfect-outline 레인 계약", () => {
  it("perfect-outline 로 선언된 모든 레인이 canonical 프로필을 실제로 해석한다", async () => {
    const { STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS } = await import(
      "./studio-brush-engine-lane-catalog"
    );
    const { STUDIO_BRUSH_RUNTIME_CONTRACT } = await import(
      "./studio-brush-runtime-contract"
    );
    const rows = [
      ...STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS,
      ...STUDIO_BRUSH_RUNTIME_CONTRACT,
    ].filter((row) => row.engine === "perfect-outline");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const resolved = resolveStudioPerfectFreehandProfile(row.id);
      expect(resolved, `${row.id} 가 perfect-freehand 프로필을 해석하지 못한다`).not.toBeNull();
      // 프로필은 행이 canonicalId 로 지목한 브러시의 것과 같아야 한다. 어떤 프로필이든
      // 붙기만 하면 통과하는 게이트는, 잘못된 프로필이 붙는 경우를 잡지 못한다.
      expect(resolved!.id, `${row.id} 의 프로필이 canonicalId 와 어긋난다`)
        .toBe(resolveStudioPerfectFreehandProfile(row.canonicalId)?.id);
    }
  });
});
