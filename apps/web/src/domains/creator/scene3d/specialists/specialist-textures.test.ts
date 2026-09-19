import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { WebIO } from "@gltf-transform/core";
import {
  createTexturedSpecialistFixture,
  textureFixtureRgba,
  textureFixturePng,
} from "./specialist-texture-fixtures";
import { createSpecialistIo, preflightSpecialistGlb } from "./specialist-gltf";
import { processTextureDerivatives } from "./specialist-textures";
import { inspectSpecialistGlbImages } from "./specialist-image-budget";
import { derivativeTextureSize } from "./specialist-texture-codec";
import { createSpecialistFixture } from "./specialist-fixtures";
import type { SpecialistRasterDecoder } from "./specialist-texture-codec";

const decoder: SpecialistRasterDecoder = async (
  _bytes,
  _mime,
  width,
  height,
) => ({ width, height, data: textureFixtureRgba(width, height) });

describe("real texture derivatives and release pipeline", () => {
  it.each(["uastc", "etc1s"] as const)(
    "encodes a real %s mip chain and required Basis GLB",
    async (textureMode) => {
      const source = await createTexturedSpecialistFixture();
      const original = source.slice();
      const result = await processTextureDerivatives(
        await createSpecialistIo(),
        source,
        { kind: "textures", textureMode, maxTextureSize: 512 },
        decoder,
      );
      expect(source).toEqual(original);
      const glb = result.artifacts[0]!.bytes;
      expect(preflightSpecialistGlb(glb).extensionsRequired).toContain(
        "KHR_texture_basisu",
      );
      expect(inspectSpecialistGlbImages(glb)).toMatchObject([
        { width: 32, height: 32, mime: "image/ktx2" },
      ]);
      const receipt = JSON.parse(
        new TextDecoder().decode(result.artifacts[1]!.bytes),
      );
      expect(receipt.textures[0]).toMatchObject({
        mode: textureMode,
        transfer: "srgb",
        levels: 6,
        action: "encoded",
      });
    },
  );
  it("writes three independently reduced textured LODs with measured receipts", async () => {
    const result = await processTextureDerivatives(
      await createSpecialistIo(),
      await createTexturedSpecialistFixture(),
      {
        kind: "release",
        textureMode: "uastc",
        maxTextureSize: 512,
        error: 0.03,
      },
      decoder,
    );
    expect(result.artifacts.map(({ name }) => name)).toEqual([
      "release-lod-0.glb",
      "release-lod-1.glb",
      "release-lod-2.glb",
      "texture-release-receipt.json",
    ]);
    expect(result.artifacts[1]!.stats!.triangles).toBeLessThan(
      result.artifacts[0]!.stats!.triangles,
    );
    expect(result.artifacts[2]!.stats!.triangles).toBeLessThan(
      result.artifacts[1]!.stats!.triangles,
    );
    for (const artifact of result.artifacts.slice(0, 3))
      expect(inspectSpecialistGlbImages(artifact.bytes)[0]!.mime).toBe(
        "image/ktx2",
      );
  });
  it("keeps data and normal textures linear UASTC even when color mode is ETC1S", async () => {
    const result = await processTextureDerivatives(
      await createSpecialistIo(),
      await createTexturedSpecialistFixture(true),
      { kind: "textures", textureMode: "etc1s", maxTextureSize: 512 },
      decoder,
    );
    const receipt = JSON.parse(
      new TextDecoder().decode(result.artifacts[1]!.bytes),
    );
    expect(
      receipt.textures.find((entry: { normal: boolean }) => entry.normal),
    ).toMatchObject({ mode: "uastc", transfer: "linear", normal: true });
  });
  it("rejects a texture shared by incompatible color/data slots", async () => {
    const io = new WebIO();
    const document = await io.readBinary(
      await createTexturedSpecialistFixture(),
    );
    const material = document.getRoot().listMaterials()[0]!;
    material.setMetallicRoughnessTexture(material.getBaseColorTexture());
    await expect(
      processTextureDerivatives(
        await createSpecialistIo(),
        new Uint8Array(await io.writeBinary(document)),
        { kind: "textures", textureMode: "uastc", maxTextureSize: 512 },
        decoder,
      ),
    ).rejects.toMatchObject({ code: "unsupported" });
  });
  it("does not pretend an untextured source needs encoding or accept mismatched decoder sizes", async () => {
    await expect(
      processTextureDerivatives(
        await createSpecialistIo(),
        await createSpecialistFixture("cube"),
        { kind: "textures", textureMode: "uastc", maxTextureSize: 512 },
        decoder,
      ),
    ).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      processTextureDerivatives(
        await createSpecialistIo(),
        await createTexturedSpecialistFixture(),
        { kind: "textures", textureMode: "uastc", maxTextureSize: 512 },
        async () => ({ width: 1, height: 1, data: new Uint8Array(4) }),
      ),
    ).rejects.toMatchObject({ code: "runtime" });
  });
  it("explicitly controls mip transfer filtering and renormalization without changing the WASM kernel", async () => {
    const source = resolve(
      "node_modules/ktx2-encoder/dist/applyInputOptions.js",
    );
    // Import the exact patched module without asking Vite to treat a package-private test path as product API.
    const module = await import(/* @vite-ignore */ pathToFileURL(source).href);
    const calls: [string, unknown][] = [];
    const encoder = new Proxy(
      {},
      {
        get: (_, name) =>
          typeof name === "string"
            ? (value: unknown) => calls.push([name, value])
            : undefined,
      },
    );
    module.applyInputOptions(
      { isPerceptual: false, isNormalMap: true },
      encoder,
    );
    expect(calls).toContainEqual(["setMipSRGB", false]);
    expect(calls).toContainEqual(["setMipRenormalize", true]);
    expect(
      readFileSync("patches/ktx2-encoder@0.6.0.patch", "utf8"),
    ).not.toContain("diff --git a/dist/basis/basis_encoder.wasm");
  });
  it("keeps resize dimensions positive, aligned and within the requested edge", () => {
    expect(derivativeTextureSize(4096, 2048, 1024)).toEqual({
      width: 1024,
      height: 512,
    });
    expect(derivativeTextureSize(1, 1, 512)).toEqual({ width: 4, height: 4 });
  });
});


it("enforces the selected edge on already-compressed KTX2 without altering source bytes", async () => {
  const io = await createSpecialistIo();
  const document = await io.readBinary(await createTexturedSpecialistFixture());
  document.getRoot().listTextures()[0]!.setImage(await textureFixturePng(1024, 4));
  const original = new Uint8Array(await io.writeBinary(document));
  const encoded = await processTextureDerivatives(io, original,
    { kind: "textures", textureMode: "uastc", maxTextureSize: 2048 }, decoder);
  const source = encoded.artifacts[0]!.bytes; const snapshot = source.slice();
  const forbiddenDecoder = vi.fn(decoder);
  for (const kind of ["textures", "release"] as const) {
    await expect(processTextureDerivatives(io, source,
      { kind, textureMode: "uastc", maxTextureSize: 512, ...(kind === "release" ? { error: 0.01 } : {}) } as Parameters<typeof processTextureDerivatives>[2],
      forbiddenDecoder)).rejects.toMatchObject({ code: "unsupported" });
  }
  expect(source).toEqual(snapshot); expect(forbiddenDecoder).not.toHaveBeenCalled();
  const kept = await processTextureDerivatives(io, source,
    { kind: "release", textureMode: "uastc", maxTextureSize: 1024, error: 0.03 }, forbiddenDecoder);
  expect(inspectSpecialistGlbImages(kept.artifacts[0]!.bytes)[0]).toMatchObject({ width: 1024, height: 4 });
  expect(forbiddenDecoder).not.toHaveBeenCalled();
});
