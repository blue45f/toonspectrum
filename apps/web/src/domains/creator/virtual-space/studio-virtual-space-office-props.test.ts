import { describe, expect, it } from "vitest";

import {
  officeClockHands,
  officeClockSecondBucket,
  officeMonitorGlow,
  officeNeonFlicker,
  officePlantSway,
  officePropFrame,
  officePropKindForCampusObject,
  officePropKindForFurniture,
  STUDIO_OFFICE_PROP_KINDS,
} from "./studio-virtual-space-office-props";

describe("officeClockHands", () => {
  it("자정에는 모든 바늘이 12시를 가리킨다", () => {
    const hands = officeClockHands(0);
    expect(hands.hourAngle).toBe(0);
    expect(hands.minuteAngle).toBe(0);
    expect(hands.secondAngle).toBe(0);
    expect(hands.second).toBe(0);
  });

  it("6시는 시침이 아래, 30분은 분침이 아래, 15초는 초침이 오른쪽이다", () => {
    expect(officeClockHands(6 * 3600 * 1000).hourAngle).toBeCloseTo(Math.PI, 6);
    expect(officeClockHands(30 * 60 * 1000).minuteAngle).toBeCloseTo(Math.PI, 6);
    expect(officeClockHands(15 * 1000).secondAngle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("시침은 분을 반영해 천천히 이동한다 (6시 30분이면 6~7시 사이)", () => {
    const hands = officeClockHands((6 * 3600 + 30 * 60) * 1000);
    expect(hands.hourAngle).toBeGreaterThan(Math.PI);
    expect(hands.hourAngle).toBeLessThan(Math.PI + Math.PI / 6);
  });

  it("무효한 시각은 0으로 취급한다", () => {
    expect(officeClockHands(Number.NaN).secondAngle).toBe(0);
    expect(officeClockHands(-500).hourAngle).toBe(0);
  });

  it("초 버킷은 1초마다 바뀐다", () => {
    expect(officeClockSecondBucket(1500)).toBe(1);
    expect(officeClockSecondBucket(1999)).toBe(1);
    expect(officeClockSecondBucket(2000)).toBe(2);
  });
});

describe("officeMonitorGlow", () => {
  it("항상 0~1 범위에서 은은하게 변한다", () => {
    for (let time = 0; time < 20_000; time += 137) {
      const value = officeMonitorGlow(time, "desk-1", false);
      expect(value).toBeGreaterThanOrEqual(0.5);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("같은 입력은 같은 값을 돌려준다 (결정적)", () => {
    expect(officeMonitorGlow(4321, "desk-1", false)).toBe(officeMonitorGlow(4321, "desk-1", false));
  });

  it("모션 줄이기에서는 고정 밝기다", () => {
    expect(officeMonitorGlow(0, "desk-1", true)).toBe(officeMonitorGlow(9999, "desk-1", true));
  });
});

describe("officeNeonFlicker", () => {
  it("항상 0~1 범위이고 대부분 켜져 있다", () => {
    let lit = 0;
    for (let time = 0; time < 20_000; time += 90) {
      const value = officeNeonFlicker(time, "cafe-neon", false);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (value > 0.8) lit += 1;
    }
    expect(lit).toBeGreaterThan(150);
  });

  it("모션 줄이기에서는 깜빡이지 않고 계속 켜져 있다", () => {
    expect(officeNeonFlicker(123, "cafe-neon", true)).toBe(1);
    expect(officeNeonFlicker(987_654, "cafe-neon", true)).toBe(1);
  });
});

describe("officePlantSway", () => {
  it("흔들림이 작은 범위 안에 머문다", () => {
    for (let time = 0; time < 30_000; time += 211) {
      const sway = officePlantSway(time, "plant-1", false);
      expect(Math.abs(sway.rotation)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(sway.offsetX)).toBeLessThanOrEqual(2);
    }
  });

  it("모션 줄이기에서는 흔들리지 않는다", () => {
    expect(officePlantSway(5000, "plant-1", true)).toEqual({ rotation: 0, offsetX: 0 });
  });
});

describe("officePropFrame / 종류 매핑", () => {
  it("소품 종류는 4종이다", () => {
    expect(STUDIO_OFFICE_PROP_KINDS).toEqual(["monitor-glow", "wall-clock", "neon-flicker", "plant-sway"]);
  });

  it("시계 프레임은 바늘을 포함하고 나머지는 null이다", () => {
    expect(officePropFrame("wall-clock", 15_000, "clock", false).clock?.second).toBe(15);
    expect(officePropFrame("monitor-glow", 15_000, "desk", false).clock).toBeNull();
  });

  it("모션 줄이기에서 시계 초침은 초 단위로 끊긴다", () => {
    const frame = officePropFrame("wall-clock", 15_700, "clock", true);
    expect(frame.clock?.secondAngle).toBeCloseTo((15 / 60) * Math.PI * 2, 6);
  });

  it("캠퍼스 오브젝트 종류를 소품 종류로 연결한다", () => {
    expect(officePropKindForCampusObject("desk-monitor")).toBe("monitor-glow");
    expect(officePropKindForCampusObject("wall-clock")).toBe("wall-clock");
    expect(officePropKindForCampusObject("neon-sign")).toBe("neon-flicker");
    expect(officePropKindForCampusObject("reception")).toBeNull();
  });

  it("가구 종류를 소품 종류로 연결한다 (화분 흔들림 포함)", () => {
    expect(officePropKindForFurniture("plant")).toBe("plant-sway");
    expect(officePropKindForFurniture("desk-monitor")).toBe("monitor-glow");
    expect(officePropKindForFurniture("sofa")).toBeNull();
  });
});
