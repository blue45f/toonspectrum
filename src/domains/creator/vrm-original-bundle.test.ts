import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { validateVrmGlbBytes } from "./vrm-library";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

const ORIGINAL_VRM_FILES = [
  "TS_Minseo_Campus.vrm",
  "TS_Taeo_Barista.vrm",
  "TS_Jeonghwa_Gardener.vrm",
  "TS_Haram_Explorer.vrm",
  "TS_Yeonhui_RuneGuard.vrm",
  "TS_Nova_ServiceAndroid.vrm",
  "cyber_agent_zero.vrm",
  "TS_Seojin_Architect.vrm",
  "TS_Mira_Detective.vrm",
] as const;

const CC0_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/";

const REQUIRED_HUMANOID_BONES = [
  "hips",
  "spine",
  "head",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
] as const;

type JsonRecord = Record<string, unknown>;

function bundledBytes(fileName: string): Uint8Array {
  return readFileSync(join(process.cwd(), "public", "vrm", fileName));
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

function accessorFloats(json: JsonRecord, binary: Uint8Array, accessorIndex: number): Float32Array {
  const accessor = (json.accessors as JsonRecord[])[accessorIndex];
  const bufferView = (json.bufferViews as JsonRecord[])[accessor.bufferView as number];
  const byteOffset =
    Number(bufferView.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
  const componentCount = accessor.type === "VEC4" ? 4 : 1;
  return new Float32Array(
    binary.buffer,
    binary.byteOffset + byteOffset,
    Number(accessor.count) * componentCount,
  );
}

describe("ToonSpectrum original Blender MCP VRM pack", () => {
  it.each(ORIGINAL_VRM_FILES)("%s has a complete self-contained skinned VRM 1.0 payload", (fileName) => {
    const bytes = bundledBytes(fileName);
    expect(validateVrmGlbBytes(bytes)).toEqual({ vrmVersion: 1 });
    expect(bytes.byteLength).toBeGreaterThan(100 * 1024);
    expect(bytes.byteLength).toBeLessThan(12 * 1024 * 1024);

    const json = embeddedJson(bytes);
    const extensions = json.extensions as JsonRecord;
    const vrm = extensions.VRMC_vrm as JsonRecord;
    const meta = vrm.meta as JsonRecord;
    const humanoid = vrm.humanoid as JsonRecord;
    const humanBones = humanoid.humanBones as JsonRecord;
    const nodes = json.nodes as JsonRecord[];
    const meshes = json.meshes as {
      extras?: { targetNames?: string[] };
      primitives?: { attributes?: JsonRecord }[];
    }[];
    const skins = json.skins as JsonRecord[];
    const resources = [
      ...((json.buffers as JsonRecord[] | undefined) ?? []),
      ...((json.images as JsonRecord[] | undefined) ?? []),
    ];

    expect(json.asset).toMatchObject({ version: "2.0" });
    expect((json.extensionsUsed as string[]).filter((extension) => extension === "VRMC_vrm"))
      .toEqual(["VRMC_vrm"]);
    expect(json.extensionsRequired ?? []).not.toContain("VRMC_vrm");
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
    expect(meta).toMatchObject({
      allowExcessivelyViolentUsage: fileName !== "TS_Haram_Explorer.vrm",
      allowExcessivelySexualUsage: fileName !== "TS_Haram_Explorer.vrm",
      allowPoliticalOrReligiousUsage: true,
      allowAntisocialOrHateUsage: false,
    });

    const mappedNodes = REQUIRED_HUMANOID_BONES.map((bone) => {
      const binding = humanBones[bone] as { node?: unknown } | undefined;
      expect(binding, `${fileName}: ${bone}`).toBeDefined();
      expect(binding?.node, `${fileName}: ${bone}`).toBeTypeOf("number");
      return binding?.node as number;
    });
    expect(new Set(mappedNodes).size).toBe(mappedNodes.length);
    expect(mappedNodes.every((node) => Number.isInteger(node) && node >= 0 && node < nodes.length))
      .toBe(true);
    expect(Object.keys(humanBones)).toHaveLength(53);

    expect(skins.length).toBeGreaterThan(0);
    const skinnedNodes = nodes.filter((node) => Number.isInteger(node.skin));
    expect(skinnedNodes.length).toBeGreaterThan(0);
    const primitives = meshes.flatMap((mesh) => mesh.primitives ?? []);
    expect(primitives.length).toBeGreaterThan(0);
    for (const primitive of primitives) {
      expect(primitive.attributes).toHaveProperty("JOINTS_0");
      expect(primitive.attributes).toHaveProperty("WEIGHTS_0");
    }
    expect(resources.every((resource) => resource.uri === undefined)).toBe(true);

    const binary = binaryChunk(bytes);
    const hasBlendedVertex = primitives.some((primitive) => {
      const weightsAccessor = primitive.attributes?.WEIGHTS_0;
      if (typeof weightsAccessor !== "number") return false;
      const weights = accessorFloats(json, binary, weightsAccessor);
      for (let index = 0; index < weights.length; index += 4) {
        if (weights[index] > 0.05 && weights[index + 1] > 0.05) return true;
      }
      return false;
    });
    expect(hasBlendedVertex, `${fileName}: expected a real two-bone transition`).toBe(true);

    const expressions = vrm.expressions as JsonRecord;
    const preset = expressions.preset as JsonRecord;
    const blink = preset.blink as JsonRecord;
    const aa = preset.aa as JsonRecord;
    const happy = preset.happy as JsonRecord;
    const sad = preset.sad as JsonRecord;
    expect(blink.morphTargetBinds).toHaveLength(2);
    expect(aa.morphTargetBinds).toHaveLength(1);
    expect(happy.morphTargetBinds).toHaveLength(1);
    expect(sad.morphTargetBinds).toHaveLength(1);
    const nonEmptyPresets = Object.values(preset).filter((expression) => {
      const binds = (expression as JsonRecord).morphTargetBinds;
      return Array.isArray(binds) && binds.length > 0;
    });
    expect(nonEmptyPresets.length).toBeGreaterThanOrEqual(10);

    const targetNames = meshes.flatMap((mesh) => {
      const extras = mesh.extras as { targetNames?: string[] } | undefined;
      return extras?.targetNames ?? [];
    });
    expect(new Set(targetNames).size).toBeGreaterThanOrEqual(11);
    expect(targetNames).toEqual(expect.arrayContaining([
      "Blink",
      "AA",
      "IH",
      "OU",
      "EE",
      "OH",
      "Happy",
      "Sad",
      "Angry",
      "Relaxed",
      "Surprised",
    ]));
  });

  it.each(ORIGINAL_VRM_FILES)("%s loads through the app's actual three-vrm runtime", async (fileName) => {
    const bytes = bundledBytes(fileName);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(arrayBuffer, "");
    const vrm = (gltf.userData as { vrm?: import("@pixiv/three-vrm").VRM }).vrm;

    expect(vrm).toBeDefined();
    if (!vrm || vrm.meta.metaVersion !== "1") {
      throw new Error(`${fileName}: expected a VRM 1.0 runtime model`);
    }
    expect(vrm.meta.licenseUrl).toBe("https://vrm.dev/licenses/1.0/");
    expect(vrm.meta.otherLicenseUrl).toBe(CC0_LICENSE_URL);
    expect(vrm.humanoid).toBeDefined();
    expect(vrm.expressionManager).toBeDefined();
    expect(vrm.expressionManager?.getExpression("blink")).toBeDefined();
    expect(vrm.expressionManager?.getExpression("aa")).toBeDefined();
    expect(vrm.expressionManager?.getExpression("happy")).toBeDefined();
    expect(vrm.expressionManager?.getExpression("angry")).toBeDefined();
    expect(vrm.expressionManager?.getExpression("surprised")).toBeDefined();
    for (const bone of REQUIRED_HUMANOID_BONES) {
      expect(vrm.humanoid.getNormalizedBoneNode(bone), `${fileName}: ${bone}`).not.toBeNull();
    }
  });
});
