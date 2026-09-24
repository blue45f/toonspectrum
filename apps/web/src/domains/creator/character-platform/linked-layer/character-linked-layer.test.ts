import { describe, expect, it } from "vitest";

import {
  createCharacterLinkedLayer,
  reconcileCharacterLinkedLayer,
  refreshCharacterLinkedLayerArtifacts,
} from "./character-linked-layer";

describe("Character Linked 3D Layer", () => {
  it("persists renderer-neutral anchors and editable derivative layer ids", () => {
    const layer = createCharacterLinkedLayer({
      linkedLayerId: "linked:hero-shot",
      characterDocumentId: "character:hero",
      sourceRevision: 4,
      shotId: "shot:001",
      renderRecipeId: "recipe:webtoon",
      artifactRevision: "sha256:0123456789abcdef",
      artifacts: {
        beautyLayerId: "layer:beauty",
        vectorLineLayerId: "layer:line",
        toneLayerId: "layer:tone",
      },
      anchors: [{
        kind: "triangle-barycentric",
        anchorId: "anchor:cheek-line",
        meshAssetId: "mesh:face",
        topologyRevision: "topology:v1",
        primitiveIndex: 0,
        triangleIndex: 42,
        barycentric: [0.2, 0.3, 0.5],
      }],
    });

    expect(layer.status).toBe("current");
    expect(layer.artifacts.vectorLineLayerId).toBe("layer:line");
    expect(layer.anchors[0]?.kind).toBe("triangle-barycentric");
  });

  it("keeps edits and surfaces a topology conflict instead of silently deleting anchors", () => {
    const layer = createCharacterLinkedLayer({
      linkedLayerId: "linked:hero-shot",
      characterDocumentId: "character:hero",
      sourceRevision: 4,
      shotId: "shot:001",
      renderRecipeId: "recipe:webtoon",
      artifactRevision: "0123456789abcdef",
      anchors: [{
        kind: "stable-topology",
        anchorId: "anchor:jaw",
        meshAssetId: "mesh:face",
        topologyRevision: "topology:v1",
        persistentName: "face:jaw-left",
        localPosition: [0.1, 0.2, 0.3],
      }],
    });

    const reconciled = reconcileCharacterLinkedLayer(layer, {
      currentDocumentRevision: 5,
      currentTopologyRevision: "topology:v2",
      entityIds: new Set(),
    });
    expect(reconciled.status).toBe("conflicted");
    expect(reconciled.anchors).toHaveLength(1);
    expect(reconciled.conflicts).toEqual([
      expect.objectContaining({ code: "topology-revision-changed", anchorId: "anchor:jaw" }),
    ]);
  });

  it("marks a clean document revision as refreshable and promotes new artifacts", () => {
    const layer = createCharacterLinkedLayer({
      linkedLayerId: "linked:hero-shot",
      characterDocumentId: "character:hero",
      sourceRevision: 4,
      shotId: "shot:001",
      renderRecipeId: "recipe:webtoon",
      artifactRevision: "0123456789abcdef",
    });
    const stale = reconcileCharacterLinkedLayer(layer, {
      currentDocumentRevision: 5,
      currentTopologyRevision: "topology:v1",
      entityIds: new Set(),
    });
    expect(stale.status).toBe("needs-refresh");
    const refreshed = refreshCharacterLinkedLayerArtifacts(stale, {
      sourceRevision: 5,
      artifactRevision: "fedcba9876543210",
      artifacts: { beautyLayerId: "layer:new-beauty" },
    });
    expect(refreshed.status).toBe("current");
    expect(refreshed.sourceRevision).toBe(5);
  });
});
