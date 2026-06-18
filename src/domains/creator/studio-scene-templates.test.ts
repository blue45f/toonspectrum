import { describe, it, expect } from "vitest";

import {
  SCENE_TEMPLATES,
  SCENE_TEMPLATE_CATEGORIES,
  listSceneTemplates,
  type SceneSeed,
} from "./studio-scene-templates";

const ALLOWED_TYPES = new Set(["frame", "bubble", "text", "focusLines", "speedLines"]);
const CANVAS_W = 720;

function seedX(seed: SceneSeed): number {
  return seed.x;
}

describe("SCENE_TEMPLATES 데이터", () => {
  it("템플릿이 6개 이상이고 id가 유일하다", () => {
    expect(SCENE_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    const ids = SCENE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 템플릿의 카테고리는 실제 카테고리 목록에 있다", () => {
    const cats = new Set(SCENE_TEMPLATE_CATEGORIES.map((c) => c.id));
    for (const t of SCENE_TEMPLATES) {
      expect(cats.has(t.category)).toBe(true);
    }
  });

  it("build(0,0)은 2개 이상의 시드를 돌려준다", () => {
    for (const t of SCENE_TEMPLATES) {
      expect(t.build(0, 0).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("모든 시드 type은 허용된 종류이고 좌표가 유한·캔버스 폭 안에 있다", () => {
    for (const t of SCENE_TEMPLATES) {
      for (const seed of t.build(0, 0)) {
        expect(ALLOWED_TYPES.has(seed.type)).toBe(true);
        expect(Number.isFinite(seed.x)).toBe(true);
        expect(Number.isFinite(seed.y)).toBe(true);
        expect(seedX(seed)).toBeGreaterThanOrEqual(0);
        expect(seedX(seed)).toBeLessThanOrEqual(CANVAS_W);
      }
    }
  });

  it("필수 필드: 말풍선은 variant/fill/textFill, 효과선은 lineCount를 갖는다", () => {
    for (const t of SCENE_TEMPLATES) {
      for (const seed of t.build(0, 0)) {
        if (seed.type === "bubble") {
          expect(typeof seed.variant).toBe("string");
          expect(seed.fill).toMatch(/^#/);
          expect(seed.textFill).toMatch(/^#/);
          expect(typeof seed.rotation).toBe("number");
        }
        if (seed.type === "focusLines" || seed.type === "speedLines") {
          expect(seed.lineCount).toBeGreaterThan(0);
          expect(seed.strokeWidth).toBeGreaterThan(0);
        }
        if (seed.type === "text") {
          expect(seed.fontSize).toBeGreaterThan(0);
          expect(seed.fill).toMatch(/^#/);
        }
      }
    }
  });

  it("origin을 옮기면 좌표가 그만큼 평행이동한다", () => {
    const t = SCENE_TEMPLATES[0];
    const base = t.build(0, 0);
    const moved = t.build(100, 50);
    for (let i = 0; i < base.length; i++) {
      expect(moved[i].x).toBe(base[i].x + 100);
      expect(moved[i].y).toBe(base[i].y + 50);
    }
  });
});

describe("listSceneTemplates", () => {
  it("미지정이면 전체", () => {
    expect(listSceneTemplates()).toHaveLength(SCENE_TEMPLATES.length);
  });

  it("카테고리로 거른다", () => {
    const action = listSceneTemplates("action");
    expect(action.length).toBeGreaterThan(0);
    expect(action.every((t) => t.category === "action")).toBe(true);
  });

  it("없는 카테고리는 빈 배열", () => {
    expect(listSceneTemplates("nope")).toEqual([]);
  });
});
