import { describe, expect, it } from "vitest";
import { STUDIO_REVIEW_PREVIEW_UPLOAD_LIMITS } from "./studio-review-preview-producer.controller";
import { STUDIO_REVIEW_PREVIEW_MAX_BYTES } from "./studio-review-preview-canonicalizer";

describe("Studio review preview multipart limits", () => {
  it("reserves a terminal Busboy part while keeping exactly one field and one file", () => {
    expect(STUDIO_REVIEW_PREVIEW_UPLOAD_LIMITS).toEqual({
      fileSize: STUDIO_REVIEW_PREVIEW_MAX_BYTES,
      files: 1,
      fields: 1,
      fieldSize: 8192,
      fieldNameSize: 64,
      parts: 3,
    });
  });
});
