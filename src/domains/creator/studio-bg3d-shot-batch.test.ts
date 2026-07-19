import { describe, expect, it, vi } from "vitest";

import { buildStudioBg3dShotBatchArchive } from "./studio-bg3d-shot-batch";

function pngHeader(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes.buffer;
}

function psdHeader(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(26);
  bytes.set([0x38, 0x42, 0x50, 0x53, 0, 1]);
  const view = new DataView(bytes.buffer);
  view.setUint16(12, 4, false);
  view.setUint32(14, height, false);
  view.setUint32(18, width, false);
  view.setUint16(22, 8, false);
  view.setUint16(24, 3, false);
  return bytes.buffer;
}

function image(id: string, name = "컷 1") {
  return {
    shotId: id,
    shotName: name,
    width: 320,
    height: 180,
    png: new Blob([pngHeader(320, 180)], { type: "image/png" }),
  };
}

describe("Studio BG3D shot batch archive", () => {
  it("writes deterministic numbered PNG paths and a bounded manifest", async () => {
    const onProgress = vi.fn();
    const blob = await buildStudioBg3dShotBatchArchive([
      image("shot-a", "첫 컷"),
      image("shot-b", "둘째 컷"),
    ], { onProgress });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    expect(blob.type).toBe("application/zip");
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    expect(text).toContain("manifest.json");
    expect(text).toContain("shots/001.png");
    expect(text).toContain("shots/002.png");
    expect(text).toContain("toonspectrum-bg3d-shot-batch");
    expect(text).toContain('"output": "beauty"');
    expect(text).toContain("첫 컷");
    expect(onProgress).toHaveBeenLastCalledWith({ completedFiles: 3, totalFiles: 3 });
  });

  it("accepts canonical code-point-bounded emoji and ZWJ shot names", async () => {
    const astralName = "😀".repeat(80);
    await expect(buildStudioBg3dShotBatchArchive([image("shot-emoji", astralName)]))
      .resolves.toBeInstanceOf(Blob);
    await expect(buildStudioBg3dShotBatchArchive([image("shot-family", "가족 👨‍👩‍👧‍👦")]))
      .resolves.toBeInstanceOf(Blob);
  });

  it("writes a v2 multi-pass manifest with one directory per shot and explicit skipped artifacts", async () => {
    const blob = await buildStudioBg3dShotBatchArchive([
      { ...image("shot-a", "첫 컷"), pass: "beauty", requestedHeight: 1_440, wasReduced: true },
      { ...image("shot-a", "첫 컷"), pass: "main-line", requestedHeight: 1_440, wasReduced: true },
      { ...image("shot-b", "둘째 컷"), pass: "depth", requestedHeight: 1_440, wasReduced: true },
    ], {
      manifest: {
        resumeKey: "bg3d-batch-deadbeef",
        shots: [
          { id: "shot-a", name: "첫 컷" },
          { id: "shot-b", name: "둘째 컷" },
        ],
        requestedPasses: ["beauty", "main-line", "depth", "tone"],
        resolution: { mode: "maximum-height", height: 1_440 },
        skippedArtifacts: [
          { shotId: "shot-a", shotName: "첫 컷", pass: "depth", reason: "unavailable" },
          { shotId: "shot-a", shotName: "첫 컷", pass: "tone", reason: "disabled" },
          { shotId: "shot-b", shotName: "둘째 컷", pass: "beauty", reason: "disabled" },
          { shotId: "shot-b", shotName: "둘째 컷", pass: "main-line", reason: "disabled" },
          { shotId: "shot-b", shotName: "둘째 컷", pass: "tone", reason: "disabled" },
        ],
      },
    });
    const text = new TextDecoder().decode(await blob.arrayBuffer());

    expect(text).toContain('"version": 2');
    expect(text).toContain('"resumeKey": "bg3d-batch-deadbeef"');
    expect(text).toContain("shots/001/beauty.png");
    expect(text).toContain("shots/001/main-line.png");
    expect(text).toContain("shots/002/depth.png");
    expect(text).toContain('"status": "skipped"');
    expect(text).toContain('"reason": "disabled"');
    expect(text).toContain('"encoding": "normalized-device-depth-u8"');
    expect(text).toContain('"nearIs": "black"');
    expect(text).toContain('"mode": "maximum-height"');
    expect(text).toContain('"height": 1440');
  });

  it("records requested and actual height when a device budget reduces a v2 artifact", async () => {
    const blob = await buildStudioBg3dShotBatchArchive([{
      ...image("shot-a", "첫 컷"),
      pass: "beauty",
      width: 1_920,
      height: 1_080,
      requestedHeight: 2_160,
      wasReduced: true,
      png: new Blob([pngHeader(1_920, 1_080)], { type: "image/png" }),
    }], {
      manifest: {
        shots: [{ id: "shot-a", name: "첫 컷" }],
        requestedPasses: ["beauty"],
        resolution: { mode: "maximum-height", height: 2_160 },
      },
    });
    const text = new TextDecoder().decode(await blob.arrayBuffer());
    expect(text).toContain('"requestedHeight": 2160');
    expect(text).toContain('"wasReduced": true');
  });

  it("packages a bounded layered PSD beside PNG passes and records PSD fallback truthfully", async () => {
    const blob = await buildStudioBg3dShotBatchArchive([
      { ...image("shot-a", "첫 컷"), pass: "lt-composite" },
      { ...image("shot-b", "둘째 컷"), pass: "lt-composite" },
    ], {
      layeredPsds: [{
        shotId: "shot-a",
        shotName: "첫 컷",
        width: 320,
        height: 180,
        psd: new Blob([psdHeader(320, 180)], { type: "image/vnd.adobe.photoshop" }),
      }],
      manifest: {
        shots: [
          { id: "shot-a", name: "첫 컷" },
          { id: "shot-b", name: "둘째 컷" },
        ],
        requestedPasses: ["lt-composite"],
        layeredPsdRequested: true,
        psdFallbacks: [{
          shotId: "shot-b",
          shotName: "둘째 컷",
          reason: "budget",
        }],
      },
    });
    const text = new TextDecoder().decode(await blob.arrayBuffer());

    expect(text).toContain("shots/001/layers.psd");
    expect(text).toContain('"kind": "layered-psd"');
    expect(text).toContain('"encoding": "psd-v1-rle-rgba8"');
    expect(text).toContain('"reason": "budget"');
  });

  it("packages ordered contact sheets and records a truthful global fallback", async () => {
    const contactPng = new Blob([pngHeader(2_144, 1_064)], { type: "image/png" });
    const blob = await buildStudioBg3dShotBatchArchive([
      { ...image("shot-a", "첫 컷"), pass: "lt-composite" },
      { ...image("shot-b", "둘째 컷"), pass: "lt-composite" },
    ], {
      contactSheets: [{
        sheetNumber: 1,
        fileName: "contact-sheet-001.png",
        width: 2_144,
        height: 1_064,
        shotIds: ["shot-a", "shot-b"],
        png: contactPng,
      }],
      manifest: {
        shots: [
          { id: "shot-a", name: "첫 컷" },
          { id: "shot-b", name: "둘째 컷" },
        ],
        requestedPasses: ["lt-composite"],
        contactSheetRequested: true,
      },
    });
    const text = new TextDecoder().decode(await blob.arrayBuffer());

    expect(text).toContain("contact/contact-sheet-001.png");
    expect(text).toContain('"kind": "contact-sheet"');
    expect(text).toContain('"shotIds"');
    expect(text).toContain('"contactSheetFallback": null');

    const fallbackBlob = await buildStudioBg3dShotBatchArchive([
      { ...image("shot-a", "첫 컷"), pass: "beauty" },
    ], {
      manifest: {
        shots: [{ id: "shot-a", name: "첫 컷" }],
        requestedPasses: ["beauty"],
        contactSheetRequested: true,
        contactSheetFallback: "unavailable",
      },
    });
    expect(new TextDecoder().decode(await fallbackBlob.arrayBuffer()))
      .toContain('"contactSheetFallback": "unavailable"');
  });

  it("rejects duplicate ids, unsafe names, MIME mismatches, and forged PNG bytes", async () => {
    await expect(buildStudioBg3dShotBatchArchive([
      image("shot-a"), image("shot-a"),
    ])).rejects.toThrow(/중복/iu);
    await expect(buildStudioBg3dShotBatchArchive([
      { ...image("shot-a"), pass: "beauty" },
      { ...image("shot-a"), pass: "beauty" },
    ])).rejects.toThrow(/중복/iu);
    await expect(buildStudioBg3dShotBatchArchive([
      image("shot-a", "https://unsafe.invalid"),
    ])).rejects.toThrow(/안전한 형식/iu);
    await expect(buildStudioBg3dShotBatchArchive([{
      ...image("shot-a"),
      png: new Blob([pngHeader(320, 180)], { type: "image/jpeg" }),
    }])).rejects.toThrow(/안전한 형식/iu);
    await expect(buildStudioBg3dShotBatchArchive([
      { ...image("shot-a"), pass: "beauty" },
      { ...image("shot-a"), pass: "depth", width: 321 },
    ])).rejects.toThrow(/해상도/iu);
    await expect(buildStudioBg3dShotBatchArchive([
      { ...image("shot-a"), pass: "beauty" },
    ], {
      manifest: {
        shots: [{ id: "shot-a", name: "컷 1" }],
        requestedPasses: ["beauty", "depth"],
      },
    })).rejects.toThrow(/완료 또는 생략/iu);
    await expect(buildStudioBg3dShotBatchArchive([
      { ...image("shot-a"), pass: "depth" },
    ], {
      manifest: {
        shots: [{ id: "shot-a", name: "컷 1" }],
        requestedPasses: ["beauty"],
      },
    })).rejects.toThrow(/요청 패스/iu);
    await expect(buildStudioBg3dShotBatchArchive([
      { ...image("shot-a"), pass: "beauty" },
    ], {
      layeredPsds: [{
        shotId: "shot-a",
        shotName: "컷 1",
        width: 321,
        height: 180,
        psd: new Blob([psdHeader(321, 180)], { type: "image/vnd.adobe.photoshop" }),
      }],
    })).rejects.toThrow(/PSD와 PNG pass 해상도/iu);
    await expect(buildStudioBg3dShotBatchArchive([{
      ...image("shot-a"),
      png: new Blob([new Uint8Array(24)], { type: "image/png" }),
    }])).rejects.toThrow(/signature|IHDR/iu);
    await expect(buildStudioBg3dShotBatchArchive([
      { ...image("shot-a"), pass: "beauty" },
    ], {
      manifest: {
        resumeKey: "unsafe",
      },
    })).rejects.toThrow(/resume key/iu);
    await expect(buildStudioBg3dShotBatchArchive([
      { ...image("shot-a"), pass: "beauty" },
    ], {
      layeredPsds: [{
        shotId: "shot-a",
        shotName: "컷 1",
        width: 320,
        height: 180,
        psd: new Blob([new Uint8Array(26)], { type: "image/vnd.adobe.photoshop" }),
      }],
    })).rejects.toThrow(/signature/iu);
    await expect(buildStudioBg3dShotBatchArchive([{
      ...image("shot-a"),
      pass: "beauty",
      requestedHeight: 1_080,
      wasReduced: false,
    }])).rejects.toThrow(/안전한 형식/iu);
  });

  it("honors cancellation before allocating the archive", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(buildStudioBg3dShotBatchArchive(
      [image("shot-a")],
      { signal: controller.signal },
    )).rejects.toMatchObject({ name: "AbortError" });
  });
});
