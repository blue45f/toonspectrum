import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getStudioIllustrationTemplateBackground, STUDIO_ILLUSTRATION_SCENE_TEMPLATES } from "./studio-illustration-scene-templates";
import { summarizeStudioSceneTemplate } from "./studio-scene-template-summary";
import { planStudioIllustrationTemplateInsertion } from "./studio-illustration-template-insertion";

import type { El } from "../studio-element-model";

const existing = [
  { id: "user-frame", type: "frame", x: 24, y: 100, width: 672, height: 1_100, bg: "user-original.png" },
  { id: "user-text", type: "text", text: "기존 대사", x: 40, y: 160, width: 300, fontSize: 30, fill: "#000", rotation: 0 },
] satisfies El[];

describe("생성 배경 포함 완성형 템플릿 삽입", () => {
  it.each(STUDIO_ILLUSTRATION_SCENE_TEMPLATES)("$id 미리보기와 같은 새 프레임·배경·대사를 한 묶음으로 추가한다", (template) => {
    let sequence = 0;
    const before = structuredClone(existing);
    const plan = planStudioIllustrationTemplateInsertion(template.id, existing, 1_300, () => `new-${sequence++}`, (src) => `https://example.test${src}`);
    expect(plan).not.toBeNull();
    if (!plan) return;
    const background = getStudioIllustrationTemplateBackground(template.id);
    const preview = summarizeStudioSceneTemplate(template);
    expect(plan.elements.slice(0, existing.length)).toEqual(before);
    expect(plan.elements[0]).toBe(existing[0]);
    expect(plan.originY).toBe(1_240);
    expect(plan.canvasH).toBeGreaterThan(1_300);
    expect(plan.addedElements).toHaveLength(preview.seeds.length);
    for (const [index, element] of plan.addedElements.entries()) {
      const seed = preview.seeds[index];
      expect(element.type).toBe(seed.type);
      if (!("x" in element) || !("y" in element)) throw new Error("템플릿 요소의 위치가 없습니다.");
      expect(element.x).toBe(seed.x);
      expect(element.y).toBe(seed.y + plan.originY);
      if (element.type === "frame") {
        expect(element.bg).toBe(`https://example.test${background?.src}`);
        expect(element.aiProvenance?.model).toBe("unverified");
      }
      if (element.type === "bubble" || element.type === "text") {
        expect("text" in seed ? seed.text : null).toBe(element.text);
      }
    }
    expect(new Set(plan.elements.map((element) => element.id)).size).toBe(plan.elements.length);
    expect(existing).toEqual(before);
  });

  it("빈 페이지에서도 원본 컷 수를 보존하고 높이 한도 초과는 변경 전 거부한다", () => {
    let nextId = 0;
    const plan = planStudioIllustrationTemplateInsertion("illustrated-cafe-small-talk", [], 1_080, () => String(nextId++));
    expect(plan?.originY).toBe(24);
    expect(plan?.addedElements.filter((element) => element.type === "frame")).toHaveLength(3);
    expect(() => planStudioIllustrationTemplateInsertion("illustrated-cafe-small-talk", [{ ...existing[0], y: 99_000 }], 100_000, () => "id")).toThrow("높이 한도");
    expect(planStudioIllustrationTemplateInsertion("confession", [], 1_080, () => "id")).toBeNull();
  });

  it("제품 적용 경로는 요소와 캔버스 높이를 하나의 undo 커밋으로 전달한다", () => {
    const host = readFileSync(new URL("../StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
    const start = host.indexOf('if (template.id.startsWith("illustrated-"))');
    const branch = host.slice(start, host.indexOf("const { runStudioPageAddSceneTemplate }", start));
    expect(branch.match(/\bcommit\(/gu)).toHaveLength(1);
    expect(branch).toContain("commit(plan.elements, { canvasH: plan.canvasH })");
    expect(branch).not.toContain("addBgScene(");
    expect(branch.indexOf("canApplyDeferredComipoAction")).toBeLessThan(branch.indexOf("commit("));
  });
});
