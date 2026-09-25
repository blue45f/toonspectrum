import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_ASSISTANT_CAMERA_PRESETS,
  STUDIO_BG3D_ASSISTANT_SCENES,
  STUDIO_BG3D_ASSISTANT_STEPS,
  nextStudioBg3dAssistantStep,
  previousStudioBg3dAssistantStep,
  studioBg3dAssistantOutputSettings,
} from "./studio-bg3d-scene-assistant";

describe("studio 3D scene assistant model", () => {
  it("keeps one short result-led path from selection to canvas application", () => {
    expect(STUDIO_BG3D_ASSISTANT_STEPS.map((step) => step.id)).toEqual([
      "choose",
      "arrange",
      "frame",
      "finish",
    ]);
    expect(nextStudioBg3dAssistantStep("choose")).toBe("arrange");
    expect(nextStudioBg3dAssistantStep("finish")).toBeNull();
    expect(previousStudioBg3dAssistantStep("finish")).toBe("frame");
    expect(previousStudioBg3dAssistantStep("choose")).toBeNull();
  });

  it("ships curated ImageGen 2.5 art for every directly selectable scene", () => {
    expect(STUDIO_BG3D_ASSISTANT_SCENES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(STUDIO_BG3D_ASSISTANT_SCENES.map((scene) => scene.id)).size)
      .toBe(STUDIO_BG3D_ASSISTANT_SCENES.length);
    for (const scene of STUDIO_BG3D_ASSISTANT_SCENES) {
      expect(scene.image).toMatch(/^\/assets\/studio\/scene-assistant\/imagegen25-v1\/.+\.webp$/u);
      expect(scene.templateId.length).toBeGreaterThan(2);
      expect(scene.cameraPreset.length).toBeGreaterThan(2);
    }
  });
  it("maps creator-facing output choices to renderer settings without leaking technical tabs", () => {
    expect(studioBg3dAssistantOutputSettings("color")).toEqual({
      lineArtPreview: false,
      tone: { mode: "flat", type: "color", opacity: 1 },
    });
    expect(studioBg3dAssistantOutputSettings("line")).toEqual({
      lineArtPreview: true,
      tone: { mode: "none", opacity: 0 },
    });
    expect(studioBg3dAssistantOutputSettings("tone")).toMatchObject({
      lineArtPreview: true,
      tone: { type: "grayscale" },
    });
  });

  it("offers practical camera outcomes rather than axis terminology", () => {
    const labels = STUDIO_BG3D_ASSISTANT_CAMERA_PRESETS.map((preset) => preset.label);
    expect(labels).toEqual(expect.arrayContaining([
      "3/4 시점",
      "정면",
      "로우앵글",
      "하이앵글",
      "와이드",
      "클로즈업",
    ]));
    expect(labels.join(" ")).not.toMatch(/글로벌|로컬|법선|축/u);
  });
});
