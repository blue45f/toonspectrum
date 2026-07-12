/**
 * Engine-neutral, persistence-safe document for Studio's 3D background editor.
 *
 * Runtime objects, engine classes, Blob/File values, object URLs, remote URLs, storage keys, and
 * credentials are deliberately outside this schema. Model binaries are resolved by attachment id
 * at the runtime boundary; this document stores only bounded GLB metadata and scene intent.
 */

export const STUDIO_BG3D_SCENE_DOCUMENT_KIND = "toonspectrum.bg3d-scene" as const;
export const STUDIO_BG3D_SCENE_DOCUMENT_VERSION = 1 as const;
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES = 256 * 1024;
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES = 512;
export const STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS = 64;
export const STUDIO_BG3D_GLB_MIME = "model/gltf-binary" as const;
export const STUDIO_BG3D_GLB_MAX_BYTES = 100 * 1024 * 1024;

export type StudioBg3dVec3 = readonly [number, number, number];

export const STUDIO_BG3D_PRIMITIVE_KINDS = [
  "box",
  "cylinder",
  "plane",
  "sphere",
  "hemisphere",
  "cone",
  "pyramid",
  "triangularPrism",
  "hexPrism",
  "torus",
  "tube",
  "ring",
  "capsule",
] as const;

export type StudioBg3dPrimitiveKind = (typeof STUDIO_BG3D_PRIMITIVE_KINDS)[number];
export type StudioBg3dBackgroundMode = "color" | "sky-preset" | "transparent";
export type StudioBg3dSkyPresetId = "blank" | "clear_day" | "sunset" | "night";
export type StudioBg3dToneMapping = "none" | "neutral" | "aces";
export type StudioBg3dToneMode = "none" | "flat" | "cel" | "screentone";
export type StudioBg3dLineLayerType = "raster" | "vector";
export type StudioBg3dToneOutputType = "color" | "grayscale" | "pattern";
export type StudioBg3dTonePattern = "dot" | "line" | "crosshatch" | "noise";
export type StudioBg3dAttachmentSource = "upload" | "local-library" | "bundled";
export type StudioBg3dRightsStatus = "owned" | "licensed" | "public-domain" | "unknown";

export interface StudioBg3dTransform {
  readonly position: StudioBg3dVec3;
  /** Euler XYZ radians, normalized to [-PI, PI]. */
  readonly rotation: StudioBg3dVec3;
  readonly scale: StudioBg3dVec3;
}

export interface StudioBg3dCameraSettings {
  readonly position: StudioBg3dVec3;
  readonly target: StudioBg3dVec3;
  readonly fovDegrees: number;
}

export interface StudioBg3dRenderSettings {
  readonly antialias: boolean;
  readonly shadows: boolean;
  readonly exposure: number;
  readonly toneMapping: StudioBg3dToneMapping;
  readonly colorSpace: "srgb";
}

export interface StudioBg3dBackgroundSettings {
  readonly mode: StudioBg3dBackgroundMode;
  readonly color: string;
  readonly skyPresetId: StudioBg3dSkyPresetId;
}

export interface StudioBg3dDirectionalLightSettings {
  readonly color: string;
  /** Unit vector from the lit subject toward the light. */
  readonly direction: StudioBg3dVec3;
  readonly intensity: number;
  readonly castsShadow: boolean;
}

export interface StudioBg3dLightingSettings {
  readonly ambientColor: string;
  readonly ambientIntensity: number;
  readonly key: StudioBg3dDirectionalLightSettings;
  readonly fill: StudioBg3dDirectionalLightSettings;
}

export interface StudioBg3dQualityProfile {
  readonly targetFps: number;
  readonly dprMin: number;
  readonly dprMax: number;
  readonly maxRenderPixels: number;
  readonly shadows: boolean;
  readonly shadowMapSize: 256 | 512 | 1024 | 2048 | 4096;
  readonly textureScale: number;
  readonly lodBias: number;
}

export interface StudioBg3dQualityProfiles {
  readonly desktop: StudioBg3dQualityProfile;
  readonly mobile: StudioBg3dQualityProfile;
}

export interface StudioBg3dLineOutputSettings {
  readonly enabled: boolean;
  readonly layerType: StudioBg3dLineLayerType;
  readonly color: string;
  readonly widthPx: number;
  readonly strength: number;
  readonly accuracy: number;
  readonly scaleAwareAccuracy: boolean;
  readonly exteriorOutlineStrength: number;
  readonly depthEnabled: boolean;
  readonly depthStrength: number;
  readonly depthOutlineOnly: boolean;
  readonly smoothing: number;
  readonly textureLineEnabled: boolean;
  readonly textureLineStrength: number;
  readonly creaseAngleDegrees: number;
  readonly hiddenLineRemoval: boolean;
}

export interface StudioBg3dToneOutputSettings {
  readonly mode: StudioBg3dToneMode;
  readonly type: StudioBg3dToneOutputType;
  readonly pattern: StudioBg3dTonePattern;
  readonly levels: number;
  readonly opacity: number;
  readonly frequency: number;
  readonly angleDegrees: number;
}

export interface StudioBg3dOutputSettings {
  readonly transparentBackground: boolean;
  readonly exportHeight: number;
  readonly line: StudioBg3dLineOutputSettings;
  readonly tone: StudioBg3dToneOutputSettings;
}

export interface StudioBg3dComplexityBudget {
  readonly maxNodes: number;
  readonly maxTriangles: number;
  readonly maxDrawCalls: number;
  readonly maxMaterials: number;
  readonly maxLights: number;
  readonly maxModelBytes: number;
}

export interface StudioBg3dTextureBudget {
  readonly maxTextures: number;
  readonly maxTotalBytes: number;
  readonly maxDimension: number;
}

export interface StudioBg3dSceneBudgets {
  readonly complexity: StudioBg3dComplexityBudget;
  readonly textures: StudioBg3dTextureBudget;
}

export interface StudioBg3dAttachmentRights {
  readonly status: StudioBg3dRightsStatus;
  readonly commercialUse: boolean;
  readonly attributionRequired: boolean;
  readonly attribution?: string;
  readonly licenseName?: string;
}

export interface StudioBg3dModelAttachment {
  readonly id: string;
  readonly name: string;
  readonly mime: typeof STUDIO_BG3D_GLB_MIME;
  readonly byteSize: number;
  /** Lowercase `sha256:` followed by exactly 64 hexadecimal characters. */
  readonly hash: string;
  readonly rights: StudioBg3dAttachmentRights;
  readonly source: StudioBg3dAttachmentSource;
}

/**
 * Input contract for the runtime GLB trust boundary. The verifier implementation lives outside
 * this persistence module. It must immediately copy `bytes`, then verify the exact response MIME,
 * metadata byte length, SHA-256, GLB `glTF` magic, version 2, header-declared length, and the
 * cumulative byte limit before handing the owned copy to an engine parser.
 */
export interface StudioBg3dGlbVerificationRequest {
  readonly attachment: StudioBg3dModelAttachment;
  readonly bytes: Uint8Array;
  readonly responseMime: string;
  readonly cumulativeResolvedBytes: number;
  readonly maxCumulativeResolvedBytes: number;
}

/** A successful verifier result; `verifiedBytes` must be the verifier-owned defensive copy. */
export interface StudioBg3dGlbVerificationSuccess {
  readonly ok: true;
  readonly attachmentId: string;
  readonly verifiedBytes: Uint8Array;
  readonly byteSize: number;
  readonly computedHash: string;
  readonly glbVersion: 2;
  readonly nextCumulativeResolvedBytes: number;
}

export type StudioBg3dGlbVerificationFailureCode =
  | "invalid-request"
  | "mime-mismatch"
  | "byte-size-mismatch"
  | "cumulative-byte-budget-exceeded"
  | "invalid-glb-header"
  | "unsupported-glb-version"
  | "declared-length-mismatch"
  | "sha256-mismatch"
  | "digest-unavailable";

export interface StudioBg3dGlbVerificationFailure {
  readonly ok: false;
  readonly code: StudioBg3dGlbVerificationFailureCode;
}

export type StudioBg3dGlbVerificationResult =
  | StudioBg3dGlbVerificationSuccess
  | StudioBg3dGlbVerificationFailure;

/**
 * Engine-reported metrics that must be checked after GLB parsing and before scene admission.
 * Counts are totals for the resolved asset, including generated primitives and decoded textures.
 */
export interface StudioBg3dParsedGlbMetrics {
  readonly nodes: number;
  readonly triangles: number;
  readonly drawCalls: number;
  readonly materials: number;
  readonly lights: number;
  readonly textures: number;
  readonly textureBytes: number;
  readonly maxTextureDimension: number;
}

/**
 * Post-parse admission contract. The runtime validator must reject non-safe/non-negative metrics,
 * then compare nodes, triangles, draw calls, materials, and lights to `budgets.complexity`, plus
 * texture count, decoded texture bytes, and maximum dimension to `budgets.textures`. This check is
 * intentionally after engine parsing; file byte size is not a proxy for decoded scene complexity.
 */
export interface StudioBg3dPostParseBudgetRequest {
  readonly metrics: StudioBg3dParsedGlbMetrics;
  readonly budgets: StudioBg3dSceneBudgets;
}

export interface StudioBg3dLegacyMigrationOptions {
  /**
   * Explicit bridge from an old IndexedDB storage key to a newly issued logical attachment id.
   * A mapping whose value equals its key is rejected, and the mapped id must resolve to canonical
   * attachment metadata in the legacy payload. Storage keys never enter the persisted document.
   */
  readonly attachmentIdByLegacyStorageKey?: ReadonlyMap<string, string>;
}

interface StudioBg3dSceneNodeBase {
  readonly id: string;
  readonly name: string;
  readonly transform: StudioBg3dTransform;
  readonly visible: boolean;
  readonly castsShadow: boolean;
  readonly receivesShadow: boolean;
}

export interface StudioBg3dPrimitiveNode extends StudioBg3dSceneNodeBase {
  readonly kind: "primitive";
  readonly primitiveKind: StudioBg3dPrimitiveKind;
  readonly color: string;
}

export interface StudioBg3dModelNode extends StudioBg3dSceneNodeBase {
  readonly kind: "model";
  readonly attachmentId: string;
}

export type StudioBg3dSceneNode = StudioBg3dPrimitiveNode | StudioBg3dModelNode;

export interface StudioBg3dSceneDocument {
  readonly kind: typeof STUDIO_BG3D_SCENE_DOCUMENT_KIND;
  readonly version: typeof STUDIO_BG3D_SCENE_DOCUMENT_VERSION;
  readonly camera: StudioBg3dCameraSettings;
  readonly render: StudioBg3dRenderSettings;
  readonly background: StudioBg3dBackgroundSettings;
  readonly lighting: StudioBg3dLightingSettings;
  readonly quality: StudioBg3dQualityProfiles;
  readonly output: StudioBg3dOutputSettings;
  readonly budgets: StudioBg3dSceneBudgets;
  readonly attachments: readonly StudioBg3dModelAttachment[];
  readonly nodes: readonly StudioBg3dSceneNode[];
}

const DEFAULT_CAMERA_POSITION: StudioBg3dVec3 = [4, 3, 6];
const DEFAULT_CAMERA_TARGET: StudioBg3dVec3 = [0, 0.6, 0];
const DEFAULT_ROTATION: StudioBg3dVec3 = [0, 0, 0];
const DEFAULT_SCALE: StudioBg3dVec3 = [1, 1, 1];
const MAX_WORLD_COORDINATE = 10_000;
const MIN_SCALE = 0.001;
const MAX_SCALE = 1_000;
const MAX_TEXT_LENGTH = 160;
const MAX_NODE_NAME_LENGTH = 80;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const HEX_COLOR_PATTERN = /^#[a-f0-9]{6}$/iu;
const EXTERNAL_REFERENCE_PATTERN = /(?:\b(?:blob|data|file|https?):|:\/\/|\bwww\.)/iu;
const SENSITIVE_REFERENCE_PATTERN =
  /(?:\b(?:api[-_ ]?key|access[-_ ]?token|secret|password)\b|(?:^|\s)sk-[A-Za-z0-9_-]{8,})/iu;
const FORBIDDEN_ID_SET = new Set(["constructor", "prototype", "__proto__"]);
const PRIMITIVE_KIND_SET = new Set<string>(STUDIO_BG3D_PRIMITIVE_KINDS);
const BACKGROUND_MODE_SET = new Set<string>(["color", "sky-preset", "transparent"]);
const SKY_PRESET_SET = new Set<string>(["blank", "clear_day", "sunset", "night"]);
const TONE_MAPPING_SET = new Set<string>(["none", "neutral", "aces"]);
const TONE_MODE_SET = new Set<string>(["none", "flat", "cel", "screentone"]);
const LINE_LAYER_TYPE_SET = new Set<string>(["raster", "vector"]);
const TONE_OUTPUT_TYPE_SET = new Set<string>(["color", "grayscale", "pattern"]);
const TONE_PATTERN_SET = new Set<string>(["dot", "line", "crosshatch", "noise"]);
const ATTACHMENT_SOURCE_SET = new Set<string>(["upload", "local-library", "bundled"]);
const RIGHTS_STATUS_SET = new Set<string>(["owned", "licensed", "public-domain", "unknown"]);
const SHADOW_MAP_SIZES = [256, 512, 1024, 2048, 4096] as const;
const UTF8_ENCODER = new TextEncoder();

const DEFAULT_RAW_DOCUMENT = {
  kind: STUDIO_BG3D_SCENE_DOCUMENT_KIND,
  version: STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
  camera: {
    position: DEFAULT_CAMERA_POSITION,
    target: DEFAULT_CAMERA_TARGET,
    fovDegrees: 50,
  },
  render: {
    antialias: true,
    shadows: true,
    exposure: 1,
    toneMapping: "neutral",
    colorSpace: "srgb",
  },
  background: {
    mode: "sky-preset",
    color: "#ffffff",
    skyPresetId: "blank",
  },
  lighting: {
    ambientColor: "#ffffff",
    ambientIntensity: 0.75,
    key: {
      color: "#ffffff",
      direction: [4, 6, 4],
      intensity: 1.1,
      castsShadow: true,
    },
    fill: {
      color: "#ffffff",
      direction: [-4, 3, -3],
      intensity: 0.35,
      castsShadow: false,
    },
  },
  quality: {
    desktop: {
      targetFps: 60,
      dprMin: 1,
      dprMax: 2,
      maxRenderPixels: 8_294_400,
      shadows: true,
      shadowMapSize: 2048,
      textureScale: 1,
      lodBias: 0,
    },
    mobile: {
      targetFps: 30,
      dprMin: 0.75,
      dprMax: 1.5,
      maxRenderPixels: 2_073_600,
      shadows: false,
      shadowMapSize: 1024,
      textureScale: 0.5,
      lodBias: 1,
    },
  },
  output: {
    transparentBackground: false,
    exportHeight: 640,
    line: {
      enabled: true,
      layerType: "raster",
      color: "#000000",
      widthPx: 1,
      strength: 0.8,
      accuracy: 0.75,
      scaleAwareAccuracy: true,
      exteriorOutlineStrength: 1,
      depthEnabled: false,
      depthStrength: 0.5,
      depthOutlineOnly: true,
      smoothing: 0.5,
      textureLineEnabled: true,
      textureLineStrength: 0.5,
      creaseAngleDegrees: 20,
      hiddenLineRemoval: true,
    },
    tone: {
      // A 3D background should look like the shaded viewport when it is first inserted. Earlier
      // defaults disabled this layer, so the LT exporter truthfully emitted only edge rasters and
      // users saw an apparently broken wireframe. Dedicated line-art presets can still opt into
      // `none`; the general-purpose default preserves the rendered material colors.
      mode: "flat",
      type: "color",
      pattern: "dot",
      levels: 4,
      opacity: 1,
      frequency: 60,
      angleDegrees: 45,
    },
  },
  budgets: {
    complexity: {
      maxNodes: 256,
      maxTriangles: 2_000_000,
      maxDrawCalls: 512,
      maxMaterials: 256,
      maxLights: 4,
      maxModelBytes: 256 * 1024 * 1024,
    },
    textures: {
      maxTextures: 128,
      maxTotalBytes: 256 * 1024 * 1024,
      maxDimension: 4096,
    },
  },
  attachments: [],
  nodes: [],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Persistence requires every version-1 root section even though the public normalizer is lenient. */
function hasCompleteCurrentRootShape(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    value.kind === STUDIO_BG3D_SCENE_DOCUMENT_KIND &&
    value.version === STUDIO_BG3D_SCENE_DOCUMENT_VERSION &&
    isRecord(value.camera) &&
    isRecord(value.render) &&
    isRecord(value.background) &&
    isRecord(value.lighting) &&
    isRecord(value.quality) &&
    isRecord(value.output) &&
    isRecord(value.budgets) &&
    Array.isArray(value.attachments) &&
    Array.isArray(value.nodes)
  );
}

function isExplicitUnversionedLegacyRoot(
  value: unknown
): value is Record<string, unknown> & { readonly primitives: readonly unknown[] } {
  return (
    isRecord(value) &&
    !hasOwn(value, "kind") &&
    !hasOwn(value, "version") &&
    value.tool === "bg3d" &&
    Array.isArray(value.primitives) &&
    (value.customModels === undefined || Array.isArray(value.customModels)) &&
    (value.attachments === undefined || Array.isArray(value.attachments))
  );
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function decodeBoundedJson(raw: unknown): unknown | null {
  try {
    if (typeof raw === "string") {
      if (utf8ByteLength(raw) > STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES) return null;
      return JSON.parse(raw) as unknown;
    }
    const serialized = JSON.stringify(raw);
    if (
      typeof serialized !== "string" ||
      utf8ByteLength(serialized) > STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES
    ) {
      return null;
    }
    // Reparse to detach prototypes, accessors, symbols, functions, and non-JSON object identity.
    return JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Compares detached JSON graphs without depending on object-key insertion order. Persistence uses
 * this after normalization so a current-version document is accepted only when normalization is
 * lossless: unknown keys, missing nested fields, invalid children, duplicate ids/hashes, clamped
 * values, and byte-budget truncation all fail closed instead of being silently rewritten.
 */
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
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key !== rightKeys[index] || !jsonStructuresEqual(left[key], right[key])) return false;
  }
  return true;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return Math.round(boundedNumber(value, fallback, minimum, maximum));
}

function normalizedBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizedEnum<Value extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  fallback: Value
): Value {
  return typeof value === "string" && allowed.has(value) ? (value as Value) : fallback;
}

function normalizedColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value)
    ? value.toLowerCase()
    : fallback;
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function normalizedText(
  value: unknown,
  maximumLength: number,
  rejectExternalReference = false
): string | null {
  if (typeof value !== "string" || containsControlCharacter(value)) return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    !normalized ||
    Array.from(normalized).length > maximumLength ||
    (rejectExternalReference &&
      (EXTERNAL_REFERENCE_PATTERN.test(normalized) ||
        SENSITIVE_REFERENCE_PATTERN.test(normalized)))
  ) {
    return null;
  }
  return normalized;
}

function normalizedId(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !ID_PATTERN.test(value) ||
    FORBIDDEN_ID_SET.has(value.toLowerCase())
  ) {
    return null;
  }
  return value;
}

function normalizedVec3(
  value: unknown,
  fallback: StudioBg3dVec3,
  minimum: number,
  maximum: number
): StudioBg3dVec3 {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback] as StudioBg3dVec3;
  return [
    boundedNumber(value[0], fallback[0], minimum, maximum),
    boundedNumber(value[1], fallback[1], minimum, maximum),
    boundedNumber(value[2], fallback[2], minimum, maximum),
  ];
}

function normalizedRotation(value: unknown): StudioBg3dVec3 {
  const rotation = normalizedVec3(value, DEFAULT_ROTATION, -Number.MAX_VALUE, Number.MAX_VALUE);
  return rotation.map((angle) => {
    if (!Number.isFinite(angle)) return 0;
    const wrapped = ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return wrapped - Math.PI;
  }) as unknown as StudioBg3dVec3;
}

function normalizedScale(value: unknown): StudioBg3dVec3 {
  return normalizedVec3(value, DEFAULT_SCALE, MIN_SCALE, MAX_SCALE);
}

function normalizedDirection(value: unknown, fallback: StudioBg3dVec3): StudioBg3dVec3 {
  const direction = normalizedVec3(value, fallback, -1_000, 1_000);
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (!Number.isFinite(length) || length < 0.000_001) {
    const fallbackLength = Math.hypot(fallback[0], fallback[1], fallback[2]);
    return [fallback[0] / fallbackLength, fallback[1] / fallbackLength, fallback[2] / fallbackLength];
  }
  // Canonical documents already contain unit directions. Dividing a nearly-unit IEEE-754 vector
  // on every parse introduces last-bit drift, so preserve it once it is within a strict tolerance.
  if (Math.abs(length - 1) <= 1e-12) return direction;
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

function normalizedShadowMapSize(
  value: unknown,
  fallback: StudioBg3dQualityProfile["shadowMapSize"]
): StudioBg3dQualityProfile["shadowMapSize"] {
  return typeof value === "number" && SHADOW_MAP_SIZES.includes(value as never)
    ? (value as StudioBg3dQualityProfile["shadowMapSize"])
    : fallback;
}

function normalizeCamera(value: unknown): StudioBg3dCameraSettings {
  const candidate = isRecord(value) ? value : {};
  let position = normalizedVec3(
    candidate.position,
    DEFAULT_CAMERA_POSITION,
    -MAX_WORLD_COORDINATE,
    MAX_WORLD_COORDINATE
  );
  const target = normalizedVec3(
    candidate.target,
    DEFAULT_CAMERA_TARGET,
    -MAX_WORLD_COORDINATE,
    MAX_WORLD_COORDINATE
  );
  if (Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]) < 0.01) {
    position = [
      target[0],
      target[1],
      target[2] > MAX_WORLD_COORDINATE - 1 ? target[2] - 1 : target[2] + 1,
    ];
  }
  return {
    position,
    target,
    fovDegrees: boundedNumber(candidate.fovDegrees, 50, 10, 120),
  };
}

function normalizeRender(value: unknown): StudioBg3dRenderSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    antialias: normalizedBoolean(candidate.antialias, true),
    shadows: normalizedBoolean(candidate.shadows, true),
    exposure: boundedNumber(candidate.exposure, 1, 0.1, 8),
    toneMapping: normalizedEnum(candidate.toneMapping, TONE_MAPPING_SET, "neutral"),
    colorSpace: "srgb",
  };
}

function normalizeBackground(value: unknown): StudioBg3dBackgroundSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    mode: normalizedEnum(candidate.mode, BACKGROUND_MODE_SET, "sky-preset"),
    color: normalizedColor(candidate.color, "#ffffff"),
    skyPresetId: normalizedEnum(candidate.skyPresetId, SKY_PRESET_SET, "blank"),
  };
}

function normalizeDirectionalLight(
  value: unknown,
  fallback: (typeof DEFAULT_RAW_DOCUMENT.lighting)["key" | "fill"]
): StudioBg3dDirectionalLightSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    color: normalizedColor(candidate.color, fallback.color),
    direction: normalizedDirection(candidate.direction, fallback.direction),
    intensity: boundedNumber(candidate.intensity, fallback.intensity, 0, 20),
    castsShadow: normalizedBoolean(candidate.castsShadow, fallback.castsShadow),
  };
}

function normalizeLighting(value: unknown): StudioBg3dLightingSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    ambientColor: normalizedColor(candidate.ambientColor, "#ffffff"),
    ambientIntensity: boundedNumber(candidate.ambientIntensity, 0.75, 0, 10),
    key: normalizeDirectionalLight(candidate.key, DEFAULT_RAW_DOCUMENT.lighting.key),
    fill: normalizeDirectionalLight(candidate.fill, DEFAULT_RAW_DOCUMENT.lighting.fill),
  };
}

function normalizeQualityProfile(
  value: unknown,
  fallback: (typeof DEFAULT_RAW_DOCUMENT.quality)["desktop" | "mobile"]
): StudioBg3dQualityProfile {
  const candidate = isRecord(value) ? value : {};
  const dprMin = boundedNumber(candidate.dprMin, fallback.dprMin, 0.5, 3);
  return {
    targetFps: boundedInteger(candidate.targetFps, fallback.targetFps, 15, 120),
    dprMin,
    dprMax: boundedNumber(candidate.dprMax, fallback.dprMax, dprMin, 3),
    maxRenderPixels: boundedInteger(
      candidate.maxRenderPixels,
      fallback.maxRenderPixels,
      320 * 240,
      16_777_216
    ),
    shadows: normalizedBoolean(candidate.shadows, fallback.shadows),
    shadowMapSize: normalizedShadowMapSize(candidate.shadowMapSize, fallback.shadowMapSize),
    textureScale: boundedNumber(candidate.textureScale, fallback.textureScale, 0.25, 1),
    lodBias: boundedNumber(candidate.lodBias, fallback.lodBias, -2, 4),
  };
}

function normalizeQuality(value: unknown): StudioBg3dQualityProfiles {
  const candidate = isRecord(value) ? value : {};
  return {
    desktop: normalizeQualityProfile(candidate.desktop, DEFAULT_RAW_DOCUMENT.quality.desktop),
    mobile: normalizeQualityProfile(candidate.mobile, DEFAULT_RAW_DOCUMENT.quality.mobile),
  };
}

function normalizeOutput(value: unknown): StudioBg3dOutputSettings {
  const candidate = isRecord(value) ? value : {};
  const line = isRecord(candidate.line) ? candidate.line : {};
  const tone = isRecord(candidate.tone) ? candidate.tone : {};
  return {
    transparentBackground: normalizedBoolean(candidate.transparentBackground, false),
    exportHeight: boundedInteger(candidate.exportHeight, 640, 256, 4096),
    line: {
      enabled: normalizedBoolean(line.enabled, true),
      layerType: normalizedEnum(line.layerType, LINE_LAYER_TYPE_SET, "raster"),
      color: normalizedColor(line.color, "#000000"),
      widthPx: boundedNumber(line.widthPx, 1, 0.25, 8),
      strength: boundedNumber(line.strength, 0.8, 0, 1),
      accuracy: boundedNumber(line.accuracy, 0.75, 0, 1),
      scaleAwareAccuracy: normalizedBoolean(line.scaleAwareAccuracy, true),
      exteriorOutlineStrength: boundedNumber(line.exteriorOutlineStrength, 1, 0, 2),
      depthEnabled: normalizedBoolean(line.depthEnabled, false),
      depthStrength: boundedNumber(line.depthStrength, 0.5, 0, 1),
      depthOutlineOnly: normalizedBoolean(line.depthOutlineOnly, true),
      smoothing: boundedNumber(line.smoothing, 0.5, 0, 1),
      textureLineEnabled: normalizedBoolean(line.textureLineEnabled, true),
      textureLineStrength: boundedNumber(line.textureLineStrength, 0.5, 0, 1),
      creaseAngleDegrees: boundedNumber(line.creaseAngleDegrees, 20, 0, 180),
      hiddenLineRemoval: normalizedBoolean(line.hiddenLineRemoval, true),
    },
    tone: {
      mode: normalizedEnum(tone.mode, TONE_MODE_SET, "flat"),
      type: normalizedEnum(tone.type, TONE_OUTPUT_TYPE_SET, "color"),
      pattern: normalizedEnum(tone.pattern, TONE_PATTERN_SET, "dot"),
      levels: boundedInteger(tone.levels, 4, 2, 8),
      opacity: boundedNumber(tone.opacity, 1, 0, 1),
      frequency: boundedNumber(tone.frequency, 60, 1, 200),
      angleDegrees: boundedNumber(tone.angleDegrees, 45, -180, 180),
    },
  };
}

function normalizeBudgets(value: unknown): StudioBg3dSceneBudgets {
  const candidate = isRecord(value) ? value : {};
  const complexity = isRecord(candidate.complexity) ? candidate.complexity : {};
  const textures = isRecord(candidate.textures) ? candidate.textures : {};
  return {
    complexity: {
      maxNodes: boundedInteger(
        complexity.maxNodes,
        DEFAULT_RAW_DOCUMENT.budgets.complexity.maxNodes,
        1,
        STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES
      ),
      maxTriangles: boundedInteger(
        complexity.maxTriangles,
        DEFAULT_RAW_DOCUMENT.budgets.complexity.maxTriangles,
        1_000,
        10_000_000
      ),
      maxDrawCalls: boundedInteger(
        complexity.maxDrawCalls,
        DEFAULT_RAW_DOCUMENT.budgets.complexity.maxDrawCalls,
        1,
        2_048
      ),
      maxMaterials: boundedInteger(
        complexity.maxMaterials,
        DEFAULT_RAW_DOCUMENT.budgets.complexity.maxMaterials,
        1,
        1_024
      ),
      maxLights: boundedInteger(
        complexity.maxLights,
        DEFAULT_RAW_DOCUMENT.budgets.complexity.maxLights,
        3,
        16
      ),
      maxModelBytes: boundedInteger(
        complexity.maxModelBytes,
        DEFAULT_RAW_DOCUMENT.budgets.complexity.maxModelBytes,
        1 * 1024 * 1024,
        512 * 1024 * 1024
      ),
    },
    textures: {
      maxTextures: boundedInteger(
        textures.maxTextures,
        DEFAULT_RAW_DOCUMENT.budgets.textures.maxTextures,
        0,
        256
      ),
      maxTotalBytes: boundedInteger(
        textures.maxTotalBytes,
        DEFAULT_RAW_DOCUMENT.budgets.textures.maxTotalBytes,
        0,
        512 * 1024 * 1024
      ),
      maxDimension: boundedInteger(
        textures.maxDimension,
        DEFAULT_RAW_DOCUMENT.budgets.textures.maxDimension,
        256,
        8_192
      ),
    },
  };
}

function normalizeRights(value: unknown): StudioBg3dAttachmentRights | null {
  if (!isRecord(value)) return null;
  const status = normalizedEnum<StudioBg3dRightsStatus>(
    value.status,
    RIGHTS_STATUS_SET,
    "unknown"
  );
  if (value.status !== status || typeof value.commercialUse !== "boolean") return null;
  if (typeof value.attributionRequired !== "boolean") return null;
  const attribution = normalizedText(value.attribution, MAX_TEXT_LENGTH, true);
  const licenseName = normalizedText(value.licenseName, MAX_TEXT_LENGTH, true);
  if (value.attributionRequired && !attribution) return null;
  if (status === "licensed" && !licenseName) return null;
  return {
    status,
    commercialUse: status === "unknown" ? false : value.commercialUse,
    attributionRequired: value.attributionRequired,
    ...(attribution ? { attribution } : {}),
    ...(licenseName ? { licenseName } : {}),
  };
}

function normalizeAttachment(value: unknown): StudioBg3dModelAttachment | null {
  if (!isRecord(value)) return null;
  const id = normalizedId(value.id);
  const rawName = normalizedText(value.name, 120, true);
  const rights = normalizeRights(value.rights);
  if (
    !id ||
    !rawName ||
    /[\\/]/u.test(rawName) ||
    !/\.glb$/iu.test(rawName) ||
    value.mime !== STUDIO_BG3D_GLB_MIME ||
    typeof value.byteSize !== "number" ||
    !Number.isSafeInteger(value.byteSize) ||
    value.byteSize < 1 ||
    value.byteSize > STUDIO_BG3D_GLB_MAX_BYTES ||
    typeof value.hash !== "string" ||
    !SHA256_PATTERN.test(value.hash.toLowerCase()) ||
    !rights ||
    typeof value.source !== "string" ||
    !ATTACHMENT_SOURCE_SET.has(value.source)
  ) {
    return null;
  }
  return {
    id,
    name: rawName.replace(/\.glb$/iu, ".glb"),
    mime: STUDIO_BG3D_GLB_MIME,
    byteSize: value.byteSize,
    hash: value.hash.toLowerCase(),
    rights,
    source: value.source as StudioBg3dAttachmentSource,
  };
}

function normalizeAttachments(
  value: unknown,
  maxModelBytes: number
): readonly StudioBg3dModelAttachment[] {
  if (!Array.isArray(value)) return [];
  const attachments: StudioBg3dModelAttachment[] = [];
  const ids = new Set<string>();
  const hashes = new Set<string>();
  let cumulativeBytes = 0;
  for (const candidate of value) {
    const attachment = normalizeAttachment(candidate);
    if (
      !attachment ||
      ids.has(attachment.id) ||
      hashes.has(attachment.hash) ||
      cumulativeBytes + attachment.byteSize > maxModelBytes
    ) {
      continue;
    }
    attachments.push(attachment);
    ids.add(attachment.id);
    hashes.add(attachment.hash);
    cumulativeBytes += attachment.byteSize;
    if (attachments.length >= STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS) break;
  }
  return attachments;
}

function normalizeTransform(value: unknown): StudioBg3dTransform {
  const candidate = isRecord(value) ? value : {};
  return {
    position: normalizedVec3(
      candidate.position,
      [0, 0, 0],
      -MAX_WORLD_COORDINATE,
      MAX_WORLD_COORDINATE
    ),
    rotation: normalizedRotation(candidate.rotation),
    scale: normalizedScale(candidate.scale),
  };
}

function normalizeNode(
  value: unknown,
  attachmentIds: ReadonlySet<string>
): StudioBg3dSceneNode | null {
  if (!isRecord(value)) return null;
  const id = normalizedId(value.id);
  if (!id) return null;
  const base = {
    id,
    name: normalizedText(value.name, MAX_NODE_NAME_LENGTH, true) ?? "3D 요소",
    transform: normalizeTransform(value.transform),
    visible: normalizedBoolean(value.visible, true),
    castsShadow: normalizedBoolean(value.castsShadow, true),
    receivesShadow: normalizedBoolean(value.receivesShadow, true),
  };
  if (value.kind === "primitive") {
    if (typeof value.primitiveKind !== "string" || !PRIMITIVE_KIND_SET.has(value.primitiveKind)) {
      return null;
    }
    return {
      ...base,
      kind: "primitive",
      primitiveKind: value.primitiveKind as StudioBg3dPrimitiveKind,
      color: normalizedColor(value.color, "#b8b8c2"),
    };
  }
  if (value.kind === "model") {
    const attachmentId = normalizedId(value.attachmentId);
    if (!attachmentId || !attachmentIds.has(attachmentId)) return null;
    return { ...base, kind: "model", attachmentId };
  }
  return null;
}

function normalizeNodes(
  value: unknown,
  attachmentIds: ReadonlySet<string>,
  maxNodes: number
): readonly StudioBg3dSceneNode[] {
  if (!Array.isArray(value)) return [];
  const nodes: StudioBg3dSceneNode[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const node = normalizeNode(candidate, attachmentIds);
    if (!node || ids.has(node.id)) continue;
    nodes.push(node);
    ids.add(node.id);
    if (nodes.length >= maxNodes) break;
  }
  return nodes;
}

function canonicalDocumentByteLength(document: StudioBg3dSceneDocument): number {
  return utf8ByteLength(JSON.stringify(document));
}

function largestPersistablePrefix(
  itemCount: number,
  candidateForCount: (count: number) => StudioBg3dSceneDocument
): StudioBg3dSceneDocument | null {
  let lower = 0;
  let upper = itemCount;
  let best: StudioBg3dSceneDocument | null = null;
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = candidateForCount(middle);
    if (canonicalDocumentByteLength(candidate) <= STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES) {
      best = candidate;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }
  return best;
}

/**
 * Normalization expands sparse nodes with explicit defaults, so a byte-bounded input can produce a
 * larger canonical graph. Keep the longest stable prefix, dropping trailing nodes before trailing
 * attachments. This makes the output deterministic and guarantees every returned graph persists.
 */
function fitNormalizedDocumentToByteBudget(
  document: StudioBg3dSceneDocument
): StudioBg3dSceneDocument | null {
  if (canonicalDocumentByteLength(document) <= STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES) {
    return document;
  }
  const nodeBounded = largestPersistablePrefix(document.nodes.length, (count) => ({
    ...document,
    nodes: document.nodes.slice(0, count),
  }));
  if (nodeBounded) return nodeBounded;

  return largestPersistablePrefix(document.attachments.length, (count) => ({
    ...document,
    attachments: document.attachments.slice(0, count),
    nodes: [],
  }));
}

function normalizeDecodedCurrentDocument(
  value: unknown,
  rootMode: "lenient" | "strict" = "lenient"
): StudioBg3dSceneDocument | null {
  if (
    !isRecord(value) ||
    value.kind !== STUDIO_BG3D_SCENE_DOCUMENT_KIND ||
    value.version !== STUDIO_BG3D_SCENE_DOCUMENT_VERSION ||
    (rootMode === "strict" && !hasCompleteCurrentRootShape(value))
  ) {
    return null;
  }
  const budgets = normalizeBudgets(value.budgets);
  const attachments = normalizeAttachments(
    value.attachments,
    budgets.complexity.maxModelBytes
  );
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const normalized: StudioBg3dSceneDocument = {
    kind: STUDIO_BG3D_SCENE_DOCUMENT_KIND,
    version: STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
    camera: normalizeCamera(value.camera),
    render: normalizeRender(value.render),
    background: normalizeBackground(value.background),
    lighting: normalizeLighting(value.lighting),
    quality: normalizeQuality(value.quality),
    output: normalizeOutput(value.output),
    budgets,
    attachments,
    nodes: normalizeNodes(value.nodes, attachmentIds, budgets.complexity.maxNodes),
  };
  const fitted = fitNormalizedDocumentToByteBudget(normalized);
  if (!fitted || (rootMode === "strict" && !jsonStructuresEqual(value, fitted))) return null;
  return deepFreeze(fitted);
}

function legacyPrimitiveNode(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return {
    id: value.id,
    name: value.kind,
    kind: "primitive",
    primitiveKind: value.kind,
    color: value.color,
    transform: {
      position: value.position,
      rotation: value.rotation,
      scale: value.scale,
    },
    visible: true,
    castsShadow: true,
    receivesShadow: true,
  };
}

function legacyModelNode(
  value: unknown,
  options: StudioBg3dLegacyMigrationOptions
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const storageKey = value.modelId;
  if (
    typeof storageKey !== "string" ||
    !storageKey ||
    containsControlCharacter(storageKey) ||
    utf8ByteLength(storageKey) > 512
  ) {
    return null;
  }
  let mappedAttachmentId: unknown;
  try {
    mappedAttachmentId = options.attachmentIdByLegacyStorageKey?.get(storageKey);
  } catch {
    return null;
  }
  const attachmentId = normalizedId(mappedAttachmentId);
  if (!attachmentId || attachmentId === storageKey) return null;
  return {
    id: value.id,
    name: "GLB 모델",
    kind: "model",
    attachmentId,
    transform: {
      position: value.position,
      rotation: value.rotation,
      scale: value.scale,
    },
    visible: true,
    castsShadow: true,
    receivesShadow: true,
  };
}

function migrateDecodedLegacyDocument(
  value: unknown,
  options: StudioBg3dLegacyMigrationOptions
): StudioBg3dSceneDocument | null {
  if (!isExplicitUnversionedLegacyRoot(value)) return null;
  const primitiveNodes = value.primitives.map(legacyPrimitiveNode).filter(isRecord);
  const modelNodes = Array.isArray(value.customModels)
    ? value.customModels.map((model) => legacyModelNode(model, options)).filter(isRecord)
    : [];
  return normalizeDecodedCurrentDocument({
    kind: STUDIO_BG3D_SCENE_DOCUMENT_KIND,
    version: STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
    camera: value.camera,
    render: value.render,
    background: isRecord(value.background)
      ? value.background
      : {
          mode: "sky-preset",
          skyPresetId: value.skyPresetId,
          color: value.backgroundColor,
        },
    lighting: value.lighting,
    quality: value.quality,
    output: isRecord(value.output)
      ? value.output
      : {
          transparentBackground: value.transparentInsert,
          line: { enabled: true },
        },
    budgets: value.budgets,
    attachments: value.attachments,
    nodes: [...primitiveNodes, ...modelNodes],
  });
}

/** Returns a new, deeply frozen default document on every call. */
export function createDefaultStudioBg3dSceneDocument(): StudioBg3dSceneDocument {
  const document = normalizeDecodedCurrentDocument(DEFAULT_RAW_DOCUMENT);
  if (!document) throw new Error("Invalid internal Studio BG3D document defaults.");
  return document;
}

export const DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT = createDefaultStudioBg3dSceneDocument();

/**
 * Leniently sanitizes a current-version object for interactive editing. Missing or mistyped root
 * sections receive defaults; invalid roots, unknown versions, cyclic values, and oversized inputs
 * reset to a fresh default. Persistence must use the strict parse/serialize APIs below.
 */
export function normalizeStudioBg3dSceneDocument(raw: unknown): StudioBg3dSceneDocument {
  const decoded = decodeBoundedJson(raw);
  return normalizeDecodedCurrentDocument(decoded) ?? createDefaultStudioBg3dSceneDocument();
}

/**
 * Parses only canonical, complete current-version graphs. Any lossy normalization (including
 * unknown or missing nested fields, invalid/duplicate children, value clamping, and truncation),
 * oversized input, legacy payload, or unknown schema marker is rejected.
 */
export function parseStudioBg3dSceneDocument(raw: string): StudioBg3dSceneDocument | null {
  return normalizeDecodedCurrentDocument(decodeBoundedJson(raw), "strict");
}

/**
 * Accepts the current document or the actual legacy `{tool:"bg3d", primitives, customModels}` hash
 * payload. Any legacy `modelId` is an IndexedDB key, never an attachment id. A model placement
 * survives only when `attachmentIdByLegacyStorageKey` explicitly maps that key to a different,
 * valid logical id backed by canonical GLB metadata; otherwise it is intentionally dropped.
 * Documents with any unsupported/current `kind` or any `version` marker never enter legacy logic.
 */
export function migrateStudioBg3dSceneDocument(
  raw: unknown,
  options: StudioBg3dLegacyMigrationOptions = {}
): StudioBg3dSceneDocument | null {
  let rawHasSchemaMarker: boolean;
  try {
    rawHasSchemaMarker =
      isRecord(raw) && (hasOwn(raw, "kind") || hasOwn(raw, "version"));
  } catch {
    return null;
  }
  const decoded = decodeBoundedJson(raw);
  const current = normalizeDecodedCurrentDocument(decoded, "strict");
  if (current) return current;
  if (
    rawHasSchemaMarker ||
    (isRecord(decoded) && (hasOwn(decoded, "kind") || hasOwn(decoded, "version")))
  ) {
    return null;
  }
  return migrateDecodedLegacyDocument(decoded, options);
}

/**
 * Canonical current-version JSON serialization. Only already-canonical current documents are
 * accepted; callers must use the lenient editor normalizer or explicit legacy migration before
 * reaching this persistence boundary. Every non-null result is UTF-8 bounded to 256 KiB.
 */
export function serializeStudioBg3dSceneDocument(raw: unknown): string | null {
  const document = normalizeDecodedCurrentDocument(decodeBoundedJson(raw), "strict");
  if (!document) return null;
  try {
    const serialized = JSON.stringify(document);
    return utf8ByteLength(serialized) <= STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES
      ? serialized
      : null;
  } catch {
    return null;
  }
}

/** Runtime/UI helper for pre-validating one metadata record without retaining hostile fields. */
export function normalizeStudioBg3dGlbAttachment(
  raw: unknown
): StudioBg3dModelAttachment | null {
  const decoded = decodeBoundedJson(raw);
  return deepFreeze(normalizeAttachment(decoded));
}
