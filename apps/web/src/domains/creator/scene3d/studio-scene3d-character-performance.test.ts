import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../bg3d/studio-bg3d-scene-document";
import { createStudioShared3dSceneSession } from "../studio-shared-3d-scene-bridge";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { createStudioScene3dAuthority } from "./studio-scene3d-authority";
import { planStudioScene3dCharacterPerformance } from "./studio-scene3d-character-performance";

import type { StudioBg3dSharedCharacterGroundingReceipt } from "../bg3d/studio-bg3d-shared-character-grounding";

function authority() {
  return createStudioScene3dAuthority({
    authorityId: "scene:character-performance",
    bg3d: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    sharedSceneSession: createStudioShared3dSceneSession([{
      elementId: "hero",
      label: "Hero",
      scene: createStudioVrmSceneDocument(),
      stageTransform: { position: [0, 0, 0], rotationY: 0 },
    }]),
    viewportAspectRatio: 16 / 9,
    revision: 2,
    now: "2026-09-17T00:00:00.000Z",
  });
}

describe("Studio Scene3D character performance plan", () => {
  it("blocks bake and contact until a source-owned grounding receipt exists", () => {
    const plan = planStudioScene3dCharacterPerformance({ authority: authority() });
    expect(plan).toMatchObject({ readyCount: 0, blockedCount: 1, taskCount: 6 });
    expect(plan.entries[0]).toMatchObject({
      entityId: "character:hero",
      elementId: "hero",
      ready: false,
    });
    expect(plan.entries[0]?.tasks.find(({ kind }) => kind === "pose-layer")).toMatchObject({
      enabled: true,
      handler: "studio-vrm-pose-editing",
    });
    expect(plan.entries[0]?.tasks.find(({ kind }) => kind === "pose-bake")).toMatchObject({
      enabled: false,
      required: true,
    });
  });

  it("enables IK, grounding, contact, and one atomic bake for a ready character", () => {
    const grounding = Object.freeze({
      kind: "toonspectrum.bg3d-shared-character-grounding-receipt",
      version: 1,
    }) as unknown as StudioBg3dSharedCharacterGroundingReceipt;
    const plan = planStudioScene3dCharacterPerformance({
      authority: authority(),
      groundingReceipts: new Map([["hero", grounding]]),
      propContactElementIds: new Set(["hero"]),
    });
    expect(plan).toMatchObject({ readyCount: 1, blockedCount: 0 });
    expect(plan.entries[0]?.ready).toBe(true);
    expect(plan.entries[0]?.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "full-body-ik",
        handler: "studio-vrm-full-body-ik",
        enabled: true,
      }),
      expect.objectContaining({
        kind: "grounding",
        handler: "studio-bg3d-shared-character-grounding",
        enabled: true,
      }),
      expect.objectContaining({
        kind: "foot-contact",
        handler: "studio-vrm-contact-refinement",
        enabled: true,
      }),
      expect.objectContaining({
        kind: "pose-bake",
        handler: "studio-bg3d-rig-pose-bake",
        enabled: true,
      }),
    ]));
  });

  it("keeps source identity while refusing a locked character edit", () => {
    const current = authority();
    const lockedAuthority = {
      ...current,
      document: {
        ...current.document,
        entities: current.document.entities.map((entity) =>
          entity.kind === "character" ? { ...entity, locked: true } : entity),
      },
    };
    const plan = planStudioScene3dCharacterPerformance({
      authority: lockedAuthority,
      requireGrounding: false,
    });
    expect(plan.entries[0]).toMatchObject({
      runtimeKey: current.characters[0]?.runtimeKey,
      placementHash: current.characters[0]?.placementHash,
      locked: true,
      ready: false,
    });
    expect(plan.entries[0]?.warnings.join(" ")).toContain("잠겨");
  });
});
