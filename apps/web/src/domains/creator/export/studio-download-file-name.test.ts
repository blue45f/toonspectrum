import { describe, expect, it } from "vitest";

import {
  STUDIO_DOWNLOAD_FILE_NAME_MAX_CODE_POINTS,
  appendStudioDownloadSuffix,
  createStudioDownloadFileName,
  dedupeStudioDownloadFileNames,
  sanitizeStudioDownloadFileName,
  studioDownloadVersionSuffix,
} from "./studio-download-file-name";

describe("sanitizeStudioDownloadFileName", () => {
  it("removes traversal and platform-reserved characters while preserving Korean titles", () => {
    expect(sanitizeStudioDownloadFileName("  ../달빛:탐정?.PNG  ")).toBe("달빛-탐정.png");
    expect(sanitizeStudioDownloadFileName("CON.png")).toBe("_CON.png");
  });

  it("removes control and bidi override characters", () => {
    expect(sanitizeStudioDownloadFileName("회차\u0000\u202e-01.webp")).toBe("회차-01.webp");
  });

  it("uses a safe fallback and bounds the complete name", () => {
    expect(sanitizeStudioDownloadFileName("...", "내보내기.json")).toBe("내보내기.json");
    const result = sanitizeStudioDownloadFileName(`${"가".repeat(400)}.png`);
    expect(Array.from(result).length).toBeLessThanOrEqual(
      STUDIO_DOWNLOAD_FILE_NAME_MAX_CODE_POINTS,
    );
    expect(result.endsWith(".png")).toBe(true);
  });
});

describe("createStudioDownloadFileName", () => {
  it("composes an explicit suffix before the normalized extension", () => {
    expect(
      createStudioDownloadFileName({
        title: "달빛 탐정",
        fallbackTitle: "toonspectrum-webtoon",
        suffix: "strip-1of3",
        extension: ".PNG",
      }),
    ).toBe("달빛 탐정-strip-1of3.png");
  });
});

describe("studioDownloadVersionSuffix", () => {
  it("builds a stable revision and UTC timestamp suffix", () => {
    expect(studioDownloadVersionSuffix({
      revision: 7,
      exportedAt: "2026-09-25T02:35:20.987Z",
    })).toBe("r7-20260925-023520Z");
    expect(appendStudioDownloadSuffix(
      "transparent",
      studioDownloadVersionSuffix({ revision: 7, exportedAt: 0 }),
    )).toBe("transparent-r7-19700101-000000Z");
  });

  it("omits invalid or non-positive version fields", () => {
    expect(studioDownloadVersionSuffix({ revision: 0, exportedAt: "invalid" })).toBe("");
    expect(studioDownloadVersionSuffix({ revision: -1 })).toBe("");
    expect(studioDownloadVersionSuffix()).toBe("");
  });
});

describe("dedupeStudioDownloadFileNames", () => {
  it("deduplicates case-insensitively without changing order", () => {
    expect(
      dedupeStudioDownloadFileNames([
        "컷툰.png",
        "컷툰.png",
        "CUT.PNG",
        "cut.png",
      ]),
    ).toEqual(["컷툰.png", "컷툰-2.png", "CUT.png", "cut-2.png"]);
  });
});
