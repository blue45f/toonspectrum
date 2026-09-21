import { describe, expect, it } from "vitest";
import { matchReviewSourceFrame, reviewFrameChoices, reviewFrameCrop } from "./studio-review-frame-comparison";
import type { StudioVirtualSpaceReviewPreview as Preview } from "./studio-virtual-space-review-preview";

type Frame = Extract<Preview["mapping"], { status: "mapped" }>["page"]["frames"][number];
const frame = (id: string, x = 100, y = 200, width = 400, height = 300): Frame => ({ id, bounds: { x, y, width, height } });
function page(frames: Frame[], id = "page-a", ordinal = 0, height = 2000): Preview {
  return { ordinal, sha256: "a".repeat(64), byteLength: 1, mediaType: "image/png", url: "https://example.invalid/preview", expiresAt: 1,
    mapping: { status: "mapped", version: 1, sourceServerRevision: 1, sourceContentDigest: "b".repeat(64),
      page: { id, ordinal, width: 800, height, renderWidth: 400, renderHeight: height / 2, frames,
        elements: frames.map((cut) => ({ id: cut.id, type: "frame", origin: "page" })) } } };
}
describe("exact source-cut correspondence", () => {
  it("matches a moved/resized cut after insertion and page reordering by ID, not index or geometry", () => {
    const original = frame("cut-a"), moved = frame("cut-a", 300, 1200, 250, 600);
    expect(matchReviewSourceFrame(page([original]), page([frame("new"), moved], "page-a", 4, 3000), "cut-a"))
      .toEqual({ kind: "matched", source: original, target: moved });
  });
  it("does not mistake visually identical replacements or split cuts for correspondence", () => {
    const source = page([frame("cut-a")]);
    expect(matchReviewSourceFrame(source, page([frame("cut-b")]), "cut-a")).toEqual({ kind: "not-found" });
    expect(matchReviewSourceFrame(source, page([frame("cut-a-1"), frame("cut-a-2")]), "cut-a")).toEqual({ kind: "not-found" });
  });
  it("never trusts a reused frame ID on a different page", () => {
    expect(matchReviewSourceFrame(page([frame("cut-a")]), page([frame("cut-a")], "page-b"), "cut-a")).toEqual({ kind: "different-page" });
  });
  it("rejects missing and duplicate original or target identities", () => {
    const p = page([frame("cut-a")]), duplicate = page([frame("cut-a"), frame("cut-a")]);
    expect(matchReviewSourceFrame(p, p, "absent")).toEqual({ kind: "source-unavailable" });
    expect(matchReviewSourceFrame(duplicate, p, "cut-a")).toEqual({ kind: "source-ambiguous" });
    expect(matchReviewSourceFrame(p, duplicate, "cut-a")).toEqual({ kind: "target-ambiguous" });
  });
  it("keeps legacy mappings explicit instead of assigning IDs", () => {
    const p = page([frame("cut-a")]), legacy: Preview = { ...p, mapping: { status: "unmapped", reason: "legacy-review" } };
    expect(matchReviewSourceFrame(legacy, p, "cut-a")).toEqual({ kind: "source-unavailable" });
    expect(matchReviewSourceFrame(p, legacy, "cut-a")).toEqual({ kind: "target-unmapped" });
    expect(reviewFrameChoices(legacy, "").ids).toEqual([]);
    expect(reviewFrameCrop(legacy, "cut-a")).toBeNull();
  });
  it("bounds option lists while retaining search access to every exact ID", () => {
    const p = page(Array.from({ length: 251 }, (_, i) => frame(`cut-${String(i).padStart(3, "0")}`)));
    expect(reviewFrameChoices(p, "")).toMatchObject({ total: 251, start: 0, hasNext: true });
    expect(reviewFrameChoices(p, "").ids).toHaveLength(100);
    expect(reviewFrameChoices(p, "", 200).ids).toHaveLength(51);
    expect(reviewFrameChoices(p, " CUT-250 ").ids).toEqual(["cut-250"]);
    expect(reviewFrameChoices(p, "", NaN).start).toBe(0);
    expect(reviewFrameChoices(page([frame("a"), frame("a")]), "").ids).toEqual(["a"]);
  });
});
describe("display-only cut bounds", () => {
  it("converts each version's original pixels, not export scale or the other version's geometry", () => {
    const a = page([frame("cut-a")]);
    expect(reviewFrameCrop(a, "cut-a")).toEqual({ x: 100, y: 200, width: 400, height: 300,
      imageWidth: 200, imageHeight: 2000 / 300 * 100, imageLeft: -25, imageTop: -200 / 300 * 100 });
    expect(reviewFrameCrop(page([frame("cut-a", 300, 1200, 250, 600)], "page-a", 4, 3000), "cut-a"))
      .toMatchObject({ x: 300, y: 1200, width: 250, height: 600, imageLeft: -120, imageTop: -200 });
  });
  it("clips partial off-page bounds without mutating the saved frame", () => {
    const cut = frame("a", -20, -30, 100, 90), before = structuredClone(cut);
    expect(reviewFrameCrop(page([cut]), "a")).toMatchObject({ x: 0, y: 0, width: 80, height: 60 });
    expect(cut).toEqual(before);
  });
  it.each([
    frame("a", 900), frame("a", 0, 2100), frame("a", 0, 0, 0), frame("a", 0, 0, -1),
    frame("a", NaN), frame("a", Infinity), frame("a", 0, 0, 0.0001), frame("a", 0, 0, 500, 0.001),
    frame("a", Number.MAX_VALUE, 0, Number.MAX_VALUE),
  ])("refuses empty, invalid or unbounded render transforms: %j", (cut) => {
    expect(reviewFrameCrop(page([cut]), "a")).toBeNull();
  });
  it("rejects ambiguous bounds and leaves non-rectangular geometry untouched", () => {
    expect(reviewFrameCrop(page([frame("a"), frame("a")]), "a")).toBeNull();
    const polygon: Frame = { ...frame("a"), polygon: [{ x: 100, y: 200 }, { x: 500, y: 200 }, { x: 100, y: 500 }] };
    const p = page([polygon]), before = structuredClone(p);
    expect(reviewFrameCrop(p, "a")).toMatchObject({ x: 100, y: 200, width: 400, height: 300 });
    expect(p).toEqual(before);
  });
});
