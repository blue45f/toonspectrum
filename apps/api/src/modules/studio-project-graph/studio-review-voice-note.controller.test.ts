import { describe, expect, it } from "vitest";
import { STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES } from "@toonspectrum/studio-project-model/review-voice-note";
import { STUDIO_REVIEW_VOICE_NOTE_UPLOAD_LIMITS } from "./studio-review-voice-note.controller";

describe("review voice-note multipart limits", () => {
  it("allows exactly one bounded audio file and one metadata field", () => {
    expect(STUDIO_REVIEW_VOICE_NOTE_UPLOAD_LIMITS).toEqual({
      fileSize: STUDIO_REVIEW_VOICE_NOTE_MAX_BYTES,
      files: 1,
      fields: 1,
      fieldSize: 16_384,
      fieldNameSize: 64,
      parts: 3,
    });
  });
});
