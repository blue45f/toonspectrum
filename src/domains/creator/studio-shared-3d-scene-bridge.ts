import { isEffectivelyHidden, type LayerGroup } from "./studio-layers";
import { sha256HexPortable } from "./studio-sha256";
import { createAvatarForgeState } from "./studio-vrm-avatar-forge";
import {
  parseStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
  type StudioVrmCanonicalData,
  type StudioVrmSceneDocument,
  type StudioVrmVec3,
} from "./studio-vrm-scene-document";

/**
 * A page may contain many raster layers, but loading every linked avatar into one WebGL scene can
 * exhaust mobile GPU memory. The bridge therefore admits a small, deterministic foreground cast.
 */
export const STUDIO_SHARED_3D_MAX_CHARACTERS = 12;

export const STUDIO_SHARED_3D_SCENE_SESSION_KIND =
  "toonspectrum.shared-3d-scene-session" as const;
export const STUDIO_SHARED_3D_SCENE_SESSION_VERSION = 2 as const;
export const STUDIO_SHARED_3D_CHARACTER_TRANSFORM_RECEIPT_KIND =
  "toonspectrum.shared-3d-character-transform-receipt" as const;
export const STUDIO_SHARED_3D_CHARACTER_TRANSFORM_RECEIPT_VERSION = 1 as const;

export interface StudioShared3dCharacterInput {
  readonly elementId: string;
  readonly label?: string;
  readonly scene: StudioVrmSceneDocument;
  /** Optional Shot/Stage-local root placement. Model, pose and appearance remain source-owned. */
  readonly stageTransform?: StudioShared3dCharacterStageTransform;
  readonly stageId?: string;
}

export interface StudioShared3dElementSource {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly groupId?: string;
  readonly hidden?: boolean;
  readonly vrmScene?: StudioVrmSceneDocument;
}

export interface StudioShared3dPreviewOmission {
  readonly code:
    | "avatar-forge"
    | "costume"
    | "mannequin-material"
    | "physics"
    | "props"
    | "rig-constraints"
    | "scene-props"
    | "surface-paint"
    | "wardrobe";
  readonly label: string;
}

export interface StudioShared3dCharacterCompatibility {
  /** Character documents are linked, never converted into the background schema. */
  readonly roundTrip: "source-authority-preserved";
  readonly supportedPreview: readonly string[];
  /** These fields remain byte-safe in the source VRM document but are not rendered by this slice. */
  readonly previewOmissions: readonly StudioShared3dPreviewOmission[];
}

export interface StudioShared3dCharacterSource {
  readonly elementId: string;
  /** SHA-256 of the complete canonical VRM scene document. */
  readonly sourceHash: `sha256:${string}`;
  /** Changes only when the linked VRM model identity changes, not for pose or stage placement. */
  readonly modelRuntimeKey: string;
  /** Runtime-only content revision identity; never persisted as an attachment or project key. */
  readonly runtimeKey: string;
  /** Optimistic generation for the effective Stage-local placement only. */
  readonly placementHash: `sha256:${string}`;
  readonly placementAuthority: "source-authority" | "stage-override";
  readonly stageTransform: StudioShared3dCharacterStageTransform;
  readonly stageId?: string;
  readonly label: string;
  readonly scene: StudioVrmSceneDocument;
  readonly compatibility: StudioShared3dCharacterCompatibility;
}

export type StudioShared3dCharacterRuntimeStatus =
  | "loading"
  | "ready"
  | "unavailable";

/** Conservative VRM rest/pose envelope used only to fit a shared background shadow camera. */
export const STUDIO_SHARED_3D_CHARACTER_SHADOW_LOCAL_BOUNDS = Object.freeze({
  min: Object.freeze([-0.72, -0.08, -0.48] as const),
  max: Object.freeze([0.72, 2.35, 0.48] as const),
});

/** Renderer-neutral shadow entity for one linked character. */
export function createStudioShared3dCharacterShadowEntity(
  character: StudioShared3dCharacterSource,
) {
  const transform = studioShared3dCharacterWorldTransform(
    character.scene,
    character.stageTransform,
  );
  return Object.freeze({
    id: `shared-vrm-${character.elementId}`,
    position: transform.position,
    rotation: transform.rotation,
    scale: transform.scale,
    visible: true,
    localBounds: STUDIO_SHARED_3D_CHARACTER_SHADOW_LOCAL_BOUNDS,
  });
}

export interface StudioShared3dCaptureReadiness {
  readonly phase: "loading" | "ready" | "unavailable";
  /** Full-fidelity characters that may be baked and whose source raster may then be hidden. */
  readonly capturableElementIds: readonly string[];
  /** Visible in the stage, but excluded from capture because this slice cannot render every field. */
  readonly previewOnlyElementIds: readonly string[];
}

export interface StudioShared3dSceneSession {
  readonly kind: typeof STUDIO_SHARED_3D_SCENE_SESSION_KIND;
  readonly version: typeof STUDIO_SHARED_3D_SCENE_SESSION_VERSION;
  /**
   * The background editor owns camera, lights, environment and background objects. Each entry
   * below keeps its own canonical VRM authority for model, pose and expression data.
   */
  readonly authority: "background-stage-with-linked-character-sources";
  readonly characters: readonly StudioShared3dCharacterSource[];
  readonly omittedCharacterCount: number;
}

export interface StudioShared3dCharacterWorldTransform {
  readonly position: StudioVrmVec3;
  readonly rotation: StudioVrmVec3;
  readonly scale: StudioVrmVec3;
}

export interface StudioShared3dCharacterStageTransform {
  readonly position: StudioVrmVec3;
  /** Character-root yaw in canonical radians. */
  readonly rotationY: number;
}

export interface StudioShared3dCharacterTransformUpdateRequest {
  readonly elementId: string;
  /** Optimistic-concurrency token from the currently rendered shared-scene session. */
  readonly expectedRuntimeKey: string;
  /** Prevents an old panel from overwriting a newer placement without reloading the model. */
  readonly expectedPlacementHash?: `sha256:${string}`;
  readonly transform: StudioShared3dCharacterStageTransform;
}

export interface StudioShared3dCharacterTransformReceipt {
  readonly kind: typeof STUDIO_SHARED_3D_CHARACTER_TRANSFORM_RECEIPT_KIND;
  readonly version: typeof STUDIO_SHARED_3D_CHARACTER_TRANSFORM_RECEIPT_VERSION;
  readonly elementId: string;
  readonly beforeSourceHash: `sha256:${string}`;
  readonly afterSourceHash: `sha256:${string}`;
  readonly beforeRuntimeKey: string;
  readonly afterRuntimeKey: string;
  readonly authority?: "source-authority" | "stage-override";
  readonly stageId?: string;
  readonly beforePlacementHash?: `sha256:${string}`;
  readonly afterPlacementHash?: `sha256:${string}`;
  readonly transform: StudioShared3dCharacterStageTransform;
}

export type StudioShared3dCharacterTransformCommitResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly receipt: StudioShared3dCharacterTransformReceipt;
    }
  | {
      readonly ok: false;
      readonly code:
        | "invalid-request"
        | "locked-source"
        | "missing-source"
        | "stale-source"
        | "commit-rejected";
      readonly message: string;
    };

export type StudioShared3dCharacterTransformCommitHandler = (
  request: StudioShared3dCharacterTransformUpdateRequest,
) => StudioShared3dCharacterTransformCommitResult;

export interface StudioShared3dSourceLayer {
  readonly id: string;
  readonly type: string;
  readonly vrmScene?: StudioVrmSceneDocument;
  readonly hidden?: boolean;
}

export type StudioShared3dSourceLayerVisibilityPlan<T extends StudioShared3dSourceLayer> =
  | {
      readonly ok: true;
      readonly nextElements: readonly T[];
      readonly hiddenElementIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export type StudioShared3dCharacterTransformPlan<T extends StudioShared3dSourceLayer> =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly nextElements: readonly T[];
      readonly receipt: StudioShared3dCharacterTransformReceipt;
    }
  | Exclude<StudioShared3dCharacterTransformCommitResult, { readonly ok: true }>;

const SAFE_ELEMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const FORBIDDEN_IDS = new Set(["__proto__", "constructor", "prototype"]);
const PREVIEW_SUPPORTED = Object.freeze([
  "모델 참조",
  "몸·손가락 포즈",
  "루트 위치·회전",
  "표정",
  "체형 배율",
  "기본 색·MToon 재질 효과",
] as const);

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) return true;
  }
  return false;
}

function safeElementId(value: unknown): string | null {
  if (typeof value !== "string" || containsControlCharacter(value)) return null;
  if (!SAFE_ELEMENT_ID_PATTERN.test(value) || FORBIDDEN_IDS.has(value.toLowerCase())) return null;
  return value;
}

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string" || containsControlCharacter(value)) return fallback;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized ? Array.from(normalized).slice(0, 80).join("") : fallback;
}

function canonicalScene(scene: unknown): StudioVrmSceneDocument | null {
  const serialized = serializeStudioVrmSceneDocument(scene);
  return serialized ? parseStudioVrmSceneDocument(serialized) : null;
}

function sha256Text(value: string): `sha256:${string}` {
  return `sha256:${sha256HexPortable(new TextEncoder().encode(value))}`;
}

export function parseStudioShared3dCharacterStageTransform(
  value: unknown,
): StudioShared3dCharacterStageTransform | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const candidate = value as Record<string, unknown>;
    const keys = Object.keys(candidate);
    if (
      keys.length !== 2
      || !Object.hasOwn(candidate, "position")
      || !Object.hasOwn(candidate, "rotationY")
      || keys.some((key) => key !== "position" && key !== "rotationY")
    ) return null;
    const rawPosition = candidate.position;
    const rawRotationY = candidate.rotationY;
    if (!Array.isArray(rawPosition)) return null;
    const length = rawPosition.length;
    if (length !== 3) return null;
    const position = [rawPosition[0], rawPosition[1], rawPosition[2]];
    if (
      rawPosition.length !== length
      || Object.keys(rawPosition).some((key) => key !== "0" && key !== "1" && key !== "2")
      || typeof rawRotationY !== "number"
    ) {
      return null;
    }
    const [x, y, z] = position;
    const rotationY = rawRotationY;
    if (
      !position.every((component) => typeof component === "number" && Number.isFinite(component))
      || !Number.isFinite(rotationY)
      || x! < -10 || x! > 10
      || y! < -10 || y! > 10
      || z! < -10 || z! > 10
      || rotationY < -Math.PI || rotationY > Math.PI
    ) return null;
    return Object.freeze({
      position: Object.freeze(position.map((component) => Object.is(component, -0)
        ? 0
        : component)) as StudioVrmVec3,
      rotationY: Object.is(rotationY, -0) ? 0 : rotationY,
    });
  } catch {
    return null;
  }
}

export function studioShared3dCharacterStageTransformHash(
  value: StudioShared3dCharacterStageTransform,
): `sha256:${string}` {
  return sha256Text(JSON.stringify({
    position: value.position,
    rotationY: value.rotationY,
  }));
}

function hasCanonicalContent(value: StudioVrmCanonicalData): boolean {
  if (value === null || value === false || value === "" || value === 0) return false;
  if (Array.isArray(value)) return value.some(hasCanonicalContent);
  if (typeof value === "object") {
    return Object.values(value).some(hasCanonicalContent);
  }
  return true;
}

function canonicalDataText(value: unknown): string | null {
  const serialized = JSON.stringify(value, (_key, nested) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([left], [right]) =>
          left.localeCompare(right),
        ))
      : nested,
  );
  return typeof serialized === "string" ? serialized : null;
}

const NEUTRAL_AVATAR_FORGE_TEXT = canonicalDataText(createAvatarForgeState());

function hasNonNeutralAvatarForge(value: StudioVrmCanonicalData): boolean {
  if (!hasCanonicalContent(value)) return false;
  const serialized = canonicalDataText(value);
  return serialized === null || serialized !== NEUTRAL_AVATAR_FORGE_TEXT;
}

function hasNonDefaultPhysics(scene: StudioVrmSceneDocument): boolean {
  const { physics } = scene;
  return physics.stiffnessScale !== 1 || physics.gravityScale !== 1 ||
    physics.windDirectionDeg !== 0 || physics.windStrength !== 0;
}

export function inspectStudioShared3dCharacterCompatibility(
  scene: StudioVrmSceneDocument,
): StudioShared3dCharacterCompatibility {
  const omissions: StudioShared3dPreviewOmission[] = [];
  if (hasNonNeutralAvatarForge(scene.appearance.avatarForge)) {
    omissions.push({ code: "avatar-forge", label: "아바타 포지 체형 세부값" });
  }
  if (hasCanonicalContent(scene.appearance.costume)) {
    omissions.push({ code: "costume", label: "의상 조립 상태" });
  }
  if (scene.appearance.mannequin) {
    omissions.push({ code: "mannequin-material", label: "마네킹 재질 모드" });
  }
  if (hasNonDefaultPhysics(scene)) {
    omissions.push({ code: "physics", label: "머리카락·의상 물리 미리보기" });
  }
  if (hasCanonicalContent(scene.props)) {
    omissions.push({ code: "props", label: "손에 든 소품" });
  }
  if (scene.pose.ikConstraints.length > 0) {
    omissions.push({ code: "rig-constraints", label: "실시간 IK 고정점" });
  }
  if (hasCanonicalContent(scene.sceneProps)) {
    omissions.push({ code: "scene-props", label: "캐릭터 포저 장면 소품" });
  }
  if (scene.surfacePaint.textures.length > 0) {
    omissions.push({ code: "surface-paint", label: "표면 페인트 텍스처" });
  }
  if (hasCanonicalContent(scene.appearance.wardrobe)) {
    omissions.push({ code: "wardrobe", label: "옷장 레이어 상태" });
  }
  return Object.freeze({
    roundTrip: "source-authority-preserved" as const,
    supportedPreview: PREVIEW_SUPPORTED,
    previewOmissions: Object.freeze(omissions),
  });
}

/**
 * Creates a bounded, runtime-only composition. It deliberately retains canonical VRM documents
 * instead of projecting them into BG3D model nodes, so opening and closing the combined stage
 * cannot silently lose a pose, expression, attachment hash, or future VRM field.
 */
export function createStudioShared3dSceneSession(
  inputs: readonly StudioShared3dCharacterInput[],
): StudioShared3dSceneSession {
  const seen = new Set<string>();
  const characters: StudioShared3dCharacterSource[] = [];
  let validInputCount = 0;

  for (const input of inputs) {
    const elementId = safeElementId(input?.elementId);
    const scene = canonicalScene(input?.scene);
    const explicitStageTransform = input?.stageTransform === undefined
      ? null
      : parseStudioShared3dCharacterStageTransform(input.stageTransform);
    const stageId = input?.stageId === undefined ? null : safeElementId(input.stageId);
    if (
      !elementId
      || !scene
      || seen.has(elementId)
      || (input?.stageTransform !== undefined && !explicitStageTransform)
      || (input?.stageId !== undefined && !stageId)
    ) continue;
    validInputCount += 1;
    seen.add(elementId);
    if (characters.length >= STUDIO_SHARED_3D_MAX_CHARACTERS) continue;
    const canonicalJson = serializeStudioVrmSceneDocument(scene);
    if (!canonicalJson) continue;
    const sourceHash = sha256Text(canonicalJson);
    const modelHash = sha256Text(JSON.stringify(scene.model));
    const sourceWorld = studioShared3dCharacterWorldTransform(scene);
    const stageTransform = explicitStageTransform ?? Object.freeze({
      position: sourceWorld.position,
      rotationY: sourceWorld.rotation[1],
    });
    characters.push(Object.freeze({
      elementId,
      sourceHash,
      modelRuntimeKey: `${elementId}:${modelHash}`,
      runtimeKey: `${elementId}:${sourceHash}`,
      placementHash: studioShared3dCharacterStageTransformHash(stageTransform),
      placementAuthority: explicitStageTransform
        ? "stage-override" as const
        : "source-authority" as const,
      stageTransform,
      ...(stageId ? { stageId } : {}),
      label: safeLabel(input.label, scene.model.name || "3D 캐릭터"),
      scene,
      compatibility: inspectStudioShared3dCharacterCompatibility(scene),
    }));
  }

  return Object.freeze({
    kind: STUDIO_SHARED_3D_SCENE_SESSION_KIND,
    version: STUDIO_SHARED_3D_SCENE_SESSION_VERSION,
    authority: "background-stage-with-linked-character-sources",
    characters: Object.freeze(characters),
    omittedCharacterCount: Math.max(0, validInputCount - characters.length),
  });
}

/** Selects only live VRM image authorities from the active Studio page. */
export function createStudioShared3dSceneSessionFromElements(
  elements: readonly StudioShared3dElementSource[],
  options?: {
    readonly stageId?: string;
    readonly placements?: ReadonlyMap<string, StudioShared3dCharacterStageTransform>;
  },
): StudioShared3dSceneSession {
  return createStudioShared3dSceneSession(elements.flatMap((element) =>
    element.type === "image" && element.vrmScene
      ? [{
          elementId: element.id,
          label: element.name || element.vrmScene.model.name,
          scene: element.vrmScene,
          ...(options?.placements?.has(element.id)
            ? { stageTransform: options.placements.get(element.id)! }
            : {}),
          ...(options?.stageId ? { stageId: options.stageId } : {}),
        }]
      : [],
  ));
}

/**
 * Unlinked/new Stage drafts may preview only sources that are actually visible on the canvas.
 * A layer inside a hidden folder is hidden even when its own `hidden` flag is false.
 */
export function selectStudioShared3dVisibleSceneElements<
  T extends StudioShared3dElementSource,
>(elements: readonly T[], groups: LayerGroup[]): readonly T[] {
  return elements.filter((element) => !isEffectivelyHidden(element, groups));
}

export function inspectStudioShared3dCaptureReadiness(
  session: StudioShared3dSceneSession | undefined,
  statuses: Readonly<Record<string, StudioShared3dCharacterRuntimeStatus | undefined>>,
): StudioShared3dCaptureReadiness {
  let hasLoading = false;
  let hasUnavailable = false;
  const capturableElementIds: string[] = [];
  const previewOnlyElementIds: string[] = [];
  for (const character of session?.characters ?? []) {
    const status = statuses[character.runtimeKey];
    if (status === "unavailable") {
      hasUnavailable = true;
      continue;
    }
    if (status !== "ready") {
      hasLoading = true;
      continue;
    }
    if (character.compatibility.previewOmissions.length > 0) {
      previewOnlyElementIds.push(character.elementId);
    } else {
      capturableElementIds.push(character.elementId);
    }
  }
  return Object.freeze({
    phase: hasUnavailable ? "unavailable" : hasLoading ? "loading" : "ready",
    capturableElementIds: Object.freeze(capturableElementIds),
    previewOnlyElementIds: Object.freeze(previewOnlyElementIds),
  });
}

/**
 * Non-destructive 2D handoff after a successful shared capture. Every receipt id must still point
 * to one unlocked canonical VRM image. Any stale, duplicate, unavailable or malformed source makes
 * the whole plan fail without hiding a single layer.
 */
export function planStudioShared3dCapturedSourceLayerVisibility<
  T extends StudioShared3dSourceLayer,
>(input: {
  readonly elements: readonly T[];
  readonly capturedElementIds: readonly string[];
  readonly isLocked: (element: T) => boolean;
  /** Exact receipt-owned sources already hidden by another Stage need no visibility mutation. */
  readonly reusableHiddenElementIds?: ReadonlySet<string>;
}): StudioShared3dSourceLayerVisibilityPlan<T> {
  const { elements, capturedElementIds, isLocked, reusableHiddenElementIds } = input;
  if (
    capturedElementIds.length > STUDIO_SHARED_3D_MAX_CHARACTERS ||
    new Set(capturedElementIds).size !== capturedElementIds.length ||
    capturedElementIds.some((id) => !safeElementId(id))
  ) {
    return Object.freeze({
      ok: false as const,
      message: "연결 캐릭터 캡처 확인 정보가 올바르지 않아 원본 레이어를 유지했어요.",
    });
  }

  const captured = new Set(capturedElementIds);
  for (const id of captured) {
    const matches = elements.filter((element) => element.id === id);
    const source = matches[0];
    if (
      matches.length !== 1 ||
      !source ||
      source.type !== "image" ||
      !source.vrmScene ||
      !canonicalScene(source.vrmScene) ||
      (
        isLocked(source)
        && !(source.hidden === true && reusableHiddenElementIds?.has(id))
      )
    ) {
      return Object.freeze({
        ok: false as const,
        message: "연결된 3D 캐릭터 레이어가 바뀌었거나 잠겨 있어 원본을 숨기지 않았어요.",
      });
    }
  }

  const hiddenElementIds: string[] = [];
  const nextElements = elements.map((element) => {
    if (!captured.has(element.id) || element.hidden === true) return element;
    hiddenElementIds.push(element.id);
    return { ...element, hidden: true };
  });
  return Object.freeze({
    ok: true as const,
    nextElements: Object.freeze(nextElements),
    hiddenElementIds: Object.freeze(hiddenElementIds),
  });
}

function invalidTransformRequest(
  message: string,
): StudioShared3dCharacterTransformPlan<never> {
  return Object.freeze({
    ok: false as const,
    code: "invalid-request" as const,
    message,
  });
}

/**
 * Plans one source-authority writeback for a character moved inside the shared BG3D stage.
 *
 * The optimistic runtime key binds the edit to the exact canonical scene shown to the user. Only
 * root X/Z, the historical vertical root and character yaw are replaced; pose bones, expressions,
 * Avatar Forge, wardrobe, props, surface paint, physics and model provenance remain byte-stable.
 */
export function planStudioShared3dCharacterTransformUpdate<
  T extends StudioShared3dSourceLayer,
>(input: {
  readonly elements: readonly T[];
  readonly request: StudioShared3dCharacterTransformUpdateRequest;
  readonly isLocked: (element: T) => boolean;
}): StudioShared3dCharacterTransformPlan<T> {
  const { elements, request, isLocked } = input;
  const elementId = safeElementId(request?.elementId);
  if (
    !elementId
    || typeof request?.expectedRuntimeKey !== "string"
    || request.expectedRuntimeKey.length === 0
    || request.expectedRuntimeKey.length > 256
    || !request.transform
    || !parseStudioShared3dCharacterStageTransform(request.transform)
  ) {
    return invalidTransformRequest(
      "캐릭터 위치·높이·방향 값이 안전 범위를 벗어나 원본을 바꾸지 않았어요.",
    );
  }

  const matches = elements.filter((element) => element.id === elementId);
  const sourceElement = matches[0];
  if (
    matches.length !== 1
    || !sourceElement
    || sourceElement.type !== "image"
    || !sourceElement.vrmScene
  ) {
    return Object.freeze({
      ok: false as const,
      code: "missing-source" as const,
      message: "연결된 캐릭터 원본 레이어를 정확히 찾지 못해 배치를 적용하지 않았어요.",
    });
  }
  if (isLocked(sourceElement)) {
    return Object.freeze({
      ok: false as const,
      code: "locked-source" as const,
      message: "캐릭터 원본 레이어가 잠겨 있어 배치를 바꾸지 않았어요. 레이어 잠금을 먼저 해제해 주세요.",
    });
  }

  const beforeScene = canonicalScene(sourceElement.vrmScene);
  if (!beforeScene) {
    return Object.freeze({
      ok: false as const,
      code: "missing-source" as const,
      message: "캐릭터 원본 문서를 검증하지 못해 배치를 적용하지 않았어요.",
    });
  }
  const beforeSession = createStudioShared3dSceneSession([
    { elementId, scene: beforeScene },
  ]);
  const beforeSource = beforeSession.characters[0];
  if (!beforeSource || beforeSource.runtimeKey !== request.expectedRuntimeKey) {
    return Object.freeze({
      ok: false as const,
      code: "stale-source" as const,
      message: "캐릭터 원본이 미리보기 이후 바뀌어 오래된 배치를 적용하지 않았어요. 현재 값을 다시 확인해 주세요.",
    });
  }
  if (
    request.expectedPlacementHash !== undefined
    && request.expectedPlacementHash !== beforeSource.placementHash
  ) {
    return Object.freeze({
      ok: false as const,
      code: "stale-source" as const,
      message: "캐릭터 배치가 미리보기 이후 바뀌어 오래된 값을 적용하지 않았어요. 현재 값을 다시 확인해 주세요.",
    });
  }

  const parsedTransform = parseStudioShared3dCharacterStageTransform(request.transform)!;
  const [x, y, z] = parsedTransform.position;
  const afterScene = canonicalScene({
    ...beforeScene,
    pose: {
      ...beforeScene.pose,
      yOffset: y,
      bodyRotationY: parsedTransform.rotationY,
      translations: {
        ...beforeScene.pose.translations,
        root: [x, 0, z],
      },
    },
  });
  if (!afterScene) {
    return invalidTransformRequest(
      "캐릭터 배치 결과를 검증하지 못해 원본을 바꾸지 않았어요.",
    );
  }
  const afterSession = createStudioShared3dSceneSession([
    { elementId, scene: afterScene },
  ]);
  const afterSource = afterSession.characters[0];
  if (!afterSource) {
    return invalidTransformRequest(
      "캐릭터 배치 결과의 원본 연결 정보를 만들지 못했어요.",
    );
  }
  const transform: StudioShared3dCharacterStageTransform = Object.freeze({
    position: Object.freeze([
      afterScene.pose.translations.root[0],
      afterScene.pose.yOffset,
      afterScene.pose.translations.root[2],
    ]) as StudioVrmVec3,
    rotationY: afterScene.pose.bodyRotationY,
  });
  const receipt: StudioShared3dCharacterTransformReceipt = Object.freeze({
    kind: STUDIO_SHARED_3D_CHARACTER_TRANSFORM_RECEIPT_KIND,
    version: STUDIO_SHARED_3D_CHARACTER_TRANSFORM_RECEIPT_VERSION,
    elementId,
    beforeSourceHash: beforeSource.sourceHash,
    afterSourceHash: afterSource.sourceHash,
    beforeRuntimeKey: beforeSource.runtimeKey,
    afterRuntimeKey: afterSource.runtimeKey,
    authority: "source-authority" as const,
    beforePlacementHash: beforeSource.placementHash,
    afterPlacementHash: studioShared3dCharacterStageTransformHash(transform),
    transform,
  });
  const changed = beforeSource.sourceHash !== afterSource.sourceHash;
  if (!changed) {
    return Object.freeze({
      ok: true as const,
      changed: false,
      nextElements: elements,
      receipt,
    });
  }

  const nextElements = elements.map((element): T =>
    element === sourceElement
      ? ({ ...element, vrmScene: afterScene } as T)
      : element,
  );
  return Object.freeze({
    ok: true as const,
    changed: true,
    nextElements: Object.freeze(nextElements),
    receipt,
  });
}

/** World-space approximation shared by the renderer and shadow-frustum planner. */
export function studioShared3dCharacterWorldTransform(
  scene: StudioVrmSceneDocument,
  stageTransform?: StudioShared3dCharacterStageTransform,
): StudioShared3dCharacterWorldTransform {
  const root = scene.pose.translations.root;
  const width = scene.appearance.bodyScale.width;
  const height = scene.appearance.bodyScale.height;
  return Object.freeze({
    position: stageTransform?.position
      ?? Object.freeze([root[0], scene.pose.yOffset, root[2]]) as StudioVrmVec3,
    rotation: Object.freeze([
      0,
      stageTransform?.rotationY ?? scene.pose.bodyRotationY,
      0,
    ]) as StudioVrmVec3,
    scale: Object.freeze([width, height, width]) as StudioVrmVec3,
  });
}
