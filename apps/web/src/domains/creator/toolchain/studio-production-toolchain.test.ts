import { describe, expect, it } from "vitest";

import {
  admitStudioProductionTool,
  groupStudioProductionTools,
  isStudioProductionOperationExecutable,
  STUDIO_PRODUCTION_CATEGORIES,
  STUDIO_PRODUCTION_TOOLS,
  studioProductionTool,
} from "./studio-production-toolchain";

describe("studio production toolchain catalog", () => {
  it("keeps ids unique and covers every designed workflow area", () => {
    expect(STUDIO_PRODUCTION_TOOLS).toHaveLength(25);
    expect(new Set(STUDIO_PRODUCTION_TOOLS.map(({ id }) => id)).size).toBe(25);
    expect(new Set(STUDIO_PRODUCTION_CATEGORIES.map(({ id }) => id)).size)
      .toBe(STUDIO_PRODUCTION_CATEGORIES.length);
    expect(groupStudioProductionTools("community-gpl").map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "effects",
        "scan-ocr",
        "vector",
        "animation",
        "media",
        "three-d",
        "publishing",
        "audio-accessibility",
        "operations",
      ]),
    );
  });

  it("blocks noncommercial engines outside the explicit research profile", () => {
    const mixbox = studioProductionTool("mixbox");
    const openpose = studioProductionTool("openpose");
    expect(mixbox).not.toBeNull();
    expect(openpose).not.toBeNull();
    expect(admitStudioProductionTool(mixbox!, "open").allowed).toBe(false);
    expect(admitStudioProductionTool(openpose!, "community-gpl").allowed).toBe(false);
    expect(admitStudioProductionTool(mixbox!, "research-nc").allowed).toBe(true);
    expect(admitStudioProductionTool(openpose!, "research-nc").allowed).toBe(true);
  });

  it("admits copyleft tools only through their declared isolated boundary", () => {
    const tesseract = studioProductionTool("tesseract");
    const gmic = studioProductionTool("gmic");
    expect(tesseract?.deployment).toBe("local-toonbridge");
    expect(gmic?.deployment).toBe("local-toonbridge");
    expect(admitStudioProductionTool(gmic!, "open")).toMatchObject({
      allowed: true,
      execution: "local",
    });
    expect(admitStudioProductionTool(gmic!, "open").reason).toContain("별도 실행기");
  });

  it("does not expose manual or research-only adapters as executable jobs", () => {
    expect(isStudioProductionOperationExecutable("scribus", "export-pdf")).toBe(false);
    expect(isStudioProductionOperationExecutable("openpose", "pose-extract")).toBe(false);
    expect(isStudioProductionOperationExecutable("tesseract", "ocr-text")).toBe(true);
    expect(isStudioProductionOperationExecutable("ffmpeg", "encode-mp4")).toBe(true);
  });
});
