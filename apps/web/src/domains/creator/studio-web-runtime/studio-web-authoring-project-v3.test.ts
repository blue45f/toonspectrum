import { describe, expect, it } from "vitest";

import { createStudioScene3dDocument } from "../scene3d/studio-scene3d-document";
import {
  createCharacterDocumentV2,
  projectCharacterRecipeV1,
} from "../character-platform/document/character-document-v2";
import { migrateCharacterDocumentV2ToV3 } from "../character-platform/document/character-document-v3";
import {
  createStudioWebAuthoringProjectV3,
  parseStudioWebAuthoringProjectV3,
  serializeStudioWebAuthoringProjectV3,
  validateStudioWebAuthoringProjectV3,
} from "./studio-web-authoring-project-v3";

import type { CharacterRecipe } from "../character-shaper/character-shaper-contract";

const emptyRecipe: CharacterRecipe = {
  version: 1,
  slots: {
    "face-shape": null, eyes: null, irises: null, nose: null, mouth: null, ears: null,
    hair: null, body: null, top: null, bottom: null, shoes: null, accessory: [],
    expression: null, pose: null, "hand-pose": null,
  },
  colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
  handSide: "both",
};

function character() {
  return migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:hero",
    model: {
      assetId: "hero", assetVersion: "1", contentSha256: null, mode: "canonical",
      topologyFamily: "toon-standard", topologyRevision: "topology:v1",
      rigRevision: "rig:v1", morphRevision: "morph:v1", rendererRevision: "renderer:v1",
    },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "manifest:v1" },
    recipe: projectCharacterRecipeV1(emptyRecipe),
    colors: emptyRecipe.colors,
    revision: 2,
    now: "2026-09-24T00:00:00.000Z",
  }));
}

function scene() {
  const base = createStudioScene3dDocument("project:web-3d", "2026-09-24T00:00:00.000Z");
  return {
    ...base,
    assets: [{
      id: "asset:hero", kind: "character" as const, version: "1", contentSha256: "a".repeat(64),
      uri: "character-source:hero", mime: "model/vrm", byteSize: 1,
      rights: { commercialUse: true, redistribution: true, derivativeUse: true, licenseName: "original" },
      quality: { accepted: true, score: 100, reportUri: "/assets/quality/hero.json" },
    }],
    entities: [{
      id: "entity:hero", name: "Hero", kind: "character" as const, assetId: "asset:hero",
      characterDocumentId: "character:hero", characterRevision: 2,
      transform: { position: [0, 0, 0] as const, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as const },
      visible: true, locked: false, castShadow: true, receiveShadow: false, parentId: null,
    }],
  };
}

describe("Studio browser-first 3D project V3", () => {
  it("keeps Scene3D and CharacterDocument authorities linked by stable id and revision", () => {
    const hero = character();
    const project = createStudioWebAuthoringProjectV3({
      projectId: "project:web-3d",
      title: "웹툰 3D 프로젝트",
      scene: scene(),
      characters: { [hero.documentId]: hero },
      resources: {
        "resource:source": {
          resourceId: "resource:source",
          authority: "editable-mesh",
          revision: "revision:1",
          contentHash: "b".repeat(64),
          mime: "model/gltf-binary",
          byteLength: 1024,
          blobRef: `sha256:${"b".repeat(64)}`,
        },
        "resource:extruded": {
          resourceId: "resource:extruded",
          authority: "editable-mesh",
          revision: "revision:2",
          contentHash: "c".repeat(64),
          mime: "model/gltf-binary",
          byteLength: 2048,
          blobRef: `sha256:${"c".repeat(64)}`,
          sourceResourceId: "resource:source",
        },
      },
      featureGraphs: {
        "graph:model": {
          graphId: "graph:model",
          authority: "editable-mesh",
          revision: 1,
          rootResourceId: "resource:source",
          nodes: [{
            featureId: "feature:extrude",
            kind: "extrude",
            name: "돌출",
            enabled: true,
            inputFeatureIds: [],
            inputResourceIds: ["resource:source"],
            parameters: { distance: 1 },
            topologyRefs: [],
            outputResourceId: "resource:extruded",
            status: "clean",
            errorMessage: null,
          }],
        },
      },
      now: "2026-09-24T00:00:00.000Z",
    });

    expect(project.runtime).toMatchObject({
      primaryEnvironment: "browser",
      browserRequired: true,
      nativeRequired: false,
      storage: "sqlite-wasm-opfs",
    });
    const restored = parseStudioWebAuthoringProjectV3(serializeStudioWebAuthoringProjectV3(project));
    expect(restored).toEqual(project);
    expect(restored.characters["character:hero"]?.revision).toBe(2);
  });

  it("rejects missing or stale character authority references", () => {
    const hero = character();
    const base = createStudioWebAuthoringProjectV3({
      projectId: "project:web-3d",
      title: "웹툰 3D 프로젝트",
      scene: scene(),
      characters: { [hero.documentId]: hero },
      now: "2026-09-24T00:00:00.000Z",
    });
    expect(() => validateStudioWebAuthoringProjectV3({ ...base, characters: {} })).toThrow(/문서가 없습니다/u);
    expect(() => validateStudioWebAuthoringProjectV3({
      ...base,
      characters: { [hero.documentId]: { ...hero, revision: 3 } },
    })).toThrow(/revision/u);
  });

  it("rejects a cyclic feature graph before a geometry kernel sees it", () => {
    const baseScene = createStudioScene3dDocument("project:web-3d", "2026-09-24T00:00:00.000Z");
    const resource = {
      resourceId: "resource:a",
      authority: "editable-mesh" as const,
      revision: "revision:1",
      contentHash: "d".repeat(64),
      mime: "model/gltf-binary",
      byteLength: 1,
      blobRef: `sha256:${"d".repeat(64)}`,
    };
    expect(() => createStudioWebAuthoringProjectV3({
      projectId: "project:web-3d",
      title: "cycle",
      scene: baseScene,
      resources: { "resource:a": resource },
      featureGraphs: {
        "graph:cycle": {
          graphId: "graph:cycle",
          authority: "editable-mesh",
          revision: 1,
          rootResourceId: "resource:a",
          nodes: [
            {
              featureId: "feature:a", kind: "modifier", name: "A", enabled: true,
              inputFeatureIds: ["feature:b"], inputResourceIds: ["resource:a"], parameters: {},
              topologyRefs: [], outputResourceId: "resource:a", status: "dirty", errorMessage: null,
            },
            {
              featureId: "feature:b", kind: "modifier", name: "B", enabled: true,
              inputFeatureIds: ["feature:a"], inputResourceIds: ["resource:a"], parameters: {},
              topologyRefs: [], outputResourceId: "resource:a", status: "dirty", errorMessage: null,
            },
          ],
        },
      },
    })).toThrow(/순환/u);
  });
});
