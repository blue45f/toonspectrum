import { describe, expect, it } from "vitest";

import { createStudioLinked3dRenderPageFixture } from "../studio-linked-3d-render-test-fixture";
import type { El } from "../studio-element-model";
import {
  projectStudioScene3dLinkedLayerEdit,
  resolveCanonicalStudioBg3dSceneForBundle,
  resolveStudioScene3dLinkedLayerRoundTrip,
} from "./studio-scene3d-linked-layer-bridge";

function roundTrip() {
  const page = createStudioLinked3dRenderPageFixture();
  const element = page.elements[0] as Extract<El, { type: "image" }> | undefined;
  const bundleId = element?.bg3dLtBundleId;
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
          id: "roundtrip-box",
          name: "Round-trip box",
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
    expect(projection.projection.bg3d.nodes[0]?.transform.position).toEqual([2, 1, -3]);
  });

  it("fails closed when the Canvas pass receipt and active shot diverge", () => {
    const page = createStudioLinked3dRenderPageFixture("page-diverged");
    const element = page.elements[0] as Extract<El, { type: "image" }> | undefined;
    if (!element?.bg3dLtBundleId || !element.bg3dScene || !page.shared3dStage) {
      throw new Error("Linked 3D fixture is incomplete.");
    }
    const result = resolveStudioScene3dLinkedLayerRoundTrip({
      bundleId: element.bg3dLtBundleId,
      linked3dRender: page.linked3dRender,
      shared3dStage: page.shared3dStage,
      elements: [{ ...element, bg3dScene: { ...element.bg3dScene, activeShotId: "other-shot" } }],
    });
    expect(result).toMatchObject({ ok: false, code: "page-cross-reference-invalid" });
  });

  it("fails closed when linked layer BG3D scenes disagree", () => {
    const page = createStudioLinked3dRenderPageFixture("page-scene-diverge");
    const element = page.elements[0] as Extract<El, { type: "image" }> | undefined;
    if (!element?.bg3dLtBundleId || !element.bg3dScene) {
      throw new Error("Linked 3D fixture is incomplete.");
    }
    const twin = {
      ...element,
      id: `${element.id}-twin`,
      bg3dScene: {
        ...element.bg3dScene,
        camera: {
          ...element.bg3dScene.camera,
          fovDegrees: (element.bg3dScene.camera.fovDegrees ?? 50) + 7,
        },
      },
    };
    expect(resolveCanonicalStudioBg3dSceneForBundle([element], element.bg3dLtBundleId)).toMatchObject({
      ok: true,
    });
    expect(resolveCanonicalStudioBg3dSceneForBundle([element, twin], element.bg3dLtBundleId)).toEqual({
      ok: false,
      reason: "diverged",
    });
    expect(resolveCanonicalStudioBg3dSceneForBundle([], element.bg3dLtBundleId)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

});
