import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateBytes } from "gltf-validator";
import { CREATOR_ESSENTIALS, ESSENTIALS_KINDS, ESSENTIALS_MAX_BYTES, essentialsEditorHref, essentialsKind, filterCreatorEssentials, isEssentialsPath } from "./creator-essentials-catalog";

const publicRoot = new URL("../../../../../public/", import.meta.url);

describe("original creator essentials inventory", () => {
  it("contains 48 unique, budgeted original assets, not duplicate filenames", () => {
    expect(CREATOR_ESSENTIALS).toHaveLength(48);
    expect(new Set(CREATOR_ESSENTIALS.map((asset) => asset.id)).size).toBe(48);
    expect(new Set(CREATOR_ESSENTIALS.map((asset) => asset.sha256)).size).toBe(48);
    expect(ESSENTIALS_KINDS.map((kind) => CREATOR_ESSENTIALS.filter((asset) => asset.kind === kind).length)).toEqual([24, 8, 8, 8]);
    for (const asset of CREATOR_ESSENTIALS) {
      expect(isEssentialsPath(asset.url)).toBe(true);
      expect(isEssentialsPath(asset.preview)).toBe(true);
      expect(asset.bytes).toBeGreaterThan(0);
      expect(asset.bytes).toBeLessThan(ESSENTIALS_MAX_BYTES);
      expect(asset.width * asset.height).toBeLessThanOrEqual(2048 * 2048);
    }
  });
  it.each(CREATOR_ESSENTIALS)("$id matches the checked-in hash, dimensions and local file", (asset) => {
    const bytes = readFileSync(new URL(asset.url.slice(1), publicRoot));
    expect(bytes.length).toBe(asset.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    const preview = readFileSync(new URL(asset.preview.slice(1), publicRoot), "utf8");
    expect(preview).toContain("<svg");
    expect(preview).not.toMatch(/<script|<foreignObject|(?:href|src)\s*=\s*["'](?:https?:|data:|javascript:)/iu);
  });
  it.each(CREATOR_ESSENTIALS.filter((asset) => asset.kind.endsWith("3d")))("$id is a valid self-contained glTF 2 model", async (asset) => {
    const bytes = new Uint8Array(readFileSync(new URL(asset.url.slice(1), publicRoot)));
    const report = await validateBytes(bytes, { maxIssues: 30 });
    expect(report.issues.numErrors).toBe(0);
    expect(report.issues.numWarnings).toBe(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    const jsonLength = view.getUint32(12, true);
    const model = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)));
    expect(model.asset.version).toBe("2.0");
    expect(model.nodes.length).toBeGreaterThan(3);
    expect(model.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(true);
    expect(model.images ?? []).toEqual([]);
    expect(model.skins ?? []).toEqual([]);
  });
});

describe("creator essentials discovery", () => {
  it("normalizes Unicode, case and tokenized search in both languages", () => {
    expect(filterCreatorEssentials("ＷＡＬＫＩＮＧ", "all")).toHaveLength(2);
    expect(filterCreatorEssentials("걷기", "pose-2d")).toHaveLength(1);
    expect(filterCreatorEssentials("3D DESK", "all")).toHaveLength(0);
    expect(filterCreatorEssentials("work desk", "prop-3d")).toHaveLength(1);
    expect(filterCreatorEssentials(" no-such-asset ", "all")).toEqual([]);
  });
  it("rejects external paths and resolves unknown categories safely", () => {
    for (const value of ["https://example.com/a.glb", "//evil.test/model.glb", "/creator-essentials/../x.glb", "/creator-essentials/a.svg?url=evil", "javascript:alert(1)"]) expect(isEssentialsPath(value)).toBe(false);
    expect(essentialsKind("unknown")).toBe("all");
    expect(essentialsEditorHref({ kind: "pose-3d" })).toBe("/studio/bg3d");
    expect(essentialsEditorHref({ kind: "effect-2d" })).toBe("/studio/canvas");
  });
});
