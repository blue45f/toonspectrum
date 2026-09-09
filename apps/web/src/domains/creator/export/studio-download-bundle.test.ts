import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_DOWNLOAD_BUNDLE_MANIFEST_PATH,
  STUDIO_DOWNLOAD_BUNDLE_MIME,
  buildStudioDownloadBundle,
  planStudioDownloadBundleFiles,
} from "./studio-download-bundle";

describe("planStudioDownloadBundleFiles", () => {
  it("sanitizes and deduplicates file names while keeping source order", () => {
    const files = planStudioDownloadBundleFiles([
      { blob: new Blob(["a"]), fileName: "../회차:01.png" },
      { blob: new Blob(["b"]), fileName: "회차-01.png" },
      { blob: new Blob(["c"]), fileName: "CUT.PNG" },
      { blob: new Blob(["d"]), fileName: "cut.png" },
    ]);
    expect(files.map((file) => file.fileName)).toEqual([
      "회차-01.png",
      "회차-01-2.png",
      "CUT.png",
      "cut-2.png",
    ]);
    expect(files.map((file) => file.archivePath)).toEqual([
      "files/회차-01.png",
      "files/회차-01-2.png",
      "files/CUT.png",
      "files/cut-2.png",
    ]);
  });

  it("rejects an empty delivery", () => {
    expect(() => planStudioDownloadBundleFiles([])).toThrow(
      "다운로드 묶음에 포함할 파일이 없습니다.",
    );
  });
});

describe("buildStudioDownloadBundle", () => {
  it("creates one deterministic ZIP delivery with a manifest and CRC progress", async () => {
    const onProgress = vi.fn();
    const result = await buildStudioDownloadBundle({
      title: "달빛 탐정",
      generatedAt: "2026-09-09T00:00:00Z",
      crc32ExecutionMode: "direct-headless",
      files: [
        { blob: new Blob(["part-a"], { type: "image/png" }), fileName: "part-1.png" },
        { blob: new Blob(["part-b"], { type: "image/png" }), fileName: "part-2.png" },
      ],
      onProgress,
    });
    const signature = new Uint8Array(await result.blob.slice(0, 4).arrayBuffer());
    expect(Array.from(signature)).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(result.blob.type).toBe(STUDIO_DOWNLOAD_BUNDLE_MIME);
    expect(result.fileName).toBe("달빛 탐정-strip-bundle.zip");
    expect(result.manifest).toMatchObject({
      schema: "toonstudio.download-bundle/v1",
      generatedAt: "2026-09-09T00:00:00.000Z",
      integrity: "zip-crc32",
      fileCount: 2,
      totalBytes: 12,
    });
    expect(result.manifest.files.map((file) => file.path)).toEqual([
      "files/part-1.png",
      "files/part-2.png",
    ]);
    expect(onProgress).toHaveBeenLastCalledWith({
      completedFiles: 2,
      totalFiles: 2,
      fileName: "part-2.png",
    });
    expect(STUDIO_DOWNLOAD_BUNDLE_MANIFEST_PATH).toBe("manifest.json");
  });
});
