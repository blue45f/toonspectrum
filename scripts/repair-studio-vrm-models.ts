import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { validateBytes } from "gltf-validator";

import {
  isStudioVrmProductionModelUrl,
} from "../apps/web/src/domains/creator/vrm/studio-vrm-model-quality";
import { SAMPLE_VRMS } from "../apps/web/src/domains/creator/vrm/vrm-library";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const WEIGHT_EPSILON = 1e-8;
const VALIDATOR_NOISE_CODES = Object.freeze([
  "ACCESSOR_JOINTS_USED_ZERO_WEIGHT",
  "MESH_PRIMITIVE_GENERATED_TANGENT_SPACE",
  "UNUSED_OBJECT",
] as const);
const SKIN_REPAIR_ERROR_CODES = new Set([
  "ACCESSOR_JOINTS_INDEX_DUPLICATE",
  "ACCESSOR_WEIGHTS_NON_NORMALIZED",
]);

type GltfAccessor = {
  bufferView?: number;
  byteOffset?: number;
  componentType?: number;
  normalized?: boolean;
  count?: number;
  type?: string;
  sparse?: unknown;
};
type GltfBufferView = {
  buffer?: number;
  byteOffset?: number;
  byteLength?: number;
  byteStride?: number;
};

type GltfPrimitive = {
  attributes?: Record<string, number>;
};

type GltfJson = {
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  meshes?: Array<{ primitives?: GltfPrimitive[] }>;
  nodes?: Array<{ children?: number[] }>;
  skins?: Array<{ joints?: number[]; skeleton?: number }>;
};

type GlbChunk = {
  type: number;
  data: Buffer;
};

type ParsedGlb = {
  json: GltfJson;
  chunks: GlbChunk[];
  jsonChunkIndex: number;
  binChunkIndex: number;
};
type AccessorLayout = {
  offset: number;
  stride: number;
  count: number;
  componentType: number;
  normalized: boolean;
};

type RepairStats = {
  readonly id: string;
  readonly url: string;
  readonly jsonPaddingBytes: number;
  readonly invalidSkeletonsRemoved: number;
  readonly verticesRepaired: number;
  readonly duplicateInfluencesMerged: number;
  readonly weightsNormalized: number;
  readonly zeroWeightJointsCleared: number;
  readonly unsupportedAccessorPairs: readonly string[];
  readonly validatorErrorsAfterRepair: number;
};

type MutableSkinStats = {
  verticesRepaired: number;
  duplicateInfluencesMerged: number;
  weightsNormalized: number;
  zeroWeightJointsCleared: number;
  unsupportedAccessorPairs: string[];
};

type PendingWrite = {
  path: string;
  bytes: Buffer;
};
function parseGlb(bytes: Buffer): ParsedGlb {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("invalid-glb-magic");
  }
  if (bytes.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error("unsupported-glb-version");
  }
  if (bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error("invalid-glb-length");
  }

  const chunks: GlbChunk[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (end > bytes.length) throw new Error("invalid-glb-chunk-length");
    chunks.push({ type, data: Buffer.from(bytes.subarray(offset + 8, end)) });
    offset = end;
  }
  if (offset !== bytes.length) throw new Error("invalid-glb-trailing-bytes");

  const jsonChunkIndex = chunks.findIndex((chunk) => chunk.type === GLB_JSON_CHUNK);
  const binChunkIndex = chunks.findIndex((chunk) => chunk.type === GLB_BIN_CHUNK);
  if (jsonChunkIndex < 0) throw new Error("missing-glb-json-chunk");
  const jsonText = chunks[jsonChunkIndex].data.toString("utf8").trim();
  return { json: JSON.parse(jsonText) as GltfJson, chunks, jsonChunkIndex, binChunkIndex };
}
function padChunk(data: Buffer, type: number): Buffer {
  const padding = (4 - (data.length % 4)) % 4;
  if (padding === 0) return data;
  return Buffer.concat([
    data,
    Buffer.alloc(padding, type === GLB_JSON_CHUNK ? 0x20 : 0x00),
  ]);
}

function encodeGlb(parsed: ParsedGlb, jsonChanged: boolean): Buffer {
  const chunks = parsed.chunks.map((chunk, index) => {
    const source = index === parsed.jsonChunkIndex && jsonChanged
      ? Buffer.from(JSON.stringify(parsed.json), "utf8")
      : chunk.data;
    return { type: chunk.type, data: padChunk(source, chunk.type) };
  });
  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = Buffer.allocUnsafe(totalLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(totalLength, 8);
  let offset = 12;
  for (const chunk of chunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}
function isAncestor(parentByNode: readonly number[], ancestor: number, node: number): boolean {
  const visited = new Set<number>();
  let current = node;
  while (current >= 0 && !visited.has(current)) {
    if (current === ancestor) return true;
    visited.add(current);
    current = parentByNode[current] ?? -1;
  }
  return false;
}

function removeInvalidSkeletonRoots(
  json: GltfJson,
  invalidSkinIndices: ReadonlySet<number>,
): number {
  const nodes = json.nodes ?? [];
  const parentByNode = Array.from({ length: nodes.length }, () => -1);
  for (const [parent, node] of nodes.entries()) {
    for (const child of node.children ?? []) {
      if (Number.isSafeInteger(child) && child >= 0 && child < nodes.length) {
        parentByNode[child] = parent;
      }
    }
  }

  let removed = 0;
  for (const [skinIndex, skin] of (json.skins ?? []).entries()) {
    const skeleton = skin.skeleton;
    if (!Number.isSafeInteger(skeleton)) continue;
    const valid = (skin.joints ?? []).every((joint) => isAncestor(parentByNode, skeleton!, joint));
    if (invalidSkinIndices.has(skinIndex) || !valid) {
      delete skin.skeleton;
      removed += 1;
    }
  }
  return removed;
}
function componentByteSize(componentType: number): number {
  switch (componentType) {
    case UNSIGNED_BYTE: return 1;
    case UNSIGNED_SHORT: return 2;
    case UNSIGNED_INT:
    case FLOAT: return 4;
    default: throw new Error(`unsupported-component-type:${componentType}`);
  }
}

function readComponent(buffer: Buffer, offset: number, componentType: number): number {
  switch (componentType) {
    case UNSIGNED_BYTE: return buffer.readUInt8(offset);
    case UNSIGNED_SHORT: return buffer.readUInt16LE(offset);
    case UNSIGNED_INT: return buffer.readUInt32LE(offset);
    case FLOAT: return buffer.readFloatLE(offset);
    default: throw new Error(`unsupported-component-type:${componentType}`);
  }
}

function writeComponent(
  buffer: Buffer,
  offset: number,
  componentType: number,
  value: number,
): void {
  switch (componentType) {
    case UNSIGNED_BYTE: buffer.writeUInt8(value, offset); break;
    case UNSIGNED_SHORT: buffer.writeUInt16LE(value, offset); break;
    case UNSIGNED_INT: buffer.writeUInt32LE(value, offset); break;
    case FLOAT: buffer.writeFloatLE(value, offset); break;
    default: throw new Error(`unsupported-component-type:${componentType}`);
  }
}
function normalizedMaximum(componentType: number): number {
  switch (componentType) {
    case UNSIGNED_BYTE: return 0xff;
    case UNSIGNED_SHORT: return 0xffff;
    case UNSIGNED_INT: return 0xffff_ffff;
    default: throw new Error(`unsupported-normalized-component:${componentType}`);
  }
}

function getAccessorLayout(
  json: GltfJson,
  accessorIndex: number,
  binLength: number,
): AccessorLayout {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.type !== "VEC4" || accessor.sparse) {
    throw new Error(`unsupported-accessor:${accessorIndex}`);
  }
  const bufferView = json.bufferViews?.[accessor.bufferView ?? -1];
  if (!bufferView || (bufferView.buffer ?? 0) !== 0) {
    throw new Error(`unsupported-buffer-view:${accessorIndex}`);
  }
  const componentType = accessor.componentType ?? -1;
  const elementSize = componentByteSize(componentType) * 4;
  const stride = bufferView.byteStride ?? elementSize;
  const count = accessor.count ?? -1;
  const offset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (!Number.isSafeInteger(count) || count < 0 || stride < elementSize) {
    throw new Error(`invalid-accessor-layout:${accessorIndex}`);
  }
  const end = count === 0 ? offset : offset + (count - 1) * stride + elementSize;
  if (offset < 0 || end > binLength) throw new Error(`accessor-out-of-bounds:${accessorIndex}`);
  return { offset, stride, count, componentType, normalized: accessor.normalized === true };
}
function decodeWeight(raw: number, layout: AccessorLayout): number {
  if (layout.componentType === FLOAT) return raw;
  return layout.normalized ? raw / normalizedMaximum(layout.componentType) : raw;
}

function encodeWeights(values: readonly number[], layout: AccessorLayout): number[] {
  if (layout.componentType === FLOAT) {
    const encoded = values.map((value) => Math.fround(value));
    let largest = 0;
    for (let index = 1; index < encoded.length; index += 1) {
      if (encoded[index] > encoded[largest]) largest = index;
    }
    const delta = 1 - encoded.reduce((sum, value) => sum + value, 0);
    encoded[largest] = Math.fround(encoded[largest] + delta);
    return encoded;
  }
  if (!layout.normalized) throw new Error("integer-weights-not-normalized");
  const maximum = normalizedMaximum(layout.componentType);
  const scaled = values.map((value) => value * maximum);
  const encoded = scaled.map((value) => Math.floor(value));
  let remaining = maximum - encoded.reduce((sum, value) => sum + value, 0);
  const order = scaled
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);
  for (let index = 0; remaining > 0; index = (index + 1) % order.length) {
    encoded[order[index].index] += 1;
    remaining -= 1;
  }
  return encoded;
}
function repairAccessorPair(
  json: GltfJson,
  bin: Buffer,
  jointsIndex: number,
  weightsIndex: number,
  stats: MutableSkinStats,
): void {
  const joints = getAccessorLayout(json, jointsIndex, bin.length);
  const weights = getAccessorLayout(json, weightsIndex, bin.length);
  if (joints.count !== weights.count || joints.componentType === FLOAT) {
    throw new Error(`incompatible-skin-accessors:${jointsIndex}:${weightsIndex}`);
  }
  const jointSize = componentByteSize(joints.componentType);
  const weightSize = componentByteSize(weights.componentType);

  for (let vertex = 0; vertex < joints.count; vertex += 1) {
    const jointValues: number[] = [];
    const rawWeights: number[] = [];
    const decodedWeights: number[] = [];
    for (let component = 0; component < 4; component += 1) {
      jointValues.push(readComponent(
        bin,
        joints.offset + vertex * joints.stride + component * jointSize,
        joints.componentType,
      ));
      const raw = readComponent(
        bin,
        weights.offset + vertex * weights.stride + component * weightSize,
        weights.componentType,
      );
      rawWeights.push(raw);
      decodedWeights.push(decodeWeight(raw, weights));
    }
    const merged = new Map<number, number>();
    for (let component = 0; component < 4; component += 1) {
      const weight = decodedWeights[component];
      const joint = jointValues[component];
      if (weight <= WEIGHT_EPSILON || !Number.isFinite(weight)) {
        if (joint !== 0) stats.zeroWeightJointsCleared += 1;
        continue;
      }
      if (merged.has(joint)) stats.duplicateInfluencesMerged += 1;
      merged.set(joint, (merged.get(joint) ?? 0) + weight);
    }

    let total = [...merged.values()].reduce((sum, weight) => sum + weight, 0);
    if (total <= WEIGHT_EPSILON) {
      merged.clear();
      merged.set(0, 1);
      total = 1;
    }
    const normalizedEntries = [...merged.entries()].map(([joint, weight]) => [
      joint,
      weight / total,
    ] as const);
    const nextJoints = [0, 0, 0, 0];
    const normalizedWeights = [0, 0, 0, 0];
    for (let index = 0; index < Math.min(4, normalizedEntries.length); index += 1) {
      nextJoints[index] = normalizedEntries[index][0];
      normalizedWeights[index] = normalizedEntries[index][1];
    }
    const nextWeights = encodeWeights(normalizedWeights, weights);
    const jointsChanged = nextJoints.some((value, index) => value !== jointValues[index]);
    const weightsChanged = nextWeights.some((value, index) => value !== rawWeights[index]);
    if (!jointsChanged && !weightsChanged) continue;

    stats.verticesRepaired += 1;
    if (weightsChanged) stats.weightsNormalized += 1;
    for (let component = 0; component < 4; component += 1) {
      writeComponent(
        bin,
        joints.offset + vertex * joints.stride + component * jointSize,
        joints.componentType,
        nextJoints[component],
      );
      writeComponent(
        bin,
        weights.offset + vertex * weights.stride + component * weightSize,
        weights.componentType,
        nextWeights[component],
      );
    }
  }
}

function repairSkinning(json: GltfJson, bin: Buffer): MutableSkinStats {
  const stats: MutableSkinStats = {
    verticesRepaired: 0,
    duplicateInfluencesMerged: 0,
    weightsNormalized: 0,
    zeroWeightJointsCleared: 0,
    unsupportedAccessorPairs: [],
  };
  const processed = new Set<string>();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const secondaryJoints = primitive.attributes?.JOINTS_1;
      const secondaryWeights = primitive.attributes?.WEIGHTS_1;
      if (Number.isSafeInteger(secondaryJoints) || Number.isSafeInteger(secondaryWeights)) {
        stats.unsupportedAccessorPairs.push(
          `secondary-influence-set:${secondaryJoints ?? "missing"}:${secondaryWeights ?? "missing"}`,
        );
        continue;
      }
      const jointsIndex = primitive.attributes?.JOINTS_0;
      const weightsIndex = primitive.attributes?.WEIGHTS_0;
      if (!Number.isSafeInteger(jointsIndex) || !Number.isSafeInteger(weightsIndex)) continue;
      const key = `${jointsIndex}:${weightsIndex}`;
      if (processed.has(key)) continue;
      processed.add(key);
      try {
        repairAccessorPair(json, bin, jointsIndex!, weightsIndex!, stats);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stats.unsupportedAccessorPairs.push(`${key}:${message}`);
      }
    }
  }
  return stats;
}

function countJsonPadding(parsed: ParsedGlb): number {
  const length = parsed.chunks[parsed.jsonChunkIndex].data.length;
  return (4 - (length % 4)) % 4;
}

function summarizeErrorCodes(
  messages: readonly { readonly code: string; readonly severity: number }[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const message of messages) {
    if (message.severity !== 0) continue;
    result[message.code] = (result[message.code] ?? 0) + 1;
  }
  return result;
}

function collectInvalidSkeletonSkinIndices(
  messages: readonly {
    readonly code: string;
    readonly severity: number;
    readonly pointer?: string;
  }[],
): ReadonlySet<number> {
  const indices = new Set<number>();
  for (const message of messages) {
    if (message.severity !== 0 || message.code !== "SKIN_SKELETON_INVALID") continue;
    const match = /^\/skins\/(\d+)\/skeleton$/u.exec(message.pointer ?? "");
    if (match) indices.add(Number(match[1]));
  }
  return indices;
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check");
  if (write && check) throw new Error("choose-either-write-or-check");

  const publicRoot = path.resolve(process.cwd(), "apps/web/public");
  const candidates = new Map<string, string[]>();
  for (const sample of SAMPLE_VRMS) {
    if (
      sample.visibility === "legacy"
      || !isStudioVrmProductionModelUrl(sample.url)
      || !/\.(?:glb|vrm)$/iu.test(sample.url)
    ) {
      continue;
    }
    const ids = candidates.get(sample.url) ?? [];
    ids.push(sample.id);
    candidates.set(sample.url, ids);
  }

  const repairs: RepairStats[] = [];
  const pendingWrites: PendingWrite[] = [];
  const failures: Array<Record<string, unknown>> = [];
  for (const [url, ids] of [...candidates].sort(([left], [right]) => left.localeCompare(right))) {
    const filePath = path.resolve(publicRoot, url.slice(1));
    const original = readFileSync(filePath);
    const initialValidation = await validateBytes(new Uint8Array(original), {
      uri: url,
      maxIssues: 20_000,
      ignoredIssues: VALIDATOR_NOISE_CODES,
    });
    if (initialValidation.issues.truncated === true) {
      failures.push({ ids, url, reason: "validator-output-truncated-before-repair" });
      continue;
    }
    if (initialValidation.issues.numErrors === 0) continue;
    const errorCodes = summarizeErrorCodes(initialValidation.issues.messages);
    const parsed = parseGlb(original);
    const jsonPaddingBytes = countJsonPadding(parsed);
    const invalidSkeletonsRemoved = removeInvalidSkeletonRoots(
      parsed.json,
      collectInvalidSkeletonSkinIndices(initialValidation.issues.messages),
    );
    const shouldRepairSkinning = Object.keys(errorCodes)
      .some((code) => SKIN_REPAIR_ERROR_CODES.has(code));
    const skinStats = shouldRepairSkinning && parsed.binChunkIndex >= 0
      ? repairSkinning(parsed.json, parsed.chunks[parsed.binChunkIndex].data)
      : {
        verticesRepaired: 0,
        duplicateInfluencesMerged: 0,
        weightsNormalized: 0,
        zeroWeightJointsCleared: 0,
        unsupportedAccessorPairs: shouldRepairSkinning ? ["missing-bin-chunk"] : [],
      };
    if (skinStats.unsupportedAccessorPairs.length > 0) {
      failures.push({
        ids,
        url,
        reason: "unsupported-skin-accessor-layout",
        unsupportedAccessorPairs: skinStats.unsupportedAccessorPairs,
      });
      continue;
    }
    const changed = jsonPaddingBytes > 0
      || invalidSkeletonsRemoved > 0
      || skinStats.verticesRepaired > 0;
    if (!changed) {
      failures.push({
        ids,
        url,
        reason: "validator-errors-not-automatically-repairable",
        errors: initialValidation.issues.numErrors,
        errorCodes: summarizeErrorCodes(initialValidation.issues.messages),
      });
      continue;
    }

    const repaired = encodeGlb(parsed, invalidSkeletonsRemoved > 0);
    const validation = await validateBytes(new Uint8Array(repaired), {
      uri: url,
      maxIssues: 20_000,
      ignoredIssues: VALIDATOR_NOISE_CODES,
    });
    const stats: RepairStats = {
      id: ids.join(","),
      url,
      jsonPaddingBytes,
      invalidSkeletonsRemoved,
      verticesRepaired: skinStats.verticesRepaired,
      duplicateInfluencesMerged: skinStats.duplicateInfluencesMerged,
      weightsNormalized: skinStats.weightsNormalized,
      zeroWeightJointsCleared: skinStats.zeroWeightJointsCleared,
      unsupportedAccessorPairs: skinStats.unsupportedAccessorPairs,
      validatorErrorsAfterRepair: validation.issues.numErrors,
    };
    repairs.push(stats);
    if (validation.issues.truncated === true || validation.issues.numErrors > 0) {
      failures.push({
        ids,
        url,
        reason: validation.issues.truncated === true
          ? "validator-output-truncated-after-repair"
          : "validator-errors-remain-after-repair",
        errors: validation.issues.numErrors,
        errorCodes: summarizeErrorCodes(validation.issues.messages),
        stats,
      });
      continue;
    }
    pendingWrites.push({ path: filePath, bytes: repaired });
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({ failures, repairs }, null, 2));
    process.exitCode = 1;
    return;
  }
  if (write) {
    for (const pending of pendingWrites) writeFileSync(pending.path, pending.bytes);
  }
  const result = {
    mode: write ? "write" : check ? "check" : "dry-run",
    scanned: candidates.size,
    repairableFiles: repairs.length,
    repairedFiles: write ? pendingWrites.length : 0,
    repairs,
  };
  console.log(JSON.stringify(result, null, 2));
  if (check && repairs.length > 0) {
    console.error("Studio VRM assets require repair. Run pnpm repair:studio-vrm-assets.");
    process.exitCode = 1;
  }
}

export const STUDIO_VRM_REPAIR_TESTING = Object.freeze({
  collectInvalidSkeletonSkinIndices,
  encodeGlb,
  parseGlb,
  removeInvalidSkeletonRoots,
  repairSkinning,
});

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
