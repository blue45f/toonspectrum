export const STUDIO_SCENE3D_DOCUMENT_KIND = "toonspectrum.scene3d" as const;
export const STUDIO_SCENE3D_DOCUMENT_VERSION = 1 as const;

export type StudioScene3dVec3 = readonly [number, number, number];
export type StudioScene3dQuat = readonly [number, number, number, number];

export interface StudioScene3dTransform {
  readonly position: StudioScene3dVec3;
  readonly rotation: StudioScene3dQuat;
  readonly scale: StudioScene3dVec3;
}

export const STUDIO_SCENE3D_IDENTITY_TRANSFORM: StudioScene3dTransform = Object.freeze({
  position: Object.freeze([0, 0, 0] as const),
  rotation: Object.freeze([0, 0, 0, 1] as const),
  scale: Object.freeze([1, 1, 1] as const),
});

export type StudioScene3dAssetKind =
  | "character"
  | "mesh"
  | "environment"
  | "gaussian-splat";

export interface StudioScene3dAssetReference {
  readonly id: string;
  readonly kind: StudioScene3dAssetKind;
  readonly version: string;
  readonly contentSha256: string;
  readonly uri: string;
  readonly mime: string;
  readonly byteSize: number;
  readonly rights: {
    readonly commercialUse: boolean;
    readonly redistribution: boolean;
    readonly derivativeUse: boolean;
    readonly licenseName: string;
  };
  readonly quality: {
    readonly accepted: boolean;
    readonly score: number;
    readonly reportUri: string;
  };
}

interface StudioScene3dEntityBase {
  readonly id: string;
  readonly name: string;
  readonly transform: StudioScene3dTransform;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly parentId: string | null;
}

export interface StudioScene3dCharacterEntity extends StudioScene3dEntityBase {
  readonly kind: "character";
  readonly assetId: string;
  readonly characterDocumentId: string;
  readonly characterRevision: number;
}

export interface StudioScene3dModelEntity extends StudioScene3dEntityBase {
  readonly kind: "model";
  readonly assetId: string;
  readonly materialVariantId: string | null;
}

export interface StudioScene3dSplatEntity extends StudioScene3dEntityBase {
  readonly kind: "gaussian-splat";
  readonly assetId: string;
  readonly opacity: number;
  readonly cropVolumeId: string | null;
}

export type StudioScene3dEntity =
  | StudioScene3dCharacterEntity
  | StudioScene3dModelEntity
  | StudioScene3dSplatEntity;

export interface StudioScene3dCamera {
  readonly id: string;
  readonly name: string;
  readonly projection: "perspective" | "orthographic";
  readonly position: StudioScene3dVec3;
  readonly target: StudioScene3dVec3;
  readonly up: StudioScene3dVec3;
  readonly focalLengthMm: number;
  readonly orthoScale: number;
  readonly near: number;
  readonly far: number;
  readonly lensShift: readonly [number, number];
}

export interface StudioScene3dLight {
  readonly id: string;
  readonly name: string;
  readonly kind: "directional" | "point" | "spot" | "area";
  readonly color: string;
  readonly intensity: number;
  readonly position: StudioScene3dVec3;
  readonly target: StudioScene3dVec3;
  readonly castShadow: boolean;
}

export interface StudioScene3dEnvironment {
  readonly mode: "transparent" | "color" | "procedural-sky" | "asset";
  readonly color: string;
  readonly assetId: string | null;
  readonly rotationDegrees: number;
  readonly intensity: number;
  readonly groundEnabled: boolean;
  readonly groundHeight: number;
  readonly groundShadowOpacity: number;
}

export type StudioScene3dRenderProfile = "webtoon" | "anime" | "neutral" | "pbr" | "sketch";

export interface StudioScene3dRenderSettings {
  readonly profile: StudioScene3dRenderProfile;
  readonly colorSpace: "srgb";
  readonly toneMapping: "neutral" | "aces";
  readonly exposure: number;
  readonly antialiasing: "msaa" | "taa" | "taau" | "ssaa";
  readonly shadows: {
    readonly enabled: boolean;
    readonly mode: "standard" | "vsm" | "csm";
    readonly cascades: 1 | 2 | 3 | 4;
    readonly mapSize: 512 | 1024 | 2048 | 4096;
  };
  readonly effects: {
    readonly ssgi: boolean;
    readonly sss: boolean;
    readonly contactShadows: boolean;
    readonly bloom: boolean;
    readonly depthOfField: boolean;
  };
  readonly toon: {
    readonly enabled: boolean;
    readonly rampSteps: number;
    readonly outline: boolean;
    readonly outlineWidthPx: number;
    readonly semanticLines: boolean;
  };
}

export interface StudioScene3dOutputSettings {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly transparent: boolean;
  readonly preserveAlpha: boolean;
  readonly smartLayer: boolean;
  readonly semanticPasses: readonly (
    | "beauty"
    | "line"
    | "shadow"
    | "depth"
    | "normal"
    | "object-id"
    | "material-id"
  )[];
}

export interface StudioScene3dShot {
  readonly id: string;
  readonly name: string;
  readonly cameraId: string;
  readonly hiddenEntityIds: readonly string[];
  readonly renderProfileOverride: StudioScene3dRenderProfile | null;
}

export interface StudioScene3dDocumentV1 {
  readonly kind: typeof STUDIO_SCENE3D_DOCUMENT_KIND;
  readonly version: typeof STUDIO_SCENE3D_DOCUMENT_VERSION;
  readonly documentId: string;
  readonly revision: number;
  readonly coordinateSystem: {
    readonly unit: "meter";
    readonly handedness: "right";
    readonly upAxis: "Y";
    readonly forwardAxis: "-Z";
  };
  readonly assets: readonly StudioScene3dAssetReference[];
  readonly entities: readonly StudioScene3dEntity[];
  readonly cameras: readonly StudioScene3dCamera[];
  readonly activeCameraId: string;
  readonly lights: readonly StudioScene3dLight[];
  readonly environment: StudioScene3dEnvironment;
  readonly render: StudioScene3dRenderSettings;
  readonly output: StudioScene3dOutputSettings;
  readonly shots: readonly StudioScene3dShot[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class StudioScene3dDocumentError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "StudioScene3dDocumentError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown, maximum = 512): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isVec(value: unknown, length: 2 | 3 | 4): value is readonly number[] {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^(?:sha256:)?[0-9a-f]{64}$/iu.test(value);
}

function isSafeAssetUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return false;
  if (/[\\\u0000-\u001f\u007f]/u.test(value)) return false;
  if (/^(?:javascript|data|blob):/iu.test(value)) return false;
  const path = value.split(/[?#]/u, 1)[0] ?? "";
  return !path.split("/").some((segment) => segment === "." || segment === "..");
}

function isTransform(value: unknown): value is StudioScene3dTransform {
  return isRecord(value)
    && isVec(value.position, 3)
    && isVec(value.rotation, 4)
    && isVec(value.scale, 3)
    && value.scale.every((item) => item > 0 && item <= 1000);
}

function isAsset(value: unknown): value is StudioScene3dAssetReference {
  if (!isRecord(value)) return false;
  if (!isString(value.id) || !["character", "mesh", "environment", "gaussian-splat"].includes(String(value.kind))) return false;
  if (!isString(value.version) || !isSha256(value.contentSha256) || !isSafeAssetUri(value.uri)) return false;
  if (!isString(value.mime) || !Number.isSafeInteger(value.byteSize) || Number(value.byteSize) <= 0) return false;
  if (!isRecord(value.rights) || !isString(value.rights.licenseName)) return false;
  if (![value.rights.commercialUse, value.rights.redistribution, value.rights.derivativeUse].every((item) => typeof item === "boolean")) return false;
  if (!isRecord(value.quality) || typeof value.quality.accepted !== "boolean") return false;
  return isFiniteNumber(value.quality.score)
    && value.quality.score >= 0
    && value.quality.score <= 100
    && isSafeAssetUri(value.quality.reportUri);
}

function isEntity(value: unknown): value is StudioScene3dEntity {
  if (!isRecord(value) || !isString(value.id) || !isString(value.name) || !isTransform(value.transform)) return false;
  if (![value.visible, value.locked, value.castShadow, value.receiveShadow].every((item) => typeof item === "boolean")) return false;
  if (value.parentId !== null && !isString(value.parentId)) return false;
  if (value.kind === "character") {
    return isString(value.assetId)
      && isString(value.characterDocumentId)
      && Number.isSafeInteger(value.characterRevision)
      && Number(value.characterRevision) >= 0;
  }
  if (value.kind === "model") {
    return isString(value.assetId) && (value.materialVariantId === null || isString(value.materialVariantId));
  }
  if (value.kind === "gaussian-splat") {
    return isString(value.assetId)
      && isFiniteNumber(value.opacity)
      && value.opacity >= 0
      && value.opacity <= 1
      && (value.cropVolumeId === null || isString(value.cropVolumeId));
  }
  return false;
}

function isCamera(value: unknown): value is StudioScene3dCamera {
  return isRecord(value)
    && isString(value.id)
    && isString(value.name)
    && ["perspective", "orthographic"].includes(String(value.projection))
    && isVec(value.position, 3)
    && isVec(value.target, 3)
    && isVec(value.up, 3)
    && isFiniteNumber(value.focalLengthMm)
    && value.focalLengthMm >= 8
    && value.focalLengthMm <= 300
    && isFiniteNumber(value.orthoScale)
    && value.orthoScale > 0
    && isFiniteNumber(value.near)
    && value.near > 0
    && isFiniteNumber(value.far)
    && value.far > value.near
    && isVec(value.lensShift, 2);
}

function isLight(value: unknown): value is StudioScene3dLight {
  return isRecord(value)
    && isString(value.id)
    && isString(value.name)
    && ["directional", "point", "spot", "area"].includes(String(value.kind))
    && isString(value.color, 32)
    && isFiniteNumber(value.intensity)
    && value.intensity >= 0
    && value.intensity <= 100000
    && isVec(value.position, 3)
    && isVec(value.target, 3)
    && typeof value.castShadow === "boolean";
}

function ensureUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new StudioScene3dDocumentError("DUPLICATE_ID", `${label} ID가 중복되었습니다.`);
  }
}

export function assertStudioScene3dDocument(value: unknown): asserts value is StudioScene3dDocumentV1 {
  if (!isRecord(value) || value.kind !== STUDIO_SCENE3D_DOCUMENT_KIND || value.version !== STUDIO_SCENE3D_DOCUMENT_VERSION) {
    throw new StudioScene3dDocumentError("UNSUPPORTED_DOCUMENT", "지원하지 않는 3D Scene 문서입니다.");
  }
  if (!isString(value.documentId) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0) {
    throw new StudioScene3dDocumentError("INVALID_IDENTITY", "3D Scene 문서 식별자가 올바르지 않습니다.");
  }
  const coordinates = value.coordinateSystem;
  if (!isRecord(coordinates) || coordinates.unit !== "meter" || coordinates.handedness !== "right" || coordinates.upAxis !== "Y" || coordinates.forwardAxis !== "-Z") {
    throw new StudioScene3dDocumentError("INVALID_COORDINATES", "3D Scene 좌표계는 meter/right/Y/-Z만 허용합니다.");
  }
  if (!Array.isArray(value.assets) || value.assets.length > 2048 || !value.assets.every(isAsset)) {
    throw new StudioScene3dDocumentError("INVALID_ASSETS", "3D Scene asset graph가 올바르지 않습니다.");
  }
  if (!Array.isArray(value.entities) || value.entities.length > 4096 || !value.entities.every(isEntity)) {
    throw new StudioScene3dDocumentError("INVALID_ENTITIES", "3D Scene entity graph가 올바르지 않습니다.");
  }
  if (!Array.isArray(value.cameras) || value.cameras.length === 0 || value.cameras.length > 64 || !value.cameras.every(isCamera)) {
    throw new StudioScene3dDocumentError("INVALID_CAMERAS", "3D Scene camera graph가 올바르지 않습니다.");
  }
  if (!isString(value.activeCameraId) || !value.cameras.some((camera) => camera.id === value.activeCameraId)) {
    throw new StudioScene3dDocumentError("MISSING_ACTIVE_CAMERA", "활성 카메라가 존재하지 않습니다.");
  }
  if (!Array.isArray(value.lights) || value.lights.length > 64 || !value.lights.every(isLight)) {
    throw new StudioScene3dDocumentError("INVALID_LIGHTS", "3D Scene light graph가 올바르지 않습니다.");
  }
  if (!isRecord(value.environment) || !["transparent", "color", "procedural-sky", "asset"].includes(String(value.environment.mode))) {
    throw new StudioScene3dDocumentError("INVALID_ENVIRONMENT", "3D Scene environment가 올바르지 않습니다.");
  }
  if (!isRecord(value.render) || !["webtoon", "anime", "neutral", "pbr", "sketch"].includes(String(value.render.profile))) {
    throw new StudioScene3dDocumentError("INVALID_RENDER", "3D Scene render 설정이 올바르지 않습니다.");
  }
  if (!isRecord(value.output) || !Number.isSafeInteger(value.output.width) || !Number.isSafeInteger(value.output.height)) {
    throw new StudioScene3dDocumentError("INVALID_OUTPUT", "3D Scene output 설정이 올바르지 않습니다.");
  }
  if (value.output.width < 64 || value.output.height < 64 || value.output.width > 16384 || value.output.height > 16384) {
    throw new StudioScene3dDocumentError("OUTPUT_BUDGET", "3D Scene 출력 크기가 허용 범위를 벗어났습니다.");
  }
  if (!isFiniteNumber(value.output.pixelRatio) || value.output.pixelRatio < 0.5 || value.output.pixelRatio > 4) {
    throw new StudioScene3dDocumentError("OUTPUT_PIXEL_RATIO", "3D Scene pixel ratio가 허용 범위를 벗어났습니다.");
  }
  if (!Array.isArray(value.shots) || value.shots.length > 256) {
    throw new StudioScene3dDocumentError("INVALID_SHOTS", "3D Scene shot 목록이 올바르지 않습니다.");
  }
  if (!isString(value.createdAt) || !isString(value.updatedAt)) {
    throw new StudioScene3dDocumentError("INVALID_TIMESTAMPS", "3D Scene timestamp가 올바르지 않습니다.");
  }

  ensureUnique(value.assets.map((asset) => asset.id), "asset");
  ensureUnique(value.entities.map((entity) => entity.id), "entity");
  ensureUnique(value.cameras.map((camera) => camera.id), "camera");
  ensureUnique(value.lights.map((light) => light.id), "light");

  const assetIds = new Set(value.assets.map((asset) => asset.id));
  for (const entity of value.entities) {
    if (!assetIds.has(entity.assetId)) {
      throw new StudioScene3dDocumentError("MISSING_ENTITY_ASSET", `${entity.id}가 참조하는 asset이 없습니다.`);
    }
    if (entity.parentId !== null && !value.entities.some((parent) => parent.id === entity.parentId)) {
      throw new StudioScene3dDocumentError("MISSING_ENTITY_PARENT", `${entity.id}가 참조하는 parent가 없습니다.`);
    }
  }
}

export function isStudioScene3dDocument(value: unknown): value is StudioScene3dDocumentV1 {
  try {
    assertStudioScene3dDocument(value);
    return true;
  } catch {
    return false;
  }
}

export function createStudioScene3dDocument(documentId: string, now = new Date().toISOString()): StudioScene3dDocumentV1 {
  const camera: StudioScene3dCamera = Object.freeze({
    id: "camera:main",
    name: "메인 카메라",
    projection: "perspective",
    position: Object.freeze([2.8, 1.9, 4.8] as const),
    target: Object.freeze([0, 1.2, 0] as const),
    up: Object.freeze([0, 1, 0] as const),
    focalLengthMm: 50,
    orthoScale: 5,
    near: 0.03,
    far: 5000,
    lensShift: Object.freeze([0, 0] as const),
  });
  return Object.freeze({
    kind: STUDIO_SCENE3D_DOCUMENT_KIND,
    version: STUDIO_SCENE3D_DOCUMENT_VERSION,
    documentId,
    revision: 0,
    coordinateSystem: Object.freeze({ unit: "meter", handedness: "right", upAxis: "Y", forwardAxis: "-Z" }),
    assets: Object.freeze([]),
    entities: Object.freeze([]),
    cameras: Object.freeze([camera]),
    activeCameraId: camera.id,
    lights: Object.freeze([]),
    environment: Object.freeze({
      mode: "color",
      color: "#f5f5f5",
      assetId: null,
      rotationDegrees: 0,
      intensity: 1,
      groundEnabled: true,
      groundHeight: 0,
      groundShadowOpacity: 0.22,
    }),
    render: Object.freeze({
      profile: "webtoon",
      colorSpace: "srgb",
      toneMapping: "neutral",
      exposure: 1,
      antialiasing: "taa",
      shadows: Object.freeze({ enabled: true, mode: "csm", cascades: 3, mapSize: 2048 }),
      effects: Object.freeze({ ssgi: true, sss: true, contactShadows: true, bloom: false, depthOfField: false }),
      toon: Object.freeze({ enabled: true, rampSteps: 4, outline: true, outlineWidthPx: 1.25, semanticLines: true }),
    }),
    output: Object.freeze({
      width: 2048,
      height: 2048,
      pixelRatio: 1,
      transparent: false,
      preserveAlpha: true,
      smartLayer: true,
      semanticPasses: Object.freeze(["beauty", "line", "shadow", "depth", "normal", "object-id", "material-id"] as const),
    }),
    shots: Object.freeze([]),
    createdAt: now,
    updatedAt: now,
  });
}
