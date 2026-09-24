/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCharacterDocumentV2,
  projectCharacterRecipeV1,
} from "../document/character-document-v2";
import {
  migrateCharacterDocumentV2ToV3,
  type CharacterDocumentV3,
} from "../document/character-document-v3";
import { CharacterDocumentV3Repository } from "../document/character-document-v3-repository";
import { useCharacterAuthoringAuthority } from "./use-character-authoring-authority";

import type { StudioAsyncKeyValueStore } from "../../studio-local-database";
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

function projection(revision = 1): CharacterDocumentV3 {
  return migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:hook",
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
    revision,
    now: "2026-09-24T00:00:00.000Z",
  }));
}

function fixture() {
  const rows = new Map<string, string>();
  const store: StudioAsyncKeyValueStore = {
    get: async (key) => rows.get(key) ?? null,
    set: async (key, value) => { rows.set(key, value); },
    delete: async (key) => { rows.delete(key); },
  };
  const repository = new CharacterDocumentV3Repository({
    storeFactory: async () => store,
  });
  return { rows, repository };
}

afterEach(() => cleanup());

describe("useCharacterAuthoringAuthority", () => {
  it("hydrates, commits, undoes and saves CharacterDocument V3 in browser storage", async () => {
    const f = fixture();
    const hook = renderHook(() => useCharacterAuthoringAuthority(
      projection(),
      "fingerprint:v1",
      { repository: f.repository, autosave: false },
    ));

    await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
    await waitFor(() => expect(
      hook.result.current.snapshot.document.sourceReceipts.some((receipt) =>
        receipt.kind === "compatibility-projection"
        && receipt.sourceFingerprint === "fingerprint:v1"
      ),
    ).toBe(true));
    const current = hook.result.current.snapshot.document;
    let status = "";
    act(() => {
      status = hook.result.current.dispatch({
        commandId: "character.hook/iris-blue",
        label: "눈동자 색",
        source: "user",
        expectedDocumentId: current.documentId,
        expectedRevision: current.revision,
        operations: [{ kind: "set-color", target: "iris", color: "#3366ff" }],
      }).status;
    });
    expect(status).toBe("applied");
    await waitFor(() => expect(
      hook.result.current.snapshot.document.look.colors.iris,
    ).toBe("#3366ff"));
    act(() => { hook.result.current.undo(); });
    expect(hook.result.current.snapshot.document.look.colors.iris).toBeNull();
    act(() => { hook.result.current.redo(); });
    expect(hook.result.current.snapshot.document.look.colors.iris).toBe("#3366ff");

    await act(async () => {
      expect(await hook.result.current.saveNow()).toBe(true);
    });
    expect(f.rows.has("character:hook")).toBe(true);
  });

  it("reopens durable V3-only state instead of replacing it with the compatibility projection", async () => {
    const f = fixture();
    const durable = {
      ...projection(5),
      geometryStrokes: {
        version: 1 as const,
        strokes: [{
          strokeId: "stroke:durable",
          name: "durable",
          visible: true,
          locked: false,
          status: "valid" as const,
          style: {
            color: "#111111",
            baseWidth: 0.01,
            opacity: 1,
            taperStart: 0,
            taperEnd: 0,
            pressureWidth: 0,
            profile: "ribbon" as const,
            fill: true,
            lineOnly: false,
          },
          points: [
            { anchor: { kind: "free" as const, position: [0, 0, 0] as const }, pressure: 0.5, width: 1, twist: 0 },
            { anchor: { kind: "free" as const, position: [1, 0, 0] as const }, pressure: 0.5, width: 1, twist: 0 },
          ],
        }],
      },
    };
    await f.repository.save(durable);

    const hook = renderHook(() => useCharacterAuthoringAuthority(
      projection(1),
      "fingerprint:compatibility-v2",
      { repository: f.repository, autosave: false },
    ));
    await waitFor(() => expect(hook.result.current.hydrated).toBe(true));
    await waitFor(() => {
      expect(hook.result.current.snapshot.document.geometryStrokes.strokes[0]?.strokeId)
        .toBe("stroke:durable");
    });
    expect(hook.result.current.snapshot.document.revision).toBeGreaterThanOrEqual(5);
  });
});
