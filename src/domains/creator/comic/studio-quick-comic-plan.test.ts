import { describe, expect, it } from "vitest";

import { PANEL_LAYOUTS } from "../studio-panel-layouts";
import { SCENE_TEMPLATES } from "../studio-scene-templates";

import {
  clampQuickComicStep,
  createQuickComicDraft,
  createQuickComicInput,
  createQuickComicPreview,
  QUICK_COMIC_STEPS,
} from "./studio-quick-comic-plan";

describe("studio quick comic plan", () => {
  it("starts with a valid, useful layout and no pretend character or scene", () => {
    const draft = createQuickComicDraft();

    expect(PANEL_LAYOUTS.some((layout) => layout.id === draft.layoutId)).toBe(true);
    expect(draft.sceneTemplateId).toBeNull();
    expect(draft.dialogueScript).toBe("");
  });

  it("normalizes optional fields and clamps the scene target to a real frame", () => {
    const layout = PANEL_LAYOUTS.find((candidate) => candidate.frames.length >= 2)!;
    const scene = SCENE_TEMPLATES[0]!;
    const input = createQuickComicInput({
      layoutId: layout.id,
      sceneTemplateId: scene.id,
      sceneFrameIndex: 999,
      dialogueScript: "  하나: 안녕\n둘: 반가워  ",
    });

    expect(input).toEqual({
      layoutId: layout.id,
      sceneTemplateId: scene.id,
      sceneFrameIndex: layout.frames.length - 1,
      dialogueScript: "하나: 안녕\n둘: 반가워",
    });
  });

  it("omits empty optional fields and rejects unknown catalog ids", () => {
    const draft = createQuickComicDraft();

    expect(createQuickComicInput(draft)).toEqual({ layoutId: draft.layoutId });
    expect(createQuickComicInput({ ...draft, layoutId: "missing-layout" })).toBeNull();
    expect(createQuickComicInput({ ...draft, sceneTemplateId: "missing-scene" })).toBeNull();
  });

  it("previews through the shipped assembler and reports the composed result", () => {
    const draft = createQuickComicDraft();
    const preview = createQuickComicPreview({
      ...draft,
      sceneTemplateId: SCENE_TEMPLATES[0]!.id,
      dialogueScript: "민수: 안녕\n\n[잠시 후]\n지영: 반가워",
    });

    expect(preview).not.toBeNull();
    expect(preview!.assembly.frameCount).toBe(preview!.layout.frames.length);
    expect(preview!.assembly.seeds.length).toBeGreaterThan(preview!.assembly.frameCount);
    expect(preview!.dialogueCount).toBe(3);
    expect(preview!.input).toMatchObject({
      layoutId: draft.layoutId,
      sceneTemplateId: SCENE_TEMPLATES[0]!.id,
    });
  });

  it("keeps step movement inside the four-step contract", () => {
    expect(QUICK_COMIC_STEPS.map((step) => step.id)).toEqual([
      "layout",
      "scene",
      "dialogue",
      "review",
    ]);
    expect(clampQuickComicStep(-3)).toBe(0);
    expect(clampQuickComicStep(2.8)).toBe(2);
    expect(clampQuickComicStep(99)).toBe(3);
  });
});
