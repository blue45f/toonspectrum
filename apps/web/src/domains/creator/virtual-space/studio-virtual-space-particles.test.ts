import { describe, expect, it } from "vitest";
import {
  advanceStudioParticles,
  createStudioFootstepDustState,
  spawnStudioParticles,
  spawnStudioWeatherParticles,
  stepStudioFootstepDust,
  STUDIO_PARTICLE_MAX,
  studioParticleKindLabel,
  studioWeatherParticleKind,
} from "./studio-virtual-space-particles";

const BOUNDS = { width: 1280, height: 960 };

describe("spawnStudioParticles", () => {
  it("요청한 수만큼 스폰한다", () => {
    const particles = spawnStudioParticles("sparkle", { x: 100, y: 100 }, 5, "seed", 0);
    expect(particles).toHaveLength(5);
    for (const particle of particles) {
      expect(particle.kind).toBe("sparkle");
      expect(particle.lifeMs).toBeGreaterThan(0);
    }
  });

  it("같은 시드에서는 같은 파티클이 나온다 (결정적)", () => {
    const first = spawnStudioParticles("dust", { x: 10, y: 20 }, 4, "same", 0);
    const second = spawnStudioParticles("dust", { x: 10, y: 20 }, 4, "same", 0);
    expect(first).toEqual(second);
  });

  it("0개 요청이면 빈 배열이다", () => {
    expect(spawnStudioParticles("leaf", { x: 0, y: 0 }, 0, "s", 0)).toEqual([]);
  });
});

describe("advanceStudioParticles", () => {
  it("수명이 다한 파티클을 제거한다", () => {
    const particles = spawnStudioParticles("dust", { x: 640, y: 480 }, 3, "life", 0, 0, 4);
    // 먼지 최대 수명(700ms)보다 넉넉히 전진
    const advanced = advanceStudioParticles(particles, 1.0, BOUNDS);
    // dt는 0.1로 클램프되므로 여러 번 전진
    let current = particles;
    for (let step = 0; step < 20; step += 1) current = advanceStudioParticles(current, 0.1, BOUNDS);
    expect(current.length).toBeLessThan(particles.length);
    expect(advanced.length).toBeLessThanOrEqual(particles.length);
  });

  it("화면 밖 파티클을 제거한다 (컬링)", () => {
    const particles = spawnStudioParticles("smoke", { x: 640, y: 480 }, 10, "cull", 0, 0, 4);
    const far = particles.map((particle) => ({ ...particle, x: -5000, y: -5000 }));
    const advanced = advanceStudioParticles(far, 0.016, BOUNDS);
    expect(advanced).toHaveLength(0);
  });

  it("상한을 넘으면 오래된 것부터 버린다", () => {
    const many = spawnStudioParticles("confetti", { x: 640, y: 480 }, 120, "cap-a", 0, 0, 4)
      .concat(spawnStudioParticles("confetti", { x: 640, y: 480 }, 120, "cap-b", 0, 1000, 4))
      .concat(spawnStudioParticles("confetti", { x: 640, y: 480 }, 120, "cap-c", 0, 2000, 4))
      .concat(spawnStudioParticles("confetti", { x: 640, y: 480 }, 120, "cap-d", 0, 3000, 4))
      .concat(spawnStudioParticles("confetti", { x: 640, y: 480 }, 120, "cap-e", 0, 4000, 4))
      .concat(spawnStudioParticles("confetti", { x: 640, y: 480 }, 120, "cap-f", 0, 5000, 4));
    expect(many.length).toBeGreaterThan(STUDIO_PARTICLE_MAX);
    const advanced = advanceStudioParticles(many, 0.016, BOUNDS);
    expect(advanced.length).toBeLessThanOrEqual(STUDIO_PARTICLE_MAX);
  });

  it("빗방울은 아래로 떨어진다", () => {
    const particles = spawnStudioParticles("raindrop", { x: 640, y: 100 }, 3, "rain", 0, 0, 2);
    const advanced = advanceStudioParticles(particles, 0.1, BOUNDS);
    for (let index = 0; index < particles.length; index += 1) {
      expect(advanced[index]!.y).toBeGreaterThan(particles[index]!.y);
    }
  });
});

describe("stepStudioFootstepDust", () => {
  it("이동 중이면 간격마다 먼지를 낸다", () => {
    let state = createStudioFootstepDustState();
    const first = stepStudioFootstepDust(state, { feet: { x: 100, y: 200 }, moving: true, nowMs: 0, reducedMotion: false });
    expect(first.particles.length).toBeGreaterThan(0);
    state = first.state;
    const second = stepStudioFootstepDust(state, { feet: { x: 100, y: 200 }, moving: true, nowMs: 100, reducedMotion: false });
    expect(second.particles).toHaveLength(0); // 쿨다운
  });

  it("서 있거나 reduced-motion이면 스폰하지 않는다", () => {
    const state = createStudioFootstepDustState();
    expect(stepStudioFootstepDust(state, { feet: { x: 0, y: 0 }, moving: false, nowMs: 0, reducedMotion: false }).particles).toHaveLength(0);
    expect(stepStudioFootstepDust(state, { feet: { x: 0, y: 0 }, moving: true, nowMs: 0, reducedMotion: true }).particles).toHaveLength(0);
  });
});

describe("studioWeatherParticleKind / spawnStudioWeatherParticles", () => {
  it("비·눈·천둥번개만 파티클 종류를 가진다", () => {
    expect(studioWeatherParticleKind("rain")).toBe("raindrop");
    expect(studioWeatherParticleKind("snow")).toBe("snowflake");
    expect(studioWeatherParticleKind("thunderstorm")).toBe("raindrop");
    expect(studioWeatherParticleKind("clear")).toBeNull();
    expect(studioWeatherParticleKind(null)).toBeNull();
  });

  it("뷰포트 안에 날씨 파티클을 스폰한다", () => {
    const viewport = { x: 0, y: 0, width: 1280, height: 720 };
    const particles = spawnStudioWeatherParticles("snow", viewport, 20, "wx", 0);
    expect(particles).toHaveLength(20);
    for (const particle of particles) {
      expect(particle.kind).toBe("snowflake");
      expect(particle.x).toBeGreaterThanOrEqual(viewport.x);
      expect(particle.x).toBeLessThanOrEqual(viewport.x + viewport.width);
    }
    expect(spawnStudioWeatherParticles("clear", viewport, 20, "wx", 0)).toHaveLength(0);
  });
});

describe("studioParticleKindLabel", () => {
  it("한·영 라벨을 반환한다", () => {
    expect(studioParticleKindLabel("dust")).toEqual({ ko: "먼지", en: "Dust" });
    expect(studioParticleKindLabel("snowflake")).toEqual({ ko: "눈송이", en: "Snowflake" });
  });
});
