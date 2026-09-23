/**
 * Shared mutable host bag for extracted StudioVrmPoser slices.
 *
 * The open bag keeps the extracted-hook pattern compiling without a full rewrite.
 * Character-shaper call sites should go through `StudioVrmPoserShaperSurface` /
 * `readStudioVrmPoserShaperSurface` so hand-pose / pose / wardrobe entry points are typed.
 */

/** Typed shaper/apply-plan surface — prefer this over indexing the open host bag. */
export interface StudioVrmPoserShaperSurface {
  readonly applyHandPosePreset?: (side: "left" | "right", poseType: string) => void;
  readonly handlePoseSelect?: (presetId: string) => void;
  readonly handleExpressionPresetSelect?: (preset: unknown) => void;
  readonly handleAvatarForgeChange?: (forge: unknown) => void;
  readonly equipWardrobeItem?: (slot: string, itemId: string | null) => void;
  readonly equipWardrobeSetById?: (setId: string) => void;
  readonly updateWardrobeEquip?: (slot: string, patch: unknown) => void;
  readonly updateCostume?: (patch: unknown) => void;
  readonly addVrmProp?: (propId: string) => void;
  readonly removeVrmProp?: (uid: string) => void;
  readonly setVrmPropItems?: ((items: unknown) => void) | ((updater: (prev: unknown) => unknown) => void);
  readonly setSelectedVrmPropUid?: (uid: string | null) => void;
  readonly setWardrobeState?: (state: unknown) => void;
  readonly setCustomColors?: (colors: unknown) => void;
  readonly setActivePoseId?: (id: string) => void;
  readonly setCustomBones?: (bones: unknown) => void;
  readonly setCustomYOffset?: (offset: number) => void;
  readonly setPoseTranslations?: (translations: unknown) => void;
  readonly setFingerEdits?: (edits: unknown) => void;
  readonly setActiveExpressionId?: (id: string) => void;
  readonly setExpressionWeights?: (weights: unknown) => void;
  readonly setBodyRotation?: (rotation: number) => void;
}

function pickFn<K extends keyof StudioVrmPoserShaperSurface>(
  host: StudioVrmPoserHost,
  key: K,
): StudioVrmPoserShaperSurface[K] {
  const value = host[key as string];
  return (typeof value === "function" ? value : undefined) as StudioVrmPoserShaperSurface[K];
}

/** Narrow the open host bag into the typed shaper surface without `any` at call sites. */
export function readStudioVrmPoserShaperSurface(host: StudioVrmPoserHost): StudioVrmPoserShaperSurface {
  return Object.freeze({
    applyHandPosePreset: pickFn(host, "applyHandPosePreset"),
    handlePoseSelect: pickFn(host, "handlePoseSelect"),
    handleExpressionPresetSelect: pickFn(host, "handleExpressionPresetSelect"),
    handleAvatarForgeChange: pickFn(host, "handleAvatarForgeChange"),
    equipWardrobeItem: pickFn(host, "equipWardrobeItem"),
    equipWardrobeSetById: pickFn(host, "equipWardrobeSetById"),
    updateWardrobeEquip: pickFn(host, "updateWardrobeEquip"),
    updateCostume: pickFn(host, "updateCostume"),
    addVrmProp: pickFn(host, "addVrmProp"),
    removeVrmProp: pickFn(host, "removeVrmProp"),
    setVrmPropItems: pickFn(host, "setVrmPropItems"),
    setSelectedVrmPropUid: pickFn(host, "setSelectedVrmPropUid"),
    setWardrobeState: pickFn(host, "setWardrobeState"),
    setCustomColors: pickFn(host, "setCustomColors"),
    setActivePoseId: pickFn(host, "setActivePoseId"),
    setCustomBones: pickFn(host, "setCustomBones"),
    setCustomYOffset: pickFn(host, "setCustomYOffset"),
    setPoseTranslations: pickFn(host, "setPoseTranslations"),
    setFingerEdits: pickFn(host, "setFingerEdits"),
    setActiveExpressionId: pickFn(host, "setActiveExpressionId"),
    setExpressionWeights: pickFn(host, "setExpressionWeights"),
    setBodyRotation: pickFn(host, "setBodyRotation"),
  });
}

/** Open host bag — residual `any` confined to this type alias (extracted-slice pattern). */
export type StudioVrmPoserHost = Record<string, any> & {
  __impl?: Record<string, (...args: any[]) => any>;
};
