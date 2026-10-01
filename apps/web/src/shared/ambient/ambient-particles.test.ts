import { describe, expect, it } from "vitest";

import type { AmbientParticleLayerSpec } from "./ambient-layers";
import {
  ambientParticleOpacity,
  createAmbientParticle,
  stepAmbientParticle,
  type AmbientParticle,
} from "./ambient-particles";

function spec(overrides: Partial<AmbientParticleLayerSpec>): AmbientParticleLayerSpec {
  return {
    type: "particles",
    style: "streak",
    count: 10,
    fall: { min: 600, max: 800 },
    drift: { min: 60, max: 100 },
    size: { min: 14, max: 26 },
    opacity: { min: 0.3, max: 0.5 },
    sway: { min: 0, max: 0 },
    colors: ["#a9c3e8"],
    twinkle: null,
    region: "full",
    additive: false,
    shootingStars: null,
    ...overrides,
  };
}

const RAIN = spec({});
const FIREFLY = spec({
  style: "glow",
  fall: { min: -9, max: 9 },
  drift: { min: -14, max: 14 },
  size: { min: 2, max: 3.6 },
  twinkle: { min: 0.25, max: 0.7 },
  region: "lower",
});
const MOTE = spec({
  style: "mote",
  fall: { min: -14, max: -4 },
  drift: { min: -6, max: 10 },
  size: { min: 2.4, max: 5.6 },
  twinkle: { min: 0.2, max: 0.55 },
  region: "upper",
});

/** 결정적 난수(테스트용). */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function particle(overrides: Partial<AmbientParticle>): AmbientParticle {
  return {
    x: 100,
    y: 100,
    vx: 0,
    vy: 500,
    size: 20,
    opacity: 0.5,
    color: "#a9c3e8",
    rotation: 0,
    spin: 0,
    flip: 0,
    flipSpeed: 0,
    swayPhase: 0,
    swayAmp: 0,
    swayFreq: 1,
    twinklePhase: 0,
    twinkleSpeed: 0,
    ...overrides,
  };
}

describe("createAmbientParticle", () => {
  it("명세 범위 안에서 만든다", () => {
    const random = seededRandom(42);
    for (let index = 0; index < 50; index += 1) {
      const p = createAmbientParticle(RAIN, 390, 844, random);
      expect(p.vy).toBeGreaterThanOrEqual(600);
      expect(p.vy).toBeLessThanOrEqual(800);
      expect(p.size).toBeGreaterThanOrEqual(14);
      expect(p.size).toBeLessThanOrEqual(26);
      expect(RAIN.colors).toContain(p.color);
    }
  });

  it("바람이 오른쪽으로 불면 왼쪽 바깥에서도 생겨 화면 왼쪽이 비지 않는다", () => {
    const random = seededRandom(3);
    const xs = Array.from({ length: 200 }, () => createAmbientParticle(RAIN, 1440, 900, random, false).x);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1440);
  });

  it("다시 나타날 때는 화면 위쪽 바깥에서 시작한다", () => {
    const p = createAmbientParticle(RAIN, 390, 844, seededRandom(9), false);
    expect(p.y).toBeLessThan(0);
  });

  it("반딧불은 아래쪽 영역 안에서 만든다", () => {
    const random = seededRandom(7);
    for (let index = 0; index < 30; index += 1) {
      const p = createAmbientParticle(FIREFLY, 390, 1000, random);
      expect(p.y).toBeGreaterThanOrEqual(300);
      expect(p.y).toBeLessThanOrEqual(1000);
    }
  });
});

describe("stepAmbientParticle", () => {
  it("시간에 따라 떨어진다", () => {
    const p = particle({ vy: 500 });
    stepAmbientParticle(p, RAIN, 1, 390, 844, 0, seededRandom(1));
    expect(p.y).toBe(600);
  });

  it("화면 아래로 나가면 위에서 다시 나타난다", () => {
    const p = particle({ y: 900 });
    const respawned = stepAmbientParticle(p, RAIN, 0.1, 390, 844, 0, seededRandom(1));
    expect(respawned).toBe(true);
    expect(p.y).toBeLessThan(0);
  });

  it("떠오르는 빛 알갱이는 위로 나가면 아래쪽 영역에서 다시 나타난다", () => {
    const p = particle({ y: -200, vy: -10, size: 3 });
    const respawned = stepAmbientParticle(p, MOTE, 0.1, 1440, 900, 0, seededRandom(5));
    expect(respawned).toBe(true);
    expect(p.y).toBeGreaterThan(600);
  });

  it("반딧불은 영역 가장자리에서 방향을 바꿔 영역 안에 머문다", () => {
    const p = particle({ x: -60, y: 500, vx: -10, vy: 0 });
    stepAmbientParticle(p, FIREFLY, 0.05, 390, 844, 0, seededRandom(1));
    expect(p.vx).toBeGreaterThan(0);
  });
});

describe("ambientParticleOpacity", () => {
  it("반짝임이 없으면 고정 불투명도", () => {
    expect(ambientParticleOpacity(particle({ opacity: 0.4 }), RAIN, 10, 844)).toBe(0.4);
  });

  it("반딧불은 시간에 따라 깜빡인다", () => {
    const p = particle({ opacity: 0.8, twinkleSpeed: 0.5, y: 600 });
    const a = ambientParticleOpacity(p, FIREFLY, 0, 844);
    const b = ambientParticleOpacity(p, FIREFLY, 0.5, 844);
    expect(a).not.toBe(b);
    expect(Math.max(a, b)).toBeLessThanOrEqual(0.8);
  });

  it("떠오르는 빛 알갱이는 영역 가장자리에서 서서히 나타나고 사라진다", () => {
    const edge = ambientParticleOpacity(particle({ opacity: 0.8, y: 629 }), { ...MOTE, twinkle: null }, 0, 900);
    const middle = ambientParticleOpacity(particle({ opacity: 0.8, y: 300 }), { ...MOTE, twinkle: null }, 0, 900);
    expect(edge).toBeLessThan(0.05);
    expect(middle).toBeCloseTo(0.8);
  });
});
