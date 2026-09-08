// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Group } from "three";

import { useCharacterShaperBinding } from "../../character-shaper/useCharacterShaperBinding";
import { createCharacterPartPreset } from "../presets/character-part-preset";
import { CHARACTER_PART_PRESET_SQLITE_NAMESPACE, createCharacterPartPresetStore } from "../presets/character-part-preset-store";
import { createEmptyCharacterSurfaceInkDocument } from "../surface-ink/character-surface-ink";
import { CHARACTER_SURFACE_INK_SQLITE_NAMESPACE, loadCharacterSurfaceInkDocument, saveCharacterSurfaceInkDocument } from "../surface-ink/character-surface-ink-storage";
import { useCharacterSurfaceInkRuntime } from "../surface-ink/use-character-surface-ink-runtime";

import { CharacterPlatformWorkbench } from "./CharacterPlatformWorkbench";
import { useCharacterPlatformWorkbench } from "./use-character-platform-workbench";

import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import type { CharacterSurfaceInkDocument } from "../surface-ink/character-surface-ink";

const database = vi.hoisted(() => ({
  rows: new Map<string, string>(),
  get: vi.fn<(namespace: string, key: string) => Promise<string | null>>(),
  set: vi.fn<(namespace: string, key: string, value: string) => Promise<void>>(),
  delete: vi.fn<(namespace: string, key: string) => Promise<void>>(),
}));
vi.mock("../../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({
    asAsyncKeyValueStore: (namespace: string) => ({
      get: (key: string) => database.get(namespace, key),
      set: (key: string, value: string) => database.set(namespace, key, value),
      delete: (key: string) => database.delete(namespace, key),
    }),
  }),
}));

const MANIFEST_NAMESPACE = "studio-character-canonical-manifests-v12";
const rowKey = (namespace: string, key: string) => `${namespace}\u0000${key}`;
const readRow = async (namespace: string, key: string) => database.rows.get(rowKey(namespace, key)) ?? null;
const writeRow = async (namespace: string, key: string, value: string) => { database.rows.set(rowKey(namespace, key), value); };

beforeEach(() => {
  database.rows.clear();
  database.get.mockReset().mockImplementation(readRow);
  database.set.mockReset().mockImplementation(writeRow);
  database.delete.mockReset().mockImplementation(async (namespace, key) => { database.rows.delete(rowKey(namespace, key)); });
});
afterEach(async () => {
  cleanup();
  await act(async () => {});
  vi.restoreAllMocks();
});

function host(modelId = "model-a") {
  return { activeModelId: modelId, status: "empty", captureRef: { current: null } } as unknown as StudioVrmPoserHost;
}
function useWorkbench(modelId: string) {
  const h = host(modelId);
  return useCharacterPlatformWorkbench(h, useCharacterShaperBinding(h));
}
function manifest(modelId: string) {
  return {
    schemaVersion: 2,
    identity: { assetId: modelId, version: "1", topologyFamily: "toon-standard", topologyRevision: "t1", rigRevision: "r1", morphRevision: "m1", rendererRevision: "r1" },
    runtime: { format: "vrm-1.0", modelFile: "model.vrm", unitScale: 1, upAxis: "Y", forwardAxis: "-Z" },
    semantics: { nodes: {}, materials: {}, renderIds: {} }, morphs: {},
    fitting: { bodyMeasurements: {}, sockets: [], colliders: [] },
    exports: { supportedPasses: ["beauty"], psdLayerMap: {} },
    quality: { reportFile: "quality.json", minimumScore: 90, acceptedAt: "2026-09-08", acceptedBy: "test", goldenPoseIds: [], goldenCameraIds: [] },
    provenance: { creatorId: "test", sourceLicense: "original", commercialUse: true, redistribution: true, contentSha256: "a".repeat(64) },
  };
}
function ink(name: string, modelKey = name): CharacterSurfaceInkDocument {
  return { version: 1, layers: [{ layerId: name, name, visible: true, locked: false, opacity: 1, blendMode: "normal", strokes: [{
    strokeId: `stroke-${name}`, meshAssetId: "face", topologyRevision: modelKey, status: "valid",
    anchors: [{ meshAssetId: "face", topologyRevision: modelKey, primitiveIndex: 0, triangleIndex: 0, barycentric: [1, 0, 0], localNormal: [0, 0, 1], localTangent: [1, 0, 0], skinIndices: [0, 0, 0, 0], skinWeights: [1, 0, 0, 0], pressure: 0.5, width: 1 }],
    style: { color: "#111111", widthMode: "surface", baseWidth: 0.02, opacity: 1, taperStart: 0, taperEnd: 0, pressureWidth: 0, pressureOpacity: 0, smoothing: 0, surfaceOffset: 0.001, cap: "round", join: "round", frontFacesOnly: true },
  }] }] };
}

function Workbench() {
  const h = host();
  const binding = useCharacterShaperBinding(h);
  return <CharacterPlatformWorkbench h={h} binding={{ ...binding, recipe: { ...binding.recipe, slots: { ...binding.recipe.slots, eyes: "eyes:round" } } }} />;
}

describe("character SQLite persistence", () => {
  it("serializes overlapping preset saves and deletes and reopens through the product SQLite factory", async () => {
    const browserRead = vi.spyOn(Storage.prototype, "getItem");
    const browserWrite = vi.spyOn(Storage.prototype, "setItem");
    const hook = renderHook(() => useWorkbench("model-a"));
    await act(async () => {});
    const preset = createCharacterPartPreset({ presetId: "preset-a", name: "Original", kind: "slot", scope: "personal", document: hook.result.current.document, slot: "eyes" });
    const store = createCharacterPartPresetStore();
    const gate = Promise.withResolvers<void>();
    database.set.mockImplementationOnce(async (namespace, key, value) => { await gate.promise; await writeRow(namespace, key, value); });
    const saved = store.save(preset);
    const edited = store.save({ ...preset, name: "Edited" });
    const removed = store.remove(preset.presetId);
    await waitFor(() => expect(database.set).toHaveBeenCalled());
    expect(store.getSnapshot().presets).toHaveLength(0);
    gate.resolve();
    expect((await saved).presets[0]?.name).toBe("Original");
    expect((await edited).presets[0]).toMatchObject({ name: "Edited", version: 2 });
    expect((await removed).presets).toHaveLength(0);
    const reopened = createCharacterPartPresetStore();
    await reopened.refresh();
    expect(reopened.list()).toEqual([]);
    expect(database.get).toHaveBeenCalledWith(CHARACTER_PART_PRESET_SQLITE_NAMESPACE, "library-v1");
    expect(browserRead).not.toHaveBeenCalled();
    expect(browserWrite).not.toHaveBeenCalled();
  });

  it("retains the durable preset on write failure and allows retry without clearing it", async () => {
    const hook = renderHook(() => useWorkbench("model-a"));
    await act(async () => {});
    const preset = createCharacterPartPreset({ presetId: "preset-a", name: "Original", kind: "slot", scope: "personal", document: hook.result.current.document, slot: "eyes" });
    const store = createCharacterPartPresetStore();
    await store.save(preset);
    database.set.mockRejectedValueOnce(new Error("OPFS quota"));
    expect(await store.save({ ...preset, name: "Edited" })).toMatchObject({ status: "error", message: "OPFS quota" });
    expect(store.list()[0]?.name).toBe("Original");
    expect(JSON.parse((await readRow(CHARACTER_PART_PRESET_SQLITE_NAMESPACE, "library-v1"))!)[0].name).toBe("Original");
    expect((await store.save({ ...preset, name: "Retried" })).presets[0]?.name).toBe("Retried");
  });

  it("preserves ink save order, then reloads the latest acknowledged document without browser KV", async () => {
    const gate = Promise.withResolvers<void>();
    database.set.mockImplementationOnce(async (namespace, key, value) => { await gate.promise; await writeRow(namespace, key, value); });
    const first = saveCharacterSurfaceInkDocument("ink-a", ink("first"));
    const second = saveCharacterSurfaceInkDocument("ink-a", ink("second"));
    const loaded = loadCharacterSurfaceInkDocument("ink-a");
    await waitFor(() => expect(database.set).toHaveBeenCalledTimes(1));
    gate.resolve();
    await Promise.all([first, second]);
    expect(await loaded).toEqual(ink("second"));
    database.set.mockRejectedValueOnce(new Error("SQLite unavailable"));
    await expect(saveCharacterSurfaceInkDocument("ink-a", ink("failed"))).rejects.toThrow("SQLite unavailable");
    expect(await loadCharacterSurfaceInkDocument("ink-a")).toEqual(ink("second"));
  });

  it.each(["strokes", "layers", "coordinates"] as const)("rejects unreloadable ink %s before replacing its durable row", async (kind) => {
    const previous = ink("preserved");
    await saveCharacterSurfaceInkDocument("bounded", previous);
    const layer = previous.layers[0]!;
    const stroke = layer.strokes[0]!;
    const candidate: CharacterSurfaceInkDocument = kind === "layers"
      ? { ...previous, layers: Array.from({ length: 33 }, (_, i) => ({ ...layer, layerId: String(i), strokes: [] })) }
      : { ...previous, layers: [{ ...layer, strokes: kind === "strokes"
        ? Array.from({ length: 2_001 }, (_, i) => ({ ...stroke, strokeId: String(i), anchors: [] }))
        : [{ ...stroke, anchors: [{ ...stroke.anchors[0]!, barycentric: [Number.NaN, 0, 0] }] }] }] };
    await expect(saveCharacterSurfaceInkDocument("bounded", candidate)).rejects.toThrow("3D 펜선");
    expect(database.set).toHaveBeenCalledTimes(1);
    expect(await loadCharacterSurfaceInkDocument("bounded")).toEqual(previous);
    await saveCharacterSurfaceInkDocument("bounded", ink("repaired"));
    expect(await loadCharacterSurfaceInkDocument("bounded")).toEqual(ink("repaired"));
  });

  it("saves and reloads ink at the existing 2000 stroke limit", async () => {
    const previous = ink("limit");
    const layer = previous.layers[0]!;
    const candidate = { ...previous, layers: [{ ...layer, strokes: Array.from({ length: 2_000 }, (_, i) => ({ ...layer.strokes[0]!, strokeId: String(i), anchors: [] })) }] };
    await saveCharacterSurfaceInkDocument("at-limit", candidate);
    expect(await loadCharacterSurfaceInkDocument("at-limit")).toEqual(candidate);
  });

  it("never saves the initial empty ink over delayed hydration and discards an old model read", async () => {
    const oldRead = Promise.withResolvers<string | null>();
    database.get.mockImplementation((namespace, key) => key === "model-a" ? oldRead.promise : readRow(namespace, key));
    database.rows.set(rowKey(CHARACTER_SURFACE_INK_SQLITE_NAMESPACE, "model-b"), JSON.stringify(ink("B", "model-b")));
    const hook = renderHook(({ modelKey }) => useCharacterSurfaceInkRuntime({ h: host(modelKey), modelKey, revisionKey: "r1" }), { initialProps: { modelKey: "model-a" } });
    await act(async () => {});
    expect(database.set).not.toHaveBeenCalled();
    hook.rerender({ modelKey: "model-b" });
    await waitFor(() => expect(hook.result.current.document).toEqual(ink("B", "model-b")));
    await act(async () => { oldRead.resolve(JSON.stringify(ink("A", "model-a"))); });
    expect(hook.result.current.document).toEqual(ink("B", "model-b"));
    expect(database.set.mock.calls.every(([, key, value]) => key === "model-b" && value === JSON.stringify(ink("B", "model-b")))).toBe(true);
  });

  it("keeps corrupt ink intact and reports the failed hydration instead of autosaving an empty document", async () => {
    database.rows.set(rowKey(CHARACTER_SURFACE_INK_SQLITE_NAMESPACE, "corrupt"), "{broken");
    const hook = renderHook(() => useCharacterSurfaceInkRuntime({ h: host("corrupt"), modelKey: "corrupt", revisionKey: "r1" }));
    await waitFor(() => expect(hook.result.current.notice).toBeTruthy());
    expect(database.set).not.toHaveBeenCalled();
    let accepted = true;
    act(() => { accepted = hook.result.current.importJson(JSON.stringify(createEmptyCharacterSurfaceInkDocument())); });
    expect(accepted).toBe(false);
    expect(await readRow(CHARACTER_SURFACE_INK_SQLITE_NAMESPACE, "corrupt")).toBe("{broken");
  });

  it("discards a late manifest read on model change and serializes import then removal", async () => {
    const oldRead = Promise.withResolvers<string | null>();
    database.get.mockImplementation((namespace, key) => namespace === MANIFEST_NAMESPACE && key === "model-a" ? oldRead.promise : readRow(namespace, key));
    database.rows.set(rowKey(MANIFEST_NAMESPACE, "model-b"), JSON.stringify(manifest("model-b")));
    const hook = renderHook(({ modelId }) => useWorkbench(modelId), { initialProps: { modelId: "model-a" } });
    await act(async () => {});
    hook.rerender({ modelId: "model-b" });
    await act(async () => { oldRead.resolve(JSON.stringify(manifest("model-a"))); });
    await waitFor(() => expect(hook.result.current.canonicalManifest?.identity.assetId).toBe("model-b"));
    const gate = Promise.withResolvers<void>();
    database.set.mockImplementation(async (namespace, key, value) => { if (namespace === MANIFEST_NAMESPACE) await gate.promise; await writeRow(namespace, key, value); });
    let imported!: Promise<boolean>;
    let removed!: Promise<void>;
    act(() => {
      imported = hook.result.current.importCanonicalManifest(JSON.stringify(manifest("model-b")));
      removed = hook.result.current.removeCanonicalManifest();
    });
    await act(async () => { gate.resolve(); await Promise.all([imported, removed]); });
    expect(hook.result.current.canonicalManifest).toBeNull();
    expect(await readRow(MANIFEST_NAMESPACE, "model-b")).toBeNull();
  });

  it("keeps a successful queued import visible when the following delete fails", async () => {
    const initial = manifest("model-a");
    database.rows.set(rowKey(MANIFEST_NAMESPACE, "model-a"), JSON.stringify(initial));
    const hook = renderHook(() => useWorkbench("model-a"));
    await waitFor(() => expect(hook.result.current.canonicalManifest).not.toBeNull());
    const updated = { ...initial, identity: { ...initial.identity, version: "2" } };
    const gate = Promise.withResolvers<void>();
    database.set.mockImplementation(async (namespace, key, value) => {
      if (namespace === MANIFEST_NAMESPACE) await gate.promise;
      await writeRow(namespace, key, value);
    });
    database.delete.mockRejectedValueOnce(new Error("delete blocked"));
    let imported!: Promise<boolean>;
    let removed!: Promise<void>;
    act(() => {
      imported = hook.result.current.importCanonicalManifest(JSON.stringify(updated));
      removed = hook.result.current.removeCanonicalManifest();
    });
    await act(async () => { gate.resolve(); await Promise.all([imported, removed]); });
    expect(hook.result.current.canonicalManifest?.identity.version).toBe("2");
    expect(hook.result.current.notice).toBe("delete blocked");
    expect(JSON.parse((await readRow(MANIFEST_NAMESPACE, "model-a"))!).identity.version).toBe("2");
  });

  it("retains the connected manifest and exposes a failed delete rather than announcing success", async () => {
    database.rows.set(rowKey(MANIFEST_NAMESPACE, "model-a"), JSON.stringify(manifest("model-a")));
    const hook = renderHook(() => useWorkbench("model-a"));
    await waitFor(() => expect(hook.result.current.canonicalManifest).not.toBeNull());
    database.delete.mockRejectedValueOnce(new Error("OPFS denied"));
    await act(async () => { await hook.result.current.removeCanonicalManifest(); });
    expect(hook.result.current.canonicalManifest?.identity.assetId).toBe("model-a");
    expect(hook.result.current.notice).toBe("OPFS denied");
  });

  it("retains the preset name until durable success and keeps the draft after failure", async () => {
    render(<Workbench />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /품질 도구/u }));
    fireEvent.click(screen.getByRole("tab", { name: /프리셋/u }));
    const name = screen.getByRole("textbox", { name: "이름" }) as HTMLInputElement;
    const button = screen.getByRole("button", { name: "현재 파츠 저장" }) as HTMLButtonElement;
    fireEvent.change(name, { target: { value: "My preset" } });
    const failedWrite = Promise.withResolvers<void>();
    database.set.mockImplementation(async (namespace, key, value) => {
      if (namespace === CHARACTER_PART_PRESET_SQLITE_NAMESPACE) await failedWrite.promise;
      await writeRow(namespace, key, value);
    });
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    expect(name.value).toBe("My preset");
    await act(async () => { failedWrite.reject(new Error("OPFS quota")); });
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(name.value).toBe("My preset");
    expect(screen.getByRole("status").textContent).toBe("OPFS quota");
    database.set.mockImplementation(writeRow);
    fireEvent.click(button);
    await waitFor(() => expect(name.value).toBe(""));
    expect(screen.getByRole("status").textContent).toContain("저장했습니다");
  });
});

describe("workbench document and pose actions", () => {
  function readyWorkbench(overrides: Partial<StudioVrmPoserHost> = {}) {
    const h = { ...host(), ...overrides } as StudioVrmPoserHost;
    return renderHook(() => {
      const binding = useCharacterShaperBinding(h);
      return useCharacterPlatformWorkbench(h, {
        ...binding,
        recipe: { ...binding.recipe, slots: { ...binding.recipe.slots, eyes: "eyes:round" } },
      });
    });
  }
  it("exports only the connected model manifest and leaves it intact on invalid replacement", async () => {
    const hook = readyWorkbench(); await act(async () => {});
    expect(hook.result.current.exportCanonicalManifest()).toBeNull();
    await act(async () => expect(await hook.result.current.importCanonicalManifest(JSON.stringify(manifest("model-a")))).toBe(true));
    expect(JSON.parse(hook.result.current.exportCanonicalManifest()!)).toMatchObject({ identity: { assetId: "model-a" } });
    const saved = await readRow(MANIFEST_NAMESPACE, "model-a");
    for (const input of ["not JSON", JSON.stringify(manifest("another-model"))]) {
      await act(async () => expect(await hook.result.current.importCanonicalManifest(input)).toBe(false));
      expect(hook.result.current.canonicalError).toBeTruthy();
      expect(await readRow(MANIFEST_NAMESPACE, "model-a")).toBe(saved);
      expect(JSON.parse(hook.result.current.exportCanonicalManifest()!)).toEqual(JSON.parse(saved!));
    }
    await act(async () => hook.result.current.removeCanonicalManifest());
    expect(hook.result.current.exportCanonicalManifest()).toBeNull();
    expect(hook.result.current.canonicalError).toBeNull();
  });
  it("reports corrupt and wrong-model hydration without promoting either as canonical", async () => {
    for (const raw of ["broken", JSON.stringify(manifest("wrong-model"))]) {
      database.rows.set(rowKey(MANIFEST_NAMESPACE, "model-a"), raw);
      const hook = readyWorkbench();
      await waitFor(() => expect(hook.result.current.canonicalError).toBeTruthy());
      expect(hook.result.current.canonicalManifest).toBeNull();
      expect(await readRow(MANIFEST_NAMESPACE, "model-a")).toBe(raw);
      hook.unmount();
    }
  });
  it("exports, imports and removes only acknowledged presets and explains rejected input", async () => {
    const hook = readyWorkbench(); await act(async () => {});
    await act(async () => expect(await hook.result.current.saveSlotPreset("eyes", "Round eyes")).toBe(true));
    const exported = JSON.parse(hook.result.current.exportPresets()) as ReturnType<typeof createCharacterPartPreset>[];
    expect(exported).toHaveLength(1); expect(exported[0].name).toBe("Round eyes");
    await act(async () => hook.result.current.removePreset(exported[0].presetId));
    expect(JSON.parse(hook.result.current.exportPresets())).toEqual([]);
    await act(async () => expect(await hook.result.current.importPresets(JSON.stringify(exported))).toBe(1));
    expect(JSON.parse(hook.result.current.exportPresets())).toEqual(exported);
    expect(hook.result.current.notice).toContain("1개");
    for (const input of ["not JSON", "{}", JSON.stringify(Array(501).fill(exported[0])), "[{}]"]) {
      await act(async () => expect(await hook.result.current.importPresets(input)).toBe(0));
      expect(hook.result.current.notice).toBeTruthy();
      expect(JSON.parse(hook.result.current.exportPresets())).toEqual(exported);
    }
    database.set.mockRejectedValueOnce(new Error("Preset write denied"));
    await act(async () => expect(await hook.result.current.saveSlotPreset("eyes", "Rejected")).toBe(false));
    expect(hook.result.current.notice).toContain("Preset write denied");
    database.set.mockRejectedValueOnce(new Error("Import write denied"));
    await act(async () => expect(await hook.result.current.importPresets(JSON.stringify(exported))).toBe(0));
    expect(hook.result.current.notice).toContain("Import write denied");
  });
  it("passes the current document to the atomic preset commit and preserves its rejection reason", async () => {
    const commitPreset = vi.fn().mockReturnValue({ ok: false, reason: "Unsupported camera" });
    const h = host();
    const hook = renderHook(() => {
      const binding = useCharacterShaperBinding(h);
      return useCharacterPlatformWorkbench(h, { ...binding, commitPreset });
    });
    await act(async () => {});
    const preset = createCharacterPartPreset({ presetId: "preset", name: "Atomic", kind: "slot", scope: "personal", document: hook.result.current.document, slot: "eyes" });
    act(() => expect(hook.result.current.applyPreset(preset)).toBe(false));
    expect(commitPreset).toHaveBeenCalledWith(preset, hook.result.current.document);
    expect(hook.result.current.notice).toBe("Unsupported camera");
    commitPreset.mockReturnValueOnce({ ok: false });
    act(() => expect(hook.result.current.applyPreset(preset)).toBe(false));
    expect(hook.result.current.notice).toContain("적용하지 못했습니다");
    commitPreset.mockReturnValueOnce({ ok: true });
    act(() => expect(hook.result.current.applyPreset(preset)).toBe(true));
    expect(hook.result.current.notice).toContain("Atomic 프리셋을 적용했습니다");
  });
  it("does not report old-model import or preset save completion in a new scope", async () => {
    const hook = renderHook(({ id }) => {
      const h = host(id); const binding = useCharacterShaperBinding(h);
      return useCharacterPlatformWorkbench(h, { ...binding, recipe: { ...binding.recipe, slots: { ...binding.recipe.slots, eyes: "eyes:round" } } });
    }, { initialProps: { id: "model-a" } });
    await act(async () => {});
    const pending = Promise.withResolvers<void>(); let savingEntered = false;
    database.set.mockImplementation(async (namespace, key, value) => {
      if (namespace === CHARACTER_PART_PRESET_SQLITE_NAMESPACE) { savingEntered = true; await pending.promise; }
      await writeRow(namespace, key, value);
    });
    let saving: Promise<boolean>; act(() => { saving = hook.result.current.saveSlotPreset("eyes", "Old model"); });
    await waitFor(() => expect(savingEntered).toBe(true));
    hook.rerender({ id: "model-b" }); await act(async () => { pending.resolve(); expect(await saving!).toBe(false); });
    expect(hook.result.current.notice).toBeNull();
    const exported = hook.result.current.exportPresets(); const next = Promise.withResolvers<void>(); let importingEntered = false;
    database.set.mockImplementation(async (namespace, key, value) => {
      if (namespace === CHARACTER_PART_PRESET_SQLITE_NAMESPACE) { importingEntered = true; await next.promise; }
      await writeRow(namespace, key, value);
    });
    let importing: Promise<number>; act(() => { importing = hook.result.current.importPresets(exported); });
    await waitFor(() => expect(importingEntered).toBe(true));
    hook.unmount(); await act(async () => { next.resolve(); expect(await importing!).toBe(0); });
  });
  it("rejects empty or unavailable pose edits without calling the host", async () => {
    const apply = vi.fn();
    const hook = readyWorkbench({ customBones: { invalid: [1, 2], nonfinite: [0, Number.NaN, 0] }, handlePhotoPoseApply: apply });
    await act(async () => {}); act(() => expect(hook.result.current.stabilizeCurrentPose()).toBe(false));
    expect(apply).not.toHaveBeenCalled(); expect(hook.result.current.notice).toContain("먼저 포즈");
    hook.unmount(); const noHandler = readyWorkbench({ customBones: { spine: [0.1, 0.2, 0.3] } });
    await act(async () => {}); act(() => expect(noHandler.result.current.stabilizeCurrentPose()).toBe(false));
  });
  it("stabilizes selected pose regions with finite Euler output and actual foot-contact data", async () => {
    const apply = vi.fn();
    const h = { ...host(), customBones: { spine: [0.1, 0.2, 0.3], leftUpperArm: [0.1, 0.2, 0], malformed: [1, 2] }, handlePhotoPoseApply: apply,
      vrm: { scene: new Group(), humanoid: { getNormalizedBoneNode: (name: string) => name === "leftFoot" ? { getWorldPosition: (target: { set: (x: number, y: number, z: number) => unknown }) => target.set(0.1, -0.02, 0.3) } : null } },
    } as unknown as StudioVrmPoserHost;
    const hook = renderHook(() => useCharacterPlatformWorkbench(h, useCharacterShaperBinding(h))); await act(async () => {});
    act(() => hook.result.current.setSelectedPoseRegions(["torso"]));
    expect(hook.result.current.selectedPoseRegions).toEqual(["torso"]);
    act(() => expect(hook.result.current.stabilizeCurrentPose()).toBe(true));
    expect(apply).toHaveBeenCalledTimes(1);
    const value = apply.mock.calls[0][0]; expect(value.sourceName).toBe("현재 포즈 · Pose V2 안정화");
    expect(Object.keys(value.bones).sort()).toEqual(["leftUpperArm", "spine"]);
    for (const bone of Object.values(value.bones) as number[][]) { expect(bone).toHaveLength(3); expect(bone.every(Number.isFinite)).toBe(true); }
    expect(value.bones.leftUpperArm[0]).toBeCloseTo(0.1); expect(value.bones.leftUpperArm[1]).toBeCloseTo(0.2);
    expect(hook.result.current.notice).toContain("Pose V2 적용");
  });
});
