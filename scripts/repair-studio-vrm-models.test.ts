import { describe, expect, it } from "vitest";

import { STUDIO_VRM_REPAIR_TESTING } from "./repair-studio-vrm-models";

const {
  collectInvalidSkeletonSkinIndices,
  encodeGlb,
  parseGlb,
  removeInvalidSkeletonRoots,
  repairSkinning,
} = STUDIO_VRM_REPAIR_TESTING;

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;

function createGlb(json: unknown, bin = Buffer.alloc(0)): Buffer {
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const total = 12 + 8 + jsonBytes.length + (bin.length > 0 ? 8 + bin.length : 0);
  const output = Buffer.alloc(total);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(total, 8);
  output.writeUInt32LE(jsonBytes.length, 12);
  output.writeUInt32LE(GLB_JSON_CHUNK, 16);
  jsonBytes.copy(output, 20);
  if (bin.length > 0) {
    const offset = 20 + jsonBytes.length;
    output.writeUInt32LE(bin.length, offset);
    output.writeUInt32LE(GLB_BIN_CHUNK, offset + 4);
    bin.copy(output, offset + 8);
  }
  return output;
}

function glbChunkLengths(bytes: Buffer): number[] {
  const lengths: number[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    lengths.push(length);
    offset += 8 + length;
  }
  return lengths;
}

describe("studio VRM model repair", () => {
  it("pads every GLB chunk without changing parsed JSON", () => {
    const sourceJson = { nodes: [], skins: [] };
    const source = createGlb(sourceJson, Buffer.from([1, 2, 3, 4]));
    expect(glbChunkLengths(source)[0] % 4).not.toBe(0);

    const repaired = encodeGlb(parseGlb(source), false);
    expect(repaired.readUInt32LE(8)).toBe(repaired.length);
    expect(glbChunkLengths(repaired).every((length) => length % 4 === 0)).toBe(true);
    expect(parseGlb(repaired).json).toEqual(sourceJson);
  });

  it("removes only the validator-targeted invalid skeleton root", () => {
    const messages = [
      {
        code: "SKIN_SKELETON_INVALID",
        message: "invalid skeleton",
        severity: 0,
        pointer: "/skins/1/skeleton",
      },
      {
        code: "SKIN_SKELETON_INVALID",
        message: "warning copy",
        severity: 1,
        pointer: "/skins/0/skeleton",
      },
    ];
    const invalidIndices = collectInvalidSkeletonSkinIndices(messages);
    expect([...invalidIndices]).toEqual([1]);

    const json = {
      nodes: [{ children: [1] }, {}, { children: [3] }, {}],
      skins: [
        { skeleton: 0, joints: [1] },
        { skeleton: 2, joints: [1] },
      ],
    };
    expect(removeInvalidSkeletonRoots(json, invalidIndices)).toBe(1);
    expect(json.skins[0].skeleton).toBe(0);
    expect(json.skins[1].skeleton).toBeUndefined();
  });

  it("merges duplicate joint influences and normalizes their weights", () => {
    const bin = Buffer.alloc(20);
    Buffer.from([2, 2, 4, 9]).copy(bin, 0);
    [0.2, 0.3, 0.5, 0].forEach((value, index) => {
      bin.writeFloatLE(value, 4 + index * 4);
    });
    const json = {
      accessors: [
        { bufferView: 0, componentType: 5121, count: 1, type: "VEC4" },
        { bufferView: 1, componentType: 5126, count: 1, type: "VEC4" },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 4 },
        { buffer: 0, byteOffset: 4, byteLength: 16 },
      ],
      meshes: [{ primitives: [{ attributes: { JOINTS_0: 0, WEIGHTS_0: 1 } }] }],
    };

    const stats = repairSkinning(json, bin);
    expect(stats).toMatchObject({
      verticesRepaired: 1,
      duplicateInfluencesMerged: 1,
      weightsNormalized: 1,
      zeroWeightJointsCleared: 1,
      unsupportedAccessorPairs: [],
    });
    expect([...bin.subarray(0, 4)]).toEqual([2, 4, 0, 0]);
    expect(bin.readFloatLE(4)).toBeCloseTo(0.5, 6);
    expect(bin.readFloatLE(8)).toBeCloseTo(0.5, 6);
    expect(bin.readFloatLE(12)).toBe(0);
    expect(bin.readFloatLE(16)).toBe(0);
  });

  it("fails closed instead of independently normalizing a secondary influence set", () => {
    const bin = Buffer.alloc(20);
    const original = Buffer.from(bin);
    const json = {
      accessors: [
        { bufferView: 0, componentType: 5121, count: 1, type: "VEC4" },
        { bufferView: 1, componentType: 5126, count: 1, type: "VEC4" },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 4 },
        { buffer: 0, byteOffset: 4, byteLength: 16 },
      ],
      meshes: [{
        primitives: [{
          attributes: { JOINTS_0: 0, WEIGHTS_0: 1, JOINTS_1: 2, WEIGHTS_1: 3 },
        }],
      }],
    };

    const stats = repairSkinning(json, bin);
    expect(stats.verticesRepaired).toBe(0);
    expect(stats.unsupportedAccessorPairs).toEqual([
      "secondary-influence-set:2:3",
    ]);
    expect(bin).toEqual(original);
  });
});
