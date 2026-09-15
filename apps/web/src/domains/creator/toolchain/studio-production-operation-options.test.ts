import { describe, expect, it } from "vitest";

import {
  defaultStudioProductionOperationOptions,
  mergeStudioProductionOperationOptions,
  studioProductionOperationOptions,
  validateStudioProductionOperationOptions,
} from "./studio-production-operation-options";

describe("Studio production operation options", () => {
  it("shares OCR controls across every Tesseract output", () => {
    for (const operation of ["ocr-text", "ocr-tsv", "ocr-hocr", "ocr-pdf"]) {
      expect(studioProductionOperationOptions("tesseract", operation).map(({ key }) => key))
        .toEqual(["language", "pageSegmentation"]);
      expect(defaultStudioProductionOperationOptions("tesseract", operation))
        .toEqual({ language: "kor+eng", pageSegmentation: 3 });
    }
  });

  it("normalizes select values and keeps bounded numeric values", () => {
    expect(validateStudioProductionOperationOptions("tesseract", "ocr-text", {
      language: "jpn+eng",
      pageSegmentation: "11",
    })).toEqual({ language: "jpn+eng", pageSegmentation: 11 });
    expect(validateStudioProductionOperationOptions("ffmpeg", "encode-gif", {
      fps: 24,
    })).toEqual({ fps: 24 });
  });

  it("rejects invalid text and out-of-range numbers", () => {
    expect(() => validateStudioProductionOperationOptions("tesseract", "ocr-text", {
      language: "kor english",
      pageSegmentation: 3,
    })).toThrow(/OCR 언어/u);
    expect(() => validateStudioProductionOperationOptions("ffmpeg", "encode-gif", {
      fps: 120,
    })).toThrow(/1~30/u);
    expect(() => validateStudioProductionOperationOptions("rubberband", "pitch-shift", {
      semitones: 30,
    })).toThrow(/-24~24/u);
  });

  it("lets reviewed quick controls override colliding advanced keys", () => {
    expect(mergeStudioProductionOperationOptions(
      "ffmpeg",
      "encode-gif",
      { fps: 2, palette: "custom", nested: { keep: true } },
      { fps: 15 },
    )).toEqual({
      fps: 15,
      palette: "custom",
      nested: { keep: true },
    });
  });

  it("returns an empty object for operations with no UI options", () => {
    expect(defaultStudioProductionOperationOptions("ffmpeg", "encode-mp4")).toEqual({});
    expect(validateStudioProductionOperationOptions("ffmpeg", "encode-mp4", {})).toEqual({});
  });
});
