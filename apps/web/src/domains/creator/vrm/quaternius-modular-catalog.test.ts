import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { QUATERNIUS_MODULAR_VRMS } from "./quaternius-modular-catalog";
import { SAMPLE_VRMS } from "./vrm-library";

const publicRoot = resolve(process.cwd(), "apps/web/public");
const manifest = JSON.parse(readFileSync(resolve(publicRoot, "vrm/quaternius-modular-v1/manifest.json"), "utf8"));
const runtime = JSON.parse(readFileSync(resolve(process.cwd(), "artifacts/studio-asset-expansion/modular-runtime-validation.json"), "utf8"));

describe("Quaternius modular humanoid candidates", () => {
  it("registers 21 distinct authored outfit sources without counting material recolors", () => {
    expect(QUATERNIUS_MODULAR_VRMS).toHaveLength(21);
    expect(new Set(QUATERNIUS_MODULAR_VRMS.map((entry) => entry.id)).size).toBe(21);
    expect(new Set(manifest.entries.map((entry: { sourceFbxSha256: string }) => entry.sourceFbxSha256)).size).toBe(21);
    expect(runtime.status).toBe("passed");
    expect(runtime.entries).toHaveLength(21);
  });

  it.each(QUATERNIUS_MODULAR_VRMS)("loads $id as a visible skinned VRM with production-pose evidence", (entry) => {
    expect(SAMPLE_VRMS.find((model) => model.id === entry.id)).toEqual(entry);
    expect(entry.limitations).toContain("no-expressions");
    if (entry.id.includes("-male-")) expect(entry.limitations).toContain("limited-hand-rig");
    const bytes = readFileSync(resolve(publicRoot, entry.url.slice(1)));
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const extension = json.extensions.VRMC_vrm;
    expect(extension.specVersion).toBe("1.0");
    expect(Object.keys(extension.humanoid.humanBones)).toHaveLength(entry.id.includes("-male-") ? 48 : 50);
    expect(extension.expressions).toBeUndefined();
    expect(json.materials.every((material: { pbrMetallicRoughness?: { baseColorFactor?: number[] } }) => (material.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1) > 0.98)).toBe(true);
    const source = manifest.entries.find((item: { id: string }) => item.id === entry.id);
    expect(source.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(source.skinningInfluenceLimit).toBe(4);
    expect(source.maximumDiscardedInfluenceMass).toBeLessThanOrEqual(0.2);
    const receipt = runtime.entries.find((item: { id: string }) => item.id === entry.id);
    expect(receipt.sha256).toBe(source.sha256);
    expect(receipt.foregroundPixels).toBeGreaterThan(768 * 768 * 0.02);
    expect(receipt.gpu.renderer).toMatch(/Apple.*Metal/iu);
    expect(receipt.builtinPoses.map((pose: { poseId: string }) => pose.poseId)).toEqual(["default", "wave", "sit", "run"]);
    expect(receipt.builtinPoses.every((pose: { foregroundPixels: number }) => pose.foregroundPixels > 768 * 768 * 0.02)).toBe(true);
    const thumbnail = readFileSync(resolve(publicRoot, entry.thumbnailUrl.slice(1)));
    expect(thumbnail.subarray(1, 4).toString()).toBe("PNG");
    expect(createHash("sha256").update(thumbnail).digest("hex")).toBe(receipt.thumbnailSha256);
  });
});
