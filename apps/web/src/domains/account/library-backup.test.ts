import { describe, expect, it } from "vitest";

import { MAX_LIBRARY_BACKUP_BYTES, parseLibraryBackup } from "./library-backup";

export const validLibraryBackup = {
  _app: "toonspectrum-library", version: 1, exportedAt: "2026-09-12T00:00:00Z",
  ratings: { work: 4.5 }, reads: { work: "reading" }, subscriptions: { work: true }, likedReviews: {},
  reviews: { work: { titleId: "work", rating: 4.5, text: "좋아요", tags: ["연출"], spoiler: false, createdAt: "2026-09-12T00:00:00Z" } },
  collections: [{ id: "old-collection", name: "참고 작품", emoji: "📚", titleIds: ["work"], createdAt: "2026-09-12T00:00:00Z" }],
};

describe("explicit library backup validation", () => {
  it("round trips real v1 exports without importing auth or preference fields", () => {
    const data = parseLibraryBackup(JSON.stringify({ ...validLibraryBackup, sessionToken: "must-not-import", userId: "other", adultVerified: true }));
    expect(data.ratings.work).toBe(4.5);
    expect(data.collections[0].id).toBe("old-collection");
    expect(Object.keys(data).sort()).toEqual(["ratings", "reads", "subscriptions", "reviews", "likedReviews", "collections"].sort());
  });
  it("preserves the paused reading state in portable backups", () => {
    const data = parseLibraryBackup(JSON.stringify({
      ...validLibraryBackup,
      reads: { work: "paused" },
    }));
    expect(data.reads.work).toBe("paused");
  });
  it.each([{}, [], null, { ...validLibraryBackup, version: 2 }, { ...validLibraryBackup, _app: "another-app" }, { ...validLibraryBackup, ratings: { work: 99 } }, { ...validLibraryBackup, reads: { work: "invalid" } }, { ...validLibraryBackup, subscriptions: { work: "true" } }, { ...validLibraryBackup, reviews: { other: validLibraryBackup.reviews.work } }, { ...validLibraryBackup, collections: [validLibraryBackup.collections[0], validLibraryBackup.collections[0]] }])("rejects invalid structures instead of clearing existing records", (value) => {
    expect(() => parseLibraryBackup(JSON.stringify(value))).toThrow();
  });
  it("rejects dangerous record keys and oversized files", () => {
    expect(() => parseLibraryBackup(JSON.stringify({ ...validLibraryBackup, ratings: JSON.parse('{"__proto__":5}') }))).toThrow();
    expect(() => parseLibraryBackup(" ".repeat(MAX_LIBRARY_BACKUP_BYTES + 1))).toThrow();
    expect(() => parseLibraryBackup("{invalid")).toThrow();
  });
});
