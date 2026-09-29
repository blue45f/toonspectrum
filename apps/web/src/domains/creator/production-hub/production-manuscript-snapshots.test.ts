// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  createProductionManuscriptSnapshot,
  listProductionManuscriptSnapshots,
  manuscriptSnapshotOverlayAllowed,
  nextProductionManuscriptSnapshotName,
  updateProductionManuscriptSnapshotMemo,
  type ProductionManuscriptSnapshotSource,
} from "./production-manuscript-snapshots";

const STORAGE_KEY = "toonstudio.manuscript-snapshots.v1";

function source(revisionId: string): ProductionManuscriptSnapshotSource {
  return {
    revisionId,
    rootGraphHash: "b".repeat(64),
    revisionKind: "checkpoint",
    revisionMessage: "checkpoint message",
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("production-manuscript-snapshots", () => {
  it("auto-names snapshots v1, v2, ... per artifact", () => {
    const first = createProductionManuscriptSnapshot("artifact-a", source("rev-1"), "첫 메모");
    const second = createProductionManuscriptSnapshot("artifact-a", source("rev-1"));
    const other = createProductionManuscriptSnapshot("artifact-b", source("rev-9"));

    expect(first?.name).toBe("v1");
    expect(first?.memo).toBe("첫 메모");
    expect(second?.name).toBe("v2");
    expect(second?.memo).toBe("");
    expect(other?.name).toBe("v1");
    expect(nextProductionManuscriptSnapshotName("artifact-a")).toBe("v3");
    expect(nextProductionManuscriptSnapshotName("artifact-b")).toBe("v2");
  });

  it("trims memos and lists newest first", () => {
    const created = createProductionManuscriptSnapshot("artifact-a", source("rev-1"), "  오래된 메모  ");
    expect(created?.memo).toBe("오래된 메모");
    createProductionManuscriptSnapshot("artifact-a", source("rev-2"));

    const listed = listProductionManuscriptSnapshots("artifact-a");
    expect(listed.map((snapshot) => snapshot.name)).toEqual(["v2", "v1"]);

    const updated = updateProductionManuscriptSnapshotMemo("artifact-a", created!.id, "바뀐 메모");
    expect(updated.find((snapshot) => snapshot.id === created!.id)?.memo).toBe("바뀐 메모");
  });

  it("tolerates corrupt storage without throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json{");
    expect(listProductionManuscriptSnapshots("artifact-a")).toEqual([]);
    expect(nextProductionManuscriptSnapshotName("artifact-a")).toBe("v1");
  });

  it("rejects snapshots without an artifact or revision reference", () => {
    expect(createProductionManuscriptSnapshot("", source("rev-1"))).toBeNull();
    expect(createProductionManuscriptSnapshot("artifact-a", { ...source("rev-1"), revisionId: "" })).toBeNull();
  });

  it("allows overlay only between two snapshots of the same artifact", () => {
    const left = createProductionManuscriptSnapshot("artifact-a", source("rev-1"))!;
    const right = createProductionManuscriptSnapshot("artifact-a", source("rev-2"))!;
    const other = createProductionManuscriptSnapshot("artifact-b", source("rev-3"))!;

    expect(manuscriptSnapshotOverlayAllowed(left, right)).toBe(true);
    expect(manuscriptSnapshotOverlayAllowed(left, other)).toBe(false);
    expect(manuscriptSnapshotOverlayAllowed(left, left)).toBe(false);
  });
});
