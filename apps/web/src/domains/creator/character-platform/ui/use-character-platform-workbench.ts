import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Euler, Quaternion, Vector3 } from "three";

import { createCharacterCompatibilityReport } from "../compatibility/character-compatibility-report";
import {
  parseCharacterCanonicalManifestV2,
} from "../assets/character-canonical-manifest";
import { createCharacterRenderGraphPlan } from "../render/character-render-graph";
import {
  applyCharacterPartPreset,
  createCharacterPartPreset,
} from "../presets/character-part-preset";
import { createCharacterPartPresetStore } from "../presets/character-part-preset-store";
import {
  createDefaultCharacterPoseConstraintProfile,
  solveCharacterPoseV2,
} from "../pose/character-pose-v2";
import { useCharacterSurfaceInkRuntime } from "../surface-ink/use-character-surface-ink-runtime";
import { projectCharacterShaperDocument } from "../../character-shaper/character-shaper-document-projection";

import type { CharacterCanonicalManifestV2 } from "../assets/character-canonical-manifest";
import type { CharacterPartPresetV1 } from "../presets/character-part-preset";
import type {
  CharacterPoseCandidateV2,
  CharacterPoseRegion,
} from "../pose/character-pose-v2";
import type { CharacterShaperBinding } from "../../character-shaper/character-shaper-ui-contract";
import type {
  CharacterHostSnapshot,
  CharacterSlotKind,
} from "../../character-shaper/character-shaper-contract";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

const PRESET_STORE = createCharacterPartPresetStore(
  () => (typeof window === "undefined" ? null : window.localStorage),
);
const MANIFEST_STORAGE_PREFIX = "toonstudio.character-canonical-manifest.v2:";

const ALL_POSE_REGIONS: readonly CharacterPoseRegion[] = Object.freeze([
  "head",
  "torso",
  "left-arm",
  "right-arm",
  "left-leg",
  "right-leg",
  "left-hand",
  "right-hand",
]);

export interface CharacterPlatformWorkbenchState {
  readonly modelId: string;
  readonly canonicalManifest: CharacterCanonicalManifestV2 | null;
  readonly canonicalError: string | null;
  readonly compatibility: ReturnType<typeof createCharacterCompatibilityReport>;
  readonly document: ReturnType<typeof projectCharacterShaperDocument>;
  readonly renderGraph: ReturnType<typeof createCharacterRenderGraphPlan>;
  readonly presets: readonly CharacterPartPresetV1[];
  readonly presetStoreMessage: string | null;
  readonly selectedPoseRegions: readonly CharacterPoseRegion[];
  readonly setSelectedPoseRegions: (
    regions: readonly CharacterPoseRegion[],
  ) => void;
  readonly surfaceInk: ReturnType<typeof useCharacterSurfaceInkRuntime>;
  readonly notice: string | null;
  readonly importCanonicalManifest: (json: string) => boolean;
  readonly removeCanonicalManifest: () => void;
  readonly exportCanonicalManifest: () => string | null;
  readonly saveSlotPreset: (slot: CharacterSlotKind, name: string) => boolean;
  readonly applyPreset: (preset: CharacterPartPresetV1) => boolean;
  readonly removePreset: (presetId: string) => void;
  readonly exportPresets: () => string;
  readonly importPresets: (json: string) => number;
  readonly stabilizeCurrentPose: () => boolean;
}

function manifestStorageKey(modelId: string): string {
  return `${MANIFEST_STORAGE_PREFIX}${modelId}`;
}

function readManifest(modelId: string): CharacterCanonicalManifestV2 | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(manifestStorageKey(modelId));
  if (!raw) return null;
  const parsed = parseCharacterCanonicalManifestV2(JSON.parse(raw));
  if (parsed.identity.assetId !== modelId) {
    throw new Error(
      `매니페스트 대상 ${parsed.identity.assetId}과 현재 모델 ${modelId}이 다릅니다.`,
    );
  }
  return parsed;
}

function saveManifest(
  modelId: string,
  manifest: CharacterCanonicalManifestV2,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    manifestStorageKey(modelId),
    JSON.stringify(manifest),
  );
}

function activeModelId(
  h: StudioVrmPoserHost,
  binding: CharacterShaperBinding,
): string {
  return typeof h.activeModelId === "string" && h.activeModelId.trim().length > 0
    ? h.activeModelId
    : (binding.profile.modelId ?? "unloaded-character");
}

function customBones(
  h: StudioVrmPoserHost,
): Record<string, readonly [number, number, number]> {
  const source: unknown = h.customBones;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const values: Record<string, readonly [number, number, number]> = {};
  for (const [bone, value] of Object.entries(source)) {
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      !value.every(
        (item) => typeof item === "number" && Number.isFinite(item),
      )
    ) {
      continue;
    }
    values[bone] = [value[0], value[1], value[2]];
  }
  return values;
}

function quaternionBones(
  values: Readonly<Record<string, readonly [number, number, number]>>,
) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([bone, value]) => {
        const quaternion = new Quaternion()
          .setFromEuler(new Euler(value[0], value[1], value[2], "XYZ"))
          .normalize();
        return [
          bone,
          Object.freeze([
            quaternion.x,
            quaternion.y,
            quaternion.z,
            quaternion.w,
          ]),
        ];
      }),
    ),
  );
}

function eulerBones(
  values: Readonly<
    Record<string, readonly [number, number, number, number]>
  >,
) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([bone, value]) => {
        const euler = new Euler().setFromQuaternion(
          new Quaternion(value[0], value[1], value[2], value[3]),
          "XYZ",
        );
        return [bone, Object.freeze([euler.x, euler.y, euler.z])];
      }),
    ),
  );
}

interface HumanoidLike {
  getNormalizedBoneNode(name: string): {
    getWorldPosition(target: Vector3): Vector3;
  } | null;
}

function footPositions(
  h: StudioVrmPoserHost,
): Readonly<Record<string, readonly [number, number, number]>> {
  const humanoid = h.vrm?.humanoid as HumanoidLike | undefined;
  if (!humanoid || typeof humanoid.getNormalizedBoneNode !== "function") {
    return {};
  }
  const values: Record<string, readonly [number, number, number]> = {};
  for (const bone of ["leftFoot", "rightFoot"] as const) {
    const node = humanoid.getNormalizedBoneNode(bone);
    if (!node) continue;
    const position = node.getWorldPosition(new Vector3());
    values[bone] = [position.x, position.y, position.z];
  }
  return Object.freeze(values);
}

function poseConfidence() {
  return Object.freeze({
    overall: 1,
    coverage: 1,
    quality: "high" as const,
    groups: Object.freeze({
      torso: 1,
      leftArm: 1,
      rightArm: 1,
      leftLeg: 1,
      rightLeg: 1,
    }),
    joints: Object.freeze({
      leftShoulder: 1,
      rightShoulder: 1,
      leftElbow: 1,
      rightElbow: 1,
      leftWrist: 1,
      rightWrist: 1,
      leftHip: 1,
      rightHip: 1,
      leftKnee: 1,
      rightKnee: 1,
      leftAnkle: 1,
      rightAnkle: 1,
    }),
    lowConfidenceGroups: Object.freeze([]),
  });
}

function faceControls(
  values: Readonly<Record<string, number>>,
): Partial<CharacterHostSnapshot["forgeFace"]> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith("face.")) result[key.slice(5)] = value;
  }
  return result as Partial<CharacterHostSnapshot["forgeFace"]>;
}

function morphControls(
  values: Readonly<Record<string, number>>,
): CharacterHostSnapshot["semanticMorphs"] {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith("morph.")) result[key.slice(6)] = value;
  }
  return result as CharacterHostSnapshot["semanticMorphs"];
}

function documentClockForModel(_modelId: string): string {
  return new Date().toISOString();
}

export function useCharacterPlatformWorkbench(
  h: StudioVrmPoserHost,
  binding: CharacterShaperBinding,
): CharacterPlatformWorkbenchState {
  const modelId = activeModelId(h, binding);
  const documentClock = useMemo(() => documentClockForModel(modelId), [modelId]);
  const [canonicalManifest, setCanonicalManifest] =
    useState<CharacterCanonicalManifestV2 | null>(null);
  const [canonicalError, setCanonicalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedPoseRegions, setSelectedPoseRegionsState] = useState<
    readonly CharacterPoseRegion[]
  >(ALL_POSE_REGIONS);
  const presetSnapshot = useSyncExternalStore(
    PRESET_STORE.subscribe,
    PRESET_STORE.getSnapshot,
    PRESET_STORE.getSnapshot,
  );

  useEffect(() => {
    PRESET_STORE.refresh();
  }, []);
  useEffect(() => {
    try {
      setCanonicalManifest(readManifest(modelId));
      setCanonicalError(null);
    } catch (error) {
      setCanonicalManifest(null);
      setCanonicalError(
        error instanceof Error
          ? error.message
          : "공식 캐릭터 매니페스트를 읽지 못했습니다.",
      );
    }
  }, [modelId]);

  const compatibility = useMemo(
    () =>
      createCharacterCompatibilityReport(binding.profile, {
        canonical: canonicalManifest !== null,
        sourceRevision:
          canonicalManifest?.identity.rendererRevision ??
          "character-capability-profile-v1",
      }),
    [binding.profile, canonicalManifest],
  );

  const document = useMemo(
    () =>
      projectCharacterShaperDocument({
        documentId: `character-shaper:${modelId}`,
        recipe: binding.recipe,
        snapshot: binding.snapshot,
        profile: binding.profile,
        assetId: modelId,
        assetVersion: canonicalManifest?.identity.version ?? "legacy-runtime",
        contentSha256: canonicalManifest?.provenance.contentSha256 ?? null,
        canonical: canonicalManifest !== null,
        transparentBackground: Boolean(h.transparentBackground),
        backgroundColor:
          typeof h.insertBackgroundColor === "string"
            ? h.insertBackgroundColor
            : "#ffffff",
        revision: binding.history.length,
        now: documentClock,
      }),
    [
      binding.history.length,
      binding.profile,
      binding.recipe,
      binding.snapshot,
      canonicalManifest,
      documentClock,
      h.insertBackgroundColor,
      h.transparentBackground,
      modelId,
    ],
  );

  const surfaceInk = useCharacterSurfaceInkRuntime({
    h,
    modelKey: modelId,
    revisionKey: JSON.stringify([
      binding.recipe,
      binding.snapshot.forgeFace,
      binding.snapshot.semanticMorphs,
    ]),
  });
  const hasSurfacePaint = Boolean(
    h.texturePaintCanUndo || h.texturePaintHasContent || h.texturePaintDirty,
  );
  const renderGraph = useMemo(
    () =>
      createCharacterRenderGraphPlan({
        compatibility,
        canonicalManifest,
        hasSurfacePaint,
        hasSurfaceInk: surfaceInk.strokeCount > 0,
      }),
    [
      canonicalManifest,
      compatibility,
      hasSurfacePaint,
      surfaceInk.strokeCount,
    ],
  );

  const importCanonicalManifest = useCallback(
    (json: string): boolean => {
      try {
        const parsed = parseCharacterCanonicalManifestV2(JSON.parse(json));
        if (parsed.identity.assetId !== modelId) {
          throw new Error(
            `현재 모델 식별자는 ${modelId}입니다. 매니페스트의 assetId를 확인해 주세요.`,
          );
        }
        saveManifest(modelId, parsed);
        setCanonicalManifest(parsed);
        setCanonicalError(null);
        setNotice("공식 캐릭터 매니페스트를 연결했습니다.");
        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "공식 캐릭터 매니페스트를 불러오지 못했습니다.";
        setCanonicalError(message);
        setNotice(message);
        return false;
      }
    },
    [modelId],
  );

  const removeCanonicalManifest = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(manifestStorageKey(modelId));
    }
    setCanonicalManifest(null);
    setCanonicalError(null);
    setNotice("공식 캐릭터 연결을 해제하고 호환 모드로 전환했습니다.");
  }, [modelId]);

  const saveSlotPreset = useCallback(
    (slot: CharacterSlotKind, name: string): boolean => {
      try {
        const preset = createCharacterPartPreset({
          presetId: `${slot}:${Date.now().toString(36)}`,
          name,
          kind: "slot",
          scope: "personal",
          document,
          slot,
        });
        const result = PRESET_STORE.save(preset);
        if (result.status === "error") {
          throw new Error(result.message ?? "프리셋을 저장하지 못했습니다.");
        }
        setNotice(`${preset.name} 프리셋을 저장했습니다.`);
        return true;
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "프리셋을 저장하지 못했습니다.",
        );
        return false;
      }
    },
    [document],
  );

  const applyPreset = useCallback(
    (preset: CharacterPartPresetV1): boolean => {
      const planned = applyCharacterPartPreset(document, preset);
      if (!planned.ok) {
        setNotice(
          planned.skipped.map((item) => item.reason).join(" · ") ||
            "적용할 수 있는 값이 없습니다.",
        );
        return false;
      }
      const selection = preset.payload.selections?.[0];
      if (selection) {
        const entry = binding.catalog.entries.find(
          (candidate) => candidate.id === selection.entryId,
        );
        if (!entry) {
          setNotice(
            `프리셋 항목 ${selection.entryId}을 현재 카탈로그에서 찾지 못했습니다.`,
          );
          return false;
        }
        const committed = binding.commit(entry);
        if (!committed.ok) {
          setNotice(committed.reason ?? "프리셋을 적용하지 못했습니다.");
          return false;
        }
      }
      const faces = faceControls(preset.payload.controls ?? {});
      if (Object.keys(faces).length > 0) {
        binding.commitFaceParams(faces, `${preset.name}: 얼굴 조절`);
      }
      const morphs = morphControls(preset.payload.controls ?? {});
      if (Object.keys(morphs).length > 0) {
        binding.commitSemanticMorphs(morphs, `${preset.name}: 세부 조절`);
      }
      for (const [target, color] of Object.entries(
        preset.payload.colors ?? {},
      )) {
        if (
          [
            "skin",
            "hairBase",
            "hairTip",
            "iris",
            "top",
            "bottom",
            "shoes",
          ].includes(target)
        ) {
          binding.commitColor(
            target as keyof typeof binding.recipe.colors,
            color,
          );
        }
      }
      setNotice(`${preset.name} 프리셋을 적용했습니다.`);
      return true;
    },
    [binding, document],
  );

  const exportPresets = useCallback(
    () => JSON.stringify(PRESET_STORE.getSnapshot().presets, null, 2),
    [],
  );
  const importPresets = useCallback((json: string): number => {
    try {
      const values: unknown = JSON.parse(json);
      if (!Array.isArray(values) || values.length > 500) {
        throw new Error("프리셋 목록 형식이 올바르지 않습니다.");
      }
      let count = 0;
      for (const value of values) {
        const result = PRESET_STORE.save(value as CharacterPartPresetV1);
        if (result.status === "error") {
          throw new Error(result.message ?? "프리셋 저장에 실패했습니다.");
        }
        count += 1;
      }
      setNotice(`프리셋 ${count}개를 불러왔습니다.`);
      return count;
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "프리셋을 불러오지 못했습니다.",
      );
      return 0;
    }
  }, []);

  const stabilizeCurrentPose = useCallback((): boolean => {
    const bones = customBones(h);
    if (
      Object.keys(bones).length === 0 ||
      typeof h.handlePhotoPoseApply !== "function"
    ) {
      setNotice("먼저 포즈 프리셋이나 사진 포즈를 적용해 주세요.");
      return false;
    }
    const quaternions = quaternionBones(bones) as Readonly<
      Record<string, readonly [number, number, number, number]>
    >;
    const feet = footPositions(h);
    const contacts = Object.keys(feet).map((bone) =>
      Object.freeze({
        id: `${bone}:ground`,
        kind: "ground" as const,
        bone,
        target: Object.freeze([
          feet[bone]![0],
          0,
          feet[bone]![2],
        ]) as readonly [number, number, number],
        weight: 1,
        tolerance: 0.01,
      }),
    );
    const candidate: CharacterPoseCandidateV2 = Object.freeze({
      candidateId: `pose-v2:${Date.now().toString(36)}`,
      generationId: Date.now(),
      source: "manual",
      root: Object.freeze({
        position: [0, 0, 0] as const,
        rotation: [0, 0, 0, 1] as const,
      }),
      bones: quaternions,
      confidence: Object.freeze({
        overall: 1,
        regions: Object.freeze(
          Object.fromEntries(ALL_POSE_REGIONS.map((region) => [region, 1])),
        ),
        joints: Object.freeze(
          Object.fromEntries(Object.keys(quaternions).map((bone) => [bone, 1])),
        ),
      }),
      contacts: Object.freeze(contacts),
      warnings: Object.freeze([]),
    });
    const solved = solveCharacterPoseV2({
      candidate,
      currentBones: quaternions,
      selectedRegions: selectedPoseRegions,
      footPositions: feet,
      profile: createDefaultCharacterPoseConstraintProfile(),
    });
    h.handlePhotoPoseApply({
      sourceName: "현재 포즈 · Pose V2 안정화",
      bones: eulerBones(solved.candidate.bones),
      landmarks: [],
      worldLandmarks: [],
      confidence: poseConfidence(),
      fingerEdits: {},
      detectedHandSides: [],
    });
    setNotice(
      `Pose V2 적용 · 본 ${solved.appliedBones.length}개 · 유지 ${solved.preservedBones.length}개` +
        (Math.abs(solved.groundedBy) > 0.0001
          ? ` · 접지 보정 ${solved.groundedBy.toFixed(3)}m 계산`
          : ""),
    );
    return true;
  }, [h, selectedPoseRegions]);

  return Object.freeze({
    modelId,
    canonicalManifest,
    canonicalError,
    compatibility,
    document,
    renderGraph,
    presets: presetSnapshot.presets,
    presetStoreMessage: presetSnapshot.message,
    selectedPoseRegions,
    setSelectedPoseRegions: (regions: readonly CharacterPoseRegion[]) =>
      setSelectedPoseRegionsState(Object.freeze([...regions])),
    surfaceInk,
    notice,
    importCanonicalManifest,
    removeCanonicalManifest,
    exportCanonicalManifest: () =>
      canonicalManifest ? JSON.stringify(canonicalManifest, null, 2) : null,
    saveSlotPreset,
    applyPreset,
    removePreset: (presetId: string) => {
      PRESET_STORE.remove(presetId);
    },
    exportPresets,
    importPresets,
    stabilizeCurrentPose,
  });
}
