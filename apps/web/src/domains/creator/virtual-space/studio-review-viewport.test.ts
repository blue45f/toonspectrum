import { describe, expect, it } from "vitest";
import { readReviewScrollPosition, reviewScrollTarget } from "./studio-review-viewport";

const metrics = { scrollLeft: 200, scrollTop: 450, scrollWidth: 600, scrollHeight: 1200, clientWidth: 200, clientHeight: 300 };
describe("review viewport geometry", () => {
  it("retains the relative position after zoom and viewport changes", () => {
    const position = readReviewScrollPosition(metrics);
    expect(position).toEqual({ x: 0.5, y: 0.5 });
    expect(reviewScrollTarget(position, { ...metrics, scrollWidth: 1000, scrollHeight: 2100 }))
      .toEqual({ left: 400, top: 900 });
  });
  it("preserves remembered ratios while a fit-width view has no scrollable range", () => {
    const fit = { ...metrics, scrollWidth: 200, scrollHeight: 300, scrollLeft: 0, scrollTop: 0 };
    const remembered = readReviewScrollPosition(fit, { x: 0.75, y: 0.6 });
    expect(remembered).toEqual({ x: 0.75, y: 0.6 });
    expect(reviewScrollTarget(remembered, metrics)).toEqual({ left: 300, top: 540 });
  });
  it("clamps invalid and overscrolled coordinates", () => {
    expect(readReviewScrollPosition({ ...metrics, scrollLeft: -20, scrollTop: 99999 })).toEqual({ x: 0, y: 1 });
    expect(reviewScrollTarget({ x: Number.NaN, y: Infinity }, metrics)).toEqual({ left: 0, top: 0 });
    expect(reviewScrollTarget({ x: 2, y: -1 }, metrics)).toEqual({ left: 400, top: 0 });
  });
});
