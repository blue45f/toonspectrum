import { describe, expect, it } from "vitest";
import {
  ambientFloaters,
  carpetRippleValue,
  dayPhaseForHour,
  floaterCount,
  hangingSwayAngleDegrees,
  shadowForHour,
  STUDIO_AMBIENT_EVENT_BUCKET_MS,
  STUDIO_DAY_PHASES,
  studioAmbientHappeningsForBucket,
  studioAmbientPhaseNote,
  studioAmbientUpcomingEventBanner,
  windSwayOffset,
} from "./studio-virtual-space-ambient-life";

describe("바람 흔들림", () => {
  it("바람이 없으면 흔들리지 않는다", () => {
    expect(windSwayOffset(10, 0, 1, false)).toEqual({ x: 0, y: 0 });
  });

  it("바람이 세면 진폭이 크다", () => {
    const weak = windSwayOffset(1.7, 0.2, 0, false);
    const strong = windSwayOffset(1.7, 1, 0, false);
    expect(Math.abs(strong.x)).toBeGreaterThan(Math.abs(weak.x));
  });

  it("시간에 따라 주기적으로 변한다", () => {
    const a = windSwayOffset(0, 1, 0, false);
    const b = windSwayOffset(2, 1, 0, false);
    expect(a.x).not.toBeCloseTo(b.x, 3);
  });

  it("phase가 다르면 위상이 다르다", () => {
    const a = windSwayOffset(3, 1, 0, false);
    const b = windSwayOffset(3, 1, 2.5, false);
    expect(a.x).not.toBeCloseTo(b.x, 3);
  });

  it("reduced-motion이면 0이다", () => {
    expect(windSwayOffset(10, 1, 1, true)).toEqual({ x: 0, y: 0 });
    expect(hangingSwayAngleDegrees(10, 1, 1, true)).toBe(0);
  });

  it("매달린 장식은 각도로 흔들린다", () => {
    const angle = hangingSwayAngleDegrees(1.5, 1, 0, false);
    expect(Math.abs(angle)).toBeLessThanOrEqual(9);
    expect(hangingSwayAngleDegrees(1.5, 0, 0, false)).toBe(0);
  });
});

describe("카펫 물결", () => {
  it("0~1 범위의 파동 값을 낸다", () => {
    for (const [x, y] of [[0, 0], [100, 50], [640, 360]] as const) {
      const value = carpetRippleValue(x, y, 5, false);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("위치와 시간에 따라 달라진다", () => {
    expect(carpetRippleValue(0, 0, 0, false)).not.toBe(carpetRippleValue(100, 0, 0, false));
    expect(carpetRippleValue(0, 0, 0, false)).not.toBe(carpetRippleValue(0, 0, 3, false));
  });

  it("reduced-motion이면 0이다", () => {
    expect(carpetRippleValue(100, 50, 5, true)).toBe(0);
  });
});

describe("시간대와 그림자", () => {
  it("시각별 시간대를 판정한다", () => {
    expect(STUDIO_DAY_PHASES).toEqual(["dawn", "day", "dusk", "night"]);
    expect(dayPhaseForHour(6)).toBe("dawn");
    expect(dayPhaseForHour(12)).toBe("day");
    expect(dayPhaseForHour(18)).toBe("dusk");
    expect(dayPhaseForHour(23)).toBe("night");
    expect(dayPhaseForHour(2)).toBe("night");
  });

  it("정오 그림자가 아침/저녁보다 짧다", () => {
    const noon = shadowForHour(12);
    const morning = shadowForHour(7);
    const evening = shadowForHour(18.5);
    expect(noon.lengthFactor).toBeLessThan(morning.lengthFactor);
    expect(noon.lengthFactor).toBeLessThan(evening.lengthFactor);
  });

  it("그림자는 태양 반대 방향으로 뻗는다", () => {
    const morning = shadowForHour(8);
    const evening = shadowForHour(17);
    // 아침 태양은 동쪽 → 그림자는 서쪽, 저녁은 반대
    expect(Math.abs(morning.angleDegrees - evening.angleDegrees)).toBeGreaterThan(60);
  });

  it("밤 그림자는 짧고 희미하다", () => {
    const night = shadowForHour(23);
    expect(night.opacity).toBeLessThan(0.3);
    expect(night.lengthFactor).toBeLessThan(1);
  });
});

describe("떠다니는 입자", () => {
  it("밀도에 따라 개수가 정해진다", () => {
    expect(floaterCount("firefly", 0)).toBe(0);
    expect(floaterCount("firefly", 1)).toBe(24);
    expect(floaterCount("dust", 1)).toBe(60);
    expect(floaterCount("dust", 0.5)).toBe(30);
  });

  it("같은 시드·시간이면 같은 위치다 (결정적)", () => {
    const bounds = { width: 1280, height: 720 };
    const first = ambientFloaters({ kind: "dust", count: 10, timeSeconds: 5, bounds, night: false, seed: 42, reducedMotion: false });
    const second = ambientFloaters({ kind: "dust", count: 10, timeSeconds: 5, bounds, night: false, seed: 42, reducedMotion: false });
    expect(first).toEqual(second);
  });

  it("시간이 흐르면 위치가 바뀐다", () => {
    const bounds = { width: 1280, height: 720 };
    const a = ambientFloaters({ kind: "dust", count: 5, timeSeconds: 0, bounds, night: false, seed: 1, reducedMotion: false });
    const b = ambientFloaters({ kind: "dust", count: 5, timeSeconds: 10, bounds, night: false, seed: 1, reducedMotion: false });
    expect(a[0]?.x).not.toBeCloseTo(b[0]?.x ?? 0, 2);
  });

  it("반딧불이는 밤에만 빛난다", () => {
    const bounds = { width: 1280, height: 720 };
    const night = ambientFloaters({ kind: "firefly", count: 5, timeSeconds: 3, bounds, night: true, seed: 1, reducedMotion: false });
    const day = ambientFloaters({ kind: "firefly", count: 5, timeSeconds: 3, bounds, night: false, seed: 1, reducedMotion: false });
    expect(night.some((f) => f.glow > 0)).toBe(true);
    expect(day.every((f) => f.glow === 0)).toBe(true);
  });

  it("reduced-motion이면 입자가 표류하지 않고 반딧불이는 빛나지 않는다", () => {
    const bounds = { width: 1280, height: 720 };
    const still = ambientFloaters({ kind: "firefly", count: 5, timeSeconds: 3, bounds, night: true, seed: 1, reducedMotion: true });
    const moved = ambientFloaters({ kind: "firefly", count: 5, timeSeconds: 30, bounds, night: true, seed: 1, reducedMotion: true });
    expect(still).toEqual(moved);
    expect(still.every((f) => f.glow === 0)).toBe(true);
  });

  it("입자는 경계 안에 있다", () => {
    const bounds = { width: 1280, height: 720 };
    const floaters = ambientFloaters({ kind: "dust", count: 40, timeSeconds: 7, bounds, night: false, reducedMotion: false });
    for (const floater of floaters) {
      expect(floater.x).toBeGreaterThanOrEqual(0);
      expect(floater.x).toBeLessThan(1280);
      expect(floater.y).toBeGreaterThanOrEqual(0);
      expect(floater.y).toBeLessThan(720);
    }
  });
});

describe("앰비언트 이벤트 (Track C)", () => {
  it("같은 버킷에서는 항상 같은 해프닝을 반환한다 (결정적)", () => {
    const bucketStart = Math.floor(Date.now() / STUDIO_AMBIENT_EVENT_BUCKET_MS) * STUDIO_AMBIENT_EVENT_BUCKET_MS;
    const a = studioAmbientHappeningsForBucket(bucketStart + 1000);
    const b = studioAmbientHappeningsForBucket(bucketStart + 300_000);
    expect(a).toEqual(b);
  });

  it("해프닝 문구는 ko/en 쌍을 가진다", () => {
    const happening = studioAmbientHappeningsForBucket(Date.now());
    if (happening) {
      expect(happening.textKo.length).toBeGreaterThan(0);
      expect(happening.textEn.length).toBeGreaterThan(0);
    }
  });

  it("타운 이벤트 진행 중/임박 배너를 반환한다", () => {
    // 2026-10-01 KST 10:00 = 스탠드업 진행 중 (10:00-10:25)
    const kstStandup = new Date("2026-10-01T10:05:00+09:00").getTime();
    const active = studioAmbientUpcomingEventBanner(kstStandup);
    expect(active?.kind).toBe("banner");
    expect(active?.event.kind).toBe("standup");
    // 09:55 = 스탠드업 5분 전 → 임박 토스트
    const beforeStandup = new Date("2026-10-01T09:55:00+09:00").getTime();
    const toast = studioAmbientUpcomingEventBanner(beforeStandup);
    expect(toast?.kind).toBe("toast");
    expect(toast?.event.kind).toBe("standup");
    // 심야 03:00 = 이벤트 없음
    const night = new Date("2026-10-01T03:00:00+09:00").getTime();
    expect(studioAmbientUpcomingEventBanner(night)).toBeNull();
  });

  it("시간대별 분위기 메모를 반환한다", () => {
    expect(studioAmbientPhaseNote("dawn").ko).toContain("아침");
    expect(studioAmbientPhaseNote("night").en).toContain("fireflies");
  });
});
