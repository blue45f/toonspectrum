import { describe, expect, it } from "vitest";

import { dispatchCharacterCommand } from "./application/character-command-dispatcher";
import {
  characterCompatibilitySnapshot,
  createCharacterCompatibilityReport,
} from "./compatibility/character-compatibility-report";
import { diffCharacterDocuments } from "./document/character-document-diff";
import {
  CharacterDocumentValidationError,
  createCharacterDocumentV2,
  isCharacterDocumentV2,
  parseCharacterDocumentV2,
  projectCharacterRecipeV1,
} from "./document/character-document-v2";
import { createCharacterExportPreflight } from "./export/character-export-preflight";
import { projectCharacterShaperDocument } from "../character-shaper/character-shaper-document-projection";
import { summarizeCharacterSlotSupport } from "../character-shaper/character-shaper-slot-support";

import type {
  CharacterCapabilityProfile,
  CharacterHostSnapshot,
  CharacterRecipe,
  CharacterSlotAvailability,
  CharacterSlotEntry,
} from "../character-shaper/character-shaper-contract";

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
    top: "top:shirt",
    bottom: null,
    shoes: null,
    accessory: ["accessory:glasses"],
    expression: "expression:xf_joy",
    pose: "pose:xp_wave_greeting",
    "hand-pose": "hand-pose:peace",
  },
  colors: {
    skin: "#f5c6a0",
    hairBase: "#1f1a1c",
    hairTip: "#4a3f47",
    iris: "#3b6fb6",
    top: "#f8fafc",
    bottom: null,
    shoes: null,
  },
  handSide: "both",
};

const profile: CharacterCapabilityProfile = {
  status: "ready",
  modelId: "sample-vrm",
  modelName: "샘플",
  humanoid: true,
  semanticMorphs: {
    eyeSize: "native-morph",
    eyeSpacing: "adaptive-mesh",
    eyeTilt: "adaptive-mesh",
    irisSize: "native-morph",
    noseHeight: "adaptive-mesh",
    noseWidth: "adaptive-mesh",
    mouthWidth: "adaptive-mesh",
    lipFullness: "adaptive-mesh",
    earSize: "adaptive-mesh",
  },
  expressions: ["happy", "angry", "sad", "blink", "aa"],
  costumeSlots: ["tops", "bottoms", "shoes"],
  wardrobeMetricsReady: true,
  propsReady: true,
  irisTintable: true,
  originalHairMeshCount: 2,
  surfacePaintReady: true,
};

const snapshot: CharacterHostSnapshot = {
  forgeFace: { headWidth: 0.97, headHeight: 1.05, headDepth: 1, cheekVolume: 0.3, chinLength: 1.04 },
  semanticMorphs: { eyeSize: 0.1, eyeSpacing: 0, eyeTilt: 0.6 },
  hairStyle: "bob",
  hairBangStyle: "blunt",
  hairReplaceOriginal: true,
  hairBaseColor: "#1f1a1c",
  hairTipColor: "#4a3f47",
  proportionPresetId: "webtoon-7",
  bodyPresetId: "balanced",
  wardrobe: {},
  propIds: ["glasses"],
  activePoseId: "xp_wave_greeting",
  activeExpressionId: "preset:xf_joy",
  expressionWeights: { happy: 0.8 },
  customColors: {},
  irisColor: "#3b6fb6",
  handSide: "both",
  lastHandPoseType: "peace",
};

function document() {
  const compatibility = characterCompatibilitySnapshot(createCharacterCompatibilityReport(profile));
  return createCharacterDocumentV2({
    documentId: "character:foundation",
    model: { assetId: "sample-vrm", assetVersion: "1", contentSha256: null, mode: "compatible" },
    compatibility,
    recipe: projectCharacterRecipeV1(recipe),
    colors: recipe.colors,
    revision: 3,
    now: "2026-09-07T00:00:00.000Z",
  });
}

describe("Character Platform V2 foundation", () => {
  it("projects the shipped 15-slot recipe into a strict versioned document", () => {
    const projected = projectCharacterRecipeV1(recipe);
    expect(projected.slots.hair?.entryId).toBe("hair:bob");
    expect(projected.accessories.map((entry) => entry.entryId)).toEqual(["accessory:glasses"]);
    expect(projected.handPose.left?.entryId).toBe("hand-pose:peace");
    expect(projected.handPose.right?.entryId).toBe("hand-pose:peace");
    expect(isCharacterDocumentV2(document())).toBe(true);
    expect(() => createCharacterDocumentV2({
      documentId: "",
      model: { assetId: "sample", assetVersion: "1", contentSha256: null, mode: "compatible" },
      compatibility: characterCompatibilitySnapshot(createCharacterCompatibilityReport(profile)),
      recipe: projected,
      colors: recipe.colors,
    })).toThrow(CharacterDocumentValidationError);
  });

  it("diffs and commits one revision while rejecting stale commands", () => {
    const before = document();
    const changed = { ...before, colors: { ...before.colors, iris: "#ffffff" } };
    expect(diffCharacterDocuments(before, changed).map((entry) => entry.path)).toEqual(["colors.iris"]);
    const result = dispatchCharacterCommand(
      before,
      {
        commandId: "command:iris",
        kind: "character.color.set",
        label: "눈동자 색",
        expectedRevision: 3,
        source: "user",
        payload: "#ffffff",
      },
      (current, color) => ({ ...current, colors: { ...current.colors, iris: color } }),
      { now: () => "2026-09-07T00:01:00.000Z" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.revision).toBe(4);
      expect(result.receipt.changedPaths).toEqual(["colors.iris"]);
    }
    expect(dispatchCharacterCommand(
      before,
      {
        commandId: "command:stale",
        kind: "character.test",
        label: "오래된 명령",
        expectedRevision: 2,
        source: "user",
        payload: null,
      },
      (current) => current,
    )).toMatchObject({ ok: false, code: "revision-conflict" });
  });

  it("does not commit an unchanged document restored from JSON with accessory selections", () => {
    const before = document();
    const restored = parseCharacterDocumentV2(JSON.parse(JSON.stringify(before)));

    expect(restored.recipe.accessories[0]).not.toBe(before.recipe.accessories[0]);
    expect(diffCharacterDocuments(before, restored)).toEqual([]);
    expect(dispatchCharacterCommand(
      before,
      {
        commandId: "command:restore",
        kind: "character.restore",
        label: "동일한 문서 복원",
        expectedRevision: before.revision,
        source: "migration",
        payload: restored,
      },
      (_current, restoredDocument) => restoredDocument,
    )).toMatchObject({ ok: false, code: "no-change", currentRevision: before.revision });
    expect(before.revision).toBe(3);
  });

  it.each(["reordered", "changed", "added", "removed"] as const)(
    "still detects %s accessory selections after JSON restoration",
    (change) => {
      const base = document();
      const first = base.recipe.accessories[0]!;
      const before = parseCharacterDocumentV2({
        ...base,
        recipe: {
          ...base.recipe,
          accessories: [first, { ...first, entryId: "accessory:hat", overrides: { visible: true } }],
        },
      });
      const restored = parseCharacterDocumentV2(JSON.parse(JSON.stringify(before)));
      const selections = restored.recipe.accessories;
      const changedSelections = {
        reordered: [selections[1]!, selections[0]!],
        changed: [selections[0]!, { ...selections[1]!, overrides: { visible: false } }],
        added: [...selections, { ...first, entryId: "accessory:scarf" }],
        removed: [selections[0]!],
      }[change];
      const after = parseCharacterDocumentV2({
        ...restored,
        recipe: { ...restored.recipe, accessories: changedSelections },
      });

      expect(diffCharacterDocuments(before, after)).toEqual([
        { path: "recipe.accessories", kind: "changed", before: before.recipe.accessories, after: changedSelections },
      ]);
    },
  );

  it("derives honest model compatibility and export strategy", () => {
    const report = createCharacterCompatibilityReport(profile);
    expect(report.grade).toBe("A");
    expect(report.features.find((item) => item.id === "semantic-psd")?.status).toBe("partial");
    expect(createCharacterCompatibilityReport(profile, { canonical: true }).grade).toBe("canonical");
    expect(createCharacterExportPreflight({
      format: "psd",
      width: 512,
      height: 640,
      transparent: true,
      profile,
    }).strategy).toBe("direct-main-thread");
    const highResolution = createCharacterExportPreflight({
      format: "psd",
      width: 4096,
      height: 4096,
      transparent: true,
      profile,
      canonical: true,
      hasSurfacePaint: true,
    });
    expect(highResolution.strategy).toBe("tile-worker");
    expect(highResolution.tileEdge).toBe(1024);
  });

  it("projects the current host snapshot without making Three.js state part of the document", () => {
    const projected = projectCharacterShaperDocument({
      documentId: "character:projected",
      recipe,
      snapshot,
      profile,
      transparentBackground: true,
      revision: 7,
      now: "2026-09-07T00:00:00.000Z",
    });
    expect(projected.compatibility.grade).toBe("A");
    expect(projected.customControls["face.headWidth"]).toBe(0.97);
    expect(projected.customControls["morph.eyeTilt"]).toBe(0.6);
    expect(projected.pose).toMatchObject({ activeEntryId: "xp_wave_greeting", source: "preset" });
    expect(projected.render.transparentBackground).toBe(true);
  });

  it("summarizes slot support without hiding partial or unavailable entries", () => {
    const entries = [{ id: "a" }, { id: "b" }, { id: "c" }] as CharacterSlotEntry[];
    const statuses: Readonly<Record<string, CharacterSlotAvailability["status"]>> = {
      a: "available",
      b: "partial",
      c: "unavailable",
    };
    const summary = summarizeCharacterSlotSupport(entries, (entry) => ({
      status: statuses[entry.id] ?? "unavailable",
      reason: null,
      missing: [],
    }));
    expect(summary).toMatchObject({
      status: "partially-supported",
      available: 1,
      partial: 1,
      unavailable: 1,
    });
    expect(summarizeCharacterSlotSupport(entries, () => ({
      status: "unavailable",
      reason: null,
      missing: [],
    }), { ready: false }).status).toBe("unknown");
  });
});
