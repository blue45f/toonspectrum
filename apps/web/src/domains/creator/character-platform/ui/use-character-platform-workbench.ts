import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Euler, Quaternion } from "three";

import { createCharacterCompatibilityReport } from "../compatibility/character-compatibility-report";
import {
  parseCharacterCanonicalManifestV2,
} from "../assets/character-canonical-manifest";
import { createCharacterRenderGraphPlan } from "../render/character-render-graph";
import {
  createCharacterPartPreset,
} from "../presets/character-part-preset";
import { createCharacterPartPresetStore } from "../presets/character-part-preset-store";
import { useCharacterSurfaceInkRuntime } from "../surface-ink/use-character-surface-ink-runtime";
import { projectCharacterShaperDocument } from "../../character-shaper/character-shaper-document-projection";
import {
  migrateCharacterDocumentV2ToV3,
  validateCharacterDocumentV3,
} from "../document/character-document-v3";
import { createCurrentStudioWebAuthoringRuntimePlan } from "../../studio-web-runtime/studio-web-authoring-runtime";
import { useCharacterAuthoringAuthority } from "./use-character-authoring-authority";
import { useCharacterCanonicalParts } from "./use-character-canonical-parts";
import { loadCharacterSurfaceInkDocument } from "../surface-ink/character-surface-ink-storage";
import { useCharacterGroomRuntime } from "../groom/use-character-groom-runtime";
import { useCharacterPoseRuntime } from "../pose-v3/use-character-pose-runtime";
import { useCharacterRenderExtras } from "../runtime/use-character-render-extras";
import { useCharacterDocumentBinding } from "./use-character-document-binding";
import { characterDocumentCompatibilityView } from "../application/character-shaper-document-plan";
import { useCharacterDocumentHostRuntime } from "./use-character-document-host-runtime";
import { captureCharacterPoseRuntimeV3, readCharacterPoseRuntimeSource } from "../pose-v3/character-pose-runtime-adapter";
import { STUDIO_VRM_BASE_ROTATION_Y_KEY } from "../../vrm/studio-vrm-asset-runtime";
import { sanitizeAvatarForgeState, createAvatarForgeState } from "../../vrm/studio-vrm-avatar-forge";
import { normalizeStudioVrmPoseTranslations } from "../../vrm/studio-vrm-pose-translations";

import type { CharacterCanonicalManifestV2 } from "../assets/character-canonical-manifest";
import type { CharacterPartPresetV1 } from "../presets/character-part-preset";
import type {
  CharacterPoseRegion,
} from "../pose/character-pose-v2";
import type { CharacterShaperBinding } from "../../character-shaper/character-shaper-ui-contract";
import type {
  CharacterSlotKind,
} from "../../character-shaper/character-shaper-contract";
import type { StudioAsyncKeyValueStore } from "../../studio-local-database";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

const PRESET_STORE = createCharacterPartPresetStore();
const MANIFEST_SQLITE_NAMESPACE = "studio-character-canonical-manifests-v12";
let manifestTail: Promise<unknown> = Promise.resolve();

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
  readonly binding: CharacterShaperBinding;
  readonly modelId: string;
  readonly canonicalManifest: CharacterCanonicalManifestV2 | null;
  readonly canonicalError: string | null;
  readonly canonicalParts: ReturnType<typeof useCharacterCanonicalParts>;
  readonly compatibility: ReturnType<typeof createCharacterCompatibilityReport>;
  readonly document: ReturnType<typeof projectCharacterShaperDocument>;
  readonly documentV3: ReturnType<typeof migrateCharacterDocumentV2ToV3>;
  readonly authoring: ReturnType<typeof useCharacterAuthoringAuthority>;
  readonly groom: ReturnType<typeof useCharacterGroomRuntime>;
  readonly renderExtras: ReturnType<typeof useCharacterRenderExtras>;
  readonly poseRuntime: ReturnType<typeof useCharacterPoseRuntime>;
  readonly hostRuntime: ReturnType<typeof useCharacterDocumentHostRuntime>;
  readonly webRuntime: ReturnType<typeof createCurrentStudioWebAuthoringRuntimePlan>;
  readonly renderGraph: ReturnType<typeof createCharacterRenderGraphPlan>;
  readonly presets: readonly CharacterPartPresetV1[];
  readonly presetStoreMessage: string | null;
  readonly selectedPoseRegions: readonly CharacterPoseRegion[];
  readonly setSelectedPoseRegions: (
    regions: readonly CharacterPoseRegion[],
  ) => void;
  readonly surfaceInk: ReturnType<typeof useCharacterSurfaceInkRuntime>;
  readonly notice: string | null;
  readonly importCanonicalManifest: (json: string) => Promise<boolean>;
  readonly removeCanonicalManifest: () => Promise<void>;
  readonly exportCanonicalManifest: () => string | null;
  readonly saveSlotPreset: (slot: CharacterSlotKind, name: string) => Promise<boolean>;
  readonly applyPreset: (preset: CharacterPartPresetV1) => boolean;
  readonly removePreset: (presetId: string) => Promise<void>;
  readonly exportPresets: () => string;
  readonly importPresets: (json: string) => Promise<number>;
  readonly stabilizeCurrentPose: () => boolean;
}

function withManifestStorage<T>(operation: (storage: StudioAsyncKeyValueStore) => Promise<T>): Promise<T> {
  const run = async () => {
    const { acquireStudioLocalDatabase } = await import("../../studio-local-database-runtime");
    return operation((await acquireStudioLocalDatabase()).asAsyncKeyValueStore(MANIFEST_SQLITE_NAMESPACE));
  };
  const result = manifestTail.then(run, run);
  manifestTail = result.then(() => undefined, () => undefined);
  return result;
}

function readManifest(modelId: string): Promise<CharacterCanonicalManifestV2 | null> {
  return withManifestStorage(async (storage) => {
    const raw = await storage.get(modelId);
    if (!raw) return null;
    const parsed = parseCharacterCanonicalManifestV2(JSON.parse(raw));
    if (parsed.identity.assetId !== modelId) {
      throw new Error(`매니페스트 대상 ${parsed.identity.assetId}과 현재 모델 ${modelId}이 다릅니다.`);
    }
    return parsed;
  });
}

function saveManifest(modelId: string, manifest: CharacterCanonicalManifestV2): Promise<void> {
  const serialized = JSON.stringify(manifest);
  return withManifestStorage((storage) => storage.set(modelId, serialized));
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
  source: unknown,
): Record<string, readonly [number, number, number]> {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const values: Record<string, readonly [number, number, number]> = {};
  for (const [bone, entry] of Object.entries(source)) {
    const value = entry && typeof entry === "object" && "rotation" in entry ? entry.rotation : entry;
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
          .setFromEuler(new Euler(value[0], value[1], value[2], /Hand|Arm|Finger/u.test(bone) ? "YXZ" : "XYZ"))
          .normalize();
        return [
          bone,
          Object.freeze([
            quaternion.x,
            quaternion.y,
            quaternion.z,
            quaternion.w,
          ] as const),
        ];
      }),
    ),
  );
}

export function useCharacterPlatformWorkbench(
  h: StudioVrmPoserHost,
  binding: CharacterShaperBinding,
  options: { readonly documentAuthority?: boolean; readonly legacyEditing?: boolean } = {},
): CharacterPlatformWorkbenchState {
  const modelId = activeModelId(h, binding);
  const scopeRef = useRef({ active: false });
  const manifestGenerationRef = useRef(0);
  const documentClock = useMemo(() => ({ modelId, createdAt: new Date().toISOString() }), [modelId]);
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
    void PRESET_STORE.refresh();
  }, []);
  useEffect(() => {
    const scope = { active: true };
    scopeRef.current = scope;
    const generation = ++manifestGenerationRef.current;
    setCanonicalManifest(null);
    setCanonicalError(null);
    void readManifest(modelId).then((manifest) => {
      if (scope.active && generation === manifestGenerationRef.current) setCanonicalManifest(manifest);
    }).catch((error: unknown) => {
      if (scope.active && generation === manifestGenerationRef.current) {
        setCanonicalError(error instanceof Error ? error.message : "공식 캐릭터 매니페스트를 읽지 못했습니다.");
      }
    });
    return () => { scope.active = false; };
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
        now: documentClock.createdAt,
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

  const documentV3Projection = useMemo(() => {
    const migrated = migrateCharacterDocumentV2ToV3(document);
    const runtime = readCharacterPoseRuntimeSource(h.vrm);
    const captured = runtime ? captureCharacterPoseRuntimeV3({
      source: runtime, poseId: migrated.pose.poseId, generationId: migrated.pose.generationId,
    }) : migrated.pose;
    const translations = normalizeStudioVrmPoseTranslations(h.poseTranslations)?.root;
    const base: unknown = runtime?.scene.userData[STUDIO_VRM_BASE_ROTATION_Y_KEY];
    const yaw = typeof h.bodyRotation === "number" && Number.isFinite(h.bodyRotation)
      ? h.bodyRotation + (typeof base === "number" && Number.isFinite(base) ? base : 0) : null;
    const rotation = yaw === null ? captured.root.rotation
      : new Quaternion().setFromEuler(new Euler(0, yaw, 0)).toArray();
    return validateCharacterDocumentV3({
      ...migrated,
      recipe: { ...migrated.recipe, slots: { ...migrated.recipe.slots,
        ...(migrated.recipe.slots.hair ? { hair: { ...migrated.recipe.slots.hair,
          overrides: Object.fromEntries(Object.entries(sanitizeAvatarForgeState(h.avatarForgeState ?? createAvatarForgeState()).hair)
            .map(([key, value]) => [`hair.${key}`, value])) } } : {}) } },
      pose: {
        ...migrated.pose,
        bones: { ...captured.bones, ...quaternionBones(customBones(h.customBones)) },
        root: {
          position: [translations?.[0] ?? captured.root.position[0], typeof h.customYOffset === "number" && Number.isFinite(h.customYOffset) ? h.customYOffset : captured.root.position[1], translations?.[2] ?? captured.root.position[2]],
          rotation: [rotation[0], rotation[1], rotation[2], rotation[3]],
        },
      },
    });
  }, [document, h.avatarForgeState, h.vrm, h.customBones, h.customYOffset, h.poseTranslations, h.bodyRotation]);
  const sourceFingerprint = useMemo(() => JSON.stringify({
    model: documentV3Projection.model,
    compatibility: documentV3Projection.compatibility,
    recipe: documentV3Projection.recipe,
    deformation: documentV3Projection.deformation,
    colors: documentV3Projection.look.colors,
    expression: documentV3Projection.expression,
    pose: { root: documentV3Projection.pose.root, bones: documentV3Projection.pose.bones, poseId: documentV3Projection.pose.poseId },
    transparent: documentV3Projection.output.transparent,
  }), [documentV3Projection]);
  const authoring = useCharacterAuthoringAuthority(
    documentV3Projection,
    sourceFingerprint,
    {
      synchronizeProjection: options.documentAuthority !== true || options.legacyEditing === true,
      enabled: !options.documentAuthority || (h.status === "ready" && Boolean(h.vrm)),
      initializeDocument: async (initial) => validateCharacterDocumentV3({
        ...initial,
        surfaceInk: await loadCharacterSurfaceInkDocument(initial.model.assetId),
      }),
    },
  );
  const documentBinding = useCharacterDocumentBinding(binding, authoring, h);
  const uiBinding = options.documentAuthority ? documentBinding : binding;
  const authorityDocument = characterDocumentCompatibilityView(authoring.snapshot.document);
  const documentV3 = authoring.snapshot.previewDocument ?? authoring.snapshot.document;
  const surfaceInk = useCharacterSurfaceInkRuntime({
    h,
    modelKey: modelId,
    revisionKey: JSON.stringify([documentV3.recipe, documentV3.deformation]),
    authoringDocument: documentV3.surfaceInk,
    authoringReady: authoring.hydrated,
    authoringEditable: authoring.snapshot.previewCommandId === null,
    onDocumentChange: (next) => {
      const current = authoring.authority.getSnapshot().document;
      const result = authoring.dispatch({
        commandId: `character.ink/${current.revision}`,
        label: "3D 펜선 편집",
        source: "user",
        expectedDocumentId: current.documentId,
        expectedRevision: current.revision,
        operations: [{ kind: "replace-surface-ink", surfaceInk: next }],
      });
      return result.status === "applied" || result.status === "noop";
    },
    authoringUndo: authoring.undo,
    authoringRedo: authoring.redo,
    authoringCanUndo: authoring.snapshot.canUndo,
    authoringCanRedo: authoring.snapshot.canRedo,
  });
  const hostRuntime = useCharacterDocumentHostRuntime({ h, binding, current: document, authoring });
  const renderExtras = useCharacterRenderExtras({ h, document: documentV3, enabled: authoring.hydrated });
  const groom = useCharacterGroomRuntime({ h, document: documentV3, modelKey: modelId, enabled: authoring.hydrated });
  const poseRuntime = useCharacterPoseRuntime({ h, authoring, selectedRegions: selectedPoseRegions });
  const webRuntime = useMemo(
    () => createCurrentStudioWebAuthoringRuntimePlan(),
    [],
  );
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
  const canonicalParts = useCharacterCanonicalParts({
    h,
    manifest: canonicalManifest,
    modelId,
    onNotice: setNotice,
  });

  const importCanonicalManifest = useCallback(
    async (json: string): Promise<boolean> => {
      const scope = scopeRef.current;
      const generation = ++manifestGenerationRef.current;
      try {
        const parsed = parseCharacterCanonicalManifestV2(JSON.parse(json));
        if (parsed.identity.assetId !== modelId) {
          throw new Error(
            `현재 모델 식별자는 ${modelId}입니다. 매니페스트의 assetId를 확인해 주세요.`,
          );
        }
        await saveManifest(modelId, parsed);
        if (!scope.active) return false;
        setCanonicalManifest(parsed);
        if (generation !== manifestGenerationRef.current) return false;
        setCanonicalError(null);
        setNotice("공식 캐릭터 매니페스트를 연결했습니다.");
        return true;
      } catch (error) {
        if (!scope.active || generation !== manifestGenerationRef.current) return false;
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

  const removeCanonicalManifest = useCallback(async () => {
    const scope = scopeRef.current;
    const generation = ++manifestGenerationRef.current;
    try {
      await withManifestStorage((storage) => storage.delete(modelId));
      if (!scope.active) return;
      setCanonicalManifest(null);
      if (generation !== manifestGenerationRef.current) return;
      setCanonicalError(null);
      setNotice("공식 캐릭터 연결을 해제하고 호환 모드로 전환했습니다.");
    } catch (error) {
      if (!scope.active || generation !== manifestGenerationRef.current) return;
      const message = error instanceof Error ? error.message : "공식 캐릭터 연결을 해제하지 못했습니다.";
      setCanonicalError(message);
      setNotice(message);
    }
  }, [modelId]);

  const saveSlotPreset = useCallback(
    async (slot: CharacterSlotKind, name: string): Promise<boolean> => {
      const scope = scopeRef.current;
      try {
        const preset = createCharacterPartPreset({
          presetId: `${slot}:${Date.now().toString(36)}`,
          name,
          kind: "slot",
          scope: "personal",
          document: options.documentAuthority ? authorityDocument : document,
          slot,
        });
        const result = await PRESET_STORE.save(preset);
        if (!scope.active) return false;
        if (result.status === "error") {
          throw new Error(result.message ?? "프리셋을 저장하지 못했습니다.");
        }
        setNotice(`${preset.name} 프리셋을 저장했습니다.`);
        return true;
      } catch (error) {
        if (!scope.active) return false;
        setNotice(
          error instanceof Error
            ? error.message
            : "프리셋을 저장하지 못했습니다.",
        );
        return false;
      }
    },
    [document, options.documentAuthority, authorityDocument],
  );

  const applyPreset = useCallback(
    (preset: CharacterPartPresetV1): boolean => {
      const committed = uiBinding.commitPreset(preset, options.documentAuthority ? authorityDocument : document);
      if (!committed.ok) {
        setNotice(committed.reason ?? "프리셋을 적용하지 못했습니다.");
        return false;
      }
      setNotice(`${preset.name} 프리셋을 적용했습니다.`);
      return true;
    },
    [uiBinding, options.documentAuthority, authorityDocument, document],
  );

  const exportPresets = useCallback(
    () => JSON.stringify(PRESET_STORE.getSnapshot().presets, null, 2),
    [],
  );
  const importPresets = useCallback(async (json: string): Promise<number> => {
    const scope = scopeRef.current;
    try {
      const values: unknown = JSON.parse(json);
      if (!Array.isArray(values) || values.length > 500) {
        throw new Error("프리셋 목록 형식이 올바르지 않습니다.");
      }
      const result = await PRESET_STORE.saveMany(values);
      if (!scope.active) return 0;
      if (result.status === "error") {
        throw new Error(result.message ?? "프리셋 저장에 실패했습니다.");
      }
      const count = values.length;
      setNotice(`프리셋 ${count}개를 불러왔습니다.`);
      return count;
    } catch (error) {
      if (!scope.active) return 0;
      setNotice(
        error instanceof Error
          ? error.message
          : "프리셋을 불러오지 못했습니다.",
      );
      return 0;
    }
  }, []);


  const renderProblem = hostRuntime.error
    ?? poseRuntime.runtimeError
    ?? (documentV3.groom.groups.length > 0 ? groom.error ?? (!groom.supported ? groom.reason : null) : null)
    ?? (documentV3.geometryStrokes.strokes.length > 0 || documentV3.look.materialOverrides.length > 0 ? renderExtras.error : null);
  const renderPending = hostRuntime.pending || poseRuntime.pending || (documentV3.groom.groups.length > 0 && (groom.status === "building" || groom.status === "idle"))
    || ((documentV3.geometryStrokes.strokes.length > 0 || documentV3.look.materialOverrides.length > 0) && (renderExtras.status === "building" || renderExtras.status === "idle"));
  const visibleBinding = options.documentAuthority ? { ...uiBinding,
    busyReason: uiBinding.busyReason ?? renderProblem ?? (renderPending ? "캐릭터 원본을 화면에 적용하는 중입니다." : null),
    previewEntryId: uiBinding.previewEntryId ?? authoring.snapshot.previewCommandId,
  } : uiBinding;
  return Object.freeze({
    binding: visibleBinding,
    modelId,
    canonicalManifest,
    canonicalError,
    canonicalParts,
    compatibility,
    document: options.documentAuthority ? authorityDocument : document,
    documentV3,
    authoring,
    groom,
    renderExtras,
    poseRuntime,
    hostRuntime,
    webRuntime,
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
    removePreset: async (presetId: string) => {
      await PRESET_STORE.remove(presetId);
    },
    exportPresets,
    importPresets,
    stabilizeCurrentPose: poseRuntime.previewStabilization,
  });
}
