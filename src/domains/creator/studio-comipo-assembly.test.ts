import { describe, expect, it } from "vitest";

import { assembleComipoPage } from "./studio-comipo-assembly";
import { PANEL_LAYOUTS } from "./studio-panel-layouts";
import { SCENE_TEMPLATES } from "./studio-scene-templates";

describe("assembleComipoPage", () => {
  it("materializes frames and bubble seeds from a panel layout", () => {
    const layout = PANEL_LAYOUTS.find((item) => item.id === "layout_talk_2_bubbles");
    expect(layout).toBeTruthy();
    const result = assembleComipoPage({ layoutId: layout!.id });
    expect(result).not.toBeNull();
    expect(result!.frameCount).toBe(layout!.frames.length);
    expect(result!.bubbleCount).toBeGreaterThanOrEqual((layout!.bubbles ?? []).length);
    expect(result!.canvasH).toBe(layout!.canvasH);
  });

  it("layers scene template and dialogue on top of panel layout", () => {
    const layoutId = "layout_two_rows";
    const sceneId = SCENE_TEMPLATES[0]!.id;
    const result = assembleComipoPage({
      layoutId,
      sceneTemplateId: sceneId,
      dialogueScript: "민수: 안녕\n지영: 반가워",
    });
    expect(result).not.toBeNull();
    expect(result!.frameCount).toBeGreaterThanOrEqual(2);
    expect(result!.bubbleCount).toBeGreaterThanOrEqual(3);
    expect(result!.seeds.length).toBeGreaterThan(result!.frameCount + 1);
  });

  it("returns null for unknown layout id", () => {
    expect(assembleComipoPage({ layoutId: "missing-layout" })).toBeNull();
  });
});