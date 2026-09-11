import { describe, expect, it } from "vitest";

import {
  studioExternalJoinHref,
  studioExternalPresentationHref,
  studioExternalReviewHref,
  validateStudioExternalToken,
} from "./studio-route-registry";

describe("Studio external entry links", () => {
  it("accepts URL-safe opaque tokens and rejects malformed values", () => {
    expect(validateStudioExternalToken("review_ABC-1234")).toBe(true);
    expect(validateStudioExternalToken("short")).toBe(false);
    expect(validateStudioExternalToken("token with spaces")).toBe(false);
    expect(validateStudioExternalToken("../unsafe-token")).toBe(false);
    expect(validateStudioExternalToken(undefined)).toBe(false);
  });

  it("builds canonical compatibility destinations without exposing tokens in path parsing", () => {
    expect(studioExternalReviewHref("review_ABC-1234"))
      .toBe("/studio/review?shareToken=review_ABC-1234");
    expect(studioExternalPresentationHref("present_ABC-1234"))
      .toBe("/studio/present?presentationToken=present_ABC-1234");
    expect(studioExternalJoinHref("invite_ABC-1234"))
      .toBe("/studio/join?invite=invite_ABC-1234");
  });

  it("fails closed instead of normalizing unknown tokens", () => {
    expect(() => studioExternalReviewHref("bad token")).toThrow("valid external token");
    expect(() => studioExternalPresentationHref("../unsafe-token")).toThrow("valid external token");
    expect(() => studioExternalJoinHref("tiny")).toThrow("valid external token");
  });
});
