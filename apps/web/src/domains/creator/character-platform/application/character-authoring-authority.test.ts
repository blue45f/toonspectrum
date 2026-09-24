import { describe, expect, it } from "vitest";

import {
  CharacterAuthoringAuthority,
  dispatchCharacterAuthoringCommand,
  type CharacterAuthoringCommand,
} from "./character-authoring-authority";
import {
  createCharacterDocumentV2,
  projectCharacterRecipeV1,
} from "../document/character-document-v2";
import {
  migrateCharacterDocumentV2ToV3,
  validateCharacterDocumentV3,
} from "../document/character-document-v3";

import type { CharacterRecipe } from "../../character-shaper/character-shaper-contract";

const recipe: CharacterRecipe = {
  version: 1,
  slots: {
    "face-shape": null,
    eyes: null,
    irises: null,
    nose: null,
    mouth: null,
    ears: null,
    hair: null,
    body: null,
    top: null,
    bottom: null,
    shoes: null,
    accessory: [],
    expression: null,
    pose: null,
    "hand-pose": null,
  },
  colors: {
    skin: null,
    hairBase: null,
    hairTip: null,
    iris: null,
    top: null,
    bottom: null,
    shoes: null,
  },
  handSide: "both",
};

function document() {
  return migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:authority",
    model: {
      assetId: "hero",
      assetVersion: "1",
      contentSha256: null,
      mode: "canonical",
      topologyFamily: "toon-standard",
      topologyRevision: "topology:v1",
      rigRevision: "rig:v1",
      morphRevision: "morph:v1",
      rendererRevision: "renderer:v1",
    },
    compatibility: {
      grade: "canonical",
      supported: [],
      partial: [],
      unsupported: [],
      sourceRevision: "manifest:v1",
    },
    recipe: projectCharacterRecipeV1(recipe),
    colors: recipe.colors,
    revision: 2,
    now: "2026-09-24T00:00:00.000Z",
  }));
}

function colorCommand(revision = 2): CharacterAuthoringCommand {
  return {
    commandId: "character.color/iris-blue",
    label: "눈동자 색",
    source: "user",
    expectedDocumentId: "character:authority",
    expectedRevision: revision,
    committedAt: "2026-09-24T00:01:00.000Z",
    operations: [{ kind: "set-color", target: "iris", color: "#3366ff" }],
  };
}

describe("Character V3 authoring authority", () => {
  it("commits multiple serializable operations as one revision", () => {
    const before = document();
    const result = dispatchCharacterAuthoringCommand(before, {
      ...colorCommand(),
      operations: [
        ...colorCommand().operations,
        {
          kind: "set-slot",
          slot: "hair",
          selection: {
            entryId: "hair:bob",
            entryVersion: "1",
            providerId: "toonstudio-builtin",
            catalogRevision: "catalog:v1",
          },
        },
      ],
    });

    expect(result.receipt.status).toBe("applied");
    expect(result.document.revision).toBe(3);
    expect(result.document.look.colors.iris).toBe("#3366ff");
    expect(result.document.recipe.slots.hair?.entryId).toBe("hair:bob");
    expect(result.receipt.changedSections).toEqual(["recipe", "look"]);
  });

  it("supports transient preview, one-step commit, undo and redo", () => {
    const authority = new CharacterAuthoringAuthority(document());
    expect(authority.beginPreview(colorCommand()).status).toBe("applied");
    expect(authority.getSnapshot().document.look.colors.iris).toBeNull();
    expect(authority.getSnapshot().previewDocument?.look.colors.iris).toBe("#3366ff");

    const committed = authority.commitPreview("2026-09-24T00:02:00.000Z");
    expect(committed?.status).toBe("applied");
    expect(authority.getSnapshot().document.revision).toBe(3);
    expect(authority.getSnapshot().historyLength).toBe(1);

    expect(authority.undo()).toBe(true);
    expect(authority.getSnapshot().document.revision).toBe(4);
    expect(authority.getSnapshot().document.look.colors.iris).toBeNull();
    expect(authority.redo()).toBe(true);
    expect(authority.getSnapshot().document.revision).toBe(5);
    expect(authority.getSnapshot().document.look.colors.iris).toBe("#3366ff");
  });

  it("rejects stale worker results instead of overwriting newer edits", () => {
    const authority = new CharacterAuthoringAuthority(document());
    const token = authority.beginJob("job:pose-photo", 100);
    expect(authority.dispatch(colorCommand()).status).toBe("applied");

    const result = authority.commitJob(token, {
      commandId: "character.worker/late",
      label: "늦게 끝난 Worker",
      operations: [{ kind: "set-color", target: "hairBase", color: "#111111" }],
    });
    expect(result.status).toBe("stale");
    expect(authority.getSnapshot().document.look.colors.hairBase).toBeNull();
    expect(authority.getSnapshot().document.revision).toBe(3);
  });

  it("commits free-space geometry strokes through the same revision authority", () => {
    const authority = new CharacterAuthoringAuthority(document());
    const receipt = authority.dispatch({
      commandId: "character.geometry-stroke/add",
      label: "3D 지오메트리 선",
      source: "user",
      expectedDocumentId: "character:authority",
      expectedRevision: 2,
      operations: [{
        kind: "replace-geometry-strokes",
        geometryStrokes: {
          version: 1,
          strokes: [{
            strokeId: "stroke:test",
            name: "테스트 선",
            visible: true,
            locked: false,
            status: "valid",
            style: {
              color: "#111111", baseWidth: 0.01, opacity: 1, taperStart: 0, taperEnd: 0.5,
              pressureWidth: 0.5, profile: "ribbon", fill: true, lineOnly: false,
            },
            points: [
              { anchor: { kind: "free", position: [0, 0, 0] }, pressure: 0.5, width: 1, twist: 0 },
              { anchor: { kind: "free", position: [0.2, 0.1, 0] }, pressure: 0.5, width: 0.5, twist: 0 },
            ],
          }],
        },
      }],
    });
    expect(receipt.status).toBe("applied");
    expect(receipt.changedSections).toEqual(["geometryStrokes"]);
    expect(authority.getSnapshot().document.geometryStrokes.strokes).toHaveLength(1);
  });

  it("preserves topology-bound authoring data and marks it for reprojection", () => {
    const authority = new CharacterAuthoringAuthority(document());
    expect(authority.dispatch({
      commandId: "character.geometry-stroke/surface",
      label: "표면 지오메트리 선",
      source: "user",
      expectedDocumentId: "character:authority",
      expectedRevision: 2,
      operations: [{
        kind: "replace-geometry-strokes",
        geometryStrokes: {
          version: 1,
          strokes: [{
            strokeId: "stroke:surface",
            name: "표면선",
            visible: true,
            locked: false,
            status: "valid",
            style: {
              color: "#111111", baseWidth: 0.01, opacity: 1, taperStart: 0, taperEnd: 0,
              pressureWidth: 0, profile: "ribbon", fill: true, lineOnly: false,
            },
            points: [
              {
                anchor: {
                  kind: "surface",
                  position: [0, 0, 0],
                  normal: [0, 0, 1],
                  meshAssetId: "mesh:face",
                  topologyRevision: "topology:v1",
                  primitiveIndex: 0,
                  triangleIndex: 1,
                  barycentric: [0.2, 0.3, 0.5],
                },
                pressure: 0.5,
                width: 1,
                twist: 0,
              },
              {
                anchor: {
                  kind: "surface",
                  position: [0.2, 0.1, 0],
                  normal: [0, 0, 1],
                  meshAssetId: "mesh:face",
                  topologyRevision: "topology:v1",
                  primitiveIndex: 0,
                  triangleIndex: 2,
                  barycentric: [0.2, 0.3, 0.5],
                },
                pressure: 0.5,
                width: 0.5,
                twist: 0,
              },
            ],
          }],
        },
      }],
    }).status).toBe("applied");

    const projected = validateCharacterDocumentV3({
      ...document(),
      topology: { ...document().topology, revision: "topology:v2" },
      groom: { ...document().groom, topologyRevision: "topology:v2" },
    });
    const current = authority.getSnapshot().document;
    const synced = authority.dispatch({
      commandId: "character.compatibility-sync/topology-v2",
      label: "호환 런타임 상태 동기화",
      source: "system",
      expectedDocumentId: current.documentId,
      expectedRevision: current.revision,
      operations: [{
        kind: "sync-compatibility-projection",
        projection: projected,
        sourceFingerprint: "fingerprint:topology-v2",
      }],
    });

    expect(synced.status).toBe("applied");
    const after = authority.getSnapshot().document;
    expect(after.topology.revision).toBe("topology:v2");
    expect(after.geometryStrokes.strokes).toHaveLength(1);
    expect(after.geometryStrokes.strokes[0]?.status).toBe("needs-reprojection");
    expect(after.sourceReceipts).toContainEqual(expect.objectContaining({
      kind: "compatibility-projection",
      sourceFingerprint: "fingerprint:topology-v2",
      topologyChanged: true,
    }));
  });

  it("never accepts a command for another document", () => {
    const result = dispatchCharacterAuthoringCommand(document(), {
      ...colorCommand(),
      expectedDocumentId: "character:other",
    });
    expect(result.receipt.status).toBe("stale");
    expect(result.document.revision).toBe(2);
  });
});
