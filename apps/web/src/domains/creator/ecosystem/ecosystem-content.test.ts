import { describe, expect, it } from "vitest";

import { createOriginalSample, ORIGINAL_CONTENT_CREDIT, SAMPLE_WORKS, SCENE_RECIPES } from "./ecosystem-content";

describe("original creator ecosystem content", () => {
  it("ships four complete samples and twelve scene recipes", () => {
    expect(SAMPLE_WORKS).toHaveLength(4);
    expect(SCENE_RECIPES).toHaveLength(12);
  });

  it.each(SAMPLE_WORKS.map(work => [work.id, work.title] as const))("creates editable sample %s", (id, title) => {
    let sequence = 0;
    const page = createOriginalSample(id, 800, "final", () => `test-${sequence++}`);
    expect(page.name).toBe(title);
    expect(page.elements.filter(element => element.type === "frame")).toHaveLength(4);
    expect(page.elements.filter(element => element.type === "bubble")).toHaveLength(8);
    expect(page.elements.some(element => element.type === "image")).toBe(false);
    expect(page.note).toContain(ORIGINAL_CONTENT_CREDIT);
    expect(new Set(page.elements.map(element => element.id)).size).toBe(page.elements.length);
  });

  it("keeps process stages deterministic and rejects unknown samples", () => {
    const nextId = (() => { let sequence = 0; return () => `id-${sequence++}`; })();
    const storyboard = createOriginalSample("romance", 800, "storyboard", nextId);
    expect(storyboard.elements.some(element => element.type === "draw" && element.fill === "#e5e1da")).toBe(true);
    expect(() => createOriginalSample("missing")).toThrow(/등록되지 않은/u);
  });
});
