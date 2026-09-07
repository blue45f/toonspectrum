import { describe, expect, it } from "vitest";

import { CHARACTER_SLOT_KINDS } from "../../character-shaper/character-shaper-contract";
import {
  createCharacterDocumentV2,
  projectCharacterRecipeV1,
} from "../document/character-document-v2";
import {
  applyCharacterPartPreset,
  createCharacterPartPreset,
  parseCharacterPartPresetV1,
} from "./character-part-preset";
import { createCharacterPartPresetStore } from "./character-part-preset-store";

import type { CharacterRecipe } from "../../character-shaper/character-shaper-contract";

function recipe(eyes: string): CharacterRecipe {
  return {
    version: 1,
    slots: Object.fromEntries(CHARACTER_SLOT_KINDS.map((slot) => [
      slot,
      slot === "accessory" ? [] : slot === "eyes" ? eyes : null,
    ])) as unknown as CharacterRecipe["slots"],
    colors: {
      skin: "#f4c8a8",
      hairBase: "#221a18",
      hairTip: null,
      iris: "#5a3a2a",
      top: null,
      bottom: null,
      shoes: null,
    },
    handSide: "both",
  };
}

function document(eyes: string) {
  const value = recipe(eyes);
  return createCharacterDocumentV2({
    documentId: `doc-${eyes}`,
    model: {
      assetId: "character:lumi",
      assetVersion: "1.0.0",
      contentSha256: null,
      mode: "canonical",
      topologyFamily: "toon-standard",
    },
    compatibility: {
      grade: "canonical",
      supported: ["identity", "semantic-psd"],
      partial: [],
      unsupported: [],
      sourceRevision: "manifest-1",
    },
    recipe: projectCharacterRecipeV1(value),
    colors: value.colors,
    customControls: { "morph.eyeSize": 0.4, "morph.eyeTilt": 0.2, "morph.noseWidth": 0.5 },
    now: "2026-09-08T00:00:00.000Z",
  });
}

class MemoryStorage {
  private readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async set(key: string, value: string): Promise<void> { this.values.set(key, value); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

describe("character part presets", () => {
  it("captures one slot and only its related controls and colours", () => {
    const preset = createCharacterPartPreset({
      presetId: "eyes:cold-cat",
      name: "차가운 고양이 눈",
      kind: "slot",
      scope: "personal",
      document: document("eyes:cat"),
      slot: "eyes",
      now: "2026-09-08T00:00:00.000Z",
    });
    expect(preset.payload.selections?.[0]?.entryId).toBe("eyes:cat");
    expect(preset.payload.controls).toEqual({ "morph.eyeSize": 0.4, "morph.eyeTilt": 0.2 });
    expect(preset.payload.colors).toEqual({ iris: "#5a3a2a" });
    expect(parseCharacterPartPresetV1(preset)).toBe(preset);
  });

  it("applies the slot atomically and increments one revision", () => {
    const source = document("eyes:cat");
    const target = document("eyes:round");
    const preset = createCharacterPartPreset({
      presetId: "eyes:cat",
      name: "고양이 눈",
      kind: "slot",
      scope: "personal",
      document: source,
      slot: "eyes",
    });
    const result = applyCharacterPartPreset(target, preset);
    expect(result.ok).toBe(true);
    expect(result.document.recipe.slots.eyes?.entryId).toBe("eyes:cat");
    expect(result.document.revision).toBe(target.revision + 1);
    expect(target.recipe.slots.eyes?.entryId).toBe("eyes:round");
  });

  it("persists bounded presets and replaces them by stable id", async () => {
    const storage = new MemoryStorage();
    const store = createCharacterPartPresetStore(async () => storage);
    await store.refresh();
    const first = createCharacterPartPreset({
      presetId: "eyes:one",
      name: "첫 눈",
      kind: "slot",
      scope: "personal",
      document: document("eyes:cat"),
      slot: "eyes",
      now: "2026-09-08T00:00:00.000Z",
    });
    await store.save(first);
    await store.save({ ...first, name: "수정된 눈" });
    expect(store.getSnapshot().presets).toHaveLength(1);
    expect(store.getSnapshot().presets[0]?.name).toBe("수정된 눈");
    expect(store.getSnapshot().presets[0]?.version).toBe(2);

    const reloaded = createCharacterPartPresetStore(async () => storage);
    await reloaded.refresh();
    expect(reloaded.list({ slot: "eyes", text: "수정" })).toHaveLength(1);
  });
});


describe("saved hand-pose sides", () => {
  const selection = (entryId: string) => ({ entryId, entryVersion: "1", providerId: "builtin", catalogRevision: "1" });
  it.each(["left", "right"] as const)("saves and reloads only the original %s hand", async (side) => {
    const base = document("eyes:round");
    const source = { ...base, recipe: { ...base.recipe, handPose: { [side]: selection("hand-pose:fist") } } };
    const preset = createCharacterPartPreset({ presetId: side, name: side, kind: "slot", scope: "personal", slot: "hand-pose", document: source });
    const storage = new MemoryStorage();
    await createCharacterPartPresetStore(async () => storage).save(preset);
    const reopened = createCharacterPartPresetStore(async () => storage);
    await reopened.refresh();
    const target = { ...base, recipe: { ...base.recipe, handPose: { left: selection("hand-pose:open"), right: selection("hand-pose:relaxed") } } };
    const result = applyCharacterPartPreset(target, reopened.list()[0]!);
    expect(result.ok).toBe(true);
    expect(result.document.recipe.handPose).toEqual({ ...target.recipe.handPose, [side]: selection("hand-pose:fist") });
    expect(result.document.revision).toBe(target.revision + 1);
  });
});


it("preserves legacy unsided hand presets and rejects ambiguous or malformed keyed hands", () => {
  const base = document("eyes:round");
  const selection = { entryId: "hand-pose:fist", entryVersion: "1", providerId: "builtin", catalogRevision: "1" };
  const preset = createCharacterPartPreset({ presetId: "legacy", name: "legacy", kind: "slot", scope: "personal", slot: "hand-pose", document: base });
  const legacy = { ...preset, payload: { slot: "hand-pose" as const, selections: [selection] } };
  expect(parseCharacterPartPresetV1(legacy)).toBe(legacy);
  expect(applyCharacterPartPreset(base, legacy).document.recipe.handPose).toEqual({ left: selection, right: selection });
  for (const payload of [
    { slot: "hand-pose", handPose: { both: selection } },
    { slot: "eyes", handPose: { left: selection } },
    { slot: "hand-pose", handPose: { left: null } },
    { slot: "hand-pose", handPose: { left: selection }, selections: [selection] },
  ]) expect(() => parseCharacterPartPresetV1({ ...preset, payload })).toThrow("형식");
});
