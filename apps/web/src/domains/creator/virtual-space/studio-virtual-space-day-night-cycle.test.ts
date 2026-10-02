import { describe, expect, it } from "vitest";

import {
  studioDayNightAmbientAt,
  studioDayNightName,
  studioDayNightTintAlpha,
  studioDayNightTimeOfDay,
  STUDIO_DAY_NIGHT_CYCLE_MS,
} from "./studio-virtual-space-day-night-cycle";

describe("studioDayNightTimeOfDay", () => {
  it("시작 시각을 0, 하루 뒤를 0으로 순환한다", () => {
    expect(studioDayNightTimeOfDay(0, 0)).toBe(0);
    expect(studioDayNightTimeOfDay(STUDIO_DAY_NIGHT_CYCLE_MS, 0)).toBeCloseTo(0, 8);
    expect(studioDayNightTimeOfDay(STUDIO_DAY_NIGHT_CYCLE_MS / 2, 0)).toBeCloseTo(0.5, 8);
  });

  it("음수 오프셋도 양의 비율로 감싼다", () => {
    expect(studioDayNightTimeOfDay(-1000, 0)).toBeGreaterThan(0);
    expect(studioDayNightTimeOfDay(-1000, 0)).toBeLessThan(1);
  });
});

describe("studioDayNightAmbientAt", () => {
  it("자정은 어둡고 푸른 틴트, 정오는 밝고 흰 틴트", () => {
    const midnight = studioDayNightAmbientAt(0);
    const noon = studioDayNightAmbientAt(0.5);
    expect(midnight.ambient).toBeLessThan(noon.ambient);
    expect(noon.ambient).toBe(1);
    expect(noon.tint).toBe(0xffffff);
  });

  it("키프레임 사이를 연속 보간한다", () => {
    const a = studioDayNightAmbientAt(0.24);
    const b = studioDayNightAmbientAt(0.26);
    expect(b.ambient).toBeGreaterThan(a.ambient);
    // 단조 경계 밖 값은 클램프
    expect(studioDayNightAmbientAt(-1).timeOfDay).toBe(0);
    expect(studioDayNightAmbientAt(2).timeOfDay).toBe(1);
  });
});

describe("studioDayNightTintAlpha", () => {
  it("어두울수록 틴트 알파가 크다", () => {
    expect(studioDayNightTintAlpha(0.25)).toBeGreaterThan(studioDayNightTintAlpha(0.9));
    expect(studioDayNightTintAlpha(1)).toBe(0);
  });
});

describe("studioDayNightName", () => {
  it("시간대별 한글/영문 이름", () => {
    expect(studioDayNightName(0.4).ko).toBe("아침");
    expect(studioDayNightName(0.5).en).toBe("Day");
    expect(studioDayNightName(0).ko).toBe("밤");
    expect(studioDayNightName(0.74).ko).toBe("해질녘");
    expect(studioDayNightName(0.25).ko).toBe("새벽");
  });
});
