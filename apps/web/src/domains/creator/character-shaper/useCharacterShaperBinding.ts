/**
 * Character Shaper — the one bridge between the workshop UI and the existing VRM poser host.
 *
 * The Shaper owns no scene document. Every card selection is *derived* from host state and every
 * commit is a small, ordered set of host calls (`character-shaper-apply-plan.ts` decides which).
 * This hook is where those two directions meet:
 *
 *  - **derive** — read `h` into a `CharacterHostSnapshot`, build the capability profile, and let
 *    `deriveCharacterRecipe` say which catalog entry each slot currently holds.
 *  - **commit** — run one plan, merging every Avatar Forge write into a single
 *    `handleAvatarForgeChange`, and record one history step whose undo restores the raw host state
 *    (forge, wardrobe, props, costume, pose, expression, colours, iris tint) exactly as it was.
 *
 * Two traps this file exists to avoid:
 *  1. The mouth shapes need a VRM expression floor, but `h.updateExpressionWeight` recomputes
 *     `activeExpressionId` from the resulting weights — which would silently drop the creator's
 *     chosen 표정. The floor therefore goes through `setExpressionWeights` and leaves the id alone.
 *  2. `applyVrmCustomColors` re-runs whenever `customColors` changes and repaints the model's
 *     materials, so the iris tint is re-applied in an effect keyed on those colours as well as on
 *     `(vrm, irisColor)`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EXPRESSION_PRESETS } from "../studio-pose-presets";
import {
  applyAvatarForgeBodyPreset,
  createAvatarForgeState,
  sanitizeAvatarForgeState,
  setAvatarForgeSemanticFaceMorph,
} from "../vrm/studio-vrm-avatar-forge";
import { STUDIO_VRM_PROPORTION_PRESETS } from "../vrm/studio-vrm-proportion-core";
import { createPropInstance } from "../vrm/studio-vrm-props";

import {
  planCharacterSlotApply,
  planCharacterSlotClear,
  planCharacterSlotRemove,
} from "./character-shaper-apply-plan";
import {
  EMPTY_CHARACTER_CAPABILITY_PROFILE,
  createCharacterCapabilityProfile,
  evaluateCharacterSlotEntry,
} from "./character-shaper-capability";
import { CHARACTER_SLOT_CATALOG, characterSlotMeta } from "./character-shaper-catalog";
import { characterPresetWornSlots, planCharacterPresetApplication } from "./character-shaper-preset-plan";
import { applyCharacterIrisTint } from "./character-shaper-iris-tint";
import { createEmptyCharacterRecipe, deriveCharacterRecipe } from "./character-shaper-recipe";
import { useCharacterShaperHistory } from "./useCharacterShaperHistory";

import type {
  CharacterApplyPlan,
  CharacterApplyStep,
  CharacterCapabilityProfile,
  CharacterHandPoseType,
  CharacterHandSide,
  CharacterHostSnapshot,
  CharacterRecipe,
  CharacterSemanticMorphBundle,
  CharacterSlotAvailability,
  CharacterSlotEntry,
  CharacterSlotKind,
} from "./character-shaper-contract";
import type {
  CharacterShaperBinding,
  CharacterShaperCommitResult,
} from "./character-shaper-ui-contract";
import type {
  AvatarForgeHairParams,
  AvatarForgeSemanticFaceMorphId,
  AvatarForgeState,
} from "../vrm/studio-vrm-avatar-forge";
import type { CostumeSlot } from "../vrm/studio-vrm-costume";
import type { PropInstance } from "../vrm/studio-vrm-props";
import type { WardrobeEquip, WardrobeSlot, WardrobeState } from "../vrm/studio-vrm-wardrobe";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { VRM } from "@pixiv/three-vrm";

/* -------------------------------------------------------------------------- */
/* Raw host state — what one undo step restores                               */
/* -------------------------------------------------------------------------- */

interface CharacterCostumeState {
  readonly hidden: readonly string[];
  readonly recolor: Readonly<Record<string, string>>;
}

/**
 * Everything one Shaper step can move. Poses keep their raw bone maps (not only the preset id) so
 * undoing a pose card also restores finger curls and the Y offset that preset changed.
 */
export interface CharacterShaperHostState {
  readonly forge: AvatarForgeState | null;
  readonly wardrobe: WardrobeState;
  readonly props: readonly PropInstance[];
  readonly selectedPropUid: string | null;
  readonly costume: CharacterCostumeState | null;
  readonly customColors: Readonly<Record<string, string>>;
  readonly activePoseId: string;
  readonly customBones: Readonly<Record<string, unknown>>;
  readonly customYOffset: number;
  readonly poseTranslations: unknown;
  readonly fingerEdits: Readonly<Record<string, unknown>>;
  readonly activeExpressionId: string;
  readonly expressionWeights: Readonly<Record<string, number>>;
  readonly bodyRotation: number;
  /** Session values the binding owns; they belong to the same undo step as the host writes. */
  readonly irisColor: string | null;
  readonly handSide: CharacterHandSide;
  readonly lastHandPoseType: CharacterHandPoseType | null;
  readonly handPoseTypes?: CharacterHostSnapshot["handPoseTypes"];
}

interface CharacterShaperSession {
  readonly irisColor: string | null;
  readonly handSide: CharacterHandSide;
  readonly lastHandPoseType: CharacterHandPoseType | null;
  readonly handPoseTypes?: CharacterHostSnapshot["handPoseTypes"];
}

interface CharacterShaperPlanContext {
  readonly snapshot: CharacterHostSnapshot;
  readonly handSide: CharacterHandSide;
}

interface CharacterShaperPreviewState {
  readonly modelId: string | null;
  readonly entryId: string;
  readonly plan: CharacterApplyPlan;
  readonly before: CharacterShaperHostState;
  readonly snapshot: CharacterHostSnapshot;
  readonly recipe: CharacterRecipe;
  readonly handSide: CharacterHandSide;
}

const HAND_SIDES: readonly CharacterHandSide[] = ["left", "right", "both"];
const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const PREVIEW_LOCK_REASON = "미리보기 후보를 확정하거나 닫은 뒤에 다른 편집을 할 수 있습니다.";

const COLOR_LABELS: Readonly<Record<keyof CharacterRecipe["colors"], string>> = {
  skin: "피부",
  hairBase: "머리 기본색",
  hairTip: "머리 끝 색",
  iris: "눈동자",
  top: "상의",
  bottom: "하의",
  shoes: "신발",
};

const EMPTY_SNAPSHOT: CharacterHostSnapshot = {
  forgeFace: { headWidth: 1, headHeight: 1, headDepth: 1, cheekVolume: 0.35, chinLength: 1 },
  semanticMorphs: {},
  hairStyle: "none",
  hairBangStyle: "full",
  hairReplaceOriginal: false,
  hairBaseColor: "#2b2320",
  hairTipColor: "#4a3b33",
  proportionPresetId: null,
  bodyPresetId: "balanced",
  wardrobe: {},
  propIds: [],
  activePoseId: null,
  activeExpressionId: null,
  expressionWeights: {},
  customColors: {},
  irisColor: null,
  handSide: "both",
  lastHandPoseType: null,
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readRecord<T>(value: unknown): Readonly<Record<string, T>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, T>>)
    : {};
}

function readProps(value: unknown): readonly PropInstance[] {
  return Array.isArray(value) ? (value as readonly PropInstance[]) : [];
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return HEX_COLOR.test(trimmed) ? trimmed : null;
}

function forgeOfHost(host: StudioVrmPoserHost): AvatarForgeState {
  const raw = host.avatarForgeState as AvatarForgeState | null | undefined;
  return raw ? sanitizeAvatarForgeState(raw) : createAvatarForgeState();
}

/* -------------------------------------------------------------------------- */
/* Snapshot                                                                    */
/* -------------------------------------------------------------------------- */

interface SnapshotInput {
  readonly forge: AvatarForgeState;
  readonly wardrobe: WardrobeState;
  readonly props: readonly PropInstance[];
  readonly customColors: Readonly<Record<string, string>>;
  readonly activePoseId: string | null;
  readonly activeExpressionId: string | null;
  readonly expressionWeights: Readonly<Record<string, number>>;
  readonly session: CharacterShaperSession;
}

function deriveSnapshot(input: SnapshotInput): CharacterHostSnapshot {
  const { forge, session } = input;
  const wardrobe: Partial<Record<WardrobeSlot, { readonly itemId: string; readonly color: string }>> = {};
  for (const [slot, equip] of Object.entries(input.wardrobe)) {
    if (!equip || typeof equip.itemId !== "string") continue;
    wardrobe[slot as WardrobeSlot] = { itemId: equip.itemId, color: equip.color };
  }
  return {
    forgeFace: forge.face,
    semanticMorphs: (forge.semanticFaceMorphs ?? {}) as CharacterSemanticMorphBundle,
    hairStyle: forge.hair.style,
    hairBangStyle: forge.hair.bangStyle,
    hairReplaceOriginal: forge.hair.replaceOriginal,
    hairBaseColor: forge.hair.baseColor,
    hairTipColor: forge.hair.tipColor,
    proportionPresetId: forge.proportions.presetId ?? null,
    bodyPresetId: forge.bodyPresetId ?? "balanced",
    wardrobe,
    propIds: input.props.map((prop) => prop.propId),
    activePoseId: input.activePoseId,
    activeExpressionId: input.activeExpressionId,
    expressionWeights: input.expressionWeights,
    customColors: input.customColors,
    irisColor: session.irisColor,
    handSide: session.handSide,
    lastHandPoseType: session.lastHandPoseType,
    handPoseTypes: session.handPoseTypes,
  };
}

/* -------------------------------------------------------------------------- */
/* Busy guard                                                                  */
/* -------------------------------------------------------------------------- */

/** Non-null while the host cannot accept a mutation; the string is shown to the creator as-is. */
export function characterShaperBusyReason(h: StudioVrmPoserHost): string | null {
  if (h.isCapturing === true) return "캡처가 끝난 뒤에 다시 적용할 수 있습니다.";
  if (h.isThumbnailCapturing === true) return "썸네일을 만드는 중입니다. 잠시 뒤 다시 시도해 주세요.";
  if (h.isSharingPose === true) return "포즈를 공유하는 중입니다. 끝나면 다시 적용할 수 있습니다.";
  if (h.broadcastPreviewActive === true) return "방송 미리보기를 끄면 다시 적용할 수 있습니다.";
  if (h.proportionRigStatus === "applying") return "체형 리그를 적용하는 중입니다.";
  if (h.proportionRigStatus === "reload-required") {
    return readString(h.proportionRigMessage) ?? "체형 리그를 다시 불러와야 합니다.";
  }
  if (h.status !== "ready") return "VRM 캐릭터를 먼저 불러오세요.";
  // 위의 구체적인 사유들이 지금의 워드로브 잠금 조건과 같지만, 그건 우연이다. 잠금의 authority는
  // 호스트가 들고 있으므로 마지막에 그 값 자체를 확인한다 — 호스트가 잠금 조건을 하나 더 늘렸을 때
  // 셰이퍼만 조용히 옷을 갈아입히는 일이 없어야 한다.
  if (h.wardrobeInteractionLocked === true) return "지금은 옷을 바꿀 수 없습니다. 잠시 뒤 다시 시도해 주세요.";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Binding                                                                     */
/* -------------------------------------------------------------------------- */

export function useCharacterShaperBinding(h: StudioVrmPoserHost): CharacterShaperBinding {
  const hostRef = useRef(h);
  const [session, setSession] = useState<CharacterShaperSession>({
    irisColor: null,
    handSide: "both",
    lastHandPoseType: null,
  });
  const sessionRef = useRef(session);
  const previewRef = useRef<CharacterShaperPreviewState | null>(null);
  const [previewEntryId, setPreviewEntryId] = useState<string | null>(null);
  const updateSession = useCallback((
    update: CharacterShaperSession | ((current: CharacterShaperSession) => CharacterShaperSession),
  ) => {
    const next = typeof update === "function" ? update(sessionRef.current) : update;
    sessionRef.current = next;
    setSession(next);
  }, []);
  const history = useCharacterShaperHistory<CharacterShaperHostState>();
  const resetHistory = history.reset;
  const pushHistory = history.push;

  const busyReason = characterShaperBusyReason(h);
  const busyRef = useRef(busyReason);

  // `useStudioVrmPoserState` rebuilds `h` every render, so callbacks read the host through a ref
  // that an effect keeps current — putting `h` itself in a dependency array would re-run every
  // effect on every render.
  useEffect(() => {
    hostRef.current = h;
    sessionRef.current = session;
    busyRef.current = busyReason;
  });

  /* ---------------------------------------------------------------------- */
  /* Derivation                                                              */
  /* ---------------------------------------------------------------------- */

  const status = (readString(h.status) ?? "empty") as CharacterCapabilityProfile["status"];
  const vrm = (h.vrm ?? null) as VRM | null;
  const modelId = readString(h.activeModelId);
  const modelName = readString(h.displayModelName) ?? readString(h.modelName) ?? "";
  const wardrobeMetricsReady = Boolean(h.wardrobeMetrics);
  const originalHairMeshCount = typeof h.detectedOriginalHairCount === "number" ? h.detectedOriginalHairCount : 0;
  const surfacePaintReady = readString(h.texturePaintDisabledReason) === null;

  const profile = useMemo<CharacterCapabilityProfile>(() => {
    if (!vrm || status !== "ready") {
      return { ...EMPTY_CHARACTER_CAPABILITY_PROFILE, status, modelId, modelName };
    }
    return createCharacterCapabilityProfile({
      vrm,
      status,
      modelId,
      modelName,
      wardrobeMetricsReady,
      originalHairMeshCount,
      surfacePaintReady,
    });
  }, [vrm, status, modelId, modelName, wardrobeMetricsReady, originalHairMeshCount, surfacePaintReady]);

  const rawForge = h.avatarForgeState as AvatarForgeState | null | undefined;
  const forge = useMemo(() => (rawForge ? sanitizeAvatarForgeState(rawForge) : createAvatarForgeState()), [rawForge]);
  const wardrobe = readRecord<WardrobeEquip>(h.wardrobeState) as WardrobeState;
  const props = readProps(h.vrmPropItems);
  const customColors = readRecord<string>(h.customColors);
  const activePoseId = readString(h.activePoseId);
  const activeExpressionId = readString(h.activeExpressionId);
  const expressionWeights = readRecord<number>(h.expressionWeights);

  const derivedSnapshot = useMemo<CharacterHostSnapshot>(
    () => (status === "ready"
      ? deriveSnapshot({
          forge,
          wardrobe,
          props,
          customColors,
          activePoseId,
          activeExpressionId,
          expressionWeights,
          session,
        })
      : { ...EMPTY_SNAPSHOT, handSide: session.handSide }),
    [status, forge, wardrobe, props, customColors, activePoseId, activeExpressionId, expressionWeights, session],
  );

  const derivedRecipe = useMemo(
    () => (status === "ready" ? deriveCharacterRecipe(derivedSnapshot, CHARACTER_SLOT_CATALOG) : createEmptyCharacterRecipe()),
    [status, derivedSnapshot],
  );
  const activePreview = previewRef.current?.modelId === modelId ? previewRef.current : null;
  const snapshot = activePreview?.snapshot ?? derivedSnapshot;
  const recipe = activePreview?.recipe ?? derivedRecipe;

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || preview.modelId === modelId) return;
    previewRef.current = null;
    setPreviewEntryId(null);
  }, [modelId]);

  /* ---------------------------------------------------------------------- */
  /* Raw host state capture / restore                                        */
  /* ---------------------------------------------------------------------- */

  const captureHostState = useCallback((): CharacterShaperHostState => {
    const host = hostRef.current;
    const current = sessionRef.current;
    const costume = (host.costumeState ?? null) as CharacterCostumeState | null;
    return {
      forge: host.avatarForgeState ? sanitizeAvatarForgeState(host.avatarForgeState as AvatarForgeState) : null,
      wardrobe: { ...(readRecord<WardrobeEquip>(host.wardrobeState) as WardrobeState) },
      props: [...readProps(host.vrmPropItems)],
      selectedPropUid: readString(host.selectedVrmPropUid),
      costume: costume ? { hidden: [...costume.hidden], recolor: { ...costume.recolor } } : null,
      customColors: { ...readRecord<string>(host.customColors) },
      activePoseId: typeof host.activePoseId === "string" ? host.activePoseId : "",
      customBones: { ...readRecord<unknown>(host.customBones) },
      customYOffset: typeof host.customYOffset === "number" ? host.customYOffset : 0,
      poseTranslations: host.poseTranslations,
      fingerEdits: { ...readRecord<unknown>(host.fingerEdits) },
      activeExpressionId: typeof host.activeExpressionId === "string" ? host.activeExpressionId : "neutral",
      expressionWeights: { ...readRecord<number>(host.expressionWeights) },
      bodyRotation: typeof host.bodyRotation === "number" ? host.bodyRotation : 0,
      irisColor: current.irisColor,
      handSide: current.handSide,
      lastHandPoseType: current.lastHandPoseType,
      handPoseTypes: current.handPoseTypes,
    };
  }, []);

  const restoreHostState = useCallback((state: CharacterShaperHostState) => {
    const host = hostRef.current;
    // Proportions must travel through the forge handler so the rig runtime re-applies them.
    if (state.forge) host.handleAvatarForgeChange?.(state.forge);
    host.setWardrobeState?.({ ...state.wardrobe });
    host.setVrmPropItems?.([...state.props]);
    host.setSelectedVrmPropUid?.(state.selectedPropUid);
    if (state.costume) {
      host.updateCostume?.({ hidden: [...state.costume.hidden], recolor: { ...state.costume.recolor } });
    }
    host.setCustomColors?.({ ...state.customColors });
    host.setActivePoseId?.(state.activePoseId);
    host.setCustomBones?.({ ...state.customBones });
    host.setCustomYOffset?.(state.customYOffset);
    if (state.poseTranslations !== undefined) host.setPoseTranslations?.(state.poseTranslations);
    host.setFingerEdits?.({ ...state.fingerEdits });
    host.setActiveExpressionId?.(state.activeExpressionId);
    host.setExpressionWeights?.({ ...state.expressionWeights });
    host.setBodyRotation?.(state.bodyRotation);
    updateSession({
      irisColor: state.irisColor,
      handSide: state.handSide,
      lastHandPoseType: state.lastHandPoseType,
      handPoseTypes: state.handPoseTypes,
    });
  }, [updateSession]);

  /* ---------------------------------------------------------------------- */
  /* Baseline (hold-to-compare · 처음 상태로)                                 */
  /* ---------------------------------------------------------------------- */

  const baselineRef = useRef<CharacterShaperHostState | null>(null);
  const baselineModelRef = useRef<string | null>(null);
  const compareStashRef = useRef<CharacterShaperHostState | null>(null);
  const [baselineRecipe, setBaselineRecipe] = useState<CharacterRecipe>(createEmptyCharacterRecipe);
  const [compareActive, setCompareActiveState] = useState(false);

  useEffect(() => {
    if (status !== "ready") return;
    // One baseline per model: the guard makes re-running on a recipe change a no-op.
    if (baselineRef.current !== null && baselineModelRef.current === modelId) return;
    // Clear the departed model's session values before capturing either baseline. Reset and
    // compare must restore the same clean session that the new model initially displays.
    const baselineSession: CharacterShaperSession = {
      ...sessionRef.current,
      irisColor: null,
      lastHandPoseType: null,
      handPoseTypes: undefined,
    };
    baselineModelRef.current = modelId;
    baselineRef.current = { ...captureHostState(), ...baselineSession };
    compareStashRef.current = null;
    setBaselineRecipe(deriveCharacterRecipe({ ...derivedSnapshot, ...baselineSession }, CHARACTER_SLOT_CATALOG));
    setCompareActiveState(false);
    resetHistory();
    updateSession(baselineSession);
  }, [status, modelId, derivedSnapshot, captureHostState, resetHistory, updateSession]);

  /* ---------------------------------------------------------------------- */
  /* Iris tint — re-applied whenever the host repaints custom colours         */
  /* ---------------------------------------------------------------------- */

  const irisColor = session.irisColor;
  useEffect(() => {
    if (!vrm) return;
    applyCharacterIrisTint(vrm, irisColor);
    if (typeof requestAnimationFrame !== "function") return;
    // `applyVrmCustomColors` schedules a repair pass on the next frame; land after it.
    const frame = requestAnimationFrame(() => applyCharacterIrisTint(vrm, irisColor));
    return () => cancelAnimationFrame(frame);
  }, [vrm, irisColor, customColors]);

  /* ---------------------------------------------------------------------- */
  /* Step execution                                                          */
  /* ---------------------------------------------------------------------- */

  const runSteps = useCallback((steps: readonly CharacterApplyStep[], colorChanges: Partial<CharacterRecipe["colors"]> = {}) => {
    const host = hostRef.current;
    let mergedForge: AvatarForgeState | null = null;
    const forgeDraft = (): AvatarForgeState => {
      mergedForge ??= forgeOfHost(host);
      return mergedForge;
    };
    let nextIris: string | null | undefined;
    let nextHandPose: CharacterHandPoseType | undefined;
    const updatedHands: Partial<Record<"left" | "right", CharacterHandPoseType>> = {};

    for (const step of steps) {
      switch (step.kind) {
        case "forge-face": {
          const base = forgeDraft();
          mergedForge = sanitizeAvatarForgeState({
            ...base,
            presetId: undefined,
            face: { ...base.face, ...step.face },
          });
          break;
        }
        case "semantic-morph": {
          let base = forgeDraft();
          for (const [id, value] of Object.entries(step.morphs)) {
            if (typeof value !== "number") continue;
            base = setAvatarForgeSemanticFaceMorph(base, id as AvatarForgeSemanticFaceMorphId, value);
          }
          mergedForge = base;
          break;
        }
        case "forge-hair": {
          const base = forgeDraft();
          mergedForge = sanitizeAvatarForgeState({
            ...base,
            presetId: undefined,
            hair: { ...base.hair, ...step.hair },
          });
          break;
        }
        case "proportion": {
          const base = step.bodyPresetId ? applyAvatarForgeBodyPreset(forgeDraft(), step.bodyPresetId) : forgeDraft();
          const preset = STUDIO_VRM_PROPORTION_PRESETS.find((item) => item.id === step.presetId);
          mergedForge = preset
            ? sanitizeAvatarForgeState({ ...base, presetId: undefined, proportions: preset.proportions })
            : base;
          break;
        }
        case "iris-color":
          nextIris = step.color;
          break;
        case "expression-floor": {
          // Trap: `updateExpressionWeight` recomputes `activeExpressionId` from the weights, which
          // would drop the creator's 표정 selection. Write the weights and leave the id alone.
          const merged: Record<string, number> = { ...readRecord<number>(host.expressionWeights) };
          for (const [name, value] of Object.entries(step.weights)) {
            merged[name] = Math.max(merged[name] ?? 0, value);
          }
          host.setExpressionWeights?.(merged);
          break;
        }
        case "wardrobe-equip":
          host.equipWardrobeItem?.(step.slot, step.itemId);
          if (step.itemId !== null && step.color) host.updateWardrobeEquip?.(step.slot, { color: step.color });
          break;
        case "wardrobe-set":
          host.equipWardrobeSetById?.(step.setId);
          break;
        case "costume-visibility": {
          const costume = (host.costumeState ?? null) as CharacterCostumeState | null;
          if (!costume) break;
          const meshes = Array.isArray(host.costumeMeshes)
            ? (host.costumeMeshes as readonly { readonly key: string; readonly slot: CostumeSlot }[])
            : [];
          const affected = new Set(meshes.filter((mesh) => step.slots.includes(mesh.slot)).map((mesh) => mesh.key));
          const hidden = step.visible
            ? costume.hidden.filter((key) => !affected.has(key))
            : [...new Set([...costume.hidden, ...affected])];
          host.updateCostume?.({ hidden, recolor: { ...costume.recolor } });
          break;
        }
        case "prop-add": {
          const color = step.color;
          if (color) {
            const instance = createPropInstance(step.propId);
            if (instance) {
              host.setVrmPropItems?.((prev: PropInstance[]) => [...prev, { ...instance, color }]);
              host.setSelectedVrmPropUid?.(instance.uid);
            }
            break;
          }
          host.addVrmProp?.(step.propId);
          break;
        }
        case "prop-remove":
          for (const item of readProps(host.vrmPropItems)) {
            if (item.propId === step.propId) host.removeVrmProp?.(item.uid);
          }
          break;
        case "expression-preset": {
          const preset = EXPRESSION_PRESETS.find((item) => item.id === step.presetId);
          if (preset) host.handleExpressionPresetSelect?.(preset);
          break;
        }
        case "pose-preset":
          host.handlePoseSelect?.(step.presetId);
          break;
        case "hand-pose": {
          const sides: readonly ("left" | "right")[] = step.side === "both" ? ["left", "right"] : [step.side];
          for (const side of sides) {
            host.applyHandPosePreset?.(side, step.poseType);
            updatedHands[side] = step.poseType;
          }
          nextHandPose = step.poseType;
          break;
        }
        default:
          break;
      }
    }

    const colors = { ...readRecord<string>(host.customColors) };
    const worn = characterPresetWornSlots(steps, readRecord<WardrobeEquip>(host.wardrobeState) as WardrobeState);
    let customColorsChanged = false;
    let colorChanged = false;
    const setCustom = (key: string, hex: string | null) => {
      if (hex) colors[key] = hex;
      else delete colors[key];
      customColorsChanged = true;
      colorChanged = true;
    };
    const garment = (slots: readonly WardrobeSlot[], fallback: string | null, hex: string | null) => {
      const equipped = slots.find((slot) => worn.has(slot));
      if (equipped && hex) {
        host.updateWardrobeEquip?.(equipped, { color: hex });
        colorChanged = true;
      } else if (fallback) setCustom(fallback, hex);
    };
    for (const [target, color] of Object.entries(colorChanges)) {
      const hex = normalizeHex(color);
      switch (target) {
        case "iris": nextIris = hex; colorChanged = true; break;
        case "skin": setCustom("body", hex); break;
        case "hairBase":
          if ((mergedForge ?? forgeOfHost(host)).hair.style !== "none" && hex) {
            const base = forgeDraft();
            mergedForge = sanitizeAvatarForgeState({ ...base, presetId: undefined, hair: { ...base.hair, baseColor: hex } });
            colorChanged = true;
          } else setCustom("hair", hex);
          break;
        case "hairTip":
          if (hex) {
            const base = forgeDraft();
            mergedForge = sanitizeAvatarForgeState({ ...base, presetId: undefined, hair: { ...base.hair, tipColor: hex } });
            colorChanged = true;
          }
          break;
        case "top": garment(["outer", "top"], "tops", hex); break;
        case "bottom": garment(["bottom"], "bottoms", hex); break;
        case "shoes": garment(["shoes"], null, hex); break;
      }
    }
    if (customColorsChanged) host.setCustomColors?.(colors);

    // One merged Avatar Forge write per commit, exactly as the brief requires.
    if (mergedForge) host.handleAvatarForgeChange?.(mergedForge);
    if (nextIris !== undefined || nextHandPose !== undefined) {
      updateSession((current) => ({
        ...current,
        ...(nextIris === undefined ? {} : { irisColor: nextIris }),
        ...(nextHandPose === undefined ? {} : { lastHandPoseType: nextHandPose, handPoseTypes: { ...current.handPoseTypes, ...updatedHands } }),
      }));
    }
    return steps.length > 0 || colorChanged;
  }, [updateSession]);

  /* ---------------------------------------------------------------------- */
  /* Commit surface                                                          */
  /* ---------------------------------------------------------------------- */

  const runPlan = useCallback((plan: CharacterApplyPlan): CharacterShaperCommitResult => {
    const blocked = busyRef.current;
    if (blocked !== null) return { ok: false, plan, reason: blocked };
    if (previewRef.current !== null) return { ok: false, plan, reason: PREVIEW_LOCK_REASON };
    if (plan.availability.status === "unavailable") {
      return { ok: false, plan, reason: plan.availability.reason ?? "이 모델에는 적용할 수 없습니다." };
    }
    // Nothing to do (already applied) is a success with no history step, not a warning.
    if (plan.steps.length === 0) return { ok: true, plan, reason: null };
    const before = captureHostState();
    runSteps(plan.steps);
    pushHistory(plan.label, before);
    return { ok: true, plan, reason: null };
  }, [captureHostState, runSteps, pushHistory]);

  /** Precision edits share the commit path so one completed drag is one undo step, not many. */
  const commitSteps = useCallback((label: string, steps: readonly CharacterApplyStep[]) => {
    if (busyRef.current !== null || previewRef.current !== null || steps.length === 0) return;
    const before = captureHostState();
    runSteps(steps);
    pushHistory(label, before);
  }, [captureHostState, runSteps, pushHistory]);

  const planContext = useMemo<CharacterShaperPlanContext>(() => ({
    snapshot,
    handSide: activePreview?.handSide ?? session.handSide,
  }), [activePreview?.handSide, snapshot, session.handSide]);

  const evaluate = useCallback(
    (entry: CharacterSlotEntry): CharacterSlotAvailability => evaluateCharacterSlotEntry(entry, profile),
    [profile],
  );

  const plan = useCallback(
    (entry: CharacterSlotEntry): CharacterApplyPlan => planCharacterSlotApply(entry, profile, planContext),
    [profile, planContext],
  );

  const planForContext = useCallback((
    entry: CharacterSlotEntry,
    context: CharacterShaperPlanContext,
  ): CharacterApplyPlan => {
    if (
      characterSlotMeta(entry.slot).multi
      && entry.apply.kind === "prop"
      && context.snapshot.propIds.includes(entry.apply.propId)
    ) {
      const removal = planCharacterSlotRemove(entry.slot, entry.id, context);
      if (removal) return removal;
    }
    return planCharacterSlotApply(entry, profile, context);
  }, [profile]);

  const commit = useCallback((entry: CharacterSlotEntry): CharacterShaperCommitResult =>
    runPlan(planForContext(entry, planContext)), [planContext, planForContext, runPlan]);

  const cancelPreview = useCallback(() => {
    const previewState = previewRef.current;
    if (!previewState) return;
    previewRef.current = null;
    setPreviewEntryId(null);
    if (previewState.modelId === readString(hostRef.current.activeModelId)) {
      restoreHostState(previewState.before);
    }
  }, [restoreHostState]);

  const preview = useCallback((entry: CharacterSlotEntry): CharacterShaperCommitResult => {
    const context: CharacterShaperPlanContext = {
      snapshot,
      handSide: sessionRef.current.handSide,
    };
    const prepared = planForContext(entry, context);
    const blocked = busyRef.current;
    if (blocked !== null) return { ok: false, plan: prepared, reason: blocked };
    if (prepared.availability.status === "unavailable") {
      return {
        ok: false,
        plan: prepared,
        reason: prepared.availability.reason ?? "이 모델에는 적용할 수 없습니다.",
      };
    }
    const current = previewRef.current;
    if (current) {
      return current.entryId === entry.id
        ? { ok: true, plan: current.plan, reason: null }
        : { ok: false, plan: prepared, reason: PREVIEW_LOCK_REASON };
    }
    if (prepared.steps.length === 0) return { ok: true, plan: prepared, reason: null };

    const before = captureHostState();
    previewRef.current = {
      modelId,
      entryId: entry.id,
      plan: prepared,
      before,
      snapshot,
      recipe,
      handSide: sessionRef.current.handSide,
    };
    setPreviewEntryId(entry.id);
    try {
      runSteps(prepared.steps);
      return { ok: true, plan: prepared, reason: null };
    } catch (error) {
      previewRef.current = null;
      setPreviewEntryId(null);
      restoreHostState(before);
      return {
        ok: false,
        plan: prepared,
        reason: error instanceof Error ? error.message : "후보를 미리 볼 수 없습니다.",
      };
    }
  }, [captureHostState, modelId, planForContext, recipe, restoreHostState, runSteps, snapshot]);

  const commitPreview = useCallback((entry: CharacterSlotEntry): CharacterShaperCommitResult => {
    const current = previewRef.current;
    if (!current) return commit(entry);
    const blocked = busyRef.current;
    if (blocked !== null) return { ok: false, plan: current.plan, reason: blocked };
    if (current.entryId !== entry.id || current.modelId !== readString(hostRef.current.activeModelId)) {
      return { ok: false, plan: current.plan, reason: PREVIEW_LOCK_REASON };
    }
    previewRef.current = null;
    setPreviewEntryId(null);
    pushHistory(current.plan.label, current.before);
    return { ok: true, plan: current.plan, reason: null };
  }, [commit, pushHistory]);

  const clear = useCallback((slot: CharacterSlotKind): CharacterShaperCommitResult | null => {
    const cleared = planCharacterSlotClear(slot, planContext);
    return cleared ? runPlan(cleared) : null;
  }, [planContext, runPlan]);

  const remove = useCallback((slot: CharacterSlotKind, entryId: string): CharacterShaperCommitResult | null => {
    const removal = planCharacterSlotRemove(slot, entryId, planContext);
    return removal ? runPlan(removal) : null;
  }, [planContext, runPlan]);

  const setHandSide = useCallback((side: CharacterHandSide) => {
    if (!HAND_SIDES.includes(side) || previewRef.current !== null) return;
    updateSession((current) => ({ ...current, handSide: side }));
  }, [updateSession]);

  const undo = useCallback(() => {
    if (busyRef.current !== null) return;
    if (previewRef.current !== null) {
      cancelPreview();
      return;
    }
    const restore = history.undo(captureHostState());
    if (restore) restoreHostState(restore);
  }, [history, cancelPreview, captureHostState, restoreHostState]);

  const redo = useCallback(() => {
    if (busyRef.current !== null) return;
    if (previewRef.current !== null) {
      cancelPreview();
      return;
    }
    const restore = history.redo(captureHostState());
    if (restore) restoreHostState(restore);
  }, [history, cancelPreview, captureHostState, restoreHostState]);

  const setCompareActive = useCallback((active: boolean) => {
    const baseline = baselineRef.current;
    if (!baseline || busyRef.current !== null || previewRef.current !== null) return;
    if (active) {
      if (compareStashRef.current) return;
      compareStashRef.current = captureHostState();
      restoreHostState(baseline);
      setCompareActiveState(true);
      return;
    }
    const stashed = compareStashRef.current;
    compareStashRef.current = null;
    if (stashed) restoreHostState(stashed);
    setCompareActiveState(false);
  }, [captureHostState, restoreHostState]);

  const resetToBaseline = useCallback(() => {
    const baseline = baselineRef.current;
    if (!baseline || busyRef.current !== null) return;
    if (previewRef.current !== null) {
      cancelPreview();
      return;
    }
    const before = captureHostState();
    restoreHostState(baseline);
    pushHistory("처음 상태로 되돌리기", before);
  }, [cancelPreview, captureHostState, restoreHostState, pushHistory]);

  const commitFaceParams = useCallback((face: Partial<CharacterHostSnapshot["forgeFace"]>, label: string) => {
    commitSteps(label, [{ kind: "forge-face", face }]);
  }, [commitSteps]);

  const commitSemanticMorphs = useCallback((morphs: CharacterSemanticMorphBundle, label: string) => {
    commitSteps(label, [{ kind: "semantic-morph", morphs }]);
  }, [commitSteps]);

  const commitHairParams = useCallback((hair: Record<string, unknown>, label: string) => {
    commitSteps(label, [{ kind: "forge-hair", hair: hair as Partial<AvatarForgeHairParams> }]);
  }, [commitSteps]);

  const commitColor = useCallback((target: keyof CharacterRecipe["colors"], color: string | null) => {
    if (busyRef.current !== null || previewRef.current !== null) return;
    const before = captureHostState();
    if (runSteps([], { [target]: color })) pushHistory(`색: ${COLOR_LABELS[target]}`, before);
  }, [captureHostState, runSteps, pushHistory]);

  const commitPreset = useCallback<CharacterShaperBinding["commitPreset"]>((preset, document) => {
    const blocked = busyRef.current;
    if (blocked !== null) return { ok: false, reason: blocked };
    if (previewRef.current !== null) return { ok: false, reason: PREVIEW_LOCK_REASON };
    const host = hostRef.current;
    let prepared: ReturnType<typeof planCharacterPresetApplication>;
    try {
      prepared = planCharacterPresetApplication(document, preset, profile, planContext);
      const missing = prepared.requiredHostMethods.find((name) => typeof host[name] !== "function");
      if (missing) throw new Error("프리셋의 모든 변경을 적용할 수 있는 편집기가 필요합니다.");
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "프리셋을 적용할 수 없습니다." };
    }
    const before = captureHostState();
    try {
      runSteps(prepared.steps, prepared.colors);
      if (prepared.expression) {
        host.setActiveExpressionId(prepared.expression.activeEntryId ?? "");
        host.setExpressionWeights({ ...prepared.expression.weights });
      }
      pushHistory(`프리셋: ${preset.name}`, before);
      return { ok: true, reason: null };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "프리셋을 적용하지 못했습니다.";
      try {
        restoreHostState(before);
      } catch (restoreError) {
        const detail = restoreError instanceof Error ? restoreError.message : "복원 오류";
        return { ok: false, reason: `${reason} · 이전 상태 복원도 실패했습니다: ${detail}` };
      }
      return { ok: false, reason };
    }
  }, [profile, planContext, captureHostState, runSteps, restoreHostState, pushHistory]);

  return useMemo<CharacterShaperBinding>(() => ({
    catalog: CHARACTER_SLOT_CATALOG,
    profile,
    snapshot,
    recipe,
    baselineRecipe,
    history: history.state,
    busyReason,
    handSide: session.handSide,
    compareActive,
    previewEntryId,
    evaluate,
    plan,
    commit,
    preview,
    cancelPreview,
    commitPreview,
    commitPreset,
    clear,
    remove,
    setHandSide,
    undo,
    redo,
    setCompareActive,
    resetToBaseline,
    commitFaceParams,
    commitSemanticMorphs,
    commitHairParams,
    commitColor,
  }), [
    profile,
    snapshot,
    recipe,
    baselineRecipe,
    history.state,
    busyReason,
    session.handSide,
    compareActive,
    previewEntryId,
    evaluate,
    plan,
    commit,
    preview,
    cancelPreview,
    commitPreview,
    commitPreset,
    clear,
    remove,
    setHandSide,
    undo,
    redo,
    setCompareActive,
    resetToBaseline,
    commitFaceParams,
    commitSemanticMorphs,
    commitHairParams,
    commitColor,
  ]);
}
