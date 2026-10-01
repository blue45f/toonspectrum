/**
 * 앰비언트 장식물 테스트 (Track 4)
 */
import { describe, expect, it } from "vitest";

import type { ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";
import {
  buildStudioAmbientDecorSprite,
  STUDIO_AMBIENT_DECOR_CATALOG,
  STUDIO_AMBIENT_DECOR_KINDS,
  studioAmbientDecorDef,
} from "./studio-virtual-space-ambient-decor";

function createMockDeps(): ProceduralSheetDeps {
  let counter = 0;
  return {
    createCanvas: (width: number, height: number) => {
      counter += 1;
      const dataUrl = `data:image/png;base64,DECOR-TEST-${counter}`;
      const ctx = new Proxy({}, {
        get: (_target, prop: string | symbol) => {
          if (prop === "canvas") return undefined;
          return () => {};
        },
        set: () => true,
      }) as unknown as CanvasRenderingContext2D;
      return { width, height, getContext: () => ctx, toDataURL: () => dataUrl } as unknown as HTMLCanvasElement;
    },
  };
}

describe("앰비언트 장식물 카탈로그", () => {
  it("12종이다", () => {
    expect(STUDIO_AMBIENT_DECOR_KINDS).toHaveLength(12);
    expect(STUDIO_AMBIENT_DECOR_CATALOG).toHaveLength(12);
  });

  it("정의가 완전하다", () => {
    for (const definition of STUDIO_AMBIENT_DECOR_CATALOG) {
      expect(definition.kind.trim().length).toBeGreaterThan(0);
      expect(definition.labelKo.trim().length).toBeGreaterThan(0);
      expect(definition.labelEn.trim().length).toBeGreaterThan(0);
      expect(definition.descriptionKo.trim().length).toBeGreaterThan(0);
      expect(definition.descriptionEn.trim().length).toBeGreaterThan(0);
      expect(definition.width).toBeGreaterThan(0);
      expect(definition.height).toBeGreaterThan(0);
    }
  });

  it("밤에 불 켜지는 장식물이 있다", () => {
    const nightKinds = STUDIO_AMBIENT_DECOR_CATALOG.filter((definition) => definition.nightGlow).map((definition) => definition.kind);
    expect(nightKinds).toContain("streetlamp");
    expect(nightKinds).toContain("lantern");
    expect(nightKinds).toContain("neon-sign");
    expect(studioAmbientDecorDef("flag")?.nightGlow).toBe(false);
  });

  it("종류로 정의를 찾는다", () => {
    expect(studioAmbientDecorDef("windmill")?.labelKo).toBe("풍차");
    expect(studioAmbientDecorDef("cloud")?.animation).toBe("cloud-drift");
    expect(studioAmbientDecorDef("unknown")).toBeNull();
  });
});

describe("buildStudioAmbientDecorSprite", () => {
  const deps = createMockDeps();

  it("12종 전부 스프라이트를 만든다", () => {
    for (const kind of STUDIO_AMBIENT_DECOR_KINDS) {
      const definition = studioAmbientDecorDef(kind);
      const sprite = buildStudioAmbientDecorSprite(kind, deps);
      expect(sprite.kind).toBe(kind);
      expect(sprite.dataUrl.startsWith("data:image/png")).toBe(true);
      expect(sprite.width).toBe(definition?.width);
      expect(sprite.height).toBe(definition?.height);
    }
  });

  it("알 수 없는 종류는 오류를 낸다", () => {
    expect(() => buildStudioAmbientDecorSprite("unknown" as never, deps)).toThrow("알 수 없는 앰비언트 장식물");
  });
});
