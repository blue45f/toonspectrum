import { describe, expect, it } from "vitest";

import {
  studioExportFileName,
  studioExportPreset,
  validateStudioExport,
} from "./studio-export-presets";

describe("studio export presets", () => {
  it("validates exact platform width and total size", () => {
    const preset = studioExportPreset("naver-challenge");
    expect(preset).not.toBeNull();
    const result = validateStudioExport(preset!, [
      { name: "001.jpg", width: 1_000, height: 8_000, bytes: 51 * 1024 * 1024, format: "jpg" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "width",
      "file-size",
      "total-size",
    ]));
  });

  it("accepts a compliant Tapas page and creates deterministic names", () => {
    const preset = studioExportPreset("tapas-comic")!;
    expect(validateStudioExport(preset, [
      { name: "source.png", width: 940, height: 12_000, bytes: 4_000_000, format: "png" },
    ]).valid).toBe(true);
    expect(studioExportFileName(preset, { episode: 12, index: 2, extension: "png" }))
      .toBe("012-002.png");
  });
});
