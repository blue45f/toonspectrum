import { describe, expect, it } from "vitest";

import {
  STUDIO_RESUME_CHECKPOINT_MAX_AGE_MS,
  STUDIO_RESUME_CHECKPOINT_STORAGE_KEY,
  captureStudioResumeViewport,
  parseStudioResumeCheckpoints,
  planStudioResumeViewportRestore,
  readStudioResumeCheckpoint,
  writeStudioResumeCheckpoint,
} from "./studio-resume-checkpoint";

class MemoryStorage {
  value: string | null = null;
  getItem(key: string) {
    return key === STUDIO_RESUME_CHECKPOINT_STORAGE_KEY ? this.value : null;
  }
  setItem(key: string, value: string) {
    if (key === STUDIO_RESUME_CHECKPOINT_STORAGE_KEY) this.value = value;
  }
}

const now = 1_800_000_000_000;

describe("Studio resume checkpoints", () => {
  it("round-trips bounded UI-only page, selection and normalized viewport state", () => {
    const storage = new MemoryStorage();
    expect(writeStudioResumeCheckpoint({
      documentKey: "project:p1:document:d1",
      pageId: "page-2",
      selectedIds: ["panel-3", "balloon-4", "panel-3"],
      viewport: { scrollX: 1.5, scrollY: -1, zoom: 99 },
      updatedAt: now,
    }, storage, now)).toBe(true);
    expect(readStudioResumeCheckpoint("project:p1:document:d1", storage, now)).toEqual({
      version: 1,
      documentKey: "project:p1:document:d1",
      pageId: "page-2",
      selectedIds: ["panel-3", "balloon-4"],
      viewport: { scrollX: 1, scrollY: 0, zoom: 8 },
      updatedAt: now,
    });
  });

  it("rejects corrupt, stale, future and control-character records", () => {
    expect(parseStudioResumeCheckpoints("{broken", now)).toEqual([]);
    expect(parseStudioResumeCheckpoints(JSON.stringify({
      version: 1,
      checkpoints: [
        { version: 1, documentKey: "old", pageId: "p", selectedIds: [], viewport: { scrollX: 0, scrollY: 0, zoom: 1 }, updatedAt: now - STUDIO_RESUME_CHECKPOINT_MAX_AGE_MS - 1 },
        { version: 1, documentKey: "future", pageId: "p", selectedIds: [], viewport: { scrollX: 0, scrollY: 0, zoom: 1 }, updatedAt: now + 6 * 60_000 },
        { version: 1, documentKey: "bad\u0000", pageId: "p", selectedIds: [], viewport: { scrollX: 0, scrollY: 0, zoom: 1 }, updatedAt: now },
      ],
    }), now)).toEqual([]);
  });

  it("keeps the newest checkpoint per document and fails safely when storage is blocked", () => {
    const raw = JSON.stringify({
      version: 1,
      checkpoints: [
        { version: 1, documentKey: "draft:a", pageId: "new", selectedIds: [], viewport: { scrollX: 0, scrollY: 0, zoom: 1 }, updatedAt: now },
        { version: 1, documentKey: "draft:a", pageId: "old", selectedIds: [], viewport: { scrollX: 0, scrollY: 0, zoom: 1 }, updatedAt: now - 1 },
      ],
    });
    expect(parseStudioResumeCheckpoints(raw, now).map((item) => item.pageId)).toEqual(["new"]);
    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(readStudioResumeCheckpoint("draft:a", blocked, now)).toBeNull();
    expect(writeStudioResumeCheckpoint({
      documentKey: "draft:a", pageId: "p", selectedIds: [],
      viewport: { scrollX: 0, scrollY: 0, zoom: 1 }, updatedAt: now,
    }, blocked, now)).toBe(false);
  });

  it("captures ratios and restores the same relative view at another viewport size", () => {
    const viewport = captureStudioResumeViewport({
      scrollLeft: 750,
      scrollTop: 1_600,
      scrollWidth: 2_000,
      scrollHeight: 4_000,
      viewportWidth: 500,
      viewportHeight: 800,
      zoom: 2.25,
    });
    expect(viewport).toEqual({ scrollX: 0.5, scrollY: 0.5, zoom: 2.25 });
    expect(planStudioResumeViewportRestore(viewport, {
      scrollWidth: 3_000,
      scrollHeight: 5_000,
      viewportWidth: 1_000,
      viewportHeight: 1_000,
    })).toEqual({ scrollLeft: 1_000, scrollTop: 2_000, zoom: 2.25 });
  });
});
