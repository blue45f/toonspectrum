import { describe, expect, it } from "vitest";

import {
  createStudioBg3dLinkedCharacterCapture,
  resolveStudioBg3dSharedStageMutationBlockedReason,
} from "./studio-bg3d-shared-stage-projection";
import { createStudioShared3dSceneSession } from "./studio-shared-3d-scene-bridge";
import { createStudioVrmSceneDocument } from "./studio-vrm-scene-document";

describe("Studio BG3D Shared Stage projection", () => {
  it("blocks both a first connection and an update when appearance fields are preview-only", () => {
    const readiness = {
      phase: "ready" as const,
      capturableElementIds: [],
      previewOnlyElementIds: ["hero"],
    };
    for (const operation of ["insert", "update"] as const) {
      expect(resolveStudioBg3dSharedStageMutationBlockedReason({
        operation,
        mutationKind: "connect",
        includeCharactersInCapture: true,
        captureReadiness: readiness,
      })).toContain("연결 적용을 막았어요");
    }
  });

  it("allows an explicit background-only mutation without claiming a character capture", () => {
    expect(resolveStudioBg3dSharedStageMutationBlockedReason({
      operation: "insert",
      mutationKind: "background-only",
      includeCharactersInCapture: false,
      captureReadiness: {
        phase: "ready",
        capturableElementIds: [],
        previewOnlyElementIds: ["hero"],
      },
    })).toBeNull();
  });

  it("records exact Stage placement and runtime identity for captured characters", () => {
    const character = createStudioShared3dSceneSession([{
      elementId: "hero",
      scene: createStudioVrmSceneDocument(),
      stageId: "stage-a",
      stageTransform: { position: [2, 0.5, -3], rotationY: 0.75 },
    }]).characters[0]!;

    expect(createStudioBg3dLinkedCharacterCapture(["hero"], [character])).toEqual({
      kind: "full-fidelity-linked-vrm-capture",
      elementIds: ["hero"],
      stagePlacements: [{
        elementId: "hero",
        expectedRuntimeKey: character.runtimeKey,
        transform: { position: [2, 0.5, -3], rotationY: 0.75 },
      }],
    });
  });
});
