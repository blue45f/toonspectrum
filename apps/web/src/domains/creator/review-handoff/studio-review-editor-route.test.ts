import { createHash } from "node:crypto";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import { studioReviewEditorHref, studioReviewEditorRequestFromLocation } from "./studio-review-editor-route";
import { reviewEditorFixture } from "./studio-review-editor-test-fixture";

const digestForTest = (value: Record<string, unknown>) => createHash("sha256").update(canonicalJson(value)).digest("hex");

describe("review editor identity-only navigation", () => {
  it("roundtrips exact subject/comment IDs on the existing editor route", () => {
    const { request } = reviewEditorFixture(digestForTest), href = studioReviewEditorHref(request);
    expect(href.startsWith("/studio/work/work/canvas?")).toBe(true);
    const query = href.split("?")[1]!;
    expect(studioReviewEditorRequestFromLocation("work", query)).toEqual(request);
    expect([...new URLSearchParams(query).keys()]).toEqual(["sharedReview", "artifact", "revision", "digest", "graphProject", "reviewComment"]);
    expect(query).not.toContain("cut-2"); expect(query).not.toContain("p2");
  });
  it("rejects duplicated or malformed identity fields, with no stale anchor fallback", () => {
    const { request } = reviewEditorFixture(digestForTest), query = studioReviewEditorHref(request).split("?")[1]!;
    expect(studioReviewEditorRequestFromLocation("work", `${query}&reviewComment=other`)).toBeNull();
    expect(studioReviewEditorRequestFromLocation("work", query.replace("reviewComment=comment", "reviewComment=https://private.invalid"))).toBeNull();
    expect(studioReviewEditorRequestFromLocation(null, query)).toBeNull();
    expect(() => studioReviewEditorHref({ ...request, commentId: "../comment" })).toThrow();
  });
});
