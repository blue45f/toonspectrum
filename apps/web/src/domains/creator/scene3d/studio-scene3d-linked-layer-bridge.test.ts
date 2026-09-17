import { describe, expect, it } from "vitest";

import { captureStudioBg3dShot } from "../bg3d/studio-bg3d-scene-document";
import { createStudioLinked3dRenderPageFixture } from "../studio-linked-3d-render-test-fixture";
import {
  projectStudioScene3dLinkedLayerEdit,
  resolveStudioScene3dLinkedLayerRoundTrip,
} from "./studio-scene3d-linked-layer-bridge";

function roundTrip() {
  const page = createStudioLinked3dRenderPageFixture();
  const element = page.elements[0];
  const bundleId = element?.type === "image" ? element.bg3dLtBundleId : undefined;
  if (!bundleId || !page.shared3dStage || !page.linked3dRender) {
    throw new Error("Linked 3D fixture is incomplete.");
  }
  const result = resolveStudioScene3dLinkedLayerRoundTrip({
    bundleId,
    linked3dRender: page.linked3dRender,
    shared3dStage: page.shared3dStage,
    elements: page.elements,
  });
  if (!result.ok) throw new Error(result.message);
  return { page, result };
}

describe("Studio Scene3D linked layer bridge", () => {
  it("reopens one canonical authority from Canvas layers, Stage, Shot, and pass receipt", () => {
    const { result } = roundTrip();
    expect(result.authority.authorityId).toBe(`linked3d:${result.bundleId}`);
    expect(result.authority.document.revision).toBe(result.link.passRevision.revision);
    expect(result.authority.bg3d.activeShotId).toBe(result.shotId);
    expect(result.layerElementIds).toEqual([`${result.bundleId.replace(/-bundle$/u, "")}-main-line`]);
    expect(result.authority.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("projects a non-destructive edit back to the linked BG3D shot", () => {
    const { result } = roundTrip();
    const edited = {
      ...result.authority.document,
      revision: result.authority.document.revision + 1,
      entities: [
        ...result.authority.document.entities,
        {
          id: "linked-added-cube",
          name: "Linked added cube",
          kind: "primitive" as const,
          primitiveKind: "box" as const,
          color: "#ffffff",
          transform: {
            position: [2, 1, -3] as const,
            rotation: [0, 0, 0, 1] as const,
            scale: [1, 1, 1] as const,
          },
          visible: true,
          locked: false,
          castShadow: true,
          receiveShadow: true,
          parentId: null,
        },
      ],
    };
    const projection = projectStudioScene3dLinkedLayerEdit(result, edited);
    expect(projection).toMatchObject({
      ok: true,
      preservesShotIdentity: true,
      correctionCount: 0,
    });
    expect(projection.projection.bg3d.activeShotId).toBe(result.shotId);
    expect(projection.projection.bg3d.nodes).toContainEqual(expect.objectContaining({
      id: "linked-added-cube",
      transform: expect.objectContaining({ position: [2, 1, -3] }),
    }));
  });

  it("fails closed when the Canvas pass receipt and active shot diverge", () => {
    const page = createStudioLinked3dRenderPageFixture("page-diverged");
    const element = page.elements[0];
    if (
      !element
      || element.type !== "image"
      || !element.bg3dLtBundleId
      || !element.bg3dScene
      || !page.shared3dStage
    ) {
      throw new Error("Linked 3D fixture is incomplete.");
    }
    const divergedScene = captureStudioBg3dShot(element.bg3dScene, {
      id: "other-shot",
      name: "Other shot",
    });
    if (!divergedScene) throw new Error("Diverged shot fixture could not be created.");
    const result = resolveStudioScene3dLinkedLayerRoundTrip({
      bundleId: element.bg3dLtBundleId,
      linked3dRender: page.linked3dRender,
      shared3dStage: page.shared3dStage,
      elements: [{ ...element, bg3dScene: divergedScene }],
    });
    expect(result).toMatchObject({ ok: false, code: "shot-mismatch" });
  });
});
