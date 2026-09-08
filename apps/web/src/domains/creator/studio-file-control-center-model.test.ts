import { describe, expect, it } from "vitest";

import {
  addStudioRecentLocalFile,
  inspectStudioFileCandidate,
  parseStudioRecentLocalFiles,
  studioFileExtension,
} from "./studio-file-control-center-model";

describe("studio file control center model", () => {
  it("recognizes the multi-part portable project extension", () => {
    expect(studioFileExtension("Season 01.TOONPROJECT.ZIP")).toBe(".toonproject.zip");
    expect(studioFileExtension("C:\\works\\episode.psd")).toBe(".psd");
    expect(studioFileExtension("untitled")).toBe("");
  });

  it("routes a portable archive to the lossless recovery owner", () => {
    const report = inspectStudioFileCandidate({
      name: "episode-07.toonproject.zip",
      size: 12_000_000,
      type: "application/zip",
    });

    expect(report.capabilityId).toBe("toonproject-archive");
    expect(report.tier).toBe("native");
    expect(report.actionId).toBe("archive-recovery");
    expect(report.withinSizeBudget).toBe(true);
    expect(report.risks).toEqual([]);
  });

  it("distinguishes a light JSON backup from a complete portable archive", () => {
    const report = inspectStudioFileCandidate({
      name: "episode-07.json",
      size: 900_000,
      type: "application/json",
    });

    expect(report.capabilityId).toBe("toonproject-json");
    expect(report.tier).toBe("structured");
    expect(report.actionId).toBe("project-json-import");
    expect(report.risks.join(" ")).toContain("원본 자산");
    expect(report.recommendations.join(" ")).toContain(".toonproject.zip");
  });

  it("routes audited layered and interchange formats without inventing support", () => {
    expect(inspectStudioFileCandidate({ name: "paint.psd", size: 10 }).actionId)
      .toBe("psd-import");
    expect(inspectStudioFileCandidate({ name: "paint.ora", size: 10 }).actionId)
      .toBe("interchange-import");
    expect(inspectStudioFileCandidate({ name: "pages.cbz", size: 10 }).actionId)
      .toBe("interchange-import");
    expect(inspectStudioFileCandidate({ name: "board.will", size: 10 }).actionId)
      .toBe("interchange-import");
  });

  it("fails closed for proprietary or ambiguous containers", () => {
    const clip = inspectStudioFileCandidate({
      name: "source.clip",
      size: 100,
      type: "application/octet-stream",
    });
    expect(clip.capabilityId).toBeNull();
    expect(clip.tier).toBe("unsupported");
    expect(clip.actionId).toBeNull();
    expect(clip.recommendations.join(" ")).toContain("PSD");

    const zip = inspectStudioFileCandidate({
      name: "unknown.zip",
      size: 100,
      type: "application/zip",
    });
    expect(zip.capabilityId).toBeNull();
    expect(zip.tier).toBe("unsupported");
    expect(zip.actionId).toBeNull();
    expect(zip.summary).toContain(".toonproject.zip");
  });

  it("blocks files that exceed the audited single-file budget", () => {
    const report = inspectStudioFileCandidate({
      name: "too-large.toonproject.zip",
      size: 281_000_000,
    });

    expect(report.withinSizeBudget).toBe(false);
    expect(report.tier).toBe("blocked");
    expect(report.actionId).toBeNull();
  });

  it("keeps at most five recent local file metadata records and never trusts malformed JSON", () => {
    expect(parseStudioRecentLocalFiles("not-json")).toEqual([]);
    expect(parseStudioRecentLocalFiles('{"name":"wrong-shape"}')).toEqual([]);

    let recent = parseStudioRecentLocalFiles(null);
    for (let index = 0; index < 7; index += 1) {
      const report = inspectStudioFileCandidate({
        name: `episode-${index}.json`,
        size: index,
      });
      recent = addStudioRecentLocalFile(
        recent,
        report,
        new Date(Date.UTC(2026, 8, 9, 0, index)).toISOString(),
      );
    }
    expect(recent).toHaveLength(5);
    expect(recent[0]?.name).toBe("episode-6.json");
    expect(recent[4]?.name).toBe("episode-2.json");

    const replacement = inspectStudioFileCandidate({
      name: "EPISODE-6.JSON",
      size: 999,
    });
    recent = addStudioRecentLocalFile(
      recent,
      replacement,
      "2026-09-09T01:00:00.000Z",
    );
    expect(recent).toHaveLength(5);
    expect(recent[0]?.sizeBytes).toBe(999);
  });
});
