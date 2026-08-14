import { readFileSync } from "node:fs";
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

const WAVE6_FILES = [
  "TS_Sunja_HaenyeoMentor.vrm",
  "TS_Maya_CoutureDirector.vrm",
  "TS_Iseul_AdaptiveRescuer.vrm",
  "TS_Neoul_CoralDjinn.vrm",
] as const;

const CC0_LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
const MAX_MOBILE_BYTES = 5 * 1024 * 1024;

const STYLE_PARTS: Record<(typeof WAVE6_FILES)[number], readonly string[]> = {
  "TS_Sunja_HaenyeoMentor.vrm": [
    "HoodRimSide",
    "SilverTempleWisp",
    "HaenyeoVestPanel",
    "HarnessStrap",
    "UtilityPocket",
    "WetsuitSeamCenter",
  ],
  "TS_Maya_CoutureDirector.vrm": [
    "HairCoilLayer",
    "BraidedHair",
    "CoutureBodicePanel",
    "CoutureHipPleat",
    "CoutureJewel",
    "AsymmetricCapeEdge",
  ],
  "TS_Iseul_AdaptiveRescuer.vrm": [
    "RescueHairTuft",
    "RescueCollar",
    "ReflectivePanel",
    "RescuePocket",
    "ProstheticKneeHinge",
    "ProstheticPylon",
    "ProstheticFootPlate",
  ],
  "TS_Neoul_CoralDjinn.vrm": [
    "CoralBranchV2",
    "CoralSubBranch",
    "CoralPolypTip",
    "CoralPolypSide",
    "TempleFinLobe",
    "GillMark",
    "TideMantleLayer",
  ],
};

const COMMON_PARTS = [
  "HeadHighTopology",
  "JawVolume",
  "OuterEar_L",
  "InnerEar_L",
  "ScleraExpression_L",
  "Iris_L",
  "EyeHighlight_L",
  "UpperEyelid_L",
  "LowerEyelid_L",
  "NoseBridge",
  "NoseTip",
  "Nostril_L",
  "UpperLipRidge",
  "Fingernail_Thumb_L",
  "Fingernail_Little_R",
  "HandKnuckle_Index_L",
  "ShoeSole_L",
  "ShoeToeCap_R",
] as const;

const REQUIRED_EXPRESSIONS = [
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

type GltfPrimitive = {
  attributes?: JsonRecord;
  indices?: number;
  targets?: JsonRecord[];
};

type GltfMesh = {
  primitives?: GltfPrimitive[];
};

type GltfMaterial = {
  extensions?: JsonRecord;
  pbrMetallicRoughness?: {
    baseColorTexture?: { index?: number };
  };
};

function bundledBytes(fileName: string): Uint8Array {
  return readFileSync(join(process.cwd(), "public", "vrm", fileName));
}

function embeddedJson(bytes: Uint8Array): JsonRecord {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as JsonRecord;
}

function accessorCount(json: JsonRecord, accessorIndex: number | undefined): number {
  if (typeof accessorIndex !== "number") return 0;
  const accessor = (json.accessors as JsonRecord[])[accessorIndex];
  return Number(accessor?.count ?? 0);
}

describe("Wave 6 high-fidelity character contract", () => {
  it.each(WAVE6_FILES)("%s retains materially richer embedded visual structure", (fileName) => {
    const bytes = bundledBytes(fileName);
    expect(validateVrmGlbBytes(bytes)).toEqual({ vrmVersion: 1 });
    expect(bytes.byteLength, `${fileName}: substantive binary`).toBeGreaterThan(1.5 * 1024 * 1024);
    expect(bytes.byteLength, `${fileName}: mobile delivery budget`).toBeLessThanOrEqual(
      MAX_MOBILE_BYTES,
    );

    const json = embeddedJson(bytes);
    const nodes = json.nodes as JsonRecord[];
    const meshes = json.meshes as GltfMesh[];
    const primitives = meshes.flatMap((mesh) => mesh.primitives ?? []);
    const materials = json.materials as GltfMaterial[];
    const textures = json.textures as JsonRecord[];
    const images = json.images as JsonRecord[];
    const extensions = json.extensions as JsonRecord;
    const vrm = extensions.VRMC_vrm as JsonRecord;
    const meta = vrm.meta as JsonRecord;
    const humanoid = vrm.humanoid as JsonRecord;
    const humanBones = humanoid.humanBones as JsonRecord;
    const preset = (vrm.expressions as JsonRecord).preset as Record<string, JsonRecord>;

    const vertexCount = primitives.reduce((sum, primitive) => {
      const position = primitive.attributes?.POSITION;
      return sum + accessorCount(json, typeof position === "number" ? position : undefined);
    }, 0);
    const triangleCount = primitives.reduce((sum, primitive) => (
      sum + accessorCount(json, primitive.indices) / 3
    ), 0);
    const morphTargetCount = primitives.reduce(
      (sum, primitive) => sum + (primitive.targets?.length ?? 0),
      0,
    );

    expect(nodes.length, `${fileName}: authored node detail`).toBeGreaterThanOrEqual(150);
    expect(meshes.length, `${fileName}: separate readable parts`).toBeGreaterThanOrEqual(100);
    expect(primitives.length, `${fileName}: skinned visual primitives`).toBeGreaterThanOrEqual(100);
    expect(vertexCount, `${fileName}: vertex detail floor`).toBeGreaterThanOrEqual(22_000);
    expect(triangleCount, `${fileName}: triangle detail floor`).toBeGreaterThanOrEqual(37_000);
    expect(materials.length, `${fileName}: palette/material separation`).toBeGreaterThanOrEqual(15);
    expect(textures.length, `${fileName}: embedded texture finish`).toBeGreaterThanOrEqual(15);
    expect(images.length, `${fileName}: embedded image finish`).toBeGreaterThanOrEqual(15);
    expect(morphTargetCount, `${fileName}: real facial morphs`).toBeGreaterThanOrEqual(26);

    expect((json.extensionsUsed as string[])).toEqual(expect.arrayContaining([
      "VRMC_vrm",
      "VRMC_materials_mtoon",
    ]));
    expect(meta).toMatchObject({
      version: "4.0.0",
      authors: ["ToonSpectrum"],
      otherLicenseUrl: CC0_LICENSE_URL,
    });
    expect(Object.keys(humanBones), `${fileName}: exact poser profile`).toHaveLength(53);

    // glTF base-color textures are interpreted as sRGB by the runtime. Requiring every
    // MToon material to reference an embedded PNG prevents accidental external/linear-only art.
    for (const [index, image] of images.entries()) {
      expect(image.uri, `${fileName}: image ${index} external URI`).toBeUndefined();
      expect(image.bufferView, `${fileName}: image ${index} embedded bufferView`).toBeTypeOf("number");
      expect(image.mimeType, `${fileName}: image ${index} color texture format`).toBe("image/png");
    }
    for (const [index, material] of materials.entries()) {
      const mtoon = material.extensions?.VRMC_materials_mtoon as JsonRecord | undefined;
      expect(mtoon, `${fileName}: material ${index} MToon exposure`).toBeDefined();
      expect(mtoon?.outlineWidthMode, `${fileName}: material ${index} authored outline`)
        .toBe("worldCoordinates");
      const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
      expect(textureIndex, `${fileName}: material ${index} base-color texture`).toBeTypeOf("number");
      expect(Number(textureIndex)).toBeGreaterThanOrEqual(0);
      expect(Number(textureIndex)).toBeLessThan(textures.length);
    }

    const nodeNames = nodes.map((node) => String(node.name ?? ""));
    for (const part of [...COMMON_PARTS, ...STYLE_PARTS[fileName]]) {
      expect(
        nodeNames.some((name) => name.includes(part)),
        `${fileName}: missing authored visual part ${part}`,
      ).toBe(true);
    }
    expect(nodeNames.filter((name) => name.includes("Fingernail_")).length,
      `${fileName}: all ten visible fingernails`).toBeGreaterThanOrEqual(10);
    expect(nodeNames.filter((name) => name.includes("HandKnuckle_")).length,
      `${fileName}: all ten hand knuckles`).toBeGreaterThanOrEqual(10);

    for (const expressionName of REQUIRED_EXPRESSIONS) {
      const binds = preset[expressionName]?.morphTargetBinds;
      expect(binds, `${fileName}: ${expressionName} is a real bound expression`)
        .toEqual(expect.arrayContaining([expect.any(Object)]));
    }
  });

  it.each(WAVE6_FILES)("%s loads its textured high-detail skin in the actual three-vrm runtime", async (fileName) => {
    const bytes = bundledBytes(fileName);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(arrayBuffer, "");
    const vrm = (gltf.userData as { vrm?: VRM }).vrm;
    let skinnedMeshCount = 0;
    gltf.scene.traverse((object) => {
      if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinnedMeshCount += 1;
    });

    try {
      expect(vrm, `${fileName}: parsed VRM`).toBeDefined();
      expect(vrm?.meta.metaVersion).toBe("1");
      expect(vrm?.meta.otherLicenseUrl).toBe(CC0_LICENSE_URL);
      expect(skinnedMeshCount, `${fileName}: runtime retained detailed skinned parts`)
        .toBeGreaterThanOrEqual(100);
      for (const expressionName of REQUIRED_EXPRESSIONS) {
        expect(vrm?.expressionManager?.getExpression(expressionName),
          `${fileName}: runtime ${expressionName}`).toBeDefined();
      }
    } finally {
      VRMUtils.deepDispose(gltf.scene);
    }
  });

  it.each(WAVE6_FILES)("%s has non-placeholder 320x400 card art", (fileName) => {
    const thumbnail = readFileSync(join(
      process.cwd(),
      "public",
      "vrm",
      "thumbnails",
      fileName.replace(/\.vrm$/, ".png"),
    ));
    expect(thumbnail.byteLength, `${fileName}: rendered card detail`).toBeGreaterThan(80 * 1024);
    expect(thumbnail.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(thumbnail.readUInt32BE(16), `${fileName}: card width`).toBe(320);
    expect(thumbnail.readUInt32BE(20), `${fileName}: card height`).toBe(400);
  });
});
