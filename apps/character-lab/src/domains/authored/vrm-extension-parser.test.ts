import { describe, expect, it } from "vitest";

import { buildMinimalGlb } from "../../testing/minimal-glb";

import { parseVrmFromGlb, parseVrmcVrmFromGltfJson, vrmHumanoidToBoneMap } from "./vrm-extension-parser";

const VRM1 = {
  VRMC_vrm: {
    specVersion: "1.0",
    meta: { name: "오리온", version: "2.0.0", authors: ["Polygonal Mind"], licenseUrl: "https://vrm.dev/licenses/1.0/", commercialUsage: "corporation", allowRedistribution: true, modification: "allowModificationRedistribution" },
    humanoid: { humanBones: { hips: { node: 1 }, spine: { node: 2 }, head: { node: 3 }, leftUpperArm: { node: 4 }, notABone: { node: 5 } } },
    expressions: { preset: { happy: {}, aa: {} }, custom: { tsFaceEyeSizeBig: {} } },
  },
};

describe("authored/vrm-extension-parser", () => {
  it("VRMC_vrm 1.0 meta·humanoid·expressions를 읽고 어휘 밖 본은 노출한다", () => {
    const info = parseVrmcVrmFromGltfJson({ extensions: VRM1 });
    expect(info).not.toBeNull();
    if (!info) return;
    expect(info.family).toBe("vrm-1.0");
    expect(info.specVersion).toBe("1.0");
    expect(info.meta).toMatchObject({ name: "오리온", authors: ["Polygonal Mind"], commercialUsage: "corporation", allowRedistribution: true });
    expect(info.humanoid).toEqual({ hips: 1, spine: 2, head: 3, leftUpperArm: 4 });
    expect(info.unknownHumanBones).toEqual(["notABone"]);
    expect(info.humanoidMissingRequired).toContain("leftLowerArm");
    expect(info.humanoidMissingRequired).not.toContain("hips");
    expect(info.expressions).toEqual(["happy", "aa", "tsFaceEyeSizeBig"]);
  });

  it("VRM 0.x 확장도 읽는다(meta 키 이름이 다름)", () => {
    const info = parseVrmcVrmFromGltfJson({
      extensions: {
        VRM: {
          exporterVersion: "UniVRM-0.99",
          meta: { title: "Orion0", author: "Polygonal Mind", licenseName: "CC0", commercialUssageName: "Allow", otherLicenseUrl: "" },
          humanoid: { humanBones: [{ bone: "hips", node: 0 }, { bone: "weird", node: 9 }] },
          blendShapeMaster: { blendShapeGroups: [{ name: "Blink", presetName: "blink" }, { presetName: "joy" }] },
        },
      },
    });
    expect(info?.family).toBe("vrm-0.x");
    expect(info?.meta.licenseName).toBe("CC0");
    expect(info?.meta.authors).toEqual(["Polygonal Mind"]);
    expect(info?.humanoid).toEqual({ hips: 0 });
    expect(info?.unknownHumanBones).toEqual(["weird"]);
    expect(info?.expressions).toEqual(["Blink", "joy"]);
  });

  it("확장이 없으면 null, GLB 바이트에서는 노드 이름과 함께 읽는다", () => {
    expect(parseVrmcVrmFromGltfJson({ asset: { version: "2.0" } })).toBeNull();
    expect(parseVrmcVrmFromGltfJson(null)).toBeNull();
    const glb = buildMinimalGlb({ nodeName: "Root", extraNodeNames: ["mixamorig:Hips", "mixamorig:Spine", "mixamorig:Head", "mixamorig:LeftArm", "x"], extensions: VRM1 });
    const parsed = parseVrmFromGlb(glb);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.nodeNames).toEqual(["Root", "mixamorig:Hips", "mixamorig:Spine", "mixamorig:Head", "mixamorig:LeftArm", "x"]);
    expect(parsed.info?.humanoid.hips).toBe(1);
    const boneMap = parsed.info ? vrmHumanoidToBoneMap(parsed.info, parsed.nodeNames) : {};
    expect(boneMap).toEqual({ "mixamorig:Hips": "hips", "mixamorig:Spine": "spine", "mixamorig:Head": "head", "mixamorig:LeftArm": "leftUpperArm" });
    const noExt = parseVrmFromGlb(buildMinimalGlb());
    expect(noExt.ok && noExt.info).toBeNull();
    expect(parseVrmFromGlb(new Uint8Array([0, 0])).ok).toBe(false);
  });
});
