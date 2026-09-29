// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  createConfettiParticle,
  isConfettiAlive,
  SPECTACLE_CONFETTI_COLORS,
  updateConfettiParticle,
} from "./spectacle-confetti";

const seeded = () => {
  let s = 42;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

const origin = { x: 100, y: 100 };
const power = { min: 260, max: 620 };

describe("createConfettiParticle", () => {
  it("파티클이 유효한 범위로 생성된다", () => {
    const p = createConfettiParticle(seeded(), origin, SPECTACLE_CONFETTI_COLORS, power);
    expect(p.x).toBe(origin.x);
    expect(p.y).toBe(origin.y);
    expect(SPECTACLE_CONFETTI_COLORS).toContain(p.color);
    expect(["rect", "circle", "ribbon"]).toContain(p.shape);
    expect(p.life).toBe(0);
    expect(p.width).toBeGreaterThan(0);
    expect(p.height).toBeGreaterThan(0);
  });

  it("결정적 시드로 재현 가능하다", () => {
    const a = createConfettiParticle(seeded(), origin, SPECTACLE_CONFETTI_COLORS, power);
    const b = createConfettiParticle(seeded(), origin, SPECTACLE_CONFETTI_COLORS, power);
    expect(a).toEqual(b);
  });
});

describe("updateConfettiParticle", () => {
  it("중력으로 vy가 증가한다", () => {
    const p = createConfettiParticle(seeded(), origin, SPECTACLE_CONFETTI_COLORS, power);
    const next = updateConfettiParticle(p, 0.1, 900, 2600);
    expect(next.vy).toBeGreaterThan(p.vy);
    expect(next.life).toBeGreaterThan(p.life);
    expect(next.maxLife).toBe(2600);
  });

  it("원본을 변경하지 않는다", () => {
    const p = createConfettiParticle(seeded(), origin, SPECTACLE_CONFETTI_COLORS, power);
    const snapshot = { ...p };
    updateConfettiParticle(p, 0.1, 900, 2600);
    expect(p).toEqual(snapshot);
  });
});

describe("isConfettiAlive", () => {
  it("수명이 다하면 false", () => {
    const p = createConfettiParticle(seeded(), origin, SPECTACLE_CONFETTI_COLORS, power);
    const dead = { ...p, life: 3000, maxLife: 2600 };
    expect(isConfettiAlive(dead)).toBe(false);
  });

  it("화면 아래로 떨어지면 false", () => {
    const p = createConfettiParticle(seeded(), origin, SPECTACLE_CONFETTI_COLORS, power);
    const fallen = { ...p, y: window.innerHeight + 100, life: 100, maxLife: 2600 };
    expect(isConfettiAlive(fallen)).toBe(false);
  });

  it("살아있는 파티클은 true", () => {
    const p = createConfettiParticle(seeded(), origin, SPECTACLE_CONFETTI_COLORS, power);
    expect(isConfettiAlive({ ...p, life: 100, maxLife: 2600 })).toBe(true);
  });
});

describe("launchSpectacleConfetti", () => {
  it("full 수준이 아니면 no-op", async () => {
    vi.resetModules();
    // localStorage에 off 저장 → readSpectacleLevel() === "none"
    localStorage.setItem("toonstudio.ambient.intensity.v1", "off");
    const { launchSpectacleConfetti } = await import("./spectacle-confetti");
    const stop = launchSpectacleConfetti();
    expect(document.querySelector(".spectacle-confetti-canvas")).toBeNull();
    stop();
    localStorage.clear();
  });
});
