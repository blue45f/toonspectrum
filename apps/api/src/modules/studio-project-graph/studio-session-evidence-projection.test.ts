import { describe, expect, it } from "vitest";
import { deriveStudioReviewPageMapping } from "@toonspectrum/studio-project-model";
import { projectStudioSessionEvidence } from "./studio-session-evidence-projection";

const pin = { sourceContentDigest: "a".repeat(64), sourceServerRevision: 4 };
const image = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: "image", name: id, src: "private-image-payload", x: 0, y: 0, width: 10, height: 10, ...extra });
const ai = (id = "ai-1", extra: Record<string, unknown> = {}) => ({ id, kind: "text", status: "succeeded", provider: "Saved provider", model: "Saved model", transport: "local",
  createdAt: "2026-09-20T09:00:00.000Z", prompt: { sha256: "b".repeat(64), raw: "do-not-disclose-prompt" },
  requestId: "do-not-disclose-request", seed: "do-not-disclose-seed", error: { message: "do-not-disclose-error" },
  references: [{ url: "do-not-disclose-reference" }], usage: { promptTokens: 0, completionTokens: 5, totalTokens: 5 },
  target: { pageId: "page-1", elementId: "image-1" }, ...extra });
function fixture(elements = [image("image-1")], operations: unknown[] = [ai()]) {
  return { width: 100, pagesList: [{ id: "page-1", canvasH: 100, elements }, { id: "page-2", canvasH: 100, elements: [image("image-2")] }],
    aiProvenance: { version: 1, operations }, master: { elements: [image("master-image")] } };
}
function project(doc: unknown, ordinal = 0) {
  const mapping = deriveStudioReviewPageMapping(doc, { ...pin, ordinal, renderWidth: 100, renderHeight: 100 });
  return projectStudioSessionEvidence(doc, { [ordinal]: mapping }, pin);
}

describe("attested snapshot evidence projection", () => {
  it("whitelists metadata, preserves zero usage, and never emits private prompts, pixels or provider errors", () => {
    const value = project(fixture());
    expect(value.aiOperations[0]).toMatchObject({ id: "ai-1", usage: { promptTokens: 0, completionTokens: 5, totalTokens: 5 }, targetStatus: "mapped", target: { elementId: "image-1", ...pin } });
    expect(JSON.stringify(value)).not.toMatch(/do-not-disclose|private-image-payload|requestId|seed|raw/);
    expect(value.assets.map((asset) => asset.source.elementId)).toEqual(["image-1", "master-image"]);
  });
  it.each(["pending", "succeeded", "failed", "cancelled"])("retains %s as recorded, without fabricating a billing amount", (status) => {
    const record = project(fixture(undefined, [ai("record", { status, usage: undefined, actualCost: 123 })])).aiOperations[0]!;
    expect(record.status).toBe(status); expect(record.usage).toBeNull(); expect(record).not.toHaveProperty("actualCost");
  });
  it("does not invent commercial rights for builtin, stock, local, AI or native-3D sources", () => {
    const value = project(fixture([image("builtin", { builtinRasterAssetId: "builtin-1" }), image("stock", { stockImageCredit: { photographerName: "Photographer" } }),
      image("local"), image("generated", { aiProvenance: {} }), image("scene", { bg3dScene: {} }), image("character", { vrmScene: {} }),
      image("community", { communityAssetCredit: { assetId: "catalog-1", commercialUse: false, licenseLabel: "Saved terms", attributionText: "Saved credit" } })], []));
    expect(value.assets.find((asset) => asset.kind === "community")).toMatchObject({ commercialUse: "prohibited", licenseLabel: "Saved terms", attribution: "Saved credit" });
    expect(value.assets.filter((asset) => asset.kind !== "community").every((asset) => asset.commercialUse === "unknown")).toBe(true);
    expect(value.assets.filter((asset) => asset.kind === "native-3d").map((asset) => asset.nativeSceneKind)).toEqual(["background3d", "vrm"]);
  });
  it("separates an out-of-window target, a missing target and an invalid element instead of substituting a page", () => {
    const value = project(fixture(undefined, [ai("outside", { target: { pageId: "page-2" } }), ai("missing", { target: undefined }), ai("invalid", { target: { pageId: "page-1", elementId: "gone" } })]));
    expect(value.aiOperations.map((op) => [op.target, op.targetStatus])).toEqual([[null, "outside-page-window"], [null, "missing"], [null, "unmapped"]]);
  });
  it("maps an exact frame, but rejects simultaneously claimed frame and element ownership", () => {
    const elements = [image("image-1"), { ...image("frame-1"), type: "frame" }];
    const value = project(fixture(elements, [ai("frame", { target: { pageId: "page-1", frameId: "frame-1" } }), ai("ambiguous", { target: { pageId: "page-1", frameId: "frame-1", elementId: "image-1" } })]));
    expect(value.aiOperations[0]?.target).toMatchObject({ frameId: "frame-1" }); expect(value.aiOperations[1]?.target).toBeNull();
  });
  it.each([-1, Infinity, NaN, 1.5, 1_000_000_001])("excludes invalid reported usage %s without replacing it with zero", (totalTokens) => {
    const result = project(fixture(undefined, [ai("invalid", { usage: { totalTokens } })]));
    expect(result.aiOperations).toEqual([]); expect(result.invalidEntries).toBe(1);
  });
  it("reports bounded output instead of presenting a truncated list as complete", () => {
    const value = project(fixture(Array.from({ length: 252 }, (_, i) => image(`image-${i}`)), Array.from({ length: 102 }, (_, i) => ai(`op-${i}`, { target: undefined }))));
    expect(value.assets).toHaveLength(250); expect(value.omittedAssets).toBe(3);
    expect(value.aiOperations).toHaveLength(100); expect(value.omittedAiOperations).toBe(2);
  });
  it("never selects the first of duplicated operation identities", () => {
    const result = project(fixture(undefined, [ai("duplicate"), ai("duplicate", { model: "Another model" })]));
    expect(result.aiOperations).toEqual([]); expect(result.invalidEntries).toBe(2);
  });
  it("excludes all repeated identities while preserving interleaved unique records", () => {
    const result = project(fixture(undefined, [ai("duplicate"), ai("unique"), ai("duplicate"), ai("duplicate")]));
    expect(result.aiOperations.map((op) => op.id)).toEqual(["unique"]);
    expect(result.invalidEntries).toBe(3);
  });
  it("rejects duplicate identity even when its first record is malformed", () => {
    const result = project(fixture(undefined, [ai("duplicate", { status: "invalid" }), ai("duplicate")]));
    expect(result.aiOperations).toEqual([]); expect(result.invalidEntries).toBe(2);
  });
  it("checks inspected identities beyond the output cap before emitting any record", () => {
    const unique = Array.from({ length: 100 }, (_, i) => ai(`unique-${i}`, { target: undefined }));
    const result = project(fixture(undefined, [ai("duplicate"), ...unique, ai("duplicate")]));
    expect(result.aiOperations.map((op) => op.id)).toEqual(unique.map((op) => op.id));
    expect(result.invalidEntries).toBe(2); expect(result.omittedAiOperations).toBe(0);
  });
  it("does not claim page usage for duplicate elements or a different capture digest", () => {
    expect(project(fixture([image("same"), image("same")], [])).assets).toEqual([]);
    const doc = fixture(); const mapping = deriveStudioReviewPageMapping(doc, { ...pin, ordinal: 0, renderWidth: 100, renderHeight: 100 });
    expect(projectStudioSessionEvidence(doc, { 0: mapping }, { ...pin, sourceContentDigest: "c".repeat(64) }).assets).toEqual([]);
  });
  it("honors hidden master pages and never emits unplaced vector text as a licensed asset", () => {
    const doc = fixture([{ ...image("text"), type: "text" }], []);
    const source = { ...doc, pagesList: [{ ...doc.pagesList[0]!, hideMaster: true }] };
    expect(project(source).assets).toEqual([]);
  });
  it("does not certify uniqueness inside an oversized truncated operation history", () => {
    const operations = Array.from({ length: 2001 }, (_, i) => ai(`record-${i}`));
    operations[2000] = ai("record-0");
    const result = project(fixture(undefined, operations));
    expect(result.aiOperations).toEqual([]); expect(result.omittedAiOperations).toBe(2001);
  });

});
