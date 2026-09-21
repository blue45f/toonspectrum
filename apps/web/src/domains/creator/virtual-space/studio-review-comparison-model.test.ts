import { describe, expect, it } from "vitest";
import { linkedReviewScroll, matchReviewSourcePage, reviewOverlayAllowed } from "./studio-review-comparison-model";
import type { StudioVirtualSpaceReviewPreview } from "./studio-virtual-space-review-preview";

function page(id: string, ordinal: number, height = 1000): StudioVirtualSpaceReviewPreview {
  return { ordinal, sha256: "a".repeat(64), byteLength: 1, mediaType: "image/png", url: "https://example.invalid/p", expiresAt: 1,
    mapping: { status: "mapped", version: 1, sourceServerRevision: 1, sourceContentDigest: "b".repeat(64),
      page: { id, ordinal, width: 800, height, renderWidth: 800, renderHeight: height, frames: [], elements: [] } } };
}
describe("identity-based comparison", () => {
  it("matches reordered pages by authoring identity, never by ordinal", () => {
    const source = page("a", 0), inserted = page("new", 0), target = page("a", 3, 2000);
    expect(matchReviewSourcePage(source, [inserted, target])).toEqual({ kind: "matched", page: target });
    expect(reviewOverlayAllowed(source, target)).toBe(false);
  });
  it("does not infer missing, duplicate or legacy identity", () => {
    const source = page("a", 0);
    expect(matchReviewSourcePage(source, [page("b", 0)])).toEqual({ kind: "not-loaded" });
    expect(matchReviewSourcePage(source, [page("a", 0), page("a", 1)])).toEqual({ kind: "ambiguous" });
    expect(matchReviewSourcePage({ ...source, mapping: { status: "unmapped", reason: "legacy-review" } }, [source])).toEqual({ kind: "unmapped" });
  });
  it("allows overlay only for equal source identity and geometry", () => {
    expect(reviewOverlayAllowed(page("a", 0), page("a", 2))).toBe(true);
    expect(reviewOverlayAllowed(page("a", 0), page("b", 0))).toBe(false);
  });
  it("clamps relative scrolling and rejects non-finite or empty source ranges", () => {
    expect(linkedReviewScroll(250, 500, 1200)).toBe(600);
    expect(linkedReviewScroll(-3, 500, 1200)).toBe(0);
    expect(linkedReviewScroll(700, 500, 1200)).toBe(1200);
    for (const input of [[0, 0, 5], [NaN, 5, 5], [2, 5, -1], [2, 5, Infinity]]) expect(linkedReviewScroll(input[0]!, input[1]!, input[2]!)).toBeNull();
  });
});
