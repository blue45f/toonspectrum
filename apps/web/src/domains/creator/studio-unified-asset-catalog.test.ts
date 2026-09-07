import { describe, expect, it } from "vitest";

import {
  buildStudioUnifiedAssetCatalog,
  countStudioUnifiedAssets,
  curateStudioUnifiedAssetHighlights,
  searchStudioUnifiedAssets,
  type StudioUnifiedBackgroundSource,
} from "./studio-unified-asset-catalog";

import type { StudioElementItem } from "./studio-elements-catalog";
import type { StudioObjectInsertItem } from "./studio-object-insert-catalog";
import type { StudioAsset } from "./studio-asset-library";
import type { SceneTemplate } from "./studio-scene-templates";

const backgrounds: readonly StudioUnifiedBackgroundSource[] = [
  {
    id: "school-night",
    label: "비 오는 밤 학교 복도",
    genre: "학원",
    imgSrc: "/school-night.webp",
    width: 1536,
    height: 1024,
  },
  {
    id: "school-night",
    label: "중복 학교 복도",
    genre: "학원",
    imgSrc: "/duplicate.webp",
  },
];

const sceneTemplate: SceneTemplate = {
  id: "confession-test",
  label: "고백 장면",
  category: "romance",
  description: "두 사람이 대화하는 로맨스 장면",
  build: () => [],
};

const element: StudioElementItem = {
  id: "effect-rain-test",
  label: "빗줄기 효과",
  category: "effect",
  keywords: ["비", "우천", "rain"],
  width: 320,
  height: 320,
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
};

const object3d: StudioObjectInsertItem = {
  id: "obj-prop-chair-test",
  kind: "vrm-prop",
  sourceId: "chair-test",
  label: "교실 의자",
  family: "prop-body",
  familyLabel: "몸 소품",
  keywords: ["학교", "의자", "chair"],
  hint: "3D 포즈 도구에서 교실 의자를 엽니다.",
  openTarget: "vrm-poser",
  defaultWidth: 280,
  defaultHeight: 280,
};

const localAsset: StudioAsset = {
  id: "local-school-logo",
  name: "내 학교 문양",
  dataUrl: "data:image/png;base64,AA==",
  width: 512,
  height: 512,
  createdAt: 2,
  kind: "ai",
};

function catalog() {
  return buildStudioUnifiedAssetCatalog({
    backgrounds,
    sceneTemplates: [sceneTemplate],
    localAssets: [localAsset],
    elements: [element],
    objects: [object3d],
  });
}

describe("Studio unified asset catalog", () => {
  it("deduplicates source ids and exposes every discovery family", () => {
    const items = catalog();
    expect(items).toHaveLength(5);
    expect(items.filter((item) => item.id === "background:school-night")).toHaveLength(1);
    expect(countStudioUnifiedAssets(items)).toEqual({
      all: 5,
      scene: 2,
      element: 1,
      "3d": 1,
      mine: 1,
    });
  });

  it("matches Korean multi-token queries and their synonyms", () => {
    const results = searchStudioUnifiedAssets(catalog(), { query: "학교 밤" });
    expect(results.map((item) => item.id)).toContain("background:school-night");

    const threeD = searchStudioUnifiedAssets(catalog(), { query: "입체 의자" });
    expect(threeD.map((item) => item.id)).toEqual(["3d:obj-prop-chair-test"]);
  });

  it("keeps scope and category filters independent", () => {
    const items = catalog();
    expect(searchStudioUnifiedAssets(items, { scope: "mine" }).map((item) => item.id))
      .toEqual(["local:local-school-logo"]);
    expect(searchStudioUnifiedAssets(items, { category: "element" }).map((item) => item.id))
      .toEqual(["element:effect-rain-test"]);
  });

  it("ranks an exact title match before broad keyword matches", () => {
    const results = searchStudioUnifiedAssets(catalog(), { query: "고백 장면" });
    expect(results[0]?.id).toBe("scene-template:confession-test");
  });

  it("curates balanced highlights instead of filling the first category only", () => {
    const highlights = curateStudioUnifiedAssetHighlights(catalog(), { limit: 5 });
    expect(new Set(highlights.map((item) => item.category))).toEqual(
      new Set(["scene", "element", "3d", "mine"]),
    );
  });
});
