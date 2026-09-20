import { Buffer } from "node:buffer";
import { WebIO } from "@gltf-transform/core";
import { describe, expect, it, vi } from "vitest";
import { admitArtifactReviewPair } from "./artifact-review-admission";
import { createSpecialistFixture } from "./specialist-fixtures";
import { sha256, createSpecialistIo } from "./specialist-gltf";
import {
  createTexturedSpecialistFixture,
  textureFixturePng,
  textureFixtureRgba,
} from "./specialist-texture-fixtures";
import { processTextureDerivatives } from "./specialist-textures";
import type { ArtifactReviewSource } from "./artifact-review-contract";
import type { SpecialistArtifact } from "./specialist-contract";

const stats = {
  triangles: 12,
  vertices: 24,
  nodes: 1,
  animations: 0,
  animationKeys: 0,
  tangentPrimitives: 0,
};
async function fixture() {
  const bytes = await createSpecialistFixture("cube");
  const artifact: SpecialistArtifact = {
    name: "cube.glb",
    mime: "model/gltf-binary",
    bytes,
    sha256: sha256(bytes),
    stats,
  };
  const source: ArtifactReviewSource = {
    label: "cube.glb",
    bytes,
    sha256: artifact.sha256,
    stats,
  };
  return { artifact, source };
}
function mutateGlb(
  bytes: Uint8Array<ArrayBuffer>,
  mutate: (json: Record<string, any>) => void,
): Uint8Array<ArrayBuffer> {
  const oldSize = new DataView(bytes.buffer).getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + oldSize)),
  );
  mutate(json);
  const text = new TextEncoder().encode(JSON.stringify(json));
  const length = Math.ceil(text.length / 4) * 4;
  const next = new Uint8Array(bytes.length - oldSize + length);
  next.set(bytes.subarray(0, 20));
  new DataView(next.buffer).setUint32(8, next.length, true);
  new DataView(next.buffer).setUint32(12, length, true);
  next.fill(32, 20, 20 + length);
  next.set(text, 20);
  next.set(bytes.subarray(20 + oldSize), 20 + length);
  return next;
}
describe("source/result preview input boundary", () => {
  it("admits real generated inputs and freezes an owned copy before any await", async () => {
    const { artifact, source } = await fixture();
    const expected = artifact.bytes.slice();
    const pending = admitArtifactReviewPair(artifact, source);
    artifact.bytes.fill(0);
    source.bytes.fill(0);
    const result = await pending;
    expect(result.result.bytes).toEqual(expected);
    expect(result.source!.bytes).toEqual(expected);
    expect(result.result.bytes.buffer).not.toBe(expected.buffer);
    expect(result.result.meshTriangles).toBe(12);
  });
  it("rejects a tampered artifact or wrong source binding rather than displaying a false comparison", async () => {
    const { artifact, source } = await fixture();
    await expect(
      admitArtifactReviewPair(
        { ...artifact, sha256: "sha256:" + "0".repeat(64) },
        source,
      ),
    ).rejects.toMatchObject({ code: "invalid-input" });
    await expect(
      admitArtifactReviewPair(artifact, {
        ...source,
        sha256: "sha256:" + "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "invalid-input" });
  });
  it("rejects external geometry/image resources and unsupported required extensions before a loader can run", async () => {
    const { artifact } = await fixture();
    for (const change of [
      (json: Record<string, any>) => {
        json.buffers[0].uri = "https://example.invalid/private.bin";
      },
      (json: Record<string, any>) => {
        json.images = [{ uri: "data:image/png;base64,anything" }];
      },
      (json: Record<string, any>) => {
        json.extensionsRequired = ["VRMC_vrm"];
      },
      (json: Record<string, any>) => {
        json.nodes[0].children = [0];
      },
    ]) {
      const bytes = mutateGlb(artifact.bytes, change);
      await expect(
        admitArtifactReviewPair({ ...artifact, bytes, sha256: sha256(bytes) }),
      ).rejects.toThrow();
    }
  });
  it("enforces aggregate encoded bytes before snapshot allocation", async () => {
    const { artifact, source } = await fixture();
    const huge = new Uint8Array(128 * 1024 * 1024);
    const copy = vi.spyOn(huge, "slice");
    await expect(
      admitArtifactReviewPair({ ...artifact, bytes: huge }, source),
    ).rejects.toMatchObject({ code: "budget" });
    expect(copy).not.toHaveBeenCalled();
  });
  it("counts both sources in the texture budget instead of accepting two individually safe images", async () => {
    const io = new WebIO();
    const document = await io.readBinary(
      await createTexturedSpecialistFixture(),
    );
    document
      .getRoot()
      .listTextures()[0]!
      .setImage(await textureFixturePng(3072, 3072));
    const bytes = new Uint8Array(await io.writeBinary(document));
    const artifact = {
      name: "large.glb",
      mime: "model/gltf-binary",
      bytes,
      sha256: sha256(bytes),
      stats,
    };
    expect(
      (await admitArtifactReviewPair(artifact)).result.imageEstimateBytes,
    ).toBe(3072 * 3072 * 4);
    await expect(
      admitArtifactReviewPair(artifact, {
        label: "source",
        bytes,
        sha256: artifact.sha256,
        stats,
      }),
    ).rejects.toMatchObject({ code: "budget" });
  });
  it("admits real compressed derivatives without needing a renderer or raster decode", async () => {
    const sourceBytes = await createTexturedSpecialistFixture();
    const result = await processTextureDerivatives(
      await createSpecialistIo(),
      sourceBytes,
      { kind: "textures", textureMode: "uastc", maxTextureSize: 512 },
      async (_bytes, _mime, width, height) => ({
        width,
        height,
        data: textureFixtureRgba(width, height),
      }),
    );
    const pair = await admitArtifactReviewPair(result.artifacts[0]!, {
      label: "original",
      bytes: sourceBytes,
      sha256: sha256(sourceBytes),
      stats,
    });
    expect(pair.result.usesKtx2).toBe(true);
    expect(pair.source!.usesKtx2).toBe(false);
  });
  it("rejects cancellation before copying and after asynchronous attestation", async () => {
    const { artifact, source } = await fixture();
    const before = new AbortController();
    before.abort();
    const copy = vi.spyOn(artifact.bytes, "slice");
    await expect(
      admitArtifactReviewPair(artifact, source, before.signal),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(copy).not.toHaveBeenCalled();
    const after = new AbortController();
    const pending = admitArtifactReviewPair(artifact, source, after.signal);
    after.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });
});


it("copies Uint8Array subclasses instead of retaining a Buffer.slice view across attestation", async () => {
  const { artifact, source } = await fixture();
  const expected = artifact.bytes.slice();
  const borrowed = Buffer.from(artifact.bytes);
  const pending = admitArtifactReviewPair({ ...artifact, bytes: borrowed }, { ...source, bytes: borrowed });
  borrowed.fill(0);
  const admitted = await pending;
  expect(admitted.result.bytes).toEqual(expected);
  expect(admitted.source!.bytes).toEqual(expected);
  expect(admitted.result.bytes.constructor).toBe(Uint8Array);
});
