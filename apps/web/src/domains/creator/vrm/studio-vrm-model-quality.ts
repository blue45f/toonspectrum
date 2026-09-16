const PRODUCTION_MODEL_PREFIXES = Object.freeze([
  "/assets/3d/characters/",
  "/assets/3d/models/",
  "/vrm/",
] as const);
const PRODUCTION_MODEL_EXTENSIONS = new Set(["vrm", "glb", "gltf"]);

export const STUDIO_VRM_MODEL_MAX_BYTES = 80 * 1024 * 1024;
export const STUDIO_VRM_MODEL_MAX_TRIANGLES = 500_000;
// Keep 128 as the optimization target, but do not hide healthy detailed characters until the
// conservative hard ceiling is exceeded.
export const STUDIO_VRM_MODEL_RECOMMENDED_MAX_PRIMITIVES = 128;
export const STUDIO_VRM_MODEL_MAX_PRIMITIVES = 192;
export const STUDIO_VRM_MODEL_MAX_MATERIALS = 48;
export const STUDIO_VRM_MODEL_MAX_TEXTURES = 64;
export const STUDIO_VRM_MODEL_MAX_JOINTS = 256;

export const STUDIO_VRM_REPAIRABLE_VALIDATOR_ERROR_CODES = Object.freeze([
  "ACCESSOR_JOINTS_INDEX_DUPLICATE",
  "ACCESSOR_WEIGHTS_NON_NORMALIZED",
  "GLB_CHUNK_LENGTH_UNALIGNED",
  "SKIN_SKELETON_INVALID",
] as const);

const REPAIRABLE_VALIDATOR_ERROR_CODES = new Set<string>(
  STUDIO_VRM_REPAIRABLE_VALIDATOR_ERROR_CODES,
);

export interface StudioVrmValidatorErrorSummary {
  readonly totalErrors: number;
  readonly capturedErrors: number;
  readonly repairableErrors: number;
  readonly blockingErrors: number;
}

export function summarizeStudioVrmValidatorErrors(
  totalErrors: number,
  messages: readonly { readonly code: string; readonly severity: number }[],
  truncated = false,
): StudioVrmValidatorErrorSummary {
  const errors = messages.filter((message) => message.severity === 0);
  const repairableErrors = errors.filter(
    (message) => REPAIRABLE_VALIDATOR_ERROR_CODES.has(message.code),
  ).length;
  const uncapturedErrors = Math.max(0, totalErrors - errors.length);
  return Object.freeze({
    totalErrors,
    capturedErrors: errors.length,
    repairableErrors,
    blockingErrors: errors.length - repairableErrors + uncapturedErrors + Number(truncated),
  });
}

/**
 * Deployment-owned VRM discovery accepts only safe relative model URLs. Remote URLs, object/data
 * URLs, encoded traversal, query strings and non-glTF formats remain valid only for explicit user
 * upload/runtime flows; they are never evidence for the bundled production catalogue.
 */
export function isStudioVrmProductionModelUrl(value: unknown): value is string {
  if (
    typeof value !== "string"
    || value.length > 512
    || value.startsWith("//")
    || !PRODUCTION_MODEL_PREFIXES.some((prefix) => value.startsWith(prefix))
    || value.includes("\\")
    || value.includes("?")
    || value.includes("#")
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }
  if (
    !decoded.startsWith("/")
    || decoded.startsWith("//")
    || !PRODUCTION_MODEL_PREFIXES.some((prefix) => decoded.startsWith(prefix))
    || decoded.includes("\\")
    || decoded.includes("?")
    || decoded.includes("#")
  ) {
    return false;
  }
  for (let index = 0; index < decoded.length; index += 1) {
    const code = decoded.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }

  const segments = decoded.slice(1).split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return false;
  }
  const extension = segments.at(-1)?.split(".").pop()?.toLowerCase();
  return extension !== undefined && PRODUCTION_MODEL_EXTENSIONS.has(extension);
}

export interface StudioVrmModelTechnicalMetrics {
  readonly byteSize: number;
  readonly triangles: number;
  readonly primitives: number;
  readonly materials: number;
  readonly textures: number;
  readonly joints: number;
  readonly meshes: number;
  readonly skins: number;
  readonly hasVrmExtension: boolean;
  readonly validatorErrors: number;
  readonly blockingValidatorErrors?: number;
  readonly repairableValidatorErrors?: number;
}

export type StudioVrmModelTechnicalRejectionCode =
  | "model-url"
  | "file-missing"
  | "file-not-regular"
  | "git-lfs-pointer"
  | "file-too-small"
  | "file-too-large"
  | "validator-errors"
  | "gltf-version"
  | "mesh-missing"
  | "skin-missing"
  | "vrm-extension-missing"
  | "position-missing"
  | "normal-missing"
  | "unsafe-external-resource"
  | "triangles"
  | "primitives"
  | "materials"
  | "textures"
  | "joints";

export function classifyStudioVrmModelTechnicalRejection(
  metrics: StudioVrmModelTechnicalMetrics,
): StudioVrmModelTechnicalRejectionCode | null {
  if (!Number.isSafeInteger(metrics.byteSize) || metrics.byteSize < 16_384) return "file-too-small";
  if (metrics.byteSize > STUDIO_VRM_MODEL_MAX_BYTES) return "file-too-large";
  const blockingValidatorErrors = metrics.blockingValidatorErrors ?? metrics.validatorErrors;
  if (blockingValidatorErrors > 0) return "validator-errors";
  if (metrics.meshes < 1) return "mesh-missing";
  if (metrics.skins < 1) return "skin-missing";
  if (!metrics.hasVrmExtension) return "vrm-extension-missing";
  if (metrics.triangles > STUDIO_VRM_MODEL_MAX_TRIANGLES) return "triangles";
  if (metrics.primitives > STUDIO_VRM_MODEL_MAX_PRIMITIVES) return "primitives";
  if (metrics.materials > STUDIO_VRM_MODEL_MAX_MATERIALS) return "materials";
  if (metrics.textures > STUDIO_VRM_MODEL_MAX_TEXTURES) return "textures";
  if (metrics.joints > STUDIO_VRM_MODEL_MAX_JOINTS) return "joints";
  return null;
}
