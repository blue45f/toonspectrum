import { describe, expect, it } from "vitest";

import { buildStudioRasterAssetElements } from "./studio-raster-asset-elements";
import { STUDIO_LEGACY_RASTER_ASSETS } from "./studio-raster-assets";

import type { StudioRasterAsset } from "./studio-raster-assets";
import type { ImageEl } from "../studio-element-model";

const image: ImageEl = { id: "image-1", type: "image", src: "data:image/png;base64,test", x: 40, y: 80, width: 560, height: 320, rotation: 0 };
const legacy = STUDIO_LEGACY_RASTER_ASSETS[0];
const decoration: StudioRasterAsset = {
  ...legacy,
  id: "builtin-raster-test-ornament",
  label: "장식 말풍선",
  kind: "bubble-decoration",
  provenance: { ...legacy.provenance, model: "unverified", modelVersionVerified: false, humanReviewed: false, assistantReviewed: true },
};

describe("장식 말풍선의 편집 가능한 대사 삽입", () => {
  it("기존 소품은 이미지 한 개와 라이선스 식별자를 유지한다", () => {
    const elements = buildStudioRasterAssetElements(legacy, image, () => "unused");
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ ...image, builtinRasterAssetId: legacy.id, name: legacy.label });
  });

  it("장식 이미지와 실제 텍스트를 한 번에 커밋할 수 있는 묶음으로 돌려준다", () => {
    const elements = buildStudioRasterAssetElements(decoration, image, () => "dialogue-1");
    expect(elements.map((element) => element.type)).toEqual(["image", "text"]);
    const artwork = elements[0];
    const dialogue = elements[1];
    expect(artwork).toMatchObject({ src: image.src, aiProvenance: { model: "unverified" } });
    expect(dialogue).toMatchObject({ id: "dialogue-1", text: "대사를 입력하세요" });
    if (dialogue?.type !== "text") throw new Error("편집 가능한 텍스트가 없습니다.");
    expect(dialogue.x).toBeGreaterThan(image.x);
    expect(dialogue.x + dialogue.width).toBeLessThan(image.x + image.width);
    expect(dialogue.y).toBeGreaterThan(image.y);
    expect(dialogue.y + dialogue.fontSize * 1.5).toBeLessThan(image.y + image.height);
    dialogue.text = "고친 대사";
    expect(artwork).toMatchObject({ src: image.src });
    expect(buildStudioRasterAssetElements(decoration, image, () => "fresh")[1]).toMatchObject({ text: "대사를 입력하세요" });
  });
});
