import { describe, expect, it, vi } from "vitest";

import { buildStudioBg3dShotBatchArchive } from "./studio-bg3d-shot-batch";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);

function image(id: string, name = "컷 1") {
  return {
    shotId: id,
    shotName: name,
    width: 320,
    height: 180,
    png: new Blob([PNG_BYTES], { type: "image/png" }),
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

  it("rejects duplicate ids, unsafe names, MIME mismatches, and forged PNG bytes", async () => {
    await expect(buildStudioBg3dShotBatchArchive([
      image("shot-a"), image("shot-a", "컷 2"),
    ])).rejects.toThrow(/중복/iu);
    await expect(buildStudioBg3dShotBatchArchive([
      image("shot-a", "https://unsafe.invalid"),
    ])).rejects.toThrow(/안전한 형식/iu);
    await expect(buildStudioBg3dShotBatchArchive([{
      ...image("shot-a"),
      png: new Blob([PNG_BYTES], { type: "image/jpeg" }),
    }])).rejects.toThrow(/안전한 형식/iu);
    await expect(buildStudioBg3dShotBatchArchive([{
      ...image("shot-a"),
      png: new Blob([new Uint8Array(12)], { type: "image/png" }),
    }])).rejects.toThrow(/시그니처/iu);
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
