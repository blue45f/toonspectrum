import { describe, expect, it, vi } from "vitest";

import {
  buildStudioDownloadPackage,
  sanitizeStudioDownloadFileStem,
  STUDIO_DOWNLOAD_PACKAGE_MIME,
  studioDownloadPackageFileName,
} from "./studio-download-package";

function image(value: string, type = "image/png"): Blob {
  return new Blob([value], { type });
}

describe("studio verified download package", () => {
  it("normalizes unsafe and reserved file names", () => {
    expect(sanitizeStudioDownloadFileStem("  작가/원고:* 1화  ")).toBe(
      "작가-원고-1화",
    );
    expect(sanitizeStudioDownloadFileStem("CON")).toBe(
      "toonspectrum-comic",
    );
    expect(studioDownloadPackageFileName(" 1화 ")).toBe(
      "1화-verified-pages.zip",
    );
  });

  it("orders pages, records dimensions, and publishes SHA-256 digests", async () => {
    const onProgress = vi.fn();
    const result = await buildStudioDownloadPackage(
      {
        title: "검증 원고",
        format: "png",
        scale: 2,
        transparentRequested: true,
        createdAt: "2026-09-09T00:00:00.000Z",
        pages: [
          {
            index: 4,
            label: "마지막/컷",
            width: 800,
            height: 1_200,
            image: image("two"),
          },
          {
            index: 1,
            label: "첫 컷",
            width: 720,
            height: 1_000,
            image: image("one"),
          },
        ],
      },
      {
        crc32ExecutionMode: "direct-headless",
        onProgress,
      },
    );

    expect(result.fileName).toBe("검증 원고-verified-pages.zip");
    expect(result.blob.type).toBe(STUDIO_DOWNLOAD_PACKAGE_MIME);
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      title: "검증 원고",
      format: "png",
      scale: 2,
      transparentRequested: true,
      captureMode: "flattened-page",
      checksum: "SHA-256",
      pageCount: 2,
      totalPageBytes: 6,
    });
    expect(result.manifest.pages).toEqual([
      {
        pageNumber: 1,
        sourceIndex: 1,
        label: "첫 컷",
        path: "pages/0001-첫 컷.png",
        mimeType: "image/png",
        width: 720,
        height: 1_000,
        bytes: 3,
        sha256:
          "7692c3ad3540bb803c020b3aee66cd8887123234ea0c6e7143c0add73ff431ed",
      },
      {
        pageNumber: 2,
        sourceIndex: 4,
        label: "마지막/컷",
        path: "pages/0002-마지막-컷.png",
        mimeType: "image/png",
        width: 800,
        height: 1_200,
        bytes: 3,
        sha256:
          "3fc4ccfe745870e2c0d99f71f30ff0656c8dedd41cc1d7d3d376b0dbe685e2f3",
      },
    ]);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "hashing", completed: 2, total: 2 }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "archiving", completed: 4, total: 4 }),
    );
  });

  it("fails closed when the encoded MIME does not match the selected format", async () => {
    await expect(
      buildStudioDownloadPackage({
        title: "mismatch",
        format: "jpg",
        scale: 1,
        transparentRequested: false,
        pages: [
          {
            index: 0,
            width: 100,
            height: 100,
            image: image("png", "image/png"),
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "MIME_MISMATCH",
      pageIndex: 0,
    });
  });

  it("honors an already aborted package request before reading page bytes", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      buildStudioDownloadPackage(
        {
          title: "cancelled",
          format: "png",
          scale: 1,
          transparentRequested: false,
          pages: [
            {
              index: 0,
              width: 100,
              height: 100,
              image: image("one"),
            },
          ],
        },
        { signal: controller.signal, crc32ExecutionMode: "direct-headless" },
      ),
    ).rejects.toMatchObject({
      code: "ABORTED",
    });
  });
});
