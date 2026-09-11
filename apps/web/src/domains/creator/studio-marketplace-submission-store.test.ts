import { describe, expect, it } from "vitest";

import {
  createStudioMarketplaceSubmissionDraft,
  readStudioMarketplaceSubmissionDraft,
  studioMarketplaceSubmissionStorageKey,
  writeStudioMarketplaceSubmissionDraft,
} from "./studio-marketplace-submission-store";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("Studio marketplace submission store", () => {
  it("creates and persists an isolated seller draft", () => {
    const storage = new MemoryStorage();
    const draft = createStudioMarketplaceSubmissionDraft(
      "seller-1",
      "2026-09-12T00:00:00.000Z",
    );
    const saved = writeStudioMarketplaceSubmissionDraft(storage, {
      ...draft,
      title: "웹툰 잉크 브러시",
      description: "필압과 기울기를 지원하는 선화 브러시",
      qualityScore: 92,
      sourceReferencesCleared: true,
    });

    expect(saved.sellerId).toBe("seller-1");
    expect(readStudioMarketplaceSubmissionDraft(storage, "seller-1"))
      .toMatchObject({ title: "웹툰 잉크 브러시", qualityScore: 92 });
    expect(readStudioMarketplaceSubmissionDraft(storage, "seller-2")).toBeNull();
    expect(storage.values.has(studioMarketplaceSubmissionStorageKey("seller-1"))).toBe(true);
  });

  it("rejects malformed persisted data instead of inventing a successful submission", () => {
    const storage = new MemoryStorage();
    storage.setItem(studioMarketplaceSubmissionStorageKey("seller-1"), JSON.stringify({
      sellerId: "seller-1",
      status: "published",
      title: "Incomplete",
    }));

    expect(readStudioMarketplaceSubmissionDraft(storage, "seller-1")).toBeNull();
  });

  it("keeps uploaded file integrity data intact", () => {
    const storage = new MemoryStorage();
    const draft = createStudioMarketplaceSubmissionDraft(
      "seller-1",
      "2026-09-12T00:00:00.000Z",
    );
    const checksum = `sha256:${"a".repeat(64)}`;
    writeStudioMarketplaceSubmissionDraft(storage, {
      ...draft,
      files: [{
        path: "primary/brush.toon-brush",
        role: "primary",
        format: "toon-brush",
        sizeBytes: 4096,
        checksum,
      }],
    });

    expect(readStudioMarketplaceSubmissionDraft(storage, "seller-1")?.files)
      .toEqual([expect.objectContaining({ checksum, sizeBytes: 4096 })]);
  });
});
