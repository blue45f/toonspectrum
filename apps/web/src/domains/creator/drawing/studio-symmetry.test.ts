import { describe, expect, it } from "vitest";

import {
  STUDIO_SYMMETRY_FOLDS_MAX,
  STUDIO_SYMMETRY_FOLDS_MIN,
  cloneStudioSymmetrySample,
  isStudioSymmetryMode,
  normalizeStudioSymmetrySettings,
  studioSymmetryCloneCount,
  studioSymmetryTransform,
  transformStudioSymmetrySample,
  type StudioSymmetrySettings,
  type SymmetryStrokeSample,
} from "./studio-symmetry";

function closeTo(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
}

const SAMPLE: SymmetryStrokeSample = {
  x: 150,
  y: 40,
  pressure: 0.8,
  dx: 1,
  dy: 0,
};

describe("isStudioSymmetryMode", () => {
  it("5종 모드를 판별한다", () => {
    expect(isStudioSymmetryMode("off")).toBe(true);
    expect(isStudioSymmetryMode("vertical")).toBe(true);
    expect(isStudioSymmetryMode("horizontal")).toBe(true);
    expect(isStudioSymmetryMode("quad")).toBe(true);
    expect(isStudioSymmetryMode("radial")).toBe(true);
    expect(isStudioSymmetryMode("diagonal")).toBe(false);
  });
});

describe("normalizeStudioSymmetrySettings", () => {
  it("빈 입력에 안전한 기본값을 반환한다", () => {
    const s = normalizeStudioSymmetrySettings(undefined);
    expect(s.mode).toBe("off");
    expect(s.folds).toBe(6);
    expect(s.angleDeg).toBe(0);
  });

  it("folds를 2–12로 클램핑한다", () => {
    expect(normalizeStudioSymmetrySettings({ folds: 99 }).folds).toBe(
      STUDIO_SYMMETRY_FOLDS_MAX,
    );
    expect(normalizeStudioSymmetrySettings({ folds: 1 }).folds).toBe(
      STUDIO_SYMMETRY_FOLDS_MIN,
    );
  });

  it("angleDeg를 -180–180으로 클램핑한다", () => {
    expect(normalizeStudioSymmetrySettings({ angleDeg: 400 }).angleDeg).toBe(
      180,
    );
    expect(normalizeStudioSymmetrySettings({ angleDeg: -400 }).angleDeg).toBe(
      -180,
    );
  });

  it("이상한 모드는 off로 폴백한다", () => {
    expect(
      normalizeStudioSymmetrySettings({ mode: "diagonal" as never }).mode,
    ).toBe("off");
  });
});

describe("studioSymmetryCloneCount", () => {
  it("모드별 복제본 개수를 반환한다", () => {
    const base = normalizeStudioSymmetrySettings(undefined);
    expect(studioSymmetryCloneCount({ ...base, mode: "off" })).toBe(1);
    expect(studioSymmetryCloneCount({ ...base, mode: "vertical" })).toBe(2);
    expect(studioSymmetryCloneCount({ ...base, mode: "horizontal" })).toBe(2);
    expect(studioSymmetryCloneCount({ ...base, mode: "quad" })).toBe(4);
    expect(studioSymmetryCloneCount({ ...base, mode: "radial", folds: 8 })).toBe(
      8,
    );
  });
});

describe("transformStudioSymmetrySample — 수직축", () => {
  const settings: StudioSymmetrySettings = normalizeStudioSymmetrySettings({
    mode: "vertical",
    axisX: 100,
    axisY: 120,
    angleDeg: 0,
  });

  it("clone 0은 원본 그대로다", () => {
    const out = transformStudioSymmetrySample(settings, 0, SAMPLE);
    expect(out).toEqual(SAMPLE);
  });

  it("수직축(x=100)에 좌표를 반사한다", () => {
    const out = transformStudioSymmetrySample(settings, 1, SAMPLE);
    closeTo(out.x, 50); // 2*100 - 150
    closeTo(out.y, 40);
  });

  it("방향벡터의 x 성분만 뒤집는다", () => {
    const out = transformStudioSymmetrySample(settings, 1, SAMPLE);
    closeTo(out.dx, -1);
    closeTo(out.dy, 0);
    expect(out.pressure).toBe(0.8);
  });

  it("두 번 반사하면 항등 변환이다", () => {
    const once = transformStudioSymmetrySample(settings, 1, SAMPLE);
    const twice = transformStudioSymmetrySample(settings, 1, once);
    closeTo(twice.x, SAMPLE.x);
    closeTo(twice.y, SAMPLE.y);
    closeTo(twice.dx, SAMPLE.dx);
    closeTo(twice.dy, SAMPLE.dy);
  });

  it("각도를 주면 축이 기울어진다", () => {
    const tilted = normalizeStudioSymmetrySettings({
      mode: "vertical",
      axisX: 100,
      axisY: 120,
      angleDeg: 90,
    });
    // 90° 기울이면 수직축이 수평축이 된다 → x는 그대로, y가 반사
    const out = transformStudioSymmetrySample(tilted, 1, SAMPLE);
    closeTo(out.x, 150);
    closeTo(out.y, 200); // 2*120 - 40
    closeTo(out.dx, 1);
    closeTo(out.dy, 0);
  });
});

describe("transformStudioSymmetrySample — 수평축", () => {
  const settings: StudioSymmetrySettings = normalizeStudioSymmetrySettings({
    mode: "horizontal",
    axisX: 160,
    axisY: 100,
    angleDeg: 0,
  });

  it("수평축(y=100)에 반사한다", () => {
    const out = transformStudioSymmetrySample(settings, 1, SAMPLE);
    closeTo(out.x, 150);
    closeTo(out.y, 160); // 2*100 - 40
    closeTo(out.dx, 1);
    closeTo(out.dy, 0);
  });
});

describe("transformStudioSymmetrySample — 4방향", () => {
  const settings: StudioSymmetrySettings = normalizeStudioSymmetrySettings({
    mode: "quad",
    axisX: 100,
    axisY: 100,
    angleDeg: 0,
  });

  it("4개 복제본의 좌표가 정확하다", () => {
    const clones = cloneStudioSymmetrySample(settings, SAMPLE);
    expect(clones).toHaveLength(4);
    // 0: 원본
    closeTo(clones[0].x, 150);
    closeTo(clones[0].y, 40);
    // 1: 수직 반사 (x=100)
    closeTo(clones[1].x, 50);
    closeTo(clones[1].y, 40);
    // 2: 수평 반사 (y=100)
    closeTo(clones[2].x, 150);
    closeTo(clones[2].y, 160);
    // 3: 수직∘수평 = 중심점(100,100) 대칭
    closeTo(clones[3].x, 50);
    closeTo(clones[3].y, 160);
    closeTo(clones[3].dx, -1);
    closeTo(clones[3].dy, 0);
  });
});

describe("transformStudioSymmetrySample — 방사형", () => {
  const settings: StudioSymmetrySettings = normalizeStudioSymmetrySettings({
    mode: "radial",
    centerX: 0,
    centerY: 0,
    folds: 4,
  });
  const radialSample: SymmetryStrokeSample = {
    x: 100,
    y: 0,
    pressure: 0.5,
    dx: 0,
    dy: 1,
  };

  it("folds 개수만큼 회전 복제한다", () => {
    const clones = cloneStudioSymmetrySample(settings, radialSample);
    expect(clones).toHaveLength(4);
    // 90°씩 회전: (100,0) → (0,100) → (-100,0) → (0,-100)
    closeTo(clones[0].x, 100);
    closeTo(clones[0].y, 0);
    closeTo(clones[1].x, 0);
    closeTo(clones[1].y, 100);
    closeTo(clones[2].x, -100);
    closeTo(clones[2].y, 0);
    closeTo(clones[3].x, 0);
    closeTo(clones[3].y, -100);
  });

  it("방향벡터도 함께 회전한다", () => {
    const clones = cloneStudioSymmetrySample(settings, radialSample);
    // 방향 (0,1) → 90° 회전 → (-1, 0)
    closeTo(clones[1].dx, -1);
    closeTo(clones[1].dy, 0);
  });

  it("folds만큼 돌리면 원래대로 돌아온다", () => {
    const t = studioSymmetryTransform(settings, 4);
    closeTo(t.a, 1);
    closeTo(t.d, 1);
    closeTo(t.b, 0);
    closeTo(t.c, 0);
  });

  it("3-fold는 120°씩 회전한다", () => {
    const three = normalizeStudioSymmetrySettings({
      mode: "radial",
      centerX: 0,
      centerY: 0,
      folds: 3,
    });
    const out = transformStudioSymmetrySample(three, 1, radialSample);
    closeTo(out.x, 100 * Math.cos((2 * Math.PI) / 3));
    closeTo(out.y, 100 * Math.sin((2 * Math.PI) / 3));
  });

  it("중심이 원점이 아니어도 정확하다", () => {
    const off = normalizeStudioSymmetrySettings({
      mode: "radial",
      centerX: 50,
      centerY: 50,
      folds: 2,
    });
    const out = transformStudioSymmetrySample(off, 1, radialSample);
    // (100,0)을 (50,50) 중심 180° 회전 → (0,100)
    closeTo(out.x, 0);
    closeTo(out.y, 100);
  });
});

describe("cloneStudioSymmetrySample", () => {
  it("off 모드에서는 원본 1개만 반환한다", () => {
    const settings = normalizeStudioSymmetrySettings({ mode: "off" });
    const clones = cloneStudioSymmetrySample(settings, SAMPLE);
    expect(clones).toHaveLength(1);
    expect(clones[0]).toEqual(SAMPLE);
  });

  it("필압은 복제본마다 그대로 유지한다", () => {
    const settings = normalizeStudioSymmetrySettings({
      mode: "radial",
      folds: 6,
    });
    const clones = cloneStudioSymmetrySample(settings, SAMPLE);
    for (const clone of clones) {
      expect(clone.pressure).toBe(SAMPLE.pressure);
    }
  });

  it("방향벡터 길이는 변환 후에도 유지된다", () => {
    const settings = normalizeStudioSymmetrySettings({
      mode: "radial",
      folds: 5,
    });
    const diagonal: SymmetryStrokeSample = {
      x: 10,
      y: 20,
      pressure: 1,
      dx: 3,
      dy: 4,
    };
    const clones = cloneStudioSymmetrySample(settings, diagonal);
    for (const clone of clones) {
      closeTo(Math.hypot(clone.dx, clone.dy), 5);
    }
  });
});
