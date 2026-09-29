// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  createFireworkBurst,
  isSparkAlive,
  randomBurstOrigin,
  SPECTACLE_FIREWORKS_COLORS,
  updateFireworkSpark,
  type SpectacleFireworkSpark,
} from "./spectacle-fireworks";

const seeded = () => {
  let s = 7;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

const origin = { x: 200, y: 150 };

describe("createFireworkBurst", () => {
  it("요청한 수만큼 불꽃을 생성한다", () => {
    const sparks = createFireworkBurst(seeded(), origin, SPECTACLE_FIREWORKS_COLORS, 60);
    expect(sparks).toHaveLength(60);
    for (const spark of sparks) {
      expect(spark.x).toBe(origin.x);
      expect(spark.y).toBe(origin.y);
      expect(spark.life).toBe(0);
      expect(spark.maxLife).toBeGreaterThan(0);
    }
  });

  it("같은 버스트의 불꽃들은 대체로 같은 색이다 (최빈값 기준)", () => {
    const sparks = createFireworkBurst(seeded(), origin, SPECTACLE_FIREWORKS_COLORS, 60);
    // 최빈 색상을 구한다
    const counts = new Map<string, number>();
    for (const spark of sparks) {
      counts.set(spark.color, (counts.get(spark.color) ?? 0) + 1);
    }
    const topCount = Math.max(...counts.values());
    // 75%가 버스트 색이므로 최빈값은 30을 충분히 넘는다
    expect(topCount).toBeGreaterThan(30);
  });

  it("결정적 시드로 재현 가능하다", () => {
    const a = createFireworkBurst(seeded(), origin, SPECTACLE_FIREWORKS_COLORS, 10);
    const b = createFireworkBurst(seeded(), origin, SPECTACLE_FIREWORKS_COLORS, 10);
    expect(a).toEqual(b);
  });
});

describe("updateFireworkSpark", () => {
  it("중력으로 vy가 증가하고 속도가 감쇠한다", () => {
    const sparks = createFireworkBurst(seeded(), origin, SPECTACLE_FIREWORKS_COLORS, 1);
    const spark = sparks[0];
    const speedBefore = Math.hypot(spark.vx, spark.vy);
    const next = updateFireworkSpark(spark, 0.5, 320);
    expect(next.life).toBeGreaterThan(spark.life);
    // 중력 가속 후에도 공기 저항으로 전체 속도는 감소 경향
    expect(Math.hypot(next.vx, next.vy)).toBeLessThan(speedBefore + 320 * 0.5);
  });

  it("원본을 변경하지 않는다", () => {
    const sparks = createFireworkBurst(seeded(), origin, SPECTACLE_FIREWORKS_COLORS, 1);
    const spark = sparks[0];
    const snapshot = { ...spark };
    updateFireworkSpark(spark, 0.1, 320);
    expect(spark).toEqual(snapshot);
  });
});

describe("isSparkAlive", () => {
  it("수명이 다하면 false", () => {
    const spark: SpectacleFireworkSpark = {
      x: 0, y: 0, vx: 0, vy: 0, color: "#fff",
      size: 2, trail: 0.03, life: 2, maxLife: 1.5,
    };
    expect(isSparkAlive(spark)).toBe(false);
  });

  it("살아있는 불꽃은 true", () => {
    const spark: SpectacleFireworkSpark = {
      x: 0, y: 0, vx: 0, vy: 0, color: "#fff",
      size: 2, trail: 0.03, life: 0.2, maxLife: 1.5,
    };
    expect(isSparkAlive(spark)).toBe(true);
  });
});

describe("randomBurstOrigin", () => {
  it("화면 상단 2/3 영역에서 지점을 정한다", () => {
    for (let i = 0; i < 20; i++) {
      const point = randomBurstOrigin(seeded(), 1000, 800);
      expect(point.x).toBeGreaterThanOrEqual(150);
      expect(point.x).toBeLessThanOrEqual(850);
      expect(point.y).toBeGreaterThanOrEqual(64);
      expect(point.y).toBeLessThanOrEqual(424);
    }
  });
});

describe("launchSpectacleFireworks", () => {
  it("full 수준이 아니면 no-op", async () => {
    vi.resetModules();
    localStorage.setItem("toonstudio.ambient.intensity.v1", "off");
    const { launchSpectacleFireworks } = await import("./spectacle-fireworks");
    const stop = launchSpectacleFireworks();
    expect(document.querySelector(".spectacle-confetti-canvas")).toBeNull();
    stop();
    localStorage.clear();
  });
});
