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
] as const;

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
    const meshes = json.meshes as { primitives?: { attributes?: JsonRecord }[] }[];
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
    expect(Object.keys(humanBones).length).toBeGreaterThanOrEqual(50);

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
    expect(vrm.humanoid).toBeDefined();
    for (const bone of REQUIRED_HUMANOID_BONES) {
      expect(vrm.humanoid.getNormalizedBoneNode(bone), `${fileName}: ${bone}`).not.toBeNull();
    }
  });
});
