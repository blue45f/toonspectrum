import { describe, expect, it } from "vitest";
import { createStudioLightFixture } from "./studio-virtual-space-lighting";
import {
  modulateStudioDayNightFixtures,
  studioDayNightLightingPhaseAt,
  studioDayNightModulationAt,
  studioDayNightPresetSummary,
  studioLightingPresetForDayNightPhase,
} from "./studio-virtual-space-day-night-lighting";

const H = (hour: number) => hour / 24;

describe("studioDayNightLightingPhaseAt", () => {
  it("시간대 경계를 정확히 나눈다", () => {
    expect(studioDayNightLightingPhaseAt(H(6))).toBe("morning");
    expect(studioDayNightLightingPhaseAt(H(11.99))).toBe("morning");
    expect(studioDayNightLightingPhaseAt(H(12))).toBe("day");
    expect(studioDayNightLightingPhaseAt(H(16.99))).toBe("day");
    expect(studioDayNightLightingPhaseAt(H(17))).toBe("dusk");
    expect(studioDayNightLightingPhaseAt(H(19.99))).toBe("dusk");
    expect(studioDayNightLightingPhaseAt(H(20))).toBe("night");
    expect(studioDayNightLightingPhaseAt(H(5.99))).toBe("night");
    expect(studioDayNightLightingPhaseAt(0)).toBe("night");
  });

  it("범위 밖 입력은 0~1로 제한한다", () => {
    expect(studioDayNightLightingPhaseAt(-1)).toBe("night");
    expect(studioDayNightLightingPhaseAt(2)).toBe("night");
  });
});

describe("프리셋 연결", () => {
  it("시간대마다 프리셋 4종이 하나씩 배정된다", () => {
    expect(studioLightingPresetForDayNightPhase("morning")).toBe("morning-fresh");
    expect(studioLightingPresetForDayNightPhase("day")).toBe("focus-work");
    expect(studioLightingPresetForDayNightPhase("dusk")).toBe("cozy-evening");
    expect(studioLightingPresetForDayNightPhase("night")).toBe("event-party");
  });

  it("요약은 현재 시간대 프리셋 라벨을 돌려준다", () => {
    const summary = studioDayNightPresetSummary(H(23));
    expect(summary.phase).toBe("night");
    expect(summary.presetKey).toBe("event-party");
    expect(summary.presetLabel.ko).toBe("파티 모드");
  });
});

describe("studioDayNightModulationAt", () => {
  it("낮에는 창문·네온 보정이 0이다", () => {
    const modulation = studioDayNightModulationAt(H(13));
    expect(modulation.phase).toBe("day");
    expect(modulation.windowGlow).toBe(0);
    expect(modulation.neonGlow).toBe(0);
  });

  it("밤에는 windowGlow와 neonGlow가 커지고 한밤중에 가장 강하다", () => {
    const early = studioDayNightModulationAt(H(21));
    const deep = studioDayNightModulationAt(H(1));
    expect(early.windowGlow).toBeGreaterThan(0);
    expect(deep.windowGlow).toBeGreaterThan(early.windowGlow);
    expect(deep.windowGlow).toBeCloseTo(0.85);
    expect(deep.neonGlow).toBe(1);
  });

  it("밤에는 네온·스트링 배율이 1을 넘고 천장등은 약해진다", () => {
    const modulation = studioDayNightModulationAt(H(23));
    expect(modulation.dimmerMultiplier["neon-sign"]).toBeGreaterThan(1);
    expect(modulation.dimmerMultiplier["ceiling-light"]).toBeLessThan(0.5);
  });
});

describe("modulateStudioDayNightFixtures", () => {
  const base = [
    createStudioLightFixture({ id: "ceil", kind: "ceiling-light", position: { x: 0, y: 0 }, dimmer: 1 }),
    createStudioLightFixture({ id: "neon", kind: "neon-sign", position: { x: 10, y: 0 }, dimmer: 0.5, on: false }),
    createStudioLightFixture({ id: "desk", kind: "desk-lamp", position: { x: 20, y: 0 }, dimmer: 0.8, on: true }),
  ];

  it("밤이면 꺼진 네온사인이 켜지고 밝기가 보정된다", () => {
    const modulated = modulateStudioDayNightFixtures(base, H(23));
    const neon = modulated.find((fixture) => fixture.id === "neon")!;
    expect(neon.on).toBe(true);
    expect(neon.dimmer).toBeCloseTo(0.6); // 0.5 × 1.2
    const ceil = modulated.find((fixture) => fixture.id === "ceil")!;
    expect(ceil.dimmer).toBeCloseTo(0.35); // 1 × 0.35
  });

  it("아침에는 네온이 자동으로 켜지지 않는다", () => {
    const modulated = modulateStudioDayNightFixtures(base, H(9));
    const neon = modulated.find((fixture) => fixture.id === "neon")!;
    expect(neon.on).toBe(false);
  });

  it("원본 픽스처를 변형하지 않는다 (불변)", () => {
    const result = modulateStudioDayNightFixtures(base, H(23));
    expect(result).not.toBe(base);
    expect(base[0]!.dimmer).toBe(1);
    expect(result[0]!.dimmer).not.toBe(base[0]!.dimmer);
  });
});
