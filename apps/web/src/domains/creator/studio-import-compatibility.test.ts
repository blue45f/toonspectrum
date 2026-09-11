import { describe, expect, it } from "vitest";

import {
  detectStudioImportFormat,
  planStudioImport,
} from "./studio-import-compatibility";

describe("Studio import compatibility", () => {
  it("opens native and raster sources without asking technical questions", () => {
    const plan = planStudioImport([
      { name: "project.toonstudio", sizeBytes: 1024, mimeType: "application/octet-stream" },
      { name: "cover.png", sizeBytes: 2048, mimeType: "image/png" },
    ]);
    expect(plan).toMatchObject({
      status: "accepted",
      acceptedCount: 2,
      reviewCount: 0,
      blockedCount: 0,
    });
    expect(plan.items.every((item) => item.safeAction === "open")).toBe(true);
  });

  it("explains conversion losses while preserving the original file", () => {
    const plan = planStudioImport([
      { name: "episode.psd", sizeBytes: 50_000, mimeType: "image/vnd.adobe.photoshop" },
      { name: "pitch.pptx", sizeBytes: 80_000, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
    ]);
    expect(plan.status).toBe("review");
    expect(plan.items[0]).toMatchObject({
      format: "psd",
      fidelity: "converted",
      safeAction: "convert-copy",
      requiresConfirmation: true,
    });
    expect(plan.items[0]?.losses).toContain("unsupported smart filters");
    expect(plan.items[1]?.preservedFeatures).toContain("slides");
  });

  it("blocks executables, unsupported files and oversized sources", () => {
    const plan = planStudioImport([
      { name: "helper.exe", sizeBytes: 1024, mimeType: "application/octet-stream" },
      { name: "notes.xyz", sizeBytes: 1024, mimeType: "application/octet-stream" },
      { name: "huge.psd", sizeBytes: 9 * 1024 * 1024 * 1024, mimeType: "image/vnd.adobe.photoshop" },
    ]);
    expect(plan).toMatchObject({ status: "blocked", blockedCount: 3 });
    expect(plan.items.map((item) => item.safeAction)).toEqual([
      "reject",
      "reject",
      "reject",
    ]);
  });

  it("uses trusted MIME fallbacks only when the extension is absent", () => {
    expect(detectStudioImportFormat({ name: "clipboard", mimeType: "image/png" })).toBe("png");
    expect(detectStudioImportFormat({ name: "voice", mimeType: "audio/mpeg" })).toBe("mp3");
    expect(detectStudioImportFormat({ name: "unknown", mimeType: "application/octet-stream" })).toBe("unknown");
  });

  it("rejects malformed descriptors and empty batches", () => {
    expect(() => planStudioImport([])).toThrow("at least one file");
    expect(() => planStudioImport([
      { name: "", sizeBytes: 0, mimeType: "" },
    ])).toThrow("positive byte size");
  });
});
