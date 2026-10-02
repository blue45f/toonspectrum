import { describe, expect, it } from "vitest";
import {
  createStudioWeatherParticleState,
  stepStudioWeatherParticles,
  studioWeatherParticleTarget,
  STUDIO_PETAL_PARTICLE_COUNT,
  type StudioWeatherParticleState,
  type StudioWeatherParticleViewport,
} from "./studio-virtual-space-weather-particles";

const VIEWPORT: StudioWeatherParticleViewport = { x: 0, y: 0, width: 1280, height: 960 };

function step(
  state: StudioWeatherParticleState,
  overrides: Partial<Parameters<typeof stepStudioWeatherParticles>[1]> = {},
): StudioWeatherParticleState {
  return stepStudioWeatherParticles(state, {
    condition: "rain",
    viewport: VIEWPORT,
    deltaSeconds: 0.016,
    particleRatio: 1,
    reducedMotion: false,
    nowMs: 1000,
    ...overrides,
  });
}

describe("studioWeatherParticleTarget", () => {
  it("비는 기본 밀도가 320개다", () => {
    expect(studioWeatherParticleTarget("rain", { particleRatio: 1, reducedMotion: false })).toBe(320);
  });

  it("품질 비율에 비례해 줄어들고 날씨 상한을 넘지 않는다", () => {
    expect(studioWeatherParticleTarget("rain", { particleRatio: 0.5, reducedMotion: false })).toBe(160);
    // 천둥번개 스펙 400 × 1 = 400 (상한)
    expect(studioWeatherParticleTarget("thunderstorm", { particleRatio: 1, reducedMotion: false })).toBe(400);
  });

  it("reduced-motion이면 0개다", () => {
    expect(studioWeatherParticleTarget("rain", { particleRatio: 1, reducedMotion: true })).toBe(0);
  });

  it("파티클 없는 날씨와 빈 입력은 0개다", () => {
    expect(studioWeatherParticleTarget("clear", { particleRatio: 1, reducedMotion: false })).toBe(0);
    expect(studioWeatherParticleTarget(null, { particleRatio: 1, reducedMotion: false })).toBe(0);
  });

  it("꽃잎은 기본 밀도를 품질 비율로 줄인다", () => {
    expect(studioWeatherParticleTarget("petals", { particleRatio: 1, reducedMotion: false })).toBe(STUDIO_PETAL_PARTICLE_COUNT);
    expect(studioWeatherParticleTarget("petals", { particleRatio: 0.5, reducedMotion: false })).toBe(70);
  });
});

describe("stepStudioWeatherParticles", () => {
  it("첫 스텝에서 목표 개수만큼 스폰된다", () => {
    const state = step(createStudioWeatherParticleState());
    expect(state.particles).toHaveLength(320);
    for (const particle of state.particles) expect(particle.kind).toBe("raindrop");
  });

  it("시간이 지나도 목표 개수가 유지된다 (수명 만료분을 보충)", () => {
    let state = step(createStudioWeatherParticleState());
    for (let index = 0; index < 30; index += 1) {
      state = step(state, { nowMs: 1000 + index * 100 });
    }
    expect(state.particles.length).toBeGreaterThan(200);
  });

  it("품질 비율을 낮추면 오래된 파티클부터 정리된다", () => {
    let state = step(createStudioWeatherParticleState());
    state = step(state, { particleRatio: 0.25 });
    expect(state.particles).toHaveLength(80);
    // 재상승하면 다시 채워진다
    state = step(state, { particleRatio: 1 });
    expect(state.particles).toHaveLength(320);
  });

  it("reduced-motion이면 스폰하지 않고 기존 풀도 비운다", () => {
    const filled = step(createStudioWeatherParticleState());
    expect(filled.particles.length).toBeGreaterThan(0);
    const emptied = step(filled, { reducedMotion: true });
    expect(emptied.particles).toHaveLength(0);
  });

  it("꽃잎 모드는 꽃잎만 천천히 떨어뜨린다", () => {
    const state = step(createStudioWeatherParticleState(), { condition: "petals" });
    expect(state.particles).toHaveLength(STUDIO_PETAL_PARTICLE_COUNT);
    for (const particle of state.particles) {
      expect(particle.kind).toBe("petal");
      expect(particle.vy).toBeGreaterThan(0);
      expect(particle.vy).toBeLessThan(120); // 빗방울보다 한참 느리다
    }
  });

  it("맑음이면 파티클이 없다", () => {
    const state = step(createStudioWeatherParticleState(), { condition: "clear" });
    expect(state.particles).toHaveLength(0);
  });

  it("파티클 id가 스텝을 거듭해도 겹치지 않는다", () => {
    let state = step(createStudioWeatherParticleState());
    for (let index = 0; index < 10; index += 1) {
      state = step(state, { nowMs: 2000 + index * 100 });
    }
    const ids = new Set(state.particles.map((particle) => particle.id));
    expect(ids.size).toBe(state.particles.length);
  });
});
