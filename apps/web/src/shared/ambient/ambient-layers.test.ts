import { describe, expect, it } from "vitest";

import {
  AMBIENT_FLASH_MAX_OPACITY,
  AMBIENT_FLASH_MIN_INTERVAL_SECONDS,
  AMBIENT_REFERENCE_AREA,
  ambientDensityScale,
  buildAmbientLayers,
  type AmbientLayerContext,
  type AmbientLayerSpec,
  type AmbientParticleLayerSpec,
} from "./ambient-layers";
import type { AmbientScene, AmbientSceneKind } from "./ambient-engine";

const DESKTOP: AmbientLayerContext = { tone: "dark", lowPower: false, area: AMBIENT_REFERENCE_AREA };

function scene(
  kind: AmbientSceneKind,
  overrides: Partial<Pick<AmbientScene, "accent" | "intensity" | "timePhase">> = {},
) {
  return { kind, accent: null, intensity: "subtle" as const, timePhase: "day" as const, ...overrides };
}

function particles(layers: readonly AmbientLayerSpec[]): AmbientParticleLayerSpec[] {
  return layers.filter((layer): layer is AmbientParticleLayerSpec => layer.type === "particles");
}

function total(layers: readonly AmbientLayerSpec[]): number {
  return particles(layers).reduce((sum, layer) => sum + layer.count, 0);
}

describe("buildAmbientLayers: 효과 카탈로그", () => {
  it("비: 바람에 기울어진 빠른 빗줄기", () => {
    const [rain] = particles(buildAmbientLayers(scene("rain"), DESKTOP));
    expect(rain?.style).toBe("streak");
    expect(rain?.fall.min).toBeGreaterThan(400);
    expect(rain?.drift.min).toBeGreaterThan(0);
  });

  it("뇌우: 비 + 드문 약한 번쩍임(8초에 최대 1회, 낮은 알파)", () => {
    const layers = buildAmbientLayers(scene("thunderstorm", { intensity: "vivid" }), DESKTOP);
    const flash = layers.find((layer) => layer.type === "flash");
    expect(flash).toBeDefined();
    if (flash?.type !== "flash") return;
    expect(flash.minIntervalSeconds).toBeGreaterThanOrEqual(AMBIENT_FLASH_MIN_INTERVAL_SECONDS);
    expect(flash.maxIntervalSeconds).toBeGreaterThan(flash.minIntervalSeconds);
    expect(flash.peakOpacity).toBeLessThanOrEqual(AMBIENT_FLASH_MAX_OPACITY);
    expect(particles(layers)[0]?.style).toBe("streak");
    // 번쩍임은 빗줄기 뒤에 그린다.
    expect(layers.indexOf(flash)).toBe(0);
  });

  it("밝은 바탕에서는 번쩍임을 그리지 않는다", () => {
    const layers = buildAmbientLayers(scene("thunderstorm"), { ...DESKTOP, tone: "light" });
    expect(layers.some((layer) => layer.type === "flash")).toBe(false);
  });

  it("눈: 흔들리며 천천히 내린다", () => {
    const [snow] = particles(buildAmbientLayers(scene("snow"), DESKTOP));
    expect(snow?.style).toBe("flake");
    expect(snow?.fall.max).toBeLessThan(120);
    expect(snow?.sway.max).toBeGreaterThan(0);
  });

  it("맑은 낮: 상단 모서리 햇살 줄기 + 떠오르는 빛 알갱이", () => {
    const morning = buildAmbientLayers(scene("sunny", { timePhase: "morning" }), DESKTOP);
    const noon = buildAmbientLayers(scene("sunny", { timePhase: "day" }), DESKTOP);
    const rays = morning.find((layer) => layer.type === "sunrays");
    expect(rays?.type === "sunrays" && rays.corner).toBe("top-left");
    const noonRays = noon.find((layer) => layer.type === "sunrays");
    expect(noonRays?.type === "sunrays" && noonRays.corner).toBe("top-right");
    const [motes] = particles(noon);
    expect(motes?.style).toBe("mote");
    expect(motes?.fall.max).toBeLessThan(0);
    expect(motes?.twinkle).not.toBeNull();
  });

  it("맑은 밤: 반짝이는 별 + 반딧불 소량, 화려하게일 때만 별똥별", () => {
    const subtle = particles(buildAmbientLayers(scene("clear-night"), DESKTOP));
    expect(subtle.map((layer) => layer.style)).toEqual(["star", "glow"]);
    expect(subtle[1]?.count).toBeLessThan(subtle[0]?.count ?? 0);
    expect(subtle[0]?.shootingStars).toBeNull();
    const vivid = particles(buildAmbientLayers(scene("clear-night", { intensity: "vivid" }), DESKTOP));
    expect(vivid[0]?.shootingStars).not.toBeNull();
  });

  it("흐림: 화면 상단에만 틈 있는 구름 실루엣(전체를 덮는 막 없음)", () => {
    const layers = buildAmbientLayers(scene("cloudy"), DESKTOP);
    expect(layers).toHaveLength(1);
    const clouds = layers[0];
    expect(clouds?.type).toBe("clouds");
    if (clouds?.type !== "clouds") return;
    expect(clouds.band).toBeLessThanOrEqual(0.5);
    expect(clouds.opacity.max).toBeLessThanOrEqual(0.2);
    expect(clouds.count).toBeLessThanOrEqual(6);
  });

  it.each([
    ["petals", "petal"],
    ["leaves", "leaf"],
    ["fireflies", "glow"],
  ] as const)("계절 효과 %s → %s 파티클", (kind, style) => {
    expect(particles(buildAmbientLayers(scene(kind), DESKTOP))[0]?.style).toBe(style);
  });

  it("화려하게의 계절 보조 효과는 파티클만 옅게 덧붙인다", () => {
    const layers = buildAmbientLayers(scene("sunny", { intensity: "vivid", accent: "leaves" }), DESKTOP);
    const leaf = particles(layers).find((layer) => layer.style === "leaf");
    const solo = particles(buildAmbientLayers(scene("leaves", { intensity: "vivid" }), DESKTOP))[0];
    expect(leaf).toBeDefined();
    expect(leaf?.count).toBeLessThan(solo?.count ?? 0);
    expect(layers.filter((layer) => layer.type === "sunrays")).toHaveLength(1);
  });
});

describe("밀도", () => {
  it("은은하게는 화려하게보다 희박하다", () => {
    const subtle = total(buildAmbientLayers(scene("rain"), DESKTOP));
    const vivid = total(buildAmbientLayers(scene("rain", { intensity: "vivid" }), DESKTOP));
    expect(subtle).toBeLessThan(vivid * 0.6);
  });

  it("저사양이면 밀도를 절반으로 줄인다", () => {
    const normal = ambientDensityScale("vivid", DESKTOP);
    const low = ambientDensityScale("vivid", { ...DESKTOP, lowPower: true });
    expect(low).toBeCloseTo(normal / 2);
    const count = total(buildAmbientLayers(scene("snow", { intensity: "vivid" }), DESKTOP));
    const lowCount = total(buildAmbientLayers(scene("snow", { intensity: "vivid" }), { ...DESKTOP, lowPower: true }));
    expect(lowCount).toBeCloseTo(count / 2, -1);
  });

  it("그리는 넓이에 비례해 같은 밀도로 보인다(작은 미리보기에도 최소 개수 유지)", () => {
    const phone = total(buildAmbientLayers(scene("rain"), { ...DESKTOP, area: 390 * 844 }));
    const desktop = total(buildAmbientLayers(scene("rain"), DESKTOP));
    expect(phone).toBeLessThan(desktop);
    const tiny = total(buildAmbientLayers(scene("petals"), { ...DESKTOP, area: 10 }));
    expect(tiny).toBeGreaterThanOrEqual(3);
  });

  it("은은하게 기본에서 한 화면 파티클 수가 과하지 않다", () => {
    for (const kind of ["rain", "thunderstorm", "snow", "petals", "leaves", "fireflies", "sunny", "clear-night"] as const) {
      expect(total(buildAmbientLayers(scene(kind), DESKTOP))).toBeLessThanOrEqual(100);
    }
  });
});
