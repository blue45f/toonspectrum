import { describe, expect, it } from "vitest";
import { parseStudioReviewResolutionRequest, studioReviewResolutionHref, studioReviewResolutionMatchesComment, studioReviewResolutionRequestFromLocation } from "./studio-review-resolution-route";
import { reviewResolutionFixture } from "./studio-review-resolution-test-fixture";

describe("identity-only saved correction return route", () => {
  it("round trips the old comment and both exact pins without body, image URLs or scope coordinates", () => {
    const { request } = reviewResolutionFixture(), url = new URL(studioReviewResolutionHref(request), "https://example.test");
    expect(url.pathname).toBe("/studio/p/work/review");
    expect(studioReviewResolutionRequestFromLocation("work", url.search)).toEqual(request);
    expect([...url.searchParams.keys()].sort()).toEqual(["artifact", "correctedDigest", "correctedReview", "correctedRevision", "digest", "graphProject", "reviewComment", "revision", "sharedReview", "view"].sort());
    expect(studioReviewResolutionMatchesComment(request, request.origin.subject, "comment")).toBe(true);
    expect(studioReviewResolutionMatchesComment(request, request.replacement, "comment")).toBe(false);
  });
  it("rejects same snapshot, cross-work/artifact, partial and duplicate locators", () => {
    const { request } = reviewResolutionFixture(), search = studioReviewResolutionHref(request).split("?")[1]!;
    for (const field of ["workId", "projectId", "artifactId"] as const) expect(parseStudioReviewResolutionRequest({ ...request, replacement: { ...request.replacement, [field]: "other" } })).toBeNull();
    expect(parseStudioReviewResolutionRequest({ ...request, replacement: request.origin.subject })).toBeNull();
    expect(studioReviewResolutionRequestFromLocation("work", `${search}&correctedRevision=other`)).toBeNull();
    const partial = new URLSearchParams(search); partial.delete("correctedDigest"); expect(studioReviewResolutionRequestFromLocation("work", partial.toString())).toBeNull();
    expect(studioReviewResolutionRequestFromLocation("other", search)?.origin.subject.workId).not.toBe("work");
  });
});
