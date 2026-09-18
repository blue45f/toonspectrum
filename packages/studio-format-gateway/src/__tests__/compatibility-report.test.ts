import { describe, expect, it } from "vitest";

import {
  compatibilitySourceSchema,
  createCompatibilityReport,
  type CompatibilityItem,
} from "../compatibility-report";

const HASH = "b".repeat(64);
const SOURCE = {
  sourceFileName: "episode-12.psd",
  sourceFormat: "psd" as const,
  sourceHash: HASH,
  sourceSize: 1_024,
  sourceBlob: {
    id: `source-${HASH.slice(0, 32)}`,
    sha256: HASH,
    size: 1_024,
    mediaType: "image/vnd.adobe.photoshop",
    role: "source" as const,
  },
  immutable: true as const,
  importedAt: "2026-09-17T00:00:00.000Z",
};

function item(
  outcome: CompatibilityItem["outcome"],
  impact: CompatibilityItem["impact"],
  id = `${outcome}-${impact}`,
): CompatibilityItem {
  return {
    id,
    path: `layers/${id}`,
    feature: id,
    outcome,
    impact,
    message: `${id} 처리 결과`,
  };
}

function report(items: readonly CompatibilityItem[]) {
  return createCompatibilityReport({
    id: `report-${items.length}`,
    artifactId: "artifact-canvas",
    source: SOURCE,
    items: [...items],
    createdAt: "2026-09-17T00:00:01.000Z",
  });
}
describe("creative-format compatibility reports", () => {
  it("assigns A only when every feature is preserved without impact", () => {
    const value = report([
      item("preserved", "none", "layers"),
      item("preserved", "none", "masks"),
    ]);
    expect(value.grade).toBe("A");
    expect(value.requiresApproval).toBe(false);
    expect(value.summary).toEqual({
      total: 2,
      preserved: 2,
      converted: 0,
      rasterized: 0,
      excluded: 0,
      unsupported: 0,
      blocking: 0,
    });
  });

  it("assigns B to visible but non-destructive conversion", () => {
    const value = report([item("converted", "minor")]);
    expect(value.grade).toBe("B");
    expect(value.requiresApproval).toBe(true);
    expect(value.summary.converted).toBe(1);
  });

  it("assigns C when editable structure is rasterized", () => {
    const value = report([item("rasterized", "major")]);
    expect(value.grade).toBe("C");
    expect(value.requiresApproval).toBe(true);
    expect(value.summary.rasterized).toBe(1);
  });

  it("assigns D for exclusions, unsupported features, or blocking loss", () => {
    expect(report([item("excluded", "major")]).grade).toBe("D");
    expect(report([item("unsupported", "blocking")]).grade).toBe("D");
    expect(report([item("converted", "blocking")]).grade).toBe("D");
  });

  it("counts every disclosed outcome deterministically", () => {
    const value = report([
      item("preserved", "none", "a"),
      item("converted", "minor", "b"),
      item("rasterized", "major", "c"),
      item("excluded", "major", "d"),
      item("unsupported", "blocking", "e"),
    ]);
    expect(value.summary).toEqual({
      total: 5,
      preserved: 1,
      converted: 1,
      rasterized: 1,
      excluded: 1,
      unsupported: 1,
      blocking: 1,
    });
  });

  it("rejects source metadata that does not match the immutable blob", () => {
    expect(compatibilitySourceSchema.safeParse({
      ...SOURCE,
      sourceBlob: { ...SOURCE.sourceBlob, size: 999 },
    }).success).toBe(false);
    expect(compatibilitySourceSchema.safeParse({
      ...SOURCE,
      sourceBlob: { ...SOURCE.sourceBlob, sha256: "c".repeat(64) },
    }).success).toBe(false);
  });
});
