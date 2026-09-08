// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCharacterPartPreset } from "../character-platform/presets/character-part-preset";
import { useCharacterPlatformWorkbench } from "../character-platform/ui/use-character-platform-workbench";

import { createAvatarForgeState } from "../vrm/studio-vrm-avatar-forge";
import { applyWardrobeSet, SELECTABLE_WARDROBE_SETS } from "../vrm/studio-vrm-wardrobe";

import { findCharacterSlotEntry, listCharacterSlotEntries } from "./character-shaper-catalog";
import { applyCharacterIrisTint } from "./character-shaper-iris-tint";
import { useCharacterShaperBinding } from "./useCharacterShaperBinding";

import type { CharacterPartPresetV1 } from "../character-platform/presets/character-part-preset";
import type { CharacterCapabilityProfile, CharacterSlotEntry } from "./character-shaper-contract";
import type { AvatarForgeState } from "../vrm/studio-vrm-avatar-forge";
import type { PropInstance } from "../vrm/studio-vrm-props";
import type { WardrobeSlot, WardrobeState } from "../vrm/studio-vrm-wardrobe";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

const FULL_PROFILE: CharacterCapabilityProfile = {
  status: "ready",
  modelId: "sample",
  modelName: "샘플 캐릭터",
  humanoid: true,
  semanticMorphs: {
    eyeSize: { kind: "shape-key" },
    eyeSpacing: { kind: "shape-key" },
    eyeTilt: { kind: "shape-key" },
    irisSize: { kind: "shape-key" },
    noseHeight: { kind: "shape-key" },
    noseWidth: { kind: "shape-key" },
    mouthWidth: { kind: "shape-key" },
    lipFullness: { kind: "shape-key" },
    earSize: { kind: "shape-key" },
  } as unknown as CharacterCapabilityProfile["semanticMorphs"],
  expressions: ["happy", "angry", "sad", "aa", "ou", "blink"],
  costumeSlots: ["tops", "bottoms", "shoes"],
  wardrobeMetricsReady: true,
  propsReady: true,
  irisTintable: true,
  originalHairMeshCount: 2,
  surfacePaintReady: true,
};

vi.mock("./character-shaper-capability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./character-shaper-capability")>();
  return { ...actual, createCharacterCapabilityProfile: () => FULL_PROFILE };
});

vi.mock("./character-shaper-iris-tint", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./character-shaper-iris-tint")>();
  return { ...actual, applyCharacterIrisTint: vi.fn(() => 1) };
});

vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({
    asAsyncKeyValueStore: () => ({ get: async () => null, set: async () => {}, delete: async () => {} }),
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

interface FakeHostState {
  status: string;
  activeModelId: string;
  avatarForgeState: AvatarForgeState;
  wardrobeState: WardrobeState;
  vrmPropItems: PropInstance[];
  selectedVrmPropUid: string | null;
  costumeState: { hidden: string[]; recolor: Record<string, string> };
  customColors: Record<string, string>;
  activePoseId: string;
  fingerEdits: Record<string, unknown>;
  activeExpressionId: string;
  expressionWeights: Record<string, number>;
  isCapturing: boolean;
  wardrobeInteractionLocked: boolean;
}

interface FakeHost {
  readonly host: StudioVrmPoserHost;
  readonly state: FakeHostState;
  readonly calls: {
    forge: AvatarForgeState[];
    pose: string[];
    hands: { side: string; poseType: string }[];
    expressionPresets: string[];
  };
}

function createFakeHost(overrides: Partial<FakeHostState> = {}): FakeHost {
  const state: FakeHostState = {
    status: "ready",
    activeModelId: "sample",
    avatarForgeState: createAvatarForgeState(),
    wardrobeState: {},
    vrmPropItems: [],
    selectedVrmPropUid: null,
    costumeState: { hidden: [], recolor: {} },
    customColors: {},
    activePoseId: "ni_weight_left",
    fingerEdits: {},
    activeExpressionId: "preset:xf_joy",
    expressionWeights: { happy: 1 },
    isCapturing: false,
    wardrobeInteractionLocked: false,
    ...overrides,
  };
  const calls: FakeHost["calls"] = { forge: [], pose: [], hands: [], expressionPresets: [] };

  const host = {
    get status() { return state.status; },
    vrm: { scene: { traverse: () => undefined } },
    get activeModelId() { return state.activeModelId; },
    displayModelName: "샘플 캐릭터",
    wardrobeMetrics: { ready: true },
    detectedOriginalHairCount: 2,
    texturePaintDisabledReason: "",
    get isCapturing() { return state.isCapturing; },
    get wardrobeInteractionLocked() { return state.wardrobeInteractionLocked; },
    isSharingPose: false,
    isThumbnailCapturing: false,
    broadcastPreviewActive: false,
    proportionRigStatus: "idle",
    proportionRigMessage: "",
    get avatarForgeState() { return state.avatarForgeState; },
    get wardrobeState() { return state.wardrobeState; },
    get vrmPropItems() { return state.vrmPropItems; },
    get selectedVrmPropUid() { return state.selectedVrmPropUid; },
    get costumeState() { return state.costumeState; },
    costumeMeshes: [{ key: "Tops", slot: "tops" }],
    get customColors() { return state.customColors; },
    get activePoseId() { return state.activePoseId; },
    customBones: {},
    customYOffset: 0,
    poseTranslations: {},
    get fingerEdits() { return state.fingerEdits; },
    get activeExpressionId() { return state.activeExpressionId; },
    get expressionWeights() { return state.expressionWeights; },
    bodyRotation: 0,

    handleAvatarForgeChange: (next: AvatarForgeState) => {
      calls.forge.push(next);
      state.avatarForgeState = next;
    },
    equipWardrobeItem: (slot: WardrobeSlot, itemId: string | null) => {
      const next: WardrobeState = { ...state.wardrobeState };
      if (itemId === null) delete next[slot];
      else next[slot] = { itemId, color: "#ffffff", fit: 1, fitMode: "auto", fabricId: "cotton" };
      state.wardrobeState = next;
    },
    updateWardrobeEquip: (slot: WardrobeSlot, patch: Record<string, unknown>) => {
      const current = state.wardrobeState[slot];
      if (!current) return;
      state.wardrobeState = { ...state.wardrobeState, [slot]: { ...current, ...patch } };
    },
    setWardrobeState: (next: WardrobeState) => { state.wardrobeState = next; },
    updateCostume: (next: { hidden: string[]; recolor: Record<string, string> }) => { state.costumeState = next; },
    addVrmProp: (propId: string) => {
      const uid = `${propId}#${state.vrmPropItems.length}`;
      state.vrmPropItems = [...state.vrmPropItems, { uid, propId } as PropInstance];
      state.selectedVrmPropUid = uid;
    },
    removeVrmProp: (uid: string) => {
      state.vrmPropItems = state.vrmPropItems.filter((item) => item.uid !== uid);
    },
    setVrmPropItems: (next: PropInstance[]) => { state.vrmPropItems = next; },
    setSelectedVrmPropUid: (uid: string | null) => { state.selectedVrmPropUid = uid; },
    setCustomColors: (next: Record<string, string>) => { state.customColors = next; },
    setExpressionWeights: (next: Record<string, number>) => { state.expressionWeights = next; },
    setActiveExpressionId: (next: string) => { state.activeExpressionId = next; },
    handleExpressionPresetSelect: (preset: { id: string; weights: Record<string, number> }) => {
      calls.expressionPresets.push(preset.id);
      state.activeExpressionId = `preset:${preset.id}`;
      state.expressionWeights = { ...preset.weights };
    },
    handlePoseSelect: (presetId: string) => {
      calls.pose.push(presetId);
      state.activePoseId = presetId;
    },
    applyHandPosePreset: (side: string, poseType: string) => {
      calls.hands.push({ side, poseType });
      state.fingerEdits = { ...state.fingerEdits, [`${side}:${poseType}`]: true };
    },
    setActivePoseId: (next: string) => { state.activePoseId = next; },
    setCustomBones: () => undefined,
    setCustomYOffset: () => undefined,
    setPoseTranslations: () => undefined,
    setFingerEdits: (next: Record<string, unknown>) => { state.fingerEdits = next; },
    setBodyRotation: () => undefined,
  } as unknown as StudioVrmPoserHost;

  return { host, state, calls };
}

function entryOf(id: string): CharacterSlotEntry {
  const found = findCharacterSlotEntry(id);
  if (!found) throw new Error(`missing catalog entry: ${id}`);
  return found;
}

function firstWardrobeEntry(): CharacterSlotEntry {
  const found = listCharacterSlotEntries("top").find((item) => item.apply.kind === "wardrobe" && item.apply.itemId);
  if (!found) throw new Error("no wardrobe top entry in the catalog");
  return found;
}

function firstAccessoryEntry(): CharacterSlotEntry {
  const found = listCharacterSlotEntries("accessory").find((item) => item.apply.kind === "prop");
  if (!found) throw new Error("no accessory entry in the catalog");
  return found;
}

function renderBinding(fake: FakeHost) {
  return renderHook(() => useCharacterShaperBinding(fake.host));
}

describe("useCharacterShaperBinding", () => {
  it("derives the recipe from host state and re-derives after a commit", () => {
    const fake = createFakeHost();
    const { result } = renderBinding(fake);
    expect(result.current.recipe.slots.eyes).toBe("eyes:original");

    act(() => {
      result.current.commit(entryOf("eyes:romance-sparkle"));
    });

    expect(result.current.recipe.slots.eyes).toBe("eyes:romance-sparkle");
    expect(result.current.history.recentLabels[0]).toBe("눈: 순정 반짝");
  });

  it("merges every Avatar Forge write of one commit into a single handleAvatarForgeChange", () => {
    const fake = createFakeHost();
    const { result } = renderBinding(fake);

    act(() => {
      result.current.commit(entryOf("eyes:romance-sparkle"));
    });

    // Three semantic morphs + one state write, but only one host call.
    expect(fake.calls.forge).toHaveLength(1);
    const morphs = fake.calls.forge[0]?.semanticFaceMorphs ?? {};
    expect(Object.keys(morphs).sort()).toEqual(["eyeSize", "eyeSpacing", "eyeTilt"]);
  });

  it("applies the mouth expression floor without resetting the active expression id", () => {
    const fake = createFakeHost({ activeExpressionId: "preset:xf_joy", expressionWeights: { happy: 0.05 } });
    const { result } = renderBinding(fake);

    act(() => {
      result.current.commit(entryOf("mouth:natural-smile"));
    });

    expect(fake.state.expressionWeights.happy).toBeCloseTo(0.2, 5);
    expect(fake.state.activeExpressionId).toBe("preset:xf_joy");
  });

  it("keeps a stronger expression weight instead of lowering it to the floor", () => {
    const fake = createFakeHost({ expressionWeights: { happy: 0.8 } });
    const { result } = renderBinding(fake);

    act(() => {
      result.current.commit(entryOf("mouth:natural-smile"));
    });

    expect(fake.state.expressionWeights.happy).toBeCloseTo(0.8, 5);
  });

  it("refuses every mutation while the host is capturing and says why", () => {
    const fake = createFakeHost({ isCapturing: true });
    const { result } = renderBinding(fake);

    expect(result.current.busyReason).toBe("캡처가 끝난 뒤에 다시 적용할 수 있습니다.");
    let outcome: { ok: boolean; reason: string | null } | null = null;
    act(() => {
      outcome = result.current.commit(entryOf("eyes:romance-sparkle"));
    });
    expect(outcome).toMatchObject({ ok: false, reason: "캡처가 끝난 뒤에 다시 적용할 수 있습니다." });
    expect(fake.calls.forge).toHaveLength(0);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("refuses a mutation whenever the host itself reports the wardrobe locked", () => {
    // 잠금 사유가 캡처·방송 미리보기가 아닌 다른 이유일 때에도 셰이퍼는 멈춰야 한다.
    const fake = createFakeHost({ wardrobeInteractionLocked: true });
    const { result } = renderBinding(fake);

    expect(result.current.busyReason).toBe("지금은 옷을 바꿀 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
    let outcome: { ok: boolean; reason: string | null } | null = null;
    act(() => {
      outcome = result.current.commit(entryOf("eyes:romance-sparkle"));
    });
    expect(outcome).toMatchObject({ ok: false });
    expect(fake.calls.forge).toHaveLength(0);
  });

  it("undo restores the raw host state of every authority the step touched, and redo re-applies it", () => {
    const fake = createFakeHost();
    const wardrobeEntry = firstWardrobeEntry();
    const { result } = renderBinding(fake);

    act(() => {
      result.current.commit(wardrobeEntry);
    });
    const equipped = { ...fake.state.wardrobeState };
    expect(Object.keys(equipped).length).toBeGreaterThan(0);

    act(() => {
      result.current.undo();
    });
    expect(fake.state.wardrobeState).toEqual({});
    expect(result.current.history.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });
    expect(fake.state.wardrobeState).toEqual(equipped);
  });

  it("tints the iris on commit and restores the previous tint on undo", () => {
    const fake = createFakeHost();
    const tint = vi.mocked(applyCharacterIrisTint);
    const { result } = renderBinding(fake);

    act(() => {
      result.current.commit(entryOf("irises:amber"));
    });
    expect(result.current.snapshot.irisColor).toBe("#b8742a");
    expect(tint.mock.calls.some(([, color]) => color === "#b8742a")).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.snapshot.irisColor).toBeNull();
  });

  it("toggles a multi slot: committing an equipped accessory takes it off", () => {
    const fake = createFakeHost();
    const accessory = firstAccessoryEntry();
    const { result } = renderBinding(fake);

    act(() => {
      result.current.commit(accessory);
    });
    expect(fake.state.vrmPropItems).toHaveLength(1);

    act(() => {
      result.current.commit(accessory);
    });
    expect(fake.state.vrmPropItems).toHaveLength(0);
  });

  it("applies a hand pose to the chosen side only and remembers it for the recipe", () => {
    const fake = createFakeHost();
    const { result } = renderBinding(fake);

    act(() => {
      result.current.setHandSide("left");
    });
    act(() => {
      result.current.commit(entryOf("hand-pose:fist"));
    });

    expect(fake.calls.hands).toEqual([{ side: "left", poseType: "fist" }]);
    expect(result.current.recipe.slots["hand-pose"]).toBe("hand-pose:fist");
    expect(result.current.handSide).toBe("left");
  });

  it("hold-to-compare swaps to the session baseline and back without recording history", () => {
    const fake = createFakeHost();
    const { result } = renderBinding(fake);

    act(() => {
      result.current.commit(entryOf("eyes:romance-sparkle"));
    });
    const steps = result.current.history.length;
    const changed = fake.state.avatarForgeState;

    act(() => {
      result.current.setCompareActive(true);
    });
    expect(result.current.compareActive).toBe(true);
    expect(fake.state.avatarForgeState.semanticFaceMorphs ?? {}).toEqual({});

    act(() => {
      result.current.setCompareActive(false);
    });
    expect(result.current.compareActive).toBe(false);
    expect(fake.state.avatarForgeState).toEqual(changed);
    expect(result.current.history.length).toBe(steps);
  });

  it("resetToBaseline is itself one undoable step", () => {
    const fake = createFakeHost();
    const { result } = renderBinding(fake);

    act(() => {
      result.current.commit(entryOf("eyes:romance-sparkle"));
    });
    act(() => {
      result.current.resetToBaseline();
    });

    expect(fake.state.avatarForgeState.semanticFaceMorphs ?? {}).toEqual({});
    expect(result.current.history.recentLabels[0]).toBe("처음 상태로 되돌리기");

    act(() => {
      result.current.undo();
    });
    expect(Object.keys(fake.state.avatarForgeState.semanticFaceMorphs ?? {})).toContain("eyeSize");
  });

  it.each(["left", "right"] as const)("starts a new model baseline without the previous %s hand or iris, including reset history", (side) => {
    const first = createFakeHost();
    const second = createFakeHost({ activeModelId: "second-model", fingerEdits: { authored: true } });
    const { result, rerender } = renderHook(({ current }) => {
      const binding = useCharacterShaperBinding(current.host);
      return { binding, workbench: useCharacterPlatformWorkbench(current.host, binding) };
    }, { initialProps: { current: first } });
    act(() => { result.current.binding.setHandSide(side); });
    act(() => { result.current.binding.commit(entryOf("hand-pose:fist")); });
    act(() => { result.current.binding.commitColor("iris", "#3b6fb6"); });
    expect(result.current.binding.recipe.handPoses).toEqual({ [side]: "hand-pose:fist" });

    second.state.status = "loading";
    rerender({ current: second });
    second.state.status = "ready";
    rerender({ current: second });
    const initialRecipe = result.current.binding.recipe;
    expect(initialRecipe.handPoses).toBeUndefined();
    expect(initialRecipe.colors.iris).toBeNull();
    expect(result.current.binding.history.length).toBe(0);

    const otherSide = side === "left" ? "right" : "left";
    act(() => { result.current.binding.setHandSide(otherSide); });
    act(() => { result.current.binding.commit(entryOf("hand-pose:relaxed")); });
    act(() => { result.current.binding.commitColor("iris", "#228844"); });
    const editedRecipe = result.current.binding.recipe;
    const editedFingers = { ...second.state.fingerEdits };
    act(() => { result.current.binding.resetToBaseline(); });
    expect(result.current.binding.recipe).toEqual(initialRecipe);
    expect(result.current.binding.baselineRecipe).toEqual(initialRecipe);
    expect(result.current.workbench.document.recipe.handPose).toEqual({});
    expect(second.state.fingerEdits).toEqual({ authored: true });
    expect(result.current.binding.history.recentLabels[0]).toBe("처음 상태로 되돌리기");
    const saved = createCharacterPartPreset({
      presetId: `model-switch-${side}`, name: "새 모델 기본 손", kind: "slot", slot: "hand-pose", scope: "personal",
      document: result.current.workbench.document,
    });
    expect(saved.payload.handPose).toEqual({});

    act(() => { result.current.binding.undo(); });
    expect(result.current.binding.recipe).toEqual(editedRecipe);
    expect(second.state.fingerEdits).toEqual(editedFingers);
    act(() => { result.current.binding.redo(); });
    expect(result.current.binding.recipe).toEqual(initialRecipe);
    expect(second.state.fingerEdits).toEqual({ authored: true });
    expect(first.state.fingerEdits).toEqual({ [`${side}:fist`]: true });
  });

  it("compares against the new model's clean session and restores only its current edits", () => {
    const first = createFakeHost();
    const second = createFakeHost({ activeModelId: "second-model", fingerEdits: { authored: true } });
    const { result, rerender } = renderHook(({ current }) => useCharacterShaperBinding(current.host), {
      initialProps: { current: first },
    });
    act(() => { result.current.setHandSide("left"); });
    act(() => { result.current.commit(entryOf("hand-pose:fist")); });
    act(() => { result.current.commitColor("iris", "#3b6fb6"); });
    rerender({ current: second });
    const initialRecipe = result.current.recipe;
    act(() => { result.current.setHandSide("right"); });
    act(() => { result.current.commit(entryOf("hand-pose:relaxed")); });
    act(() => { result.current.commitColor("iris", "#228844"); });
    const editedRecipe = result.current.recipe;
    const editedFingers = { ...second.state.fingerEdits };
    const historyLength = result.current.history.length;
    act(() => { result.current.setCompareActive(true); });
    expect(result.current.recipe).toEqual(initialRecipe);
    expect(result.current.baselineRecipe).toEqual(initialRecipe);
    expect(second.state.fingerEdits).toEqual({ authored: true });
    act(() => { result.current.setCompareActive(false); });
    expect(result.current.recipe).toEqual(editedRecipe);
    expect(second.state.fingerEdits).toEqual(editedFingers);
    expect(result.current.history.length).toBe(historyLength);
    expect(first.state.fingerEdits).toEqual({ "left:fist": true });
  });

  it("commitColor writes the iris colour as one labelled step", () => {
    const fake = createFakeHost();
    const { result } = renderBinding(fake);

    act(() => {
      result.current.commitColor("iris", "#3B6FB6");
    });

    expect(result.current.snapshot.irisColor).toBe("#3b6fb6");
    expect(result.current.history.recentLabels[0]).toBe("색: 눈동자");
  });

  it("reports no capability profile and a load hint before a model is ready", () => {
    const fake = createFakeHost({ status: "empty" });
    const { result } = renderBinding(fake);

    expect(result.current.busyReason).toBe("VRM 캐릭터를 먼저 불러오세요.");
    expect(result.current.profile.status).toBe("empty");
    expect(result.current.recipe.slots.eyes).toBeNull();
  });
});

function renderWorkbench(fake: FakeHost) {
  return renderHook(() => {
    const binding = useCharacterShaperBinding(fake.host);
    return { binding, workbench: useCharacterPlatformWorkbench(fake.host, binding) };
  });
}
function importedPreset(workbench: ReturnType<typeof useCharacterPlatformWorkbench>, payload: CharacterPartPresetV1["payload"], kind: CharacterPartPresetV1["kind"] = "character-variant"): CharacterPartPresetV1 {
  return { ...createCharacterPartPreset({ presetId: "imported", name: "Imported", kind, scope: "personal", document: workbench.document }), payload };
}

describe("complete imported presets through the real workbench binding", () => {
  it("applies every accessory, precision value, color and expression in one undoable transaction", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const entries = listCharacterSlotEntries("accessory").filter((entry) => entry.apply.kind === "prop").slice(0, 2);
    expect(entries).toHaveLength(2);
    const before = structuredClone(fake.state);
    const preset = importedPreset(result.current.workbench, {
      slot: "accessory",
      selections: entries.map((entry) => ({ entryId: entry.id, entryVersion: "1", providerId: "toonstudio-builtin", catalogRevision: "character-slot-catalog-v1" })),
      controls: { "face.headWidth": 1.1, "morph.eyeSize": 0.25 },
      colors: { skin: "#445566", iris: "#112233" },
      expression: { activeEntryId: "custom", weights: { happy: 0.2, sad: 0.6 } },
    });
    let accepted = false;
    act(() => { accepted = result.current.workbench.applyPreset(preset); });
    expect(accepted).toBe(true);
    expect(fake.state.vrmPropItems.map((item) => item.propId)).toEqual(entries.map((entry) => entry.apply.kind === "prop" ? entry.apply.propId : ""));
    expect(fake.state.avatarForgeState.face.headWidth).toBe(1.1);
    expect(fake.state.avatarForgeState.semanticFaceMorphs?.eyeSize).toBe(0.25);
    expect(fake.state.customColors.body).toBe("#445566");
    expect(result.current.binding.recipe.colors.iris).toBe("#112233");
    expect(fake.state.activeExpressionId).toBe("custom");
    expect(fake.state.expressionWeights).toEqual({ happy: 0.2, sad: 0.6 });
    expect(result.current.binding.history.length).toBe(1);
    const applied = structuredClone(fake.state);
    act(() => result.current.binding.undo());
    expect(fake.state).toEqual(before);
    act(() => result.current.binding.redo());
    expect(fake.state).toEqual(applied);
  });

  it("accepts expression-only presets instead of reporting an empty plan", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const preset = importedPreset(result.current.workbench, { expression: { activeEntryId: null, weights: { sad: 0.4 } } }, "expression");
    act(() => expect(result.current.workbench.applyPreset(preset)).toBe(true));
    expect(fake.state.expressionWeights).toEqual({ sad: 0.4 });
    expect(result.current.binding.history.length).toBe(1);
  });

  it.each(["full-pose", "partial-pose", "hand-grip", "camera-shot"] as const)("rejects unsupported %s before ancillary changes or redo invalidation", async (kind) => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    act(() => result.current.binding.commitColor("skin", "#123456"));
    act(() => result.current.binding.undo());
    const before = structuredClone(fake.state);
    const preset = importedPreset(result.current.workbench, {
      colors: { skin: "#abcdef" },
      ...(kind === "camera-shot" ? { cameraShotId: "shot-a" } : { pose: result.current.workbench.document.pose }),
    }, kind);
    act(() => expect(result.current.workbench.applyPreset(preset)).toBe(false));
    expect(fake.state).toEqual(before);
    expect(result.current.binding.history.canRedo).toBe(true);
    expect(result.current.workbench.notice).toMatch(/지원|적용할 수 없/);
  });

  it("rejects a missing second accessory before applying the first", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const before = structuredClone(fake.state);
    const preset = importedPreset(result.current.workbench, {
      slot: "accessory", selections: [firstAccessoryEntry().id, "missing:last"].map((entryId) => ({ entryId, entryVersion: "1", providerId: "toonstudio-builtin", catalogRevision: "character-slot-catalog-v1" })),
    });
    act(() => expect(result.current.workbench.applyPreset(preset)).toBe(false));
    expect(fake.state).toEqual(before);
    expect(result.current.binding.history.length).toBe(0);
  });

  it("restores earlier changes when a later host write fails and preserves history", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const before = structuredClone(fake.state);
    const writeExpression = fake.host.setExpressionWeights;
    fake.host.setExpressionWeights = vi.fn().mockImplementationOnce(() => { throw new Error("expression rejected"); }).mockImplementation(writeExpression);
    const preset = importedPreset(result.current.workbench, { controls: { "face.headWidth": 1.1 }, colors: { skin: "#445566" }, expression: { activeEntryId: "custom", weights: { happy: 0.2 } } });
    act(() => expect(result.current.workbench.applyPreset(preset)).toBe(false));
    expect(fake.state).toEqual(before);
    expect(result.current.binding.history.length).toBe(0);
    expect(result.current.workbench.notice).toContain("expression rejected");
  });

  it("replaces the complete accessory set and supports clearing it with one undo", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const entries = listCharacterSlotEntries("accessory").filter((entry) => entry.apply.kind === "prop").slice(0, 3);
    act(() => result.current.binding.commit(entries[0]!));
    const first = structuredClone(fake.state.vrmPropItems);
    const selections = entries.slice(1).map((entry) => ({ entryId: entry.id, entryVersion: "1", providerId: "toonstudio-builtin", catalogRevision: "character-slot-catalog-v1" }));
    act(() => expect(result.current.workbench.applyPreset(importedPreset(result.current.workbench, { slot: "accessory", selections }))).toBe(true));
    expect(fake.state.vrmPropItems.map((item) => item.propId)).toEqual(entries.slice(1).map((entry) => entry.apply.kind === "prop" ? entry.apply.propId : ""));
    act(() => result.current.binding.undo());
    expect(fake.state.vrmPropItems).toEqual(first);
    act(() => expect(result.current.workbench.applyPreset(importedPreset(result.current.workbench, { slot: "accessory", selections: [] }))).toBe(true));
    expect(fake.state.vrmPropItems).toEqual([]);
    act(() => result.current.binding.undo());
    expect(fake.state.vrmPropItems).toEqual(first);
  });

  it("merges hair selection, precision and both colors before React updates the host snapshot", async () => {
    const fake = createFakeHost();
    const initialForge = fake.state.avatarForgeState;
    Object.defineProperty(fake.host, "avatarForgeState", { get: () => initialForge });
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const hair = listCharacterSlotEntries("hair").find((entry) => entry.apply.kind === "forge-hair" && entry.apply.hair.style !== "none")!;
    const preset = importedPreset(result.current.workbench, {
      slot: "hair", selections: [{ entryId: hair.id, entryVersion: "1", providerId: "toonstudio-builtin", catalogRevision: "character-slot-catalog-v1" }],
      controls: { "face.headWidth": 1.1 }, colors: { hairBase: "#123456", hairTip: "#654321", skin: "#234567", top: "#345678" },
    });
    act(() => expect(result.current.workbench.applyPreset(preset)).toBe(true));
    expect(fake.state.avatarForgeState.hair.style).toBe(hair.apply.kind === "forge-hair" ? hair.apply.hair.style : "");
    expect(fake.state.avatarForgeState.hair.baseColor).toBe("#123456");
    expect(fake.state.avatarForgeState.hair.tipColor).toBe("#654321");
    expect(fake.state.avatarForgeState.face.headWidth).toBe(1.1);
    expect(fake.state.customColors).toEqual({ body: "#234567", tops: "#345678" });
    expect(fake.calls.forge).toHaveLength(1);
    expect(result.current.binding.history.length).toBe(1);
  });

  it.each<CharacterPartPresetV1["payload"]>([
    { controls: { "unknown.value": 1 }, colors: { skin: "#123456" } },
    { controls: { "face.headWidth": 20 }, colors: { skin: "#123456" } },
    { colors: { skin: "not-a-color" } },
    { expression: { activeEntryId: "custom", weights: { unknown: 0.5 } }, colors: { skin: "#123456" } },
  ])("rejects unsupported values before changing any part: %j", async (payload) => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const before = structuredClone(fake.state);
    act(() => expect(result.current.workbench.applyPreset(importedPreset(result.current.workbench, payload))).toBe(false));
    expect(fake.state).toEqual(before);
    expect(result.current.binding.history.length).toBe(0);
  });

  it("keeps a capture-busy host unchanged and does not announce success", async () => {
    const fake = createFakeHost({ isCapturing: true });
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const before = structuredClone(fake.state);
    act(() => expect(result.current.workbench.applyPreset(importedPreset(result.current.workbench, { colors: { skin: "#123456" } }))).toBe(false));
    expect(fake.state).toEqual(before);
    expect(result.current.binding.history.length).toBe(0);
    expect(result.current.workbench.notice).toContain("캡처");
  });

  it("surfaces rollback failure without claiming that the original state was restored", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    fake.host.handleAvatarForgeChange = () => { throw new Error("forge write rejected"); };
    act(() => expect(result.current.workbench.applyPreset(importedPreset(result.current.workbench, { controls: { "face.headWidth": 1.1 }, colors: { skin: "#123456" } }))).toBe(false));
    expect(result.current.workbench.notice).toContain("이전 상태 복원도 실패");
    expect(fake.state.customColors.body).toBe("#123456");
    expect(result.current.binding.history.length).toBe(0);
  });


  it("applies the projected two-handed slot independently of the current inspector hand selector", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    act(() => result.current.binding.setHandSide("left"));
    const entry = listCharacterSlotEntries("hand-pose").find((item) => item.apply.kind === "hand-pose")!;
    const selection = { entryId: entry.id, entryVersion: "1", providerId: "toonstudio-builtin", catalogRevision: "character-slot-catalog-v1" };
    act(() => expect(result.current.workbench.applyPreset(importedPreset(result.current.workbench, { slot: "hand-pose", selections: [selection, { ...selection }] }))).toBe(true));
    expect(fake.calls.hands.map((call) => call.side)).toEqual(["left", "right"]);
    expect(result.current.binding.history.length).toBe(1);
  });

  it("rejects clearing an equipped garment color instead of silently keeping its old color", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    act(() => result.current.binding.commit(firstWardrobeEntry()));
    const before = structuredClone(fake.state);
    act(() => expect(result.current.workbench.applyPreset(importedPreset(result.current.workbench, { colors: { skin: "#123456", top: null } }))).toBe(false));
    expect(fake.state).toEqual(before);
    expect(result.current.binding.history.length).toBe(1);
  });


  it("equips a top and its saved color together, clears the previous outer layer, and undoes once", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const outer = listCharacterSlotEntries("top").find((entry) => entry.apply.kind === "wardrobe" && entry.apply.slot === "outer" && entry.apply.itemId)!;
    const top = listCharacterSlotEntries("top").find((entry) => entry.apply.kind === "wardrobe" && entry.apply.slot === "top" && entry.apply.itemId)!;
    act(() => result.current.binding.commit(outer));
    const before = structuredClone(fake.state);
    const previousHistory = result.current.binding.history.length;
    const preset = importedPreset(result.current.workbench, {
      slot: "top", selections: [{ entryId: top.id, entryVersion: "1", providerId: "toonstudio-builtin", catalogRevision: "character-slot-catalog-v1" }],
      colors: { top: "#123456", skin: "#345678" },
    });
    act(() => expect(result.current.workbench.applyPreset(preset)).toBe(true));
    expect(fake.state.wardrobeState.outer).toBeUndefined();
    expect(fake.state.wardrobeState.top).toMatchObject({ itemId: top.apply.kind === "wardrobe" ? top.apply.itemId : "", color: "#123456", fit: 1, fitMode: "auto", fabricId: "cotton" });
    expect(fake.state.customColors.body).toBe("#345678");
    expect(result.current.binding.history.length).toBe(previousHistory + 1);
    const applied = structuredClone(fake.state);
    act(() => result.current.binding.undo());
    expect(fake.state).toEqual(before);
    act(() => result.current.binding.redo());
    expect(fake.state).toEqual(applied);
  });

  it("recolors a real equipped wardrobe set without changing its items, fit or fabric", async () => {
    const set = SELECTABLE_WARDROBE_SETS.find((item) => item.equips.bottom && item.equips.shoes && (item.equips.top || item.equips.outer))!;
    // The advanced wardrobe UI equips this exact product set; Shaper currently lists individual garments.
    const wardrobe = applyWardrobeSet(set);
    const fake = createFakeHost({ wardrobeState: wardrobe });
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const before = structuredClone(fake.state);
    const topSlot = wardrobe.outer ? "outer" : "top";
    const nextColors = { top: "#112233", bottom: "#445566", shoes: "#778899" };
    act(() => expect(result.current.workbench.applyPreset(importedPreset(result.current.workbench, { colors: nextColors }, "palette"))).toBe(true));
    expect(fake.state.wardrobeState).toEqual({
      ...wardrobe,
      [topSlot]: { ...wardrobe[topSlot], color: nextColors.top },
      bottom: { ...wardrobe.bottom, color: nextColors.bottom },
      shoes: { ...wardrobe.shoes, color: nextColors.shoes },
    });
    expect(result.current.binding.history.length).toBe(1);
    const applied = structuredClone(fake.state);
    act(() => result.current.binding.undo());
    expect(fake.state).toEqual(before);
    act(() => result.current.binding.redo());
    expect(fake.state).toEqual(applied);
  });

  it("returns to the original outfit while restoring native garment colors in the same preset", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    act(() => result.current.binding.commit(firstWardrobeEntry()));
    const before = structuredClone(fake.state);
    const original = entryOf("top:original");
    const preset = importedPreset(result.current.workbench, { slot: "top", selections: [{ entryId: original.id, entryVersion: "1", providerId: "toonstudio-builtin", catalogRevision: "character-slot-catalog-v1" }], colors: { top: "#234567" } });
    act(() => expect(result.current.workbench.applyPreset(preset)).toBe(true));
    expect(fake.state.wardrobeState.top).toBeUndefined();
    expect(fake.state.wardrobeState.outer).toBeUndefined();
    expect(fake.state.customColors.tops).toBe("#234567");
    expect(fake.state.costumeState.hidden).not.toContain("Tops");
    act(() => result.current.binding.undo());
    expect(fake.state).toEqual(before);
  });

  it("edits and resets original hair and skin colors without changing the forge or unrelated colors", () => {
    const fake = createFakeHost({ customColors: { body: "#111111", hair: "#222222", tops: "#333333" } });
    const { result } = renderBinding(fake);
    const initialForge = structuredClone(fake.state.avatarForgeState);
    act(() => result.current.commitColor("skin", "#445566"));
    act(() => result.current.commitColor("hairBase", "#778899"));
    expect(fake.state.customColors).toEqual({ body: "#445566", hair: "#778899", tops: "#333333" });
    expect(fake.calls.forge).toHaveLength(0);
    act(() => result.current.commitColor("skin", null));
    act(() => result.current.commitColor("hairBase", null));
    expect(fake.state.customColors).toEqual({ tops: "#333333" });
    expect(fake.state.avatarForgeState).toEqual(initialForge);
    act(() => result.current.undo());
    expect(fake.state.customColors).toEqual({ hair: "#778899", tops: "#333333" });
    act(() => result.current.redo());
    expect(fake.state.customColors).toEqual({ tops: "#333333" });
  });

  it.each(["bottom", "shoes"] as const)("edits an equipped %s color without losing garment fitting", (target) => {
    const set = SELECTABLE_WARDROBE_SETS.find((item) => item.equips.bottom && item.equips.shoes)!;
    const fake = createFakeHost({ wardrobeState: applyWardrobeSet(set) });
    const { result } = renderBinding(fake);
    const before = structuredClone(fake.state.wardrobeState);
    act(() => result.current.commitColor(target, "#abcdef"));
    expect(fake.state.wardrobeState).toEqual({ ...before, [target]: { ...before[target], color: "#abcdef" } });
    expect(result.current.history.length).toBe(1);
    act(() => result.current.undo());
    expect(fake.state.wardrobeState).toEqual(before);
    act(() => result.current.redo());
    expect(fake.state.wardrobeState[target]?.color).toBe("#abcdef");
  });

  it("keeps an unsupported shoe-color reset a no-op without discarding redo", () => {
    const fake = createFakeHost();
    const { result } = renderBinding(fake);
    act(() => result.current.commitColor("skin", "#123456"));
    act(() => result.current.undo());
    const before = structuredClone(fake.state);
    act(() => result.current.commitColor("shoes", null));
    expect(fake.state).toEqual(before);
    expect(result.current.history.canRedo).toBe(true);
  });

  it.each(["equipWardrobeItem", "setWardrobeState"])("rejects a missing %s callback before any color/garment/history change", async (method) => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    act(() => result.current.binding.commitColor("skin", "#123456"));
    act(() => result.current.binding.undo());
    const before = structuredClone(fake.state);
    const top = firstWardrobeEntry();
    delete fake.host[method];
    const preset = importedPreset(result.current.workbench, { slot: "top", selections: [{ entryId: top.id, entryVersion: "1", providerId: "toonstudio-builtin", catalogRevision: "character-slot-catalog-v1" }], colors: { skin: "#abcdef", top: "#345678" } });
    act(() => expect(result.current.workbench.applyPreset(preset)).toBe(false));
    expect(fake.state).toEqual(before);
    expect(result.current.binding.history.canRedo).toBe(true);
    expect(result.current.binding.history.length).toBe(0);
    expect(result.current.workbench.notice).toContain("모든 변경을 적용할 수 있는 편집기");
  });

});


describe("saved hand-pose side transactions", () => {
  it.each(["left", "right"] as const)("reapplies a saved %s hand without changing the other hand or losing its side on resave", async (side) => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    act(() => result.current.binding.setHandSide(side));
    act(() => result.current.binding.commit(entryOf("hand-pose:fist")));
    const preset = createCharacterPartPreset({ presetId: side, name: side, kind: "slot", scope: "personal", slot: "hand-pose", document: result.current.workbench.document });
    act(() => result.current.binding.setHandSide(side === "left" ? "right" : "left"));
    fake.calls.hands.length = 0;
    act(() => expect(result.current.workbench.applyPreset(preset)).toBe(true));
    expect(fake.calls.hands).toEqual([{ side, poseType: "fist" }]);
    const resaved = createCharacterPartPreset({ presetId: "again", name: "again", kind: "slot", scope: "personal", slot: "hand-pose", document: result.current.workbench.document });
    expect(resaved.payload.handPose).toEqual(preset.payload.handPose);
    expect(result.current.binding.history).toHaveLength(2);
  });

  it("preserves distinct hands through actual application, resave and one Undo/Redo", async () => {
    const fake = createFakeHost();
    const { result } = renderWorkbench(fake);
    await act(async () => {});
    const selection = (entryId: string) => ({ entryId, entryVersion: "1", providerId: "toonstudio-builtin", catalogRevision: "character-slot-catalog-v1" });
    const handPose = { left: selection("hand-pose:fist"), right: selection("hand-pose:relaxed") };
    const preset = importedPreset(result.current.workbench, { slot: "hand-pose", handPose });
    act(() => expect(result.current.workbench.applyPreset(preset)).toBe(true));
    expect(fake.calls.hands).toEqual([{ side: "left", poseType: "fist" }, { side: "right", poseType: "relaxed" }]);
    expect(result.current.workbench.document.recipe.handPose).toEqual(handPose);
    const resaved = createCharacterPartPreset({ presetId: "again", name: "again", kind: "slot", scope: "personal", slot: "hand-pose", document: result.current.workbench.document });
    expect(resaved.payload.handPose).toEqual(handPose);
    expect(result.current.binding.history).toHaveLength(1);
    act(() => result.current.binding.undo());
    expect(result.current.workbench.document.recipe.handPose).toEqual({});
    expect(fake.state.fingerEdits).toEqual({});
    act(() => result.current.binding.redo());
    expect(result.current.workbench.document.recipe.handPose).toEqual(handPose);
    expect(fake.state.fingerEdits).toEqual({ "left:fist": true, "right:relaxed": true });
  });
});
