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
export const STUDIO_SHARED_3D_SCENE_SESSION_VERSION = 1 as const;

export interface StudioShared3dCharacterInput {
  readonly elementId: string;
  readonly label?: string;
  readonly scene: StudioVrmSceneDocument;
}

export interface StudioShared3dElementSource {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
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
  /** Runtime-only revision identity; never persisted as an attachment or project key. */
  readonly runtimeKey: string;
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
  const transform = studioShared3dCharacterWorldTransform(character.scene);
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

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hasCanonicalContent(value: StudioVrmCanonicalData): boolean {
  if (value === null || value === false || value === "" || value === 0) return false;
  if (Array.isArray(value)) return value.some(hasCanonicalContent);
  if (typeof value === "object") {
    return Object.values(value).some(hasCanonicalContent);
  }
  return true;
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
  if (hasCanonicalContent(scene.appearance.avatarForge)) {
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
    if (!elementId || !scene || seen.has(elementId)) continue;
    validInputCount += 1;
    seen.add(elementId);
    if (characters.length >= STUDIO_SHARED_3D_MAX_CHARACTERS) continue;
    const canonicalJson = serializeStudioVrmSceneDocument(scene);
    if (!canonicalJson) continue;
    characters.push(Object.freeze({
      elementId,
      runtimeKey: `${elementId}:${fnv1a32(canonicalJson)}`,
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
): StudioShared3dSceneSession {
  return createStudioShared3dSceneSession(elements.flatMap((element) =>
    element.type === "image" && element.vrmScene
      ? [{
          elementId: element.id,
          label: element.name || element.vrmScene.model.name,
          scene: element.vrmScene,
        }]
      : [],
  ));
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
}): StudioShared3dSourceLayerVisibilityPlan<T> {
  const { elements, capturedElementIds, isLocked } = input;
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
      isLocked(source)
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

/** World-space approximation shared by the renderer and shadow-frustum planner. */
export function studioShared3dCharacterWorldTransform(
  scene: StudioVrmSceneDocument,
): StudioShared3dCharacterWorldTransform {
  const root = scene.pose.translations.root;
  const width = scene.appearance.bodyScale.width;
  const height = scene.appearance.bodyScale.height;
  return Object.freeze({
    position: Object.freeze([root[0], scene.pose.yOffset, root[2]]) as StudioVrmVec3,
    rotation: Object.freeze([0, scene.pose.bodyRotationY, 0]) as StudioVrmVec3,
    scale: Object.freeze([width, height, width]) as StudioVrmVec3,
  });
}
