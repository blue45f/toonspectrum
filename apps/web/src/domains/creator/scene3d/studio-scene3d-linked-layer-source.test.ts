import { describe, expect, it } from "vitest";

import { captureStudioBg3dShot } from "../bg3d/studio-bg3d-scene-document";
import { createStudioLinked3dRenderPageFixture } from "../studio-linked-3d-render-test-fixture";
import { resolveStudioScene3dLinkedLayerEditSource } from "./studio-scene3d-linked-layer-source";

function fixture() {
  const page = createStudioLinked3dRenderPageFixture();
  const element = page.elements[0];
  if (
    !element
    || element.type !== "image"
    || !element.bg3dLtBundleId
    || !element.bg3dScene
    || !page.shared3dStage
    || !page.linked3dRender
  ) {
    throw new Error("Linked 3D fixture is incomplete.");
  }
  return { page, element };
}

describe("Studio Scene3D lightweight linked source", () => {
  it("restores the canonical BG3D scene without constructing Scene3D authority", () => {
    const { page, element } = fixture();
    const scene = resolveStudioScene3dLinkedLayerEditSource({
      bundleId: element.bg3dLtBundleId,
      linked3dRender: page.linked3dRender,
      shared3dStage: page.shared3dStage,
      elements: page.elements,
    });
    expect(scene).toEqual(element.bg3dScene);
  });

  it("fails closed when the linked shot and canonical scene diverge", () => {
    const { page, element } = fixture();
    const divergedScene = captureStudioBg3dShot(element.bg3dScene, {
      id: "other-shot",
      name: "Other shot",
    });
    if (!divergedScene) throw new Error("Diverged shot fixture could not be created.");
    const scene = resolveStudioScene3dLinkedLayerEditSource({
      bundleId: element.bg3dLtBundleId,
      linked3dRender: page.linked3dRender,
      shared3dStage: page.shared3dStage,
      elements: [{ ...element, bg3dScene: divergedScene }],
    });
    expect(scene).toBeNull();
  });
});
