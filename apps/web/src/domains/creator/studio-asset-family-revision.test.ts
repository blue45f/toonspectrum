import { describe, expect, it } from "vitest";

import {
  appendStudioAssetRevision,
  cancelStudioAssetBatchQueue,
  claimStudioAssetBatchItems,
  createStudioAssetBatchQueue,
  createStudioAssetRevision,
  planStudioAssetVirtualWindow,
  resolveStudioExactAssetReference,
  resolveStudioMissingAsset,
  setStudioAssetDefaultRevision,
  settleStudioAssetBatchItem,
  validateStudioAssetFamily,
  type StudioAssetFamily,
} from "./studio-asset-family-revision";

const revision1 = createStudioAssetRevision({
  id: "revision-1",
  familyId: "family-1",
  contentHash: "sha256-content-1",
  mimeType: "image/png",
  byteLength: 120,
  createdAtMs: 1,
  license: "CC0-1.0",
  rendition: { width: 100, height: 200, format: "png", locale: "ko" },
});

const family: StudioAssetFamily = {
  schemaVersion: 1,
  id: "family-1",
  kind: "background",
  name: "교실 배경",
  defaultRevisionId: revision1.id,
  revisions: [revision1],
  variants: [
    {
      id: "variant-mobile",
      familyId: "family-1",
      name: "모바일",
      revisionId: revision1.id,
      rendition: { width: 800, format: "png", platform: "webtoon" },
    },
  ],
};

describe("studio immutable asset families", () => {
  it("pins manuscripts to an exact revision even after the default changes", () => {
    validateStudioAssetFamily(family);
    const original = resolveStudioExactAssetReference(family);
    const revision2 = createStudioAssetRevision({
      ...revision1,
      id: "revision-2",
      contentHash: "sha256-content-2",
      createdAtMs: 2,
    });
    const next = setStudioAssetDefaultRevision(
      appendStudioAssetRevision(family, revision2),
      revision2.id,
    );
    expect(resolveStudioExactAssetReference(next).revisionId).toBe("revision-2");
    expect(original).toEqual({
      familyId: "family-1",
      revisionId: "revision-1",
      contentHash: "sha256-content-1",
    });
  });

  it("detects metadata tampering and missing/hash-mismatched revisions", () => {
    expect(() =>
      validateStudioAssetFamily({
        ...family,
        revisions: [{ ...revision1, byteLength: 121 }],
      }),
    ).toThrow(/metadata hash mismatch/u);
    expect(
      resolveStudioMissingAsset(family, {
        familyId: family.id,
        revisionId: "missing",
        contentHash: revision1.contentHash,
      }),
    ).toEqual({
      status: "missing",
      reference: {
        familyId: family.id,
        revisionId: "missing",
        contentHash: revision1.contentHash,
      },
      candidateRevisionIds: [revision1.id],
    });
  });

  it("runs a 1000-row idempotent queue with bounded concurrency and retries", () => {
    const rows = Array.from({ length: 1_000 }, (_, index) => ({
      title: `episode-${index + 1}`,
      locale: index % 2 === 0 ? "ko" : "en",
    }));
    let queue = createStudioAssetBatchQueue({ id: "batch-1", rows, concurrency: 4 });
    const first = claimStudioAssetBatchItems(queue);
    queue = first.queue;
    expect(first.claimed).toHaveLength(4);
    expect(new Set(queue.items.map((item) => item.idempotencyKey)).size).toBe(1_000);
    queue = settleStudioAssetBatchItem(queue, first.claimed[0]!.id, {
      status: "failed",
      errorCode: "worker-timeout",
      retryable: true,
    });
    expect(queue.items[0]?.status).toBe("queued");
    expect(cancelStudioAssetBatchQueue(queue).items.filter((item) => item.status === "cancelled").length).toBeGreaterThan(0);
  });

  it("rejects duplicate rows and virtualizes 10000 assets", () => {
    expect(() =>
      createStudioAssetBatchQueue({
        id: "duplicate",
        rows: [{ title: "same" }, { title: "same" }],
      }),
    ).toThrow(/duplicate/u);
    const [start, end] = planStudioAssetVirtualWindow({
      itemCount: 10_000,
      scrollTop: 4_800,
      viewportHeight: 800,
      rowHeight: 200,
      columnCount: 5,
    });
    expect(start).toBe(105);
    expect(end).toBe(155);
    expect(end - start).toBeLessThan(100);
  });
});
