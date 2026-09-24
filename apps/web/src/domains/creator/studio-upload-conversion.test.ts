import { describe, expect, it } from "vitest";

import {
  formatStudioUploadBytes,
  studioDataUrlByteLength,
  summarizeStudioUploadConversion,
} from "./studio-upload-conversion";

describe("studio upload conversion", () => {
  it("computes base64 and percent-encoded payload sizes without decoding a second copy", () => {
    expect(studioDataUrlByteLength("data:text/plain;base64,aGVsbG8=")).toBe(5);
    expect(studioDataUrlByteLength("data:text/plain,hello%20world")).toBe(11);
    expect(studioDataUrlByteLength("https://cdn.example.test/page.webp")).toBeNull();
  });

  it("summarizes transformed pages and preserves unknown server-backed sizes", () => {
    expect(summarizeStudioUploadConversion([
      {
        source: { width: 2400, height: 3000, byteLength: 4_000_000, format: "png" },
        output: { width: 1280, height: 1600, byteLength: 800_000, format: "webp" },
      },
      {
        source: null,
        output: { width: 720, height: 1280, byteLength: null, format: "webp" },
      },
    ])).toEqual({
      pageCount: 2,
      transformedPageCount: 1,
      sourceByteLength: null,
      outputByteLength: null,
      maximumOutputWidth: 1280,
      maximumOutputHeight: 1600,
    });
  });

  it("formats byte counts for review copy", () => {
    expect(formatStudioUploadBytes(null)).toBe("계산 불가");
    expect(formatStudioUploadBytes(512)).toBe("512B");
    expect(formatStudioUploadBytes(1_536)).toBe("1.5KB");
    expect(formatStudioUploadBytes(3 * 1_024 * 1_024)).toBe("3.0MB");
  });
});
