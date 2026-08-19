import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { validateVrmGlbBytes } from "./vrm-library";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

if (typeof globalThis.createImageBitmap !== "function") {
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    writable: true,
    value: async () => ({
      width: 1,
      height: 1,
      close() {},
    }) as unknown as ImageBitmap,
  });
}

const WAVE4_VRM_FILES = [
  "TS_Samira_OrbitalBotanist.vrm",
  "TS_Yunae_DeafPercussionist.vrm",
  "TS_Boram_WeatherScientist.vrm",
  "TS_Hyeon_StudioPotter.vrm",
  "TS_Dorong_SeaOtterCourier.vrm",
] as const;
const WAVE5_VRM_FILES = [
  "TS_Sunja_HaenyeoMentor.vrm",
  "TS_Maya_CoutureDirector.vrm",
  "TS_Iseul_AdaptiveRescuer.vrm",
  "TS_Neoul_CoralDjinn.vrm",
] as const;
const STRICT_ORIGINAL_VRM_FILES = [...WAVE4_VRM_FILES, ...WAVE5_VRM_FILES] as const;
const ORION_REPAIR_FILE = "Avatar_Orion.vrm";

const CC0_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
const MAX_WAVE4_FILE_BYTES = 5 * 1024 * 1024;
const ACTIVE_WEIGHT_EPSILON = 0.01;

/**
 * Waves 4 and 5 deliberately require the 53-bone profile used by the Studio poser. Optional VRM
 * bones such as upperChest and jaw are allowed by the specification but are outside this contract.
 */
const WAVE4_HUMANOID_BONES = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "leftEye",
  "rightEye",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
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

const ACTIVE_DEFORMATION_BONES = WAVE4_HUMANOID_BONES.filter((bone) =>
  bone === "leftEye"
  || bone === "rightEye"
  || bone === "leftToes"
  || bone === "rightToes"
  || bone.includes("Thumb")
  || bone.includes("Index")
  || bone.includes("Middle")
  || bone.includes("Ring")
  || bone.includes("Little")
);

const REQUIRED_BOUND_EXPRESSIONS = [
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
  "blink",
  "blinkLeft",
  "blinkRight",
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
] as const;

type JsonRecord = Record<string, unknown>;

type GltfAccessor = JsonRecord & {
  bufferView?: number;
  byteOffset?: number;
  componentType?: number;
  count?: number;
  normalized?: boolean;
  sparse?: {
    count?: number;
    indices?: { bufferView?: number; byteOffset?: number; componentType?: number };
    values?: { bufferView?: number; byteOffset?: number };
  };
  type?: string;
};

type GltfBufferView = JsonRecord & {
  byteOffset?: number;
  byteStride?: number;
};

type GltfPrimitive = {
  attributes?: JsonRecord;
  targets?: JsonRecord[];
};

type GltfMesh = JsonRecord & {
  primitives?: GltfPrimitive[];
};

type GltfNode = JsonRecord & {
  mesh?: number;
  skin?: number;
};

type GltfSkin = JsonRecord & {
  joints?: number[];
};

function bundledBytes(fileName: string): Uint8Array {
  const filePath = join(process.cwd(), "public", "vrm", fileName);
  expect(existsSync(filePath), `${fileName}: strict original binary has not been generated`).toBe(true);
  return readFileSync(filePath);
}

function embeddedJson(bytes: Uint8Array): JsonRecord {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as JsonRecord;
}

function binaryChunk(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const binaryHeaderOffset = 20 + jsonLength;
  const binaryLength = view.getUint32(binaryHeaderOffset, true);
  return bytes.subarray(binaryHeaderOffset + 8, binaryHeaderOffset + 8 + binaryLength);
}

function componentByteSize(componentType: number): number {
  switch (componentType) {
    case 5120:
    case 5121:
      return 1;
    case 5122:
    case 5123:
      return 2;
    case 5125:
    case 5126:
      return 4;
    default:
      throw new TypeError(`Unsupported glTF component type: ${componentType}`);
  }
}

function accessorComponentCount(type: string): number {
  switch (type) {
    case "SCALAR":
      return 1;
    case "VEC2":
      return 2;
    case "VEC3":
      return 3;
    case "VEC4":
      return 4;
    case "MAT2":
      return 4;
    case "MAT3":
      return 9;
    case "MAT4":
      return 16;
    default:
      throw new TypeError(`Unsupported glTF accessor type: ${type}`);
  }
}

function readComponent(view: DataView, offset: number, componentType: number): number {
  switch (componentType) {
    case 5120:
      return view.getInt8(offset);
    case 5121:
      return view.getUint8(offset);
    case 5122:
      return view.getInt16(offset, true);
    case 5123:
      return view.getUint16(offset, true);
    case 5125:
      return view.getUint32(offset, true);
    case 5126:
      return view.getFloat32(offset, true);
    default:
      throw new TypeError(`Unsupported glTF component type: ${componentType}`);
  }
}

function normalizedComponent(value: number, componentType: number): number {
  switch (componentType) {
    case 5120:
      return Math.max(value / 127, -1);
    case 5121:
      return value / 255;
    case 5122:
      return Math.max(value / 32767, -1);
    case 5123:
      return value / 65535;
    case 5125:
      return value / 4294967295;
    case 5126:
      return value;
    default:
      throw new TypeError(`Unsupported normalized glTF component type: ${componentType}`);
  }
}

function accessorVectors(
  json: JsonRecord,
  binary: Uint8Array,
  accessorIndex: number,
  applyNormalization: boolean,
): number[][] {
  const accessors = json.accessors as GltfAccessor[];
  const bufferViews = json.bufferViews as GltfBufferView[];
  const accessor = accessors[accessorIndex];
  const bufferViewIndex = accessor?.bufferView;
  if (!accessor) throw new TypeError(`Accessor ${accessorIndex} does not exist`);
  if (
    typeof accessor.componentType !== "number"
    || typeof accessor.count !== "number"
    || typeof accessor.type !== "string"
  ) {
    throw new TypeError(`Accessor ${accessorIndex} is missing its layout`);
  }

  const bytesPerComponent = componentByteSize(accessor.componentType);
  const components = accessorComponentCount(accessor.type);
  const packedStride = bytesPerComponent * components;
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const vectors: number[][] = Array.from(
    { length: accessor.count },
    () => Array.from({ length: components }, () => 0),
  );

  if (typeof bufferViewIndex === "number" && Number.isInteger(bufferViewIndex)) {
    const bufferView = bufferViews[bufferViewIndex];
    if (!bufferView) throw new RangeError(`Accessor ${accessorIndex} references a missing bufferView`);
    const stride = Number(bufferView.byteStride ?? packedStride);
    if (stride < packedStride) throw new RangeError(`Accessor ${accessorIndex} has an invalid stride`);
    const baseOffset = Number(bufferView.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
    for (let item = 0; item < accessor.count; item += 1) {
      const vector = vectors[item];
      if (!vector) throw new RangeError(`Accessor ${accessorIndex} base item is missing`);
      for (let component = 0; component < components; component += 1) {
        const offset = baseOffset + item * stride + component * bytesPerComponent;
        const raw = readComponent(view, offset, accessor.componentType);
        vector[component] = applyNormalization && accessor.normalized
          ? normalizedComponent(raw, accessor.componentType)
          : raw;
      }
    }
  }

  const sparse = accessor.sparse;
  if (sparse) {
    const sparseCount = sparse.count;
    const indicesBufferViewIndex = sparse.indices?.bufferView;
    const indicesComponentType = sparse.indices?.componentType;
    const valuesBufferViewIndex = sparse.values?.bufferView;
    if (
      typeof sparseCount !== "number"
      || typeof indicesBufferViewIndex !== "number"
      || typeof indicesComponentType !== "number"
      || typeof valuesBufferViewIndex !== "number"
    ) {
      throw new TypeError(`Accessor ${accessorIndex} has an incomplete sparse layout`);
    }
    const indicesBufferView = bufferViews[indicesBufferViewIndex];
    const valuesBufferView = bufferViews[valuesBufferViewIndex];
    if (!indicesBufferView || !valuesBufferView) {
      throw new RangeError(`Accessor ${accessorIndex} sparse bufferView is missing`);
    }
    const indexByteSize = componentByteSize(indicesComponentType);
    const indicesOffset = Number(indicesBufferView.byteOffset ?? 0)
      + Number(sparse.indices?.byteOffset ?? 0);
    const valuesOffset = Number(valuesBufferView.byteOffset ?? 0)
      + Number(sparse.values?.byteOffset ?? 0);
    for (let sparseIndex = 0; sparseIndex < sparseCount; sparseIndex += 1) {
      const targetIndex = readComponent(
        view,
        indicesOffset + sparseIndex * indexByteSize,
        indicesComponentType,
      );
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= vectors.length) {
        throw new RangeError(`Accessor ${accessorIndex} sparse index is out of range`);
      }
      const vector = vectors[targetIndex];
      if (!vector) throw new RangeError(`Accessor ${accessorIndex} sparse item is missing`);
      for (let component = 0; component < components; component += 1) {
        const raw = readComponent(
          view,
          valuesOffset + (sparseIndex * components + component) * bytesPerComponent,
          accessor.componentType,
        );
        vector[component] = applyNormalization && accessor.normalized
          ? normalizedComponent(raw, accessor.componentType)
          : raw;
      }
    }
  }

  if (typeof bufferViewIndex !== "number" && !sparse) {
    throw new TypeError(`Accessor ${accessorIndex} has no base bufferView or sparse values`);
  }
  return vectors;
}

function validateSkinning(fileName: string, json: JsonRecord, binary: Uint8Array): void {
  const nodes = json.nodes as GltfNode[];
  const meshes = json.meshes as GltfMesh[];
  const skins = json.skins as GltfSkin[];
  const vrm = (json.extensions as JsonRecord).VRMC_vrm as JsonRecord;
  const humanoid = vrm.humanoid as JsonRecord;
  const humanBones = humanoid.humanBones as Record<string, { node?: unknown }>;

  const boneNames = Object.keys(humanBones).sort();
  expect(boneNames, `${fileName}: exact 53-bone humanoid profile`)
    .toEqual([...WAVE4_HUMANOID_BONES].sort());

  const mappedNodes = WAVE4_HUMANOID_BONES.map((bone) => {
    const node = humanBones[bone]?.node;
    expect(node, `${fileName}: ${bone} node`).toBeTypeOf("number");
    expect(Number.isInteger(node), `${fileName}: ${bone} integer node`).toBe(true);
    expect(Number(node), `${fileName}: ${bone} node range`).toBeGreaterThanOrEqual(0);
    expect(Number(node), `${fileName}: ${bone} node range`).toBeLessThan(nodes.length);
    return Number(node);
  });
  expect(new Set(mappedNodes).size, `${fileName}: humanoid mappings must not alias`)
    .toBe(WAVE4_HUMANOID_BONES.length);

  const influencedNodes = new Map<number, { maxWeight: number; vertexCount: number }>();
  let blendedVertexCount = 0;
  let skinnedPrimitiveCount = 0;

  for (const node of nodes) {
    if (!Number.isInteger(node.mesh) || !Number.isInteger(node.skin)) continue;
    const mesh = meshes[node.mesh as number];
    const skin = skins[node.skin as number];
    const joints = skin?.joints;
    expect(mesh, `${fileName}: skinned node mesh`).toBeDefined();
    expect(joints, `${fileName}: skinned node joints`).toBeDefined();
    if (!mesh || !joints) continue;

    for (const primitive of mesh.primitives ?? []) {
      const jointsAccessor = primitive.attributes?.JOINTS_0;
      const weightsAccessor = primitive.attributes?.WEIGHTS_0;
      expect(jointsAccessor, `${fileName}: JOINTS_0`).toBeTypeOf("number");
      expect(weightsAccessor, `${fileName}: WEIGHTS_0`).toBeTypeOf("number");
      if (typeof jointsAccessor !== "number" || typeof weightsAccessor !== "number") continue;

      skinnedPrimitiveCount += 1;
      const jointVectors = accessorVectors(json, binary, jointsAccessor, false);
      const weightVectors = accessorVectors(json, binary, weightsAccessor, true);
      expect(weightVectors.length, `${fileName}: joint/weight vertex count`)
        .toBe(jointVectors.length);

      for (let vertex = 0; vertex < weightVectors.length; vertex += 1) {
        const jointVector = jointVectors[vertex];
        const weightVector = weightVectors[vertex];
        expect(jointVector, `${fileName}: joint vector ${vertex}`).toHaveLength(4);
        expect(weightVector, `${fileName}: weight vector ${vertex}`).toHaveLength(4);

        const weightSum = weightVector.reduce((sum, weight) => sum + weight, 0);
        expect(weightVector.every((weight) => Number.isFinite(weight) && weight >= 0),
          `${fileName}: finite non-negative weights at vertex ${vertex}`).toBe(true);
        expect(Math.abs(weightSum - 1), `${fileName}: normalized weights at vertex ${vertex}`)
          .toBeLessThanOrEqual(0.01);
        if (weightVector.filter((weight) => weight > ACTIVE_WEIGHT_EPSILON).length >= 2) {
          blendedVertexCount += 1;
        }

        for (let slot = 0; slot < 4; slot += 1) {
          const jointIndex = jointVector[slot];
          const weight = weightVector[slot];
          expect(Number.isInteger(jointIndex), `${fileName}: integer joint index`).toBe(true);
          expect(jointIndex, `${fileName}: joint index range`).toBeGreaterThanOrEqual(0);
          expect(jointIndex, `${fileName}: joint index range`).toBeLessThan(joints.length);
          if (weight <= ACTIVE_WEIGHT_EPSILON) continue;

          const boneNode = joints[jointIndex];
          const previous = influencedNodes.get(boneNode) ?? { maxWeight: 0, vertexCount: 0 };
          influencedNodes.set(boneNode, {
            maxWeight: Math.max(previous.maxWeight, weight),
            vertexCount: previous.vertexCount + 1,
          });
        }
      }
    }
  }

  expect(skinnedPrimitiveCount, `${fileName}: skinned primitives`).toBeGreaterThan(0);
  expect(blendedVertexCount, `${fileName}: real joint transition vertices`).toBeGreaterThan(0);
  for (const bone of ACTIVE_DEFORMATION_BONES) {
    const mappedNode = Number(humanBones[bone]?.node);
    const influence = influencedNodes.get(mappedNode);
    expect(influence?.vertexCount ?? 0, `${fileName}: ${bone} must deform visible vertices`)
      .toBeGreaterThan(0);
    expect(influence?.maxWeight ?? 0, `${fileName}: ${bone} needs a meaningful skin weight`)
      .toBeGreaterThan(0.05);
  }
}

function validateExpressions(fileName: string, json: JsonRecord): void {
  const nodes = json.nodes as GltfNode[];
  const meshes = json.meshes as GltfMesh[];
  const vrm = (json.extensions as JsonRecord).VRMC_vrm as JsonRecord;
  const expressions = vrm.expressions as JsonRecord;
  const preset = expressions.preset as Record<string, JsonRecord>;
  const nonEmptyExpressions = Object.entries(preset).filter(([, expression]) => {
    const binds = expression.morphTargetBinds;
    return Array.isArray(binds) && binds.length > 0;
  });

  expect(nonEmptyExpressions.length, `${fileName}: non-empty preset expressions`)
    .toBeGreaterThanOrEqual(13);
  for (const expressionName of REQUIRED_BOUND_EXPRESSIONS) {
    const expression = preset[expressionName];
    expect(expression, `${fileName}: ${expressionName} expression`).toBeDefined();
    expect(expression?.morphTargetBinds, `${fileName}: ${expressionName} binds`)
      .toEqual(expect.arrayContaining([expect.any(Object)]));
  }

  for (const [expressionName, expression] of nonEmptyExpressions) {
    const binds = expression.morphTargetBinds as JsonRecord[];
    for (const [bindIndex, bind] of binds.entries()) {
      const nodeIndex = bind.node;
      const morphIndex = bind.index;
      const weight = bind.weight;
      expect(nodeIndex, `${fileName}: ${expressionName}[${bindIndex}] node`).toBeTypeOf("number");
      expect(morphIndex, `${fileName}: ${expressionName}[${bindIndex}] index`).toBeTypeOf("number");
      expect(weight, `${fileName}: ${expressionName}[${bindIndex}] weight`).toBeTypeOf("number");
      if (
        typeof nodeIndex !== "number"
        || typeof morphIndex !== "number"
        || typeof weight !== "number"
      ) continue;

      expect(Number.isInteger(nodeIndex)).toBe(true);
      expect(nodeIndex).toBeGreaterThanOrEqual(0);
      expect(nodeIndex).toBeLessThan(nodes.length);
      expect(Number.isInteger(morphIndex)).toBe(true);
      expect(morphIndex).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(weight) && weight > 0 && weight <= 1).toBe(true);

      const meshIndex = nodes[nodeIndex]?.mesh;
      expect(meshIndex, `${fileName}: ${expressionName}[${bindIndex}] mesh`).toBeTypeOf("number");
      const primitives = typeof meshIndex === "number" ? meshes[meshIndex]?.primitives ?? [] : [];
      expect(
        primitives.some((primitive) => (primitive.targets?.length ?? 0) > morphIndex),
        `${fileName}: ${expressionName}[${bindIndex}] target exists`,
      ).toBe(true);
    }
  }
}

function validateBoundedMorphTargets(
  fileName: string,
  json: JsonRecord,
  binary: Uint8Array,
): void {
  const meshes = json.meshes as GltfMesh[];
  let targetCount = 0;
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      for (const target of primitive.targets ?? []) {
        const positionAccessor = target.POSITION;
        expect(positionAccessor, `${fileName}: morph POSITION accessor`).toBeTypeOf("number");
        if (typeof positionAccessor !== "number") continue;
        targetCount += 1;
        const deltas = accessorVectors(json, binary, positionAccessor, true).flat();
        expect(deltas.every(Number.isFinite), `${fileName}: finite morph deltas`).toBe(true);
        const maxAbsoluteDelta = Math.max(...deltas.map(Math.abs));
        expect(maxAbsoluteDelta, `${fileName}: bounded independent morph target`)
          .toBeLessThanOrEqual(0.12);
      }
    }
  }
  expect(targetCount, `${fileName}: real morph target count`).toBeGreaterThanOrEqual(11);
}

describe("ToonSpectrum Wave 4/5 character quality contract", () => {
  it.each(STRICT_ORIGINAL_VRM_FILES)("%s is a compact, self-contained MToon VRM 1.0 with an active full rig", (fileName) => {
    const bytes = bundledBytes(fileName);
    expect(validateVrmGlbBytes(bytes)).toEqual({ vrmVersion: 1 });
    expect(bytes.byteLength, `${fileName}: non-placeholder binary`).toBeGreaterThan(100 * 1024);
    expect(bytes.byteLength, `${fileName}: 5 MB delivery budget`).toBeLessThanOrEqual(
      MAX_WAVE4_FILE_BYTES,
    );

    const json = embeddedJson(bytes);
    const extensionsUsed = json.extensionsUsed as string[];
    const extensions = json.extensions as JsonRecord;
    const vrm = extensions.VRMC_vrm as JsonRecord;
    const meta = vrm.meta as JsonRecord;
    const resources = [
      ...((json.buffers as JsonRecord[] | undefined) ?? []),
      ...((json.images as JsonRecord[] | undefined) ?? []),
    ];

    expect(vrm.specVersion).toBe("1.0");
    expect(extensionsUsed).toEqual(expect.arrayContaining([
      "VRMC_vrm",
      "VRMC_materials_mtoon",
    ]));
    expect(meta).toMatchObject({
      authors: ["ToonSpectrum"],
      licenseUrl: "https://vrm.dev/licenses/1.0/",
      avatarPermission: "everyone",
      commercialUsage: "corporation",
      creditNotation: "unnecessary",
      allowRedistribution: true,
      modification: "allowModificationRedistribution",
      otherLicenseUrl: CC0_LICENSE_URL,
    });
    expect(resources.every((resource) => resource.uri === undefined),
      `${fileName}: no external buffers or images`).toBe(true);

    const binary = binaryChunk(bytes);
    validateSkinning(fileName, json, binary);
    validateExpressions(fileName, json);
    if ((WAVE5_VRM_FILES as readonly string[]).includes(fileName)) {
      validateBoundedMorphTargets(fileName, json, binary);
    }
  });

  it.each(STRICT_ORIGINAL_VRM_FILES)("%s loads through GLTFLoader and the app's three-vrm plugin", async (fileName) => {
    const bytes = bundledBytes(fileName);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(arrayBuffer, "");
    const vrm = (gltf.userData as { vrm?: VRM }).vrm;

    try {
      expect(vrm, `${fileName}: runtime VRM`).toBeDefined();
      if (!vrm || vrm.meta.metaVersion !== "1") {
        throw new Error(`${fileName}: expected a VRM 1.0 runtime model`);
      }
      expect(vrm.meta.licenseUrl).toBe("https://vrm.dev/licenses/1.0/");
      expect(vrm.meta.otherLicenseUrl).toBe(CC0_LICENSE_URL);
      for (const bone of WAVE4_HUMANOID_BONES) {
        expect(vrm.humanoid.getNormalizedBoneNode(bone), `${fileName}: runtime ${bone}`)
          .not.toBeNull();
      }
      for (const expressionName of REQUIRED_BOUND_EXPRESSIONS) {
        expect(vrm.expressionManager?.getExpression(expressionName),
          `${fileName}: runtime ${expressionName}`).toBeDefined();
      }
    } finally {
      VRMUtils.deepDispose(gltf.scene);
    }
  });

  it("repairs Orion in place as a compact VRM 1.0 while preserving audited provenance", () => {
    const bytes = bundledBytes(ORION_REPAIR_FILE);
    expect(validateVrmGlbBytes(bytes)).toEqual({ vrmVersion: 1 });
    expect(bytes.byteLength).toBeGreaterThan(100 * 1024);
    expect(bytes.byteLength, "Orion: 5 MB delivery budget").toBeLessThanOrEqual(
      MAX_WAVE4_FILE_BYTES,
    );

    const json = embeddedJson(bytes);
    const vrm = (json.extensions as JsonRecord).VRMC_vrm as JsonRecord;
    const meta = vrm.meta as JsonRecord;
    const resources = [
      ...((json.buffers as JsonRecord[] | undefined) ?? []),
      ...((json.images as JsonRecord[] | undefined) ?? []),
    ];

    expect(vrm.specVersion).toBe("1.0");
    expect(meta).toMatchObject({
      authors: ["Polygonal Mind"],
      licenseUrl: "https://vrm.dev/licenses/1.0/",
      avatarPermission: "everyone",
      commercialUsage: "corporation",
      creditNotation: "unnecessary",
      allowRedistribution: true,
      modification: "allowModificationRedistribution",
      references: expect.arrayContaining([
        "Immutable source SHA-256: efa262d131a6bd919c1a776f0707c2d358bfb3bf0b82e6886b43d873969574f5",
        "Source VRM0 embedded meta: author=Polygonal Mind; licenseName=CC0",
      ]),
    });
    // The source asserts CC0 in embedded VRM0 metadata but provides no direct external URL.
    expect(meta.otherLicenseUrl).toBeUndefined();
    expect(resources.every((resource) => resource.uri === undefined),
      "Orion: no external buffers or images").toBe(true);

    validateSkinning(ORION_REPAIR_FILE, json, binaryChunk(bytes));
    validateExpressions(ORION_REPAIR_FILE, json);
  });

  it("loads the repaired Orion through GLTFLoader and the app's three-vrm plugin", async () => {
    const bytes = bundledBytes(ORION_REPAIR_FILE);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(arrayBuffer, "");
    const vrm = (gltf.userData as { vrm?: VRM }).vrm;

    try {
      expect(vrm, "Orion: runtime VRM").toBeDefined();
      if (!vrm || vrm.meta.metaVersion !== "1") {
        throw new Error("Orion: expected a VRM 1.0 runtime model");
      }
      expect(vrm.meta.authors).toEqual(["Polygonal Mind"]);
      expect(vrm.meta.licenseUrl).toBe("https://vrm.dev/licenses/1.0/");
      expect(vrm.meta.otherLicenseUrl).toBeUndefined();
      for (const bone of WAVE4_HUMANOID_BONES) {
        expect(vrm.humanoid.getNormalizedBoneNode(bone), `Orion: runtime ${bone}`)
          .not.toBeNull();
      }
      for (const expressionName of REQUIRED_BOUND_EXPRESSIONS) {
        expect(vrm.expressionManager?.getExpression(expressionName),
          `Orion: runtime ${expressionName}`).toBeDefined();
      }
    } finally {
      VRMUtils.deepDispose(gltf.scene);
    }
  });
});
