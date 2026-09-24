import { describe, expect, it } from "vitest";

import { CharacterDocumentV3Repository } from "./character-document-v3-repository";
import {
  createCharacterDocumentV2,
  projectCharacterRecipeV1,
} from "./character-document-v2";
import { migrateCharacterDocumentV2ToV3 } from "./character-document-v3";

import type { StudioAsyncKeyValueStore } from "../../studio-local-database";
import type { CharacterRecipe } from "../../character-shaper/character-shaper-contract";

const recipe: CharacterRecipe = {
  version: 1,
  slots: {
    "face-shape": null, eyes: null, irises: null, nose: null, mouth: null, ears: null,
    hair: null, body: null, top: null, bottom: null, shoes: null, accessory: [],
    expression: null, pose: null, "hand-pose": null,
  },
  colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null },
  handSide: "both",
};

function document(revision = 1) {
  return migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:repository",
    model: {
      assetId: "hero", assetVersion: "1", contentSha256: null, mode: "canonical",
      topologyFamily: "toon-standard", topologyRevision: "topology:v1",
      rigRevision: "rig:v1", morphRevision: "morph:v1", rendererRevision: "renderer:v1",
    },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "manifest:v1" },
    recipe: projectCharacterRecipeV1(recipe),
    colors: recipe.colors,
    revision,
    now: "2026-09-24T00:00:00.000Z",
  }));
}

function memoryStore() {
  const rows = new Map<string, string>();
  const store: StudioAsyncKeyValueStore = {
    get: async (key) => rows.get(key) ?? null,
    set: async (key, value) => { rows.set(key, value); },
    delete: async (key) => { rows.delete(key); },
  };
  return { rows, store };
}

describe("CharacterDocument V3 SQLite-WASM repository", () => {
  it("round-trips a browser-authoritative document and recognizes unchanged saves", async () => {
    const memory = memoryStore();
    const repository = new CharacterDocumentV3Repository({ storeFactory: async () => memory.store });
    expect((await repository.save(document())).status).toBe("saved");
    expect((await repository.save(document())).status).toBe("unchanged");
    expect(await repository.load("character:repository")).toEqual(document());
    expect(memory.rows.size).toBe(1);
  });

  it("rejects stale or regressing writes without replacing durable data", async () => {
    const memory = memoryStore();
    const repository = new CharacterDocumentV3Repository({ storeFactory: async () => memory.store });
    await repository.save(document(3));
    await expect(repository.save(document(4), { expectedStoredRevision: 2 }))
      .rejects.toMatchObject({ code: "revision-conflict" });
    await expect(repository.save(document(2)))
      .rejects.toMatchObject({ code: "revision-regression" });
    expect((await repository.load("character:repository"))?.revision).toBe(3);
  });

  it("serializes overlapping writes per document", async () => {
    const memory = memoryStore();
    const gate = Promise.withResolvers<void>();
    let first = true;
    const store: StudioAsyncKeyValueStore = {
      ...memory.store,
      set: async (key, value) => {
        if (first) { first = false; await gate.promise; }
        memory.rows.set(key, value);
      },
    };
    const repository = new CharacterDocumentV3Repository({ storeFactory: async () => store });
    const one = repository.save(document(1));
    const two = repository.save(document(2));
    gate.resolve();
    await Promise.all([one, two]);
    expect((await repository.load("character:repository"))?.revision).toBe(2);
  });
});
