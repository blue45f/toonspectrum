import { describe, expect, it } from "vitest";
import {
  buildStudioAnimalSpriteSheet,
  renderStudioAnimalPreview,
  STUDIO_ANIMAL_FRAME,
  STUDIO_ANIMAL_IDLE_FRAMES,
  STUDIO_ANIMAL_SPRITE_KINDS,
  STUDIO_ANIMAL_WALK_FRAMES,
  studioAnimalSpriteLabel,
} from "./studio-virtual-space-animal-sprites";
import type { ProceduralSheetDeps } from "./studio-virtual-space-character-procedural";

function createMockDeps(): ProceduralSheetDeps {
  let counter = 0;
  return {
    createCanvas: (width: number, height: number) => {
      counter += 1;
      const dataUrl = `data:image/png;base64,ANIMAL-TEST-${counter}`;
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

describe("buildStudioAnimalSpriteSheet", () => {
  const deps = createMockDeps();

  it("동물 6종의 시트를 만든다", () => {
    expect(STUDIO_ANIMAL_SPRITE_KINDS).toEqual(["cat", "dog", "fox", "bird", "butterfly", "rabbit"]);
    for (const kind of STUDIO_ANIMAL_SPRITE_KINDS) {
      const sheet = buildStudioAnimalSpriteSheet(kind, deps);
      expect(sheet.kind).toBe(kind);
      expect(sheet.dataUrl.startsWith("data:image/png")).toBe(true);
      expect(sheet.frameWidth).toBe(STUDIO_ANIMAL_FRAME);
      expect(sheet.frameHeight).toBe(STUDIO_ANIMAL_FRAME);
      expect(sheet.width).toBe(STUDIO_ANIMAL_FRAME * (STUDIO_ANIMAL_WALK_FRAMES + STUDIO_ANIMAL_IDLE_FRAMES));
      expect(sheet.height).toBe(STUDIO_ANIMAL_FRAME * 3);
      expect(sheet.directions).toEqual({ down: 0, up: 1, side: 2 });
    }
  });

  it("알 수 없는 종류는 오류를 낸다", () => {
    expect(() => buildStudioAnimalSpriteSheet("dragon" as never, deps)).toThrow();
  });

  it("미리보기를 렌더링한다", () => {
    const preview = renderStudioAnimalPreview("fox", deps);
    expect(preview.dataUrl.startsWith("data:image/png")).toBe(true);
    expect(preview.width).toBe(STUDIO_ANIMAL_FRAME);
  });

  it("한·영 라벨을 제공한다", () => {
    expect(studioAnimalSpriteLabel("cat")).toEqual({ ko: "고양이", en: "Cat" });
    expect(studioAnimalSpriteLabel("butterfly")).toEqual({ ko: "나비", en: "Butterfly" });
    expect(studioAnimalSpriteLabel("unknown")).toEqual({ ko: "동물", en: "Animal" });
  });
});
