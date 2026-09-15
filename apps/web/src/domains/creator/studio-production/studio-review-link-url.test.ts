// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioReviewLinkHref } from "./studio-review-link-url";

const TOKEN = `R${"e".repeat(31)}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("studioReviewLinkHref", () => {
  it("returns an origin-bound absolute URL in the browser", () => {
    const href = new URL(studioReviewLinkHref(TOKEN));
    expect(href.origin).toBe(window.location.origin);
    expect(href.pathname).toBe("/studio/review");
    expect(href.searchParams.get("shareToken")).toBe(TOKEN);
  });

  it("returns the canonical relative route during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(studioReviewLinkHref(TOKEN)).toBe(`/studio/review?shareToken=${TOKEN}`);
  });

  it("rejects malformed capabilities instead of emitting a link", () => {
    expect(() => studioReviewLinkHref("short/token")).toThrow(/valid external token/u);
  });
});
