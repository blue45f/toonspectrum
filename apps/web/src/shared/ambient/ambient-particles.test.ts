import { describe, expect, it } from "vitest";

import {
  createAmbientParticle,
  particleOpacity,
  updateAmbientParticle,
  type AmbientParticle,
} from "./ambient-particles";
import type { AmbientParticleSpec } from "./ambient-engine";

const RAIN: AmbientParticleSpec = {
  kind: "rain",
  count: 10,
  fallSpeed: { min: 480, max: 720 },
  drift: { min: -30, max: 30 },
  size: { min: 1, max: 2 },
  opacity: { min: 0.25, max: 0.5 },
  color: "#9db8d6",
  shape: "line",
  slant: 0.15,
};

const FIREFLY: AmbientParticleSpec = {
  kind: "firefly",
  count: 5,
  fallSpeed: { min: -15, max: 15 },
  drift: { min: -40, max: 40 },
  size: { min: 2, max: 4 },
  opacity: { min: 0.3, max: 0.9 },
  color: "#fff3a0",
  shape: "glow",
  slant: 0,
};

/** 결정적 난수 (테스트용). */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("createAmbientParticle", () => {
  it("스펙 범위 안에서 생성된다", () => {
    const random = seededRandom(42);
    for (let i = 0; i < 50; i++) {
      const p = createAmbientParticle(RAIN, 390, 844, random);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(390);
      expect(p.vy).toBeGreaterThanOrEqual(480);
      expect(p.vy).toBeLessThanOrEqual(720);
      expect(p.size).toBeGreaterThanOrEqual(1);
      expect(p.size).toBeLessThanOrEqual(2);
    }
  });

  it("반딧불이는 화면 안에서 생성된다", () => {
    const p = createAmbientParticle(FIREFLY, 390, 844, seededRandom(7));
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(844);
  });
});

describe("updateAmbientParticle", () => {
  it("시간에 따라 아래로 이동한다", () => {
    const p: AmbientParticle = {
      x: 100, y: 100, vx: 0, vy: 500,
      size: 2, opacity: 0.5, rotation: 0, rotSpeed: 0,
      swayPhase: 0, swayAmp: 0, swayFreq: 1, blinkPhase: 0,
    };
    updateAmbientParticle(p, RAIN, 1, 390, 844, 0, seededRandom(1));
    expect(p.y).toBe(600); // 100 + 500*1
  });

  it("화면을 벗어나면 위에서 재배치된다", () => {
    const p: AmbientParticle = {
      x: 100, y: 900, vx: 0, vy: 500,
      size: 2, opacity: 0.5, rotation: 0, rotSpeed: 0,
      swayPhase: 0, swayAmp: 0, swayFreq: 1, blinkPhase: 0,
    };
    const respawned = updateAmbientParticle(p, RAIN, 0.1, 390, 844, 0, seededRandom(1));
    expect(respawned).toBe(true);
    expect(p.y).toBeLessThan(100); // 위에서 등장
  });

  it("반딧불이는 경계에서 반사한다", () => {
    const p: AmbientParticle = {
      x: -50, y: 400, vx: -30, vy: 0,
      size: 3, opacity: 0.7, rotation: 0, rotSpeed: 0,
      swayPhase: 0, swayAmp: 0, swayFreq: 1, blinkPhase: 0,
    };
    updateAmbientParticle(p, FIREFLY, 0.1, 390, 844, 0, seededRandom(1));
    expect(p.vx).toBeGreaterThan(0); // 반사
  });
});

describe("particleOpacity", () => {
  it("일반 파티클은 고정 불투명도", () => {
    const p: AmbientParticle = {
      x: 0, y: 0, vx: 0, vy: 0, size: 2, opacity: 0.4,
      rotation: 0, rotSpeed: 0, swayPhase: 0, swayAmp: 0, swayFreq: 1, blinkPhase: 0,
    };
    expect(particleOpacity(p, RAIN, 10)).toBe(0.4);
  });

  it("반딧불이는 깜빡인다", () => {
    const p: AmbientParticle = {
      x: 0, y: 0, vx: 0, vy: 0, size: 3, opacity: 0.8,
      rotation: 0, rotSpeed: 0, swayPhase: 0, swayAmp: 0, swayFreq: 1, blinkPhase: 0,
    };
    const a = particleOpacity(p, FIREFLY, 0);
    const b = particleOpacity(p, FIREFLY, 0.8);
    expect(a).not.toBe(b); // 시간에 따라 변함
    expect(a).toBeGreaterThanOrEqual(0.2);
    expect(a).toBeLessThanOrEqual(0.8);
  });
});
