import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { SAMPLE_VRMS } from "../apps/web/src/domains/creator/vrm/vrm-library";
import {
  classifyStudioVrmModelTechnicalRejection,
  isStudioVrmProductionModelUrl,
  STUDIO_VRM_MODEL_MAX_BYTES,
  type StudioVrmModelTechnicalMetrics,
  type StudioVrmModelTechnicalRejectionCode,
} from "../apps/web/src/domains/creator/vrm/studio-vrm-model-quality";

type GltfAccessor = Readonly<{
  count?: number;
  min?: readonly number[];
  max?: readonly number[];
}>;
type GltfPrimitive = Readonly<{
  attributes?: Readonly<Record<string, number>>;
  indices?: number;
  mode?: number;
}>;
type GltfJson = Readonly<{
  asset?: Readonly<{ version?: string }>;
  accessors?: readonly GltfAccessor[];
  meshes?: readonly Readonly<{ primitives?: readonly GltfPrimitive[] }>[];
  materials?: readonly unknown[];
  textures?: readonly unknown[];
  skins?: readonly Readonly<{ joints?: readonly number[] }>[];
  extensions?: Readonly<Record<string, unknown>>;
  extensionsUsed?: readonly string[];
  buffers?: readonly Readonly<{ uri?: string }>[];
  images?: readonly Readonly<{ uri?: string }>[];
}>;

type ValidatorReport = Readonly<{
  issues?: Readonly<{ numErrors?: number }>;
}>;

type DetailedMetrics = StudioVrmModelTechnicalMetrics & Readonly<{
  gltfVersion: string | null;
  primitivesWithoutPosition: number;
  trianglePrimitivesWithoutNormals: number;
  unsafeExternalResources: readonly string[];
}>;

type Rejection = StudioVrmModelTechnicalRejectionCode | `scan-error:${string}`;

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const LFS_POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";

function isGitLfsPointer(bytes: Buffer): boolean {
  return bytes.length < 4_096 && bytes.toString("utf8", 0, Math.min(bytes.length, 200))
    .startsWith(LFS_POINTER_PREFIX);
}

function parseGlb(bytes: Buffer): GltfJson {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("invalid-glb-magic");
  }
  if (bytes.readUInt32LE(4) !== 2) throw new Error("unsupported-glb-version");
  const declaredLength = bytes.readUInt32LE(8);
  if (declaredLength !== bytes.length) throw new Error("invalid-glb-length");
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  if (jsonType !== GLB_JSON_CHUNK || jsonLength <= 0 || 20 + jsonLength > bytes.length) {
    throw new Error("missing-glb-json-chunk");
  }
  let json = bytes.subarray(20, 20 + jsonLength).toString("utf8");
  while (json.endsWith("\u0000")) json = json.slice(0, -1);
  return JSON.parse(json.trim()) as GltfJson;
}

function parseGltf(filePath: string, bytes: Buffer): GltfJson {
  return filePath.toLowerCase().endsWith(".gltf")
    ? JSON.parse(bytes.toString("utf8")) as GltfJson
    : parseGlb(bytes);
}

function primitiveTriangleCount(
  primitive: GltfPrimitive,
  accessors: readonly GltfAccessor[],
): number {
  const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION;
  if (!Number.isSafeInteger(accessorIndex) || accessorIndex === undefined) return 0;
  const count = accessors[accessorIndex]?.count;
  if (!Number.isSafeInteger(count) || count === undefined || count < 0) return 0;
  switch (primitive.mode ?? 4) {
    case 4:
      return Math.floor(count / 3);
    case 5:
    case 6:
      return Math.max(0, count - 2);
    default:
      return 0;
  }
}

function collectMetrics(
  json: GltfJson,
  bytes: Buffer,
  validatorErrors: number,
): DetailedMetrics {
  const accessors = json.accessors ?? [];
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  const trianglePrimitives = primitives.filter((primitive) => [4, 5, 6].includes(primitive.mode ?? 4));
  const uniqueJoints = new Set((json.skins ?? []).flatMap((skin) => skin.joints ?? []));
  const externalUris = [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((resource) => resource.uri)
    .filter((uri): uri is string => typeof uri === "string" && !uri.startsWith("data:"));
  const unsafeExternalResources = externalUris.filter((uri) => {
    if (/^(?:https?:|blob:|file:|\/\/)/iu.test(uri) || uri.includes("\\")) return true;
    try {
      const decoded = decodeURIComponent(uri);
      return decoded.includes("\\")
        || decoded.includes("?")
        || decoded.includes("#")
        || decoded.split("/").some((segment) => segment === ".." || segment === "." || !segment);
    } catch {
      return true;
    }
  });
  const extensions = new Set([
    ...(json.extensionsUsed ?? []),
    ...Object.keys(json.extensions ?? {}),
  ]);

  return Object.freeze({
    byteSize: bytes.length,
    triangles: primitives.reduce(
      (sum, primitive) => sum + primitiveTriangleCount(primitive, accessors),
      0,
    ),
    primitives: primitives.length,
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
    joints: uniqueJoints.size,
    meshes: json.meshes?.length ?? 0,
    skins: json.skins?.length ?? 0,
    hasVrmExtension: extensions.has("VRM") || extensions.has("VRMC_vrm"),
    validatorErrors,
    gltfVersion: json.asset?.version ?? null,
    primitivesWithoutPosition: primitives.filter(
      (primitive) => !Number.isSafeInteger(primitive.attributes?.POSITION),
    ).length,
    trianglePrimitivesWithoutNormals: trianglePrimitives.filter(
      (primitive) => !Number.isSafeInteger(primitive.attributes?.NORMAL),
    ).length,
    unsafeExternalResources: Object.freeze(unsafeExternalResources),
  });
}

async function validateModel(
  filePath: string,
  publicRoot: string,
  bytes: Buffer,
): Promise<ValidatorReport> {
  const module = await import("gltf-validator") as unknown as {
    validateBytes?: (data: Uint8Array, options?: unknown) => Promise<ValidatorReport>;
    validateString?: (data: string, options?: unknown) => Promise<ValidatorReport>;
    default?: {
      validateBytes?: (data: Uint8Array, options?: unknown) => Promise<ValidatorReport>;
      validateString?: (data: string, options?: unknown) => Promise<ValidatorReport>;
    };
  };
  const validateBytes = module.validateBytes ?? module.default?.validateBytes;
  const validateString = module.validateString ?? module.default?.validateString;
  const directory = path.dirname(filePath);
  const externalResourceFunction = async (uri: string): Promise<Uint8Array> => {
    if (uri.startsWith("data:")) {
      const comma = uri.indexOf(",");
      if (comma < 0) throw new Error("invalid-data-uri");
      const metadata = uri.slice(0, comma + 1);
      const body = uri.slice(comma + 1);
      const isBase64 = /;base64,/iu.test(metadata);
      return new Uint8Array(
        Buffer.from(isBase64 ? body : decodeURIComponent(body), isBase64 ? "base64" : "utf8"),
      );
    }
    const decoded = decodeURIComponent(uri);
    if (decoded.includes("\\") || decoded.includes("?") || decoded.includes("#")) {
      throw new Error(`unsafe-external-resource:${uri}`);
    }
    const target = path.resolve(directory, decoded);
    const relative = path.relative(publicRoot, target);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !existsSync(target)) {
      throw new Error(`unsafe-or-missing-external-resource:${uri}`);
    }
    return new Uint8Array(readFileSync(target));
  };
  const options = {
    uri: path.relative(publicRoot, filePath),
    externalResourceFunction,
    maxIssues: 100,
  };
  if (filePath.toLowerCase().endsWith(".gltf")) {
    if (!validateString) throw new Error("gltf-validator-validateString-unavailable");
    return validateString(bytes.toString("utf8"), options);
  }
  if (!validateBytes) throw new Error("gltf-validator-validateBytes-unavailable");
  return validateBytes(new Uint8Array(bytes), options);
}

async function main(): Promise<void> {
  const publicRoot = path.resolve(process.cwd(), "apps/web/public");
  const rejected = new Map<string, Rejection>();
  const reports: Record<string, unknown> = {};

  for (const sample of [...SAMPLE_VRMS].sort((left, right) => left.id.localeCompare(right.id))) {
    if (sample.visibility === "legacy") continue;
    const url = sample.url;
    if (!isStudioVrmProductionModelUrl(url)) {
      rejected.set(sample.id, "model-url");
      reports[sample.id] = { url, rejection: "model-url" };
      continue;
    }
    const filePath = path.resolve(publicRoot, url.slice(1));
    const relative = path.relative(publicRoot, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !existsSync(filePath)) {
      rejected.set(sample.id, "file-missing");
      reports[sample.id] = { url, rejection: "file-missing" };
      continue;
    }
    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) {
      rejected.set(sample.id, "file-not-regular");
      reports[sample.id] = { url, rejection: "file-not-regular" };
      continue;
    }
    if (fileStat.size > STUDIO_VRM_MODEL_MAX_BYTES) {
      rejected.set(sample.id, "file-too-large");
      reports[sample.id] = { url, byteSize: fileStat.size, rejection: "file-too-large" };
      continue;
    }

    try {
      const bytes = readFileSync(filePath);
      if (isGitLfsPointer(bytes)) {
        rejected.set(sample.id, "git-lfs-pointer");
        reports[sample.id] = { url, byteSize: bytes.length, rejection: "git-lfs-pointer" };
        continue;
      }
      const json = parseGltf(filePath, bytes);
      const validation = await validateModel(filePath, publicRoot, bytes);
      const metrics = collectMetrics(json, bytes, validation.issues?.numErrors ?? 0);
      let rejection: Rejection | null = classifyStudioVrmModelTechnicalRejection(metrics);
      if (!rejection && metrics.gltfVersion !== "2.0") rejection = "gltf-version";
      if (!rejection && metrics.primitivesWithoutPosition > 0) rejection = "position-missing";
      if (!rejection && metrics.trianglePrimitivesWithoutNormals > 0) rejection = "normal-missing";
      if (!rejection && metrics.unsafeExternalResources.length > 0) {
        rejection = "unsafe-external-resource";
      }
      if (rejection) rejected.set(sample.id, rejection);
      reports[sample.id] = { url, metrics, rejection };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const rejection = `scan-error:${message}` as const;
      rejected.set(sample.id, rejection);
      reports[sample.id] = { url, rejection };
    }
  }

  const entries = [...rejected.entries()];
  const generated = `/** Generated from deployment-owned glTF/VRM files. */\n`
    + `export const STUDIO_VRM_TECHNICAL_MODEL_REJECTIONS = Object.freeze({\n`
    + `${entries.map(([id, reason]) => `  ${JSON.stringify(id)}: ${JSON.stringify(reason)},`).join("\n")}\n`
    + `} as const);\n\n`
    + `const REJECTED_IDS = new Set<string>(Object.keys(STUDIO_VRM_TECHNICAL_MODEL_REJECTIONS));\n\n`
    + `export function isStudioVrmTechnicallyAdmittedModel(id: string): boolean {\n`
    + `  return !REJECTED_IDS.has(id);\n}\n`;

  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "apps/web/src/domains/creator/vrm/studio-vrm-model-technical-denylist.generated.ts",
    generated,
  );
  writeFileSync(
    "artifacts/studio-vrm-model-quality-report.json",
    `${JSON.stringify({ schemaVersion: 1, scanned: Object.keys(reports).length, rejected: Object.fromEntries(entries), reports }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ scanned: Object.keys(reports).length, rejected: Object.fromEntries(entries) }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
