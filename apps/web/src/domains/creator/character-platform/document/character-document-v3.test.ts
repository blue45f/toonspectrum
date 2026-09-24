import { describe, expect, it } from "vitest";

import {
  createCharacterDocumentV2,
  projectCharacterRecipeV1,
} from "./character-document-v2";
import {
  isCharacterDocumentV3,
  migrateCharacterDocumentV2ToV3,
  parseCharacterDocumentV3,
  serializeCharacterDocumentV3,
} from "./character-document-v3";

import type { CharacterRecipe } from "../../character-shaper/character-shaper-contract";

const recipe: CharacterRecipe = {
  version: 1,
  slots: {
    "face-shape": "face-shape:oval",
    eyes: "eyes:cat",
    irises: "irises:blue",
    nose: null,
    mouth: null,
    ears: null,
    hair: "hair:bob",
    body: "body:webtoon-7",
    top: null,
    bottom: null,
    shoes: null,
    accessory: [],
    expression: "expression:xf_joy",
    pose: "pose:xp_wave_greeting",
    "hand-pose": null,
  },
  colors: {
    skin: "#f5c6a0",
    hairBase: "#1f1a1c",
    hairTip: "#4a3f47",
    iris: "#3b6fb6",
    top: null,
    bottom: null,
    shoes: null,
  },
  handSide: "both",
};

function v2() {
  return createCharacterDocumentV2({
    documentId: "character:hero",
    model: {
      assetId: "hero-vrm",
      assetVersion: "2",
      contentSha256: null,
      mode: "canonical",
      topologyFamily: "toon-standard",
      topologyRevision: "topology:v2",
      rigRevision: "rig:v2",
      morphRevision: "morph:v2",
      rendererRevision: "renderer:v2",
    },
    compatibility: {
      grade: "canonical",
      supported: ["pose", "surface-ink"],
      partial: [],
      unsupported: [],
      sourceRevision: "manifest:v2",
    },
    recipe: projectCharacterRecipeV1(recipe),
    colors: recipe.colors,
    customControls: {
      "face.headWidth": 1.05,
      "face.chinLength": 0.95,
      "morph.eyeSize": 0.4,
    },
    expression: { activeEntryId: "xf_joy", weights: { happy: 0.8 } },
    pose: {
      activeEntryId: "xp_wave_greeting",
      source: "preset",
      bones: { head: [0, 0, 0, 1] },
    },
    transparentBackground: true,
    revision: 9,
    now: "2026-09-24T00:00:00.000Z",
  });
}

describe("CharacterDocument V3 authoring authority", () => {
  it("migrates V2 into a browser-authoritative document with groom, pose and output state", () => {
    const document = migrateCharacterDocumentV2ToV3(v2());

    expect(document.schemaVersion).toBe(3);
    expect(document.topology).toMatchObject({
      family: "toon-standard",
      revision: "topology:v2",
      rigRevision: "rig:v2",
    });
    expect(document.deformation.layers.map((layer) => layer.kind)).toEqual([
      "semantic-morph",
      "control-cage",
    ]);
    expect(document.groom.topologyRevision).toBe("topology:v2");
    expect(document.pose.source).toBe("preset");
    expect(document.pose.bones.head).toEqual([0, 0, 0, 1]);
    expect(document.runtimeRequirements).toMatchObject({
      browserRequired: true,
      nativeRequired: false,
    });
    expect(document.output.passes).toContain("surface-ink");
    expect(document.geometryStrokes).toEqual({ version: 1, strokes: [] });
  });

  it("round-trips without renderer objects or native runtime references", () => {
    const document = migrateCharacterDocumentV2ToV3(v2());
    const serialized = serializeCharacterDocumentV3(document);
    const restored = parseCharacterDocumentV3(JSON.parse(serialized));

    expect(isCharacterDocumentV3(restored)).toBe(true);
    expect(restored).toEqual(document);
    expect(serialized).not.toMatch(/WebGLRenderer|GPUDevice|VRM|Object3D/u);
    expect(serialized).not.toContain('"nativeRequired":true');
  });

  it("rejects a native-required policy or a groom topology mismatch", () => {
    const document = migrateCharacterDocumentV2ToV3(v2());
    expect(() => parseCharacterDocumentV3({
      ...document,
      runtimeRequirements: {
        ...document.runtimeRequirements,
        nativeRequired: true,
      },
    })).toThrow(/native/u);
    expect(() => parseCharacterDocumentV3({
      ...document,
      groom: { ...document.groom, topologyRevision: "topology:other" },
    })).toThrow(/topology/u);
  });
});
