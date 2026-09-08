import { describe, expect, it, vi } from "vitest";
import { readStudioZipArchive } from "../studio-zip-reader";
import { STUDIO_VRM_TEXTURE_PAINT_CHANNELS, studioVrmTexturePaintChannelEncoding } from "./studio-vrm-texture-paint-channel";
import { exportStudioVrmTexturePaintArchive } from "./studio-vrm-texture-paint-export";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==", "base64"));
function fixture() {
  const targets = STUDIO_VRM_TEXTURE_PAINT_CHANNELS.map((textureSlot) => ({
    id: textureSlot, width: 1, height: 1, pixels: new Uint8ClampedArray([128, 128, 128, 255]),
    bindings: [{ bindingKey: `gltf-material-2-${textureSlot}`, materialLocator: "gltf-material:2", textureSlot }],
  }));
  return { targets, exportPaintedTargets: vi.fn(() => ({ ok: true as const, value: targets })) };
}

describe("portable surface texture export", () => {
  it("exports verified PNG bytes once with five distinct channel bindings and encodings", async () => {
    const runtime = fixture();
    const before = structuredClone(runtime.targets);
    const zip = await exportStudioVrmTexturePaintArchive(runtime, {
      encodePng: async () => new Blob([png], { type: "image/png" }), crc32ExecutionMode: "direct-headless",
    });
    const archive = await readStudioZipArchive(zip);
    expect(archive.entries).toHaveLength(2);
    const manifest = JSON.parse(new TextDecoder().decode(await archive.readEntry("manifest.json")));
    expect(manifest).toMatchObject({ kind: "toonspectrum/surface-textures", version: 1 });
    expect(manifest.textures).toHaveLength(5);
    for (const channel of STUDIO_VRM_TEXTURE_PAINT_CHANNELS) {
      const texture = manifest.textures.find((entry: { textureSlot: string }) => entry.textureSlot === channel);
      expect(texture).toMatchObject({ textureSlot: channel, materialLocator: "gltf-material:2", ...studioVrmTexturePaintChannelEncoding(channel) });
      expect(await archive.readEntry(texture.path)).toEqual(png);
    }
    expect(runtime.targets).toEqual(before);
    expect(runtime.exportPaintedTargets).toHaveBeenCalledOnce();
  });

  it("cancels before reading or encoding a runtime when the operation is already aborted", async () => {
    const runtime = fixture(); const encodePng = vi.fn();
    const controller = new AbortController(); controller.abort();
    await expect(exportStudioVrmTexturePaintArchive(runtime, { signal: controller.signal, encodePng })).rejects.toMatchObject({ name: "AbortError" });
    expect(runtime.exportPaintedTargets).not.toHaveBeenCalled();
    expect(encodePng).not.toHaveBeenCalled();
  });
});
