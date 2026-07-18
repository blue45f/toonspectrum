/**
 * Engine-neutral, persistence-safe scene document for the Studio VRM poser.
 *
 * Three.js/React objects, VRM binary bytes, Blob/File values, object URLs, remote URLs, and
 * IndexedDB keys deliberately stay outside this contract. Uploaded models are addressed only by
 * immutable attachment metadata; the runtime must resolve and verify their bytes separately.
 */

export const STUDIO_VRM_SCENE_DOCUMENT_KIND = "studio-vrm-scene" as const;
export const STUDIO_VRM_SCENE_DOCUMENT_VERSION = 1 as const;
export const STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES = 128 * 1024;
/** Matches the default project-archive per-attachment ceiling so every accepted scene is portable. */
export const STUDIO_VRM_MODEL_MAX_BYTES = 96 * 1024 * 1024;
export const STUDIO_VRM_MAX_POSE_BONES = 64;
export const STUDIO_VRM_MAX_FINGER_BONES = 32;
export const STUDIO_VRM_MAX_EXPRESSIONS = 64;

const MAX_WORLD_COORDINATE = 10_000;
const MAX_DATA_DEPTH = 8;
const MAX_DATA_NODES = 1_024;
const MAX_DATA_ARRAY_ITEMS = 128;
const MAX_DATA_OBJECT_KEYS = 128;
const MAX_DATA_KEY_LENGTH = 64;
const MAX_DATA_STRING_LENGTH = 1_024;
const MAX_SAFE_GRAPH_DEPTH = 16;
const MAX_SAFE_GRAPH_NODES = 8_192;
const MAX_SAFE_GRAPH_ARRAY_ITEMS = 1_024;
const MAX_SAFE_GRAPH_OBJECT_KEYS = 1_024;
const MAX_RENDER_PIXELS = 33_554_432;
const UTF8_ENCODER = new TextEncoder();
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_DATA_KEY_PATTERN = /^[\p{L}\p{N}_. -]{1,64}$/u;
const CSS_HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const UNSAFE_REFERENCE_PATTERN = /^(?:data|blob|https?|file|javascript|vbscript):|^\/\//i;
const UNSAFE_REFERENCE_KEY_PATTERN = /(?:^|_)(?:url|uri|href|src)$|(?:url|uri)$/i;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export type StudioVrmVec3 = readonly [number, number, number];

export const STUDIO_VRM_HUMANOID_BONES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftEye",
  "rightEye",
  "jaw",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
] as const;

export const STUDIO_VRM_FINGER_BONES = [
  "leftThumbMetacarpal",
  "leftThumbProximal",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightThumbMetacarpal",
  "rightThumbProximal",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
] as const;

export type StudioVrmHumanoidBoneName = (typeof STUDIO_VRM_HUMANOID_BONES)[number];
export type StudioVrmFingerBoneName = (typeof STUDIO_VRM_FINGER_BONES)[number];

export interface StudioVrmBundledModel {
  readonly source: "bundled";
  readonly id: string;
  readonly name: string;
}

export interface StudioVrmAttachmentModel {
  readonly source: "attachment";
  /** Lowercase `sha256:` followed by exactly 64 hexadecimal characters. */
  readonly hash: string;
  readonly byteSize: number;
  readonly mime: "model/vrm" | "model/gltf-binary";
  readonly name: string;
}

export type StudioVrmSceneModel = StudioVrmBundledModel | StudioVrmAttachmentModel;

/** Rotation-only subset of `PoseBoneMap`; direction targets are resolved at the runtime boundary. */
export interface StudioVrmPoseBone {
  readonly rotation: StudioVrmVec3;
}

export type StudioVrmPoseBoneMap = Partial<
  Record<StudioVrmHumanoidBoneName, StudioVrmPoseBone>
>;
export type StudioVrmFingerRotationMap = Partial<
  Record<StudioVrmFingerBoneName, StudioVrmVec3>
>;

export interface StudioVrmPoseState {
  readonly bones: StudioVrmPoseBoneMap;
  readonly yOffset: number;
  /** Character-root yaw, in canonical radians `[-PI, PI)`. */
  readonly bodyRotationY: number;
  readonly fingerOverrides: StudioVrmFingerRotationMap;
}

export interface StudioVrmCameraSettings {
  readonly projection: "perspective";
  readonly position: StudioVrmVec3;
  readonly target: StudioVrmVec3;
  readonly up: StudioVrmVec3;
  readonly fovDegrees: number;
  readonly near: number;
  readonly far: number;
}

export interface StudioVrmBodyScale {
  readonly height: number;
  readonly width: number;
}

export interface StudioVrmMaterialFx {
  readonly shadeColor: string | null;
  readonly outlineColor: string | null;
  readonly rimColor: string | null;
  readonly rimIntensity: number;
  readonly emissiveColor: string | null;
  readonly emissiveIntensity: number;
}

export type StudioVrmCanonicalData =
  | null
  | boolean
  | number
  | string
  | readonly StudioVrmCanonicalData[]
  | { readonly [key: string]: StudioVrmCanonicalData };

export interface StudioVrmAppearanceSettings {
  readonly bodyScale: StudioVrmBodyScale;
  readonly customColors: Readonly<Record<string, string>>;
  readonly materialFx: StudioVrmMaterialFx;
  readonly mannequin: boolean;
  readonly avatarForge: StudioVrmCanonicalData;
  readonly costume: StudioVrmCanonicalData;
  readonly wardrobe: StudioVrmCanonicalData;
}

export interface StudioVrmLightingSettings {
  readonly intensity: number;
  readonly colorTemp: number;
  readonly directionDeg: number;
}

export interface StudioVrmPhysicsSettings {
  readonly version: 1;
  readonly stiffnessScale: number;
  readonly gravityScale: number;
  readonly windDirectionDeg: number;
  readonly windStrength: number;
}

export type StudioVrmEnvironment = "none" | "floor" | "wall" | "room" | "outdoor";

export interface StudioVrmRenderSettings {
  readonly width: number;
  readonly height: number;
  readonly transparentBackground: boolean;
  readonly backgroundColor: string;
}

export interface StudioVrmSceneDocument {
  readonly kind: typeof STUDIO_VRM_SCENE_DOCUMENT_KIND;
  readonly version: typeof STUDIO_VRM_SCENE_DOCUMENT_VERSION;
  readonly model: StudioVrmSceneModel;
  readonly pose: StudioVrmPoseState;
  readonly expressions: Readonly<Record<string, number>>;
  readonly camera: StudioVrmCameraSettings;
  readonly appearance: StudioVrmAppearanceSettings;
  readonly props: StudioVrmCanonicalData;
  readonly sceneProps: StudioVrmCanonicalData;
  readonly lighting: StudioVrmLightingSettings;
  readonly physics: StudioVrmPhysicsSettings;
  readonly env: StudioVrmEnvironment;
  readonly render: StudioVrmRenderSettings;
}

export interface StudioVrmBundledModelDescriptor {
  readonly id: string;
  readonly name: string;
}

export interface StudioVrmLegacyMigrationOptions {
  /** Authoritative bundled registry. IndexedDB ids must never be placed in this list. */
  readonly bundledModels?: readonly StudioVrmBundledModelDescriptor[];
}

export type StudioVrmLegacyMetadataMigration =
  | { readonly status: "resolved"; readonly document: StudioVrmSceneDocument }
  | {
      readonly status: "unresolved-model";
      readonly modelId: string | null;
      readonly modelName: string | null;
    };

export type StudioVrmLegacyFragmentMigration =
  | {
      readonly status: "resolved";
      /** The original PNG data URL with its metadata fragment removed. */
      readonly rasterSrc: string;
      readonly document: StudioVrmSceneDocument;
    }
  | {
      readonly status: "unresolved-model";
      readonly rasterSrc: string;
      readonly modelId: string | null;
      readonly modelName: string | null;
    };

const HUMANOID_BONE_SET = new Set<string>(STUDIO_VRM_HUMANOID_BONES);
const FINGER_BONE_SET = new Set<string>(STUDIO_VRM_FINGER_BONES);
const ENVIRONMENT_SET = new Set<string>(["none", "floor", "wall", "room", "outdoor"]);

function isStudioVrmHumanoidBoneName(value: string): value is StudioVrmHumanoidBoneName {
  return HUMANOID_BONE_SET.has(value);
}

function isStudioVrmFingerBoneName(value: string): value is StudioVrmFingerBoneName {
  return FINGER_BONE_SET.has(value);
}

function isStudioVrmEnvironment(value: unknown): value is StudioVrmEnvironment {
  return typeof value === "string" && ENVIRONMENT_SET.has(value);
}

const DEFAULT_RAW_DOCUMENT: StudioVrmSceneDocument = {
  kind: STUDIO_VRM_SCENE_DOCUMENT_KIND,
  version: STUDIO_VRM_SCENE_DOCUMENT_VERSION,
  model: { source: "bundled", id: "sample-vrm", name: "루미" },
  pose: { bones: {}, yOffset: 0, bodyRotationY: 0, fingerOverrides: {} },
  expressions: {},
  camera: {
    projection: "perspective",
    position: [0, 1.42, 3.15],
    target: [0, 1.22, 0],
    up: [0, 1, 0],
    fovDegrees: 30,
    near: 0.1,
    far: 100,
  },
  appearance: {
    bodyScale: { height: 1, width: 1 },
    customColors: {},
    materialFx: {
      shadeColor: null,
      outlineColor: null,
      rimColor: null,
      rimIntensity: 0,
      emissiveColor: null,
      emissiveIntensity: 0,
    },
    mannequin: false,
    avatarForge: null,
    costume: null,
    wardrobe: null,
  },
  props: null,
  sceneProps: null,
  lighting: { intensity: 1, colorTemp: 0.5, directionDeg: 45 },
  physics: {
    version: 1,
    stiffnessScale: 1,
    gravityScale: 1,
    windDirectionDeg: 0,
    windStrength: 0,
  },
  env: "none",
  render: {
    width: 1024,
    height: 1024,
    transparentBackground: true,
    backgroundColor: "#ffffff",
  },
};

const CURRENT_ROOT_KEYS = new Set([
  "kind",
  "version",
  "model",
  "pose",
  "expressions",
  "camera",
  "appearance",
  "props",
  "sceneProps",
  "lighting",
  "physics",
  "env",
  "render",
]);

const LEGACY_ROOT_KEYS = new Set([
  "tool",
  "poseId",
  "expressionId",
  "yOffset",
  "bodyRotationY",
  "bones",
  "expressionWeights",
  "customColors",
  "materialFx",
  "modelName",
  "modelId",
  "bodyScale",
  "fingerOverrides",
  "lighting",
  "env",
  "avatarForge",
  "vrmProps",
  "props",
  "sceneProps",
  "costume",
  "wardrobe",
  "physics",
  "mannequin",
  "transparentBackground",
  "renderWidth",
  "renderHeight",
]);

interface SafeCloneState {
  readonly seen: WeakSet<object>;
  nodes: number;
}

interface CanonicalDataState {
  nodes: number;
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeCloneDataGraph(
  value: unknown,
  state: SafeCloneState,
  depth = 0
): unknown | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : undefined;
  if (typeof value !== "object" || depth > MAX_SAFE_GRAPH_DEPTH) return undefined;
  if (state.seen.has(value) || state.nodes >= MAX_SAFE_GRAPH_NODES) return undefined;
  state.seen.add(value);
  state.nodes += 1;

  try {
    const symbols = Object.getOwnPropertySymbols(value);
    if (symbols.length > 0) return undefined;
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) return undefined;
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !("value" in lengthDescriptor)) return undefined;
      const length = lengthDescriptor.value;
      if (
        typeof length !== "number" ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > MAX_SAFE_GRAPH_ARRAY_ITEMS
      ) return undefined;
      const keys = Object.keys(descriptors).filter((key) => key !== "length");
      if (keys.length !== length) return undefined;
      const result: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
        const child = safeCloneDataGraph(descriptor.value, state, depth + 1);
        if (child === undefined) return undefined;
        result.push(child);
      }
      return result;
    }

    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const keys = Object.keys(descriptors);
    if (keys.length > MAX_SAFE_GRAPH_OBJECT_KEYS) return undefined;
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
      const child = safeCloneDataGraph(descriptor.value, state, depth + 1);
      if (child === undefined) return undefined;
      Object.defineProperty(result, key, {
        value: child,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  } catch {
    return undefined;
  }
}

function decodeBoundedDataGraph(raw: unknown): unknown | null {
  let decoded: unknown;
  try {
    if (typeof raw === "string") {
      if (utf8ByteLength(raw) > STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES) return null;
      decoded = JSON.parse(raw);
    } else {
      decoded = raw;
    }
  } catch {
    return null;
  }
  const detached = safeCloneDataGraph(decoded, { seen: new WeakSet(), nodes: 0 });
  if (detached === undefined) return null;
  try {
    const serialized = JSON.stringify(detached);
    return utf8ByteLength(serialized) <= STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES ? detached : null;
  } catch {
    return null;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  const children = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  for (const child of children) deepFreeze(child);
  return Object.freeze(value);
}

function jsonStructuresEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => jsonStructuresEqual(item, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && jsonStructuresEqual(left[key], right[key])
  );
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const bounded = Math.min(maximum, Math.max(minimum, value));
  return Object.is(bounded, -0) ? 0 : bounded;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.round(boundedNumber(value, fallback, minimum, maximum));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function normalizeSafeText(value: unknown, fallback: string, maximumLength = 128): string {
  if (typeof value !== "string" || containsControlCharacter(value)) return fallback;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    !normalized ||
    Array.from(normalized).length > maximumLength ||
    UNSAFE_REFERENCE_PATTERN.test(normalized)
  ) return fallback;
  return normalized;
}

function normalizeSafeId(value: unknown, fallback: string): string {
  if (
    typeof value !== "string" ||
    !SAFE_ID_PATTERN.test(value) ||
    FORBIDDEN_KEYS.has(value.toLowerCase()) ||
    UNSAFE_REFERENCE_PATTERN.test(value)
  ) return fallback;
  return value;
}

function normalizeCssHex(value: unknown, fallback: string): string {
  return typeof value === "string" && CSS_HEX_PATTERN.test(value) ? value.toLowerCase() : fallback;
}

function normalizeNullableCssHex(value: unknown): string | null {
  return typeof value === "string" && CSS_HEX_PATTERN.test(value) ? value.toLowerCase() : null;
}

function normalizeVec3(
  value: unknown,
  fallback: StudioVrmVec3,
  minimum = -MAX_WORLD_COORDINATE,
  maximum = MAX_WORLD_COORDINATE
): StudioVrmVec3 {
  if (!Array.isArray(value) || value.length !== 3) return [fallback[0], fallback[1], fallback[2]];
  return [
    boundedNumber(value[0], fallback[0], minimum, maximum),
    boundedNumber(value[1], fallback[1], minimum, maximum),
    boundedNumber(value[2], fallback[2], minimum, maximum),
  ];
}

function normalizeRotationAngle(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value >= -Math.PI && value < Math.PI) return Object.is(value, -0) ? 0 : value;
  const wrapped = ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function normalizeRotation(value: unknown): StudioVrmVec3 {
  if (!Array.isArray(value) || value.length !== 3) return [0, 0, 0];
  return [
    normalizeRotationAngle(value[0]),
    normalizeRotationAngle(value[1]),
    normalizeRotationAngle(value[2]),
  ];
}

function normalizeUnitVec3(value: unknown, fallback: StudioVrmVec3): StudioVrmVec3 {
  const vector = normalizeVec3(value, fallback, -1_000, 1_000);
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length < 0.000_001) return [fallback[0], fallback[1], fallback[2]];
  if (Math.abs(length - 1) <= 1e-12) return vector;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function normalizeModel(value: unknown): StudioVrmSceneModel {
  if (!isRecord(value)) return { ...DEFAULT_RAW_DOCUMENT.model };
  if (value.source === "attachment") {
    const hash = typeof value.hash === "string" && HASH_PATTERN.test(value.hash)
      ? value.hash
      : "";
    if (!hash) return { ...DEFAULT_RAW_DOCUMENT.model };
    return {
      source: "attachment",
      hash,
      byteSize: boundedInteger(value.byteSize, 1, 1, STUDIO_VRM_MODEL_MAX_BYTES),
      mime: value.mime === "model/vrm" ? "model/vrm" : "model/gltf-binary",
      name: normalizeSafeText(value.name, "VRM 모델"),
    };
  }
  if (value.source === "bundled") {
    return {
      source: "bundled",
      id: normalizeSafeId(value.id, DEFAULT_RAW_DOCUMENT.model.source === "bundled"
        ? DEFAULT_RAW_DOCUMENT.model.id
        : "sample-vrm"),
      name: normalizeSafeText(value.name, "루미"),
    };
  }
  return { ...DEFAULT_RAW_DOCUMENT.model };
}

function normalizePoseBones(value: unknown): StudioVrmPoseBoneMap {
  if (!isRecord(value)) return {};
  const result: StudioVrmPoseBoneMap = {};
  for (const key of Object.keys(value).sort()) {
    if (Object.keys(result).length >= STUDIO_VRM_MAX_POSE_BONES || !isStudioVrmHumanoidBoneName(key)) continue;
    const bone = value[key];
    if (!isRecord(bone) || !hasOwn(bone, "rotation")) continue;
    result[key] = { rotation: normalizeRotation(bone.rotation) };
  }
  return result;
}

function normalizeFingerOverrides(value: unknown): StudioVrmFingerRotationMap {
  if (!isRecord(value)) return {};
  const result: StudioVrmFingerRotationMap = {};
  for (const key of Object.keys(value).sort()) {
    if (Object.keys(result).length >= STUDIO_VRM_MAX_FINGER_BONES || !isStudioVrmFingerBoneName(key)) continue;
    result[key] = normalizeRotation(value[key]);
  }
  return result;
}

function normalizePose(value: unknown): StudioVrmPoseState {
  const candidate = isRecord(value) ? value : {};
  return {
    bones: normalizePoseBones(candidate.bones),
    yOffset: boundedNumber(candidate.yOffset, 0, -10, 10),
    bodyRotationY: normalizeRotationAngle(candidate.bodyRotationY),
    fingerOverrides: normalizeFingerOverrides(candidate.fingerOverrides),
  };
}

function normalizeExpressions(value: unknown): Readonly<Record<string, number>> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const key of Object.keys(value).sort()) {
    if (Object.keys(result).length >= STUDIO_VRM_MAX_EXPRESSIONS) break;
    if (
      !SAFE_DATA_KEY_PATTERN.test(key) ||
      FORBIDDEN_KEYS.has(key.toLowerCase()) ||
      UNSAFE_REFERENCE_KEY_PATTERN.test(key) ||
      typeof value[key] !== "number" ||
      !Number.isFinite(value[key])
    ) continue;
    result[key] = boundedNumber(value[key], 0, 0, 1);
  }
  return result;
}

function normalizeCamera(value: unknown): StudioVrmCameraSettings {
  const candidate = isRecord(value) ? value : {};
  const fallback = DEFAULT_RAW_DOCUMENT.camera;
  let position = normalizeVec3(candidate.position, fallback.position);
  const target = normalizeVec3(candidate.target, fallback.target);
  if (Math.hypot(
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2]
  ) < 0.001) position = [...fallback.position];
  let up = normalizeUnitVec3(candidate.up, fallback.up);
  const viewX = target[0] - position[0];
  const viewY = target[1] - position[1];
  const viewZ = target[2] - position[2];
  const crossLength = Math.hypot(
    viewY * up[2] - viewZ * up[1],
    viewZ * up[0] - viewX * up[2],
    viewX * up[1] - viewY * up[0]
  );
  if (crossLength < 0.000_001) up = [...fallback.up];
  const near = boundedNumber(candidate.near, fallback.near, 0.001, 10);
  let far = boundedNumber(candidate.far, fallback.far, 0.01, 100_000);
  if (far <= near) far = Math.min(100_000, Math.max(fallback.far, near + 0.01));
  return {
    projection: "perspective",
    position,
    target,
    up,
    fovDegrees: boundedNumber(candidate.fovDegrees, fallback.fovDegrees, 5, 150),
    near,
    far,
  };
}

function normalizeCanonicalData(
  value: unknown,
  state: CanonicalDataState,
  depth = 0
): StudioVrmCanonicalData | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "string") {
    if (
      Array.from(value).length > MAX_DATA_STRING_LENGTH ||
      containsControlCharacter(value) ||
      UNSAFE_REFERENCE_PATTERN.test(value.trim())
    ) return undefined;
    return value;
  }
  if (depth >= MAX_DATA_DEPTH || state.nodes >= MAX_DATA_NODES) return undefined;
  state.nodes += 1;
  if (Array.isArray(value)) {
    if (value.length > MAX_DATA_ARRAY_ITEMS) return undefined;
    const result: StudioVrmCanonicalData[] = [];
    for (const item of value) {
      const normalized = normalizeCanonicalData(item, state, depth + 1);
      if (normalized === undefined) return undefined;
      result.push(normalized);
    }
    return result;
  }
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value).sort();
  if (keys.length > MAX_DATA_OBJECT_KEYS) return undefined;
  const result: Record<string, StudioVrmCanonicalData> = {};
  for (const key of keys) {
    if (
      !SAFE_DATA_KEY_PATTERN.test(key) ||
      Array.from(key).length > MAX_DATA_KEY_LENGTH ||
      FORBIDDEN_KEYS.has(key.toLowerCase()) ||
      UNSAFE_REFERENCE_KEY_PATTERN.test(key)
    ) return undefined;
    const normalized = normalizeCanonicalData(value[key], state, depth + 1);
    if (normalized === undefined) return undefined;
    result[key] = normalized;
  }
  return result;
}

function normalizedDataOrNull(value: unknown): StudioVrmCanonicalData {
  return normalizeCanonicalData(value, { nodes: 0 }) ?? null;
}

function normalizeCustomColors(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const key of Object.keys(value).sort()) {
    if (Object.keys(result).length >= 32) break;
    if (
      !SAFE_DATA_KEY_PATTERN.test(key) ||
      FORBIDDEN_KEYS.has(key.toLowerCase()) ||
      UNSAFE_REFERENCE_KEY_PATTERN.test(key) ||
      typeof value[key] !== "string" ||
      !CSS_HEX_PATTERN.test(value[key])
    ) continue;
    result[key] = value[key].toLowerCase();
  }
  return result;
}

function normalizeMaterialFx(value: unknown): StudioVrmMaterialFx {
  const candidate = isRecord(value) ? value : {};
  return {
    shadeColor: normalizeNullableCssHex(candidate.shadeColor),
    outlineColor: normalizeNullableCssHex(candidate.outlineColor),
    rimColor: normalizeNullableCssHex(candidate.rimColor),
    rimIntensity: boundedNumber(candidate.rimIntensity, 0, 0, 1),
    emissiveColor: normalizeNullableCssHex(candidate.emissiveColor),
    emissiveIntensity: boundedNumber(candidate.emissiveIntensity, 0, 0, 1),
  };
}

function normalizeAppearance(value: unknown): StudioVrmAppearanceSettings {
  const candidate = isRecord(value) ? value : {};
  const bodyScale = isRecord(candidate.bodyScale) ? candidate.bodyScale : {};
  return {
    bodyScale: {
      height: boundedNumber(bodyScale.height, 1, 0.5, 1.6),
      width: boundedNumber(bodyScale.width, 1, 0.5, 1.6),
    },
    customColors: normalizeCustomColors(candidate.customColors),
    materialFx: normalizeMaterialFx(candidate.materialFx),
    mannequin: normalizeBoolean(candidate.mannequin, false),
    avatarForge: normalizedDataOrNull(candidate.avatarForge),
    costume: normalizedDataOrNull(candidate.costume),
    wardrobe: normalizedDataOrNull(candidate.wardrobe),
  };
}

function normalizeLighting(value: unknown): StudioVrmLightingSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    intensity: boundedNumber(candidate.intensity, 1, 0.1, 4),
    colorTemp: boundedNumber(candidate.colorTemp, 0.5, 0, 1),
    directionDeg: boundedNumber(candidate.directionDeg, 45, -180, 180),
  };
}

function normalizePhysics(value: unknown): StudioVrmPhysicsSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    version: 1,
    stiffnessScale: boundedNumber(candidate.stiffnessScale, 1, 0, 2),
    gravityScale: boundedNumber(candidate.gravityScale, 1, 0, 2),
    windDirectionDeg: boundedNumber(candidate.windDirectionDeg, 0, -180, 180),
    windStrength: boundedNumber(candidate.windStrength, 0, 0, 2),
  };
}

function normalizeRender(value: unknown): StudioVrmRenderSettings {
  const candidate = isRecord(value) ? value : {};
  let width = boundedInteger(candidate.width, 1024, 64, 8192);
  let height = boundedInteger(candidate.height, 1024, 64, 8192);
  if (width * height > MAX_RENDER_PIXELS) {
    const ratio = Math.sqrt(MAX_RENDER_PIXELS / (width * height));
    width = Math.max(64, Math.floor(width * ratio));
    height = Math.max(64, Math.floor(height * ratio));
  }
  return {
    width,
    height,
    transparentBackground: normalizeBoolean(candidate.transparentBackground, true),
    backgroundColor: normalizeCssHex(candidate.backgroundColor, "#ffffff"),
  };
}

function normalizeDecodedCurrentDocument(value: unknown): StudioVrmSceneDocument | null {
  if (
    !isRecord(value) ||
    value.kind !== STUDIO_VRM_SCENE_DOCUMENT_KIND ||
    value.version !== STUDIO_VRM_SCENE_DOCUMENT_VERSION
  ) return null;
  const document: StudioVrmSceneDocument = {
    kind: STUDIO_VRM_SCENE_DOCUMENT_KIND,
    version: STUDIO_VRM_SCENE_DOCUMENT_VERSION,
    model: normalizeModel(value.model),
    pose: normalizePose(value.pose),
    expressions: normalizeExpressions(value.expressions),
    camera: normalizeCamera(value.camera),
    appearance: normalizeAppearance(value.appearance),
    props: normalizedDataOrNull(value.props),
    sceneProps: normalizedDataOrNull(value.sceneProps),
    lighting: normalizeLighting(value.lighting),
    physics: normalizePhysics(value.physics),
    env: isStudioVrmEnvironment(value.env) ? value.env : "none",
    render: normalizeRender(value.render),
  };
  return deepFreeze(document);
}

function strictDecodedCurrentDocument(value: unknown): StudioVrmSceneDocument | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== CURRENT_ROOT_KEYS.size || keys.some((key) => !CURRENT_ROOT_KEYS.has(key))) {
    return null;
  }
  const normalized = normalizeDecodedCurrentDocument(value);
  if (!normalized || !jsonStructuresEqual(value, normalized)) return null;
  try {
    return utf8ByteLength(JSON.stringify(normalized)) <= STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES
      ? normalized
      : null;
  } catch {
    return null;
  }
}

/** Returns a new, deeply frozen default scene document on every call. */
export function createDefaultStudioVrmSceneDocument(): StudioVrmSceneDocument {
  const decoded = decodeBoundedDataGraph(DEFAULT_RAW_DOCUMENT);
  const document = strictDecodedCurrentDocument(decoded);
  if (!document) throw new Error("Invalid internal Studio VRM scene defaults.");
  return document;
}

/** Creates a default scene with a validated model descriptor. */
export function createStudioVrmSceneDocument(model?: StudioVrmSceneModel): StudioVrmSceneDocument {
  return normalizeStudioVrmSceneDocument({
    ...DEFAULT_RAW_DOCUMENT,
    model: model ?? DEFAULT_RAW_DOCUMENT.model,
  });
}

export const DEFAULT_STUDIO_VRM_SCENE_DOCUMENT = createDefaultStudioVrmSceneDocument();

/**
 * Lenient editor normalizer. Invalid roots, future versions, accessors, cycles, and oversized input
 * reset to a fresh default; persistence must use the strict parse/serialize functions below.
 */
export function normalizeStudioVrmSceneDocument(raw: unknown): StudioVrmSceneDocument {
  const decoded = decodeBoundedDataGraph(raw);
  return normalizeDecodedCurrentDocument(decoded) ?? createDefaultStudioVrmSceneDocument();
}

/** Parses only complete, losslessly canonical version-1 documents. */
export function parseStudioVrmSceneDocument(raw: string): StudioVrmSceneDocument | null {
  return strictDecodedCurrentDocument(decodeBoundedDataGraph(raw));
}

/** Serializes only complete, losslessly canonical version-1 documents. */
export function serializeStudioVrmSceneDocument(raw: unknown): string | null {
  const document = strictDecodedCurrentDocument(decodeBoundedDataGraph(raw));
  if (!document) return null;
  try {
    const serialized = JSON.stringify(document);
    return utf8ByteLength(serialized) <= STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES
      ? serialized
      : null;
  } catch {
    return null;
  }
}

function readLegacyBundledModel(
  value: Record<string, unknown>,
  options: StudioVrmLegacyMigrationOptions
): StudioVrmBundledModel | null {
  const modelId = typeof value.modelId === "string" ? value.modelId : null;
  if (!modelId) return null;
  const registry = options.bundledModels ?? [{ id: "sample-vrm", name: "루미" }];
  const match = registry.find((entry) => entry.id === modelId);
  if (!match) return null;
  const id = normalizeSafeId(match.id, "");
  const name = normalizeSafeText(match.name, "", 128);
  return id && name ? { source: "bundled", id, name } : null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function migrateDecodedLegacyMetadata(
  value: unknown,
  options: StudioVrmLegacyMigrationOptions
): StudioVrmLegacyMetadataMigration | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, LEGACY_ROOT_KEYS) ||
    (hasOwn(value, "tool") && value.tool !== "vrm-poser") ||
    hasOwn(value, "kind") ||
    hasOwn(value, "version")
  ) return null;
  const bundledModel = readLegacyBundledModel(value, options);
  if (!bundledModel) {
    return deepFreeze({
      status: "unresolved-model",
      modelId: typeof value.modelId === "string" ? value.modelId : null,
      modelName: typeof value.modelName === "string"
        ? normalizeSafeText(value.modelName, "") || null
        : null,
    });
  }
  const vrmProps = value.vrmProps !== undefined ? value.vrmProps : value.props;
  const candidate: StudioVrmSceneDocument = {
    ...DEFAULT_RAW_DOCUMENT,
    model: bundledModel,
    pose: normalizePose({
      bones: value.bones,
      yOffset: value.yOffset,
      bodyRotationY: value.bodyRotationY,
      fingerOverrides: value.fingerOverrides,
    }),
    expressions: normalizeExpressions(value.expressionWeights),
    appearance: normalizeAppearance({
      bodyScale: value.bodyScale,
      customColors: value.customColors,
      materialFx: value.materialFx,
      mannequin: value.mannequin,
      avatarForge: value.avatarForge,
      costume: value.costume,
      wardrobe: value.wardrobe,
    }),
    props: normalizedDataOrNull(vrmProps),
    sceneProps: normalizedDataOrNull(value.sceneProps),
    lighting: normalizeLighting(value.lighting),
    physics: normalizePhysics(value.physics),
    env: isStudioVrmEnvironment(value.env) ? value.env : "none",
    render: normalizeRender({
      width: value.renderWidth,
      height: value.renderHeight,
      transparentBackground: value.transparentBackground,
      backgroundColor: "#ffffff",
    }),
  };
  const serialized = serializeStudioVrmSceneDocument(candidate);
  const document = serialized ? parseStudioVrmSceneDocument(serialized) : null;
  return document ? deepFreeze({ status: "resolved", document }) : null;
}

/**
 * Migrates a canonical scene or a legacy PNG-fragment metadata object. Legacy local-library ids
 * intentionally return null unless the id appears in the explicit bundled registry.
 */
export function migrateStudioVrmSceneDocument(
  raw: unknown,
  options: StudioVrmLegacyMigrationOptions = {}
): StudioVrmSceneDocument | null {
  const decoded = decodeBoundedDataGraph(raw);
  const current = strictDecodedCurrentDocument(decoded);
  if (current) return current;
  const migrated = migrateDecodedLegacyMetadata(decoded, options);
  return migrated?.status === "resolved" ? migrated.document : null;
}

/** Detailed legacy migration for callers that need to surface an unresolved local-model state. */
export function migrateStudioVrmLegacyMetadata(
  raw: unknown,
  options: StudioVrmLegacyMigrationOptions = {}
): StudioVrmLegacyMetadataMigration | null {
  return migrateDecodedLegacyMetadata(decodeBoundedDataGraph(raw), options);
}

/**
 * Splits a legacy captured PNG data URL from its URL-encoded JSON fragment and safely migrates the
 * metadata. The returned raster source never retains the fragment. Raster bytes are not decoded.
 */
export function parseStudioVrmLegacyFragment(
  src: string,
  options: StudioVrmLegacyMigrationOptions = {}
): StudioVrmLegacyFragmentMigration | null {
  if (typeof src !== "string") return null;
  const hashIndex = src.indexOf("#");
  if (hashIndex <= 0) return null;
  const rasterSrc = src.slice(0, hashIndex);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/i.test(rasterSrc)) return null;
  const encodedFragment = src.slice(hashIndex + 1);
  if (!encodedFragment || utf8ByteLength(encodedFragment) > STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES * 3) {
    return null;
  }
  let json: string;
  try {
    json = decodeURIComponent(encodedFragment);
  } catch {
    return null;
  }
  if (utf8ByteLength(json) > STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES) return null;
  const migration = migrateStudioVrmLegacyMetadata(json, options);
  if (!migration) return null;
  return migration.status === "resolved"
    ? deepFreeze({ status: "resolved", rasterSrc, document: migration.document })
    : deepFreeze({
        status: "unresolved-model",
        rasterSrc,
        modelId: migration.modelId,
        modelName: migration.modelName,
      });
}

/** Canonical semantic equality independent of object identity and key insertion order. */
export function areStudioVrmSceneDocumentsEqual(left: unknown, right: unknown): boolean {
  const leftSerialized = serializeStudioVrmSceneDocument(left);
  return leftSerialized !== null && leftSerialized === serializeStudioVrmSceneDocument(right);
}

/** Returns whether a canonical scene contains authoring intent beyond the fresh default. */
export function studioVrmSceneHasContent(raw: unknown): boolean {
  const serialized = serializeStudioVrmSceneDocument(raw);
  if (!serialized) return false;
  return serialized !== serializeStudioVrmSceneDocument(DEFAULT_STUDIO_VRM_SCENE_DOCUMENT);
}
