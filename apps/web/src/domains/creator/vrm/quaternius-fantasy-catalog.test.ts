import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { QUATERNIUS_FANTASY_VRMS } from "./quaternius-fantasy-catalog";
import { SAMPLE_VRMS } from "./vrm-library";

const publicRoot = resolve(process.cwd(), "apps/web/public");
const readJsonChunk = (file: string) => {
  const bytes = readFileSync(file);
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  return { bytes, json: JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) };
};

describe("Quaternius free Standard character assemblies", () => {
  it("counts four outfit designs, not hair or color permutations", () => {
    expect(QUATERNIUS_FANTASY_VRMS).toHaveLength(4);
    expect(new Set(QUATERNIUS_FANTASY_VRMS.map((entry) => entry.id)).size).toBe(4);
  });

  it.each(QUATERNIUS_FANTASY_VRMS)("registers $id with real skin, honest capabilities and embedded textures", (entry) => {
    expect(SAMPLE_VRMS.find((model) => model.id === entry.id)).toEqual(entry);
    expect(entry.limitations).toEqual(["no-expressions"]);
    const { bytes, json } = readJsonChunk(resolve(publicRoot, entry.url.slice(1)));
    expect(bytes.length).toBeLessThanOrEqual(15 * 1024 * 1024);
    const extension = json.extensions.VRMC_vrm;
    expect(extension.specVersion).toBe("1.0");
    expect(extension.meta.authors).toContain("Quaternius");
    expect(extension.meta.otherLicenseUrl).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
    expect(extension.meta.allowRedistribution).toBe(true);
    expect(extension.meta.commercialUsage).toBe("corporation");
    expect(Object.keys(extension.humanoid.humanBones)).toHaveLength(52);
    expect(extension.expressions).toBeUndefined();
    for (const bone of Object.values(extension.humanoid.humanBones) as Array<{ node: number }>) {
      expect(json.nodes[bone.node]).toBeDefined();
      expect(json.skins.some((skin: { joints: number[] }) => skin.joints.includes(bone.node))).toBe(true);
    }
    expect(json.images.every((image: { uri?: string; bufferView?: number }) => !image.uri && Number.isInteger(image.bufferView))).toBe(true);
    const thumbnail = readFileSync(resolve(publicRoot, entry.thumbnailUrl.slice(1)));
    expect(thumbnail.subarray(1, 4).toString()).toBe("PNG");
    expect([thumbnail.readUInt32BE(16), thumbnail.readUInt32BE(20)]).toEqual([768, 768]);
    const manifest = JSON.parse(readFileSync(resolve(publicRoot, "vrm/quaternius-fantasy-v1/manifest.json"), "utf8"));
    expect(manifest.entries.find((item: { id: string }) => item.id === entry.id).sha256)
      .toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});
