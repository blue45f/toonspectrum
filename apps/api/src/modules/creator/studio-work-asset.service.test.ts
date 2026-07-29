import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN,
  type StudioWorkAssetManifest,
} from "../../../../../lib/studio-work-asset-contract";

import {
  StudioWorkAssetCleanupOwnershipError,
  StudioWorkAssetForbiddenError,
  StudioWorkAssetImmutableConflictError,
  StudioWorkAssetNotFoundError,
  StudioWorkAssetQuotaError,
  StudioWorkAssetReferencedError,
  StudioWorkAssetTypeConflictError,
} from "./studio-work-asset.repository";
import {
  admitStudioWorkAssetPayload,
  readStudioWorkAssetImageDimensions,
  StudioWorkAssetService,
} from "./studio-work-asset.service";

import type { DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import type { StudioWorkAssetRepository } from "./studio-work-asset.repository";

const manifest: StudioWorkAssetManifest = {
  version: 1,
  assetId: "asset-1",
  elementType: "image",
  mimeType: "image/png",
  byteSize: 8,
  sha256: "4c4b6a3be1314ab86138bef4314dde022d62b81efafc9b14ff126b34a22e7f20",
  intrinsicImage: { width: 1, height: 1, decodedRgbaBytes: 4 },
  descriptor: {
    version: 1,
    element: {
      id: "asset-1",
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
    },
  },
  updatedAt: "2026-07-16T00:00:00.000Z",
};

const repository = {
  upsert: vi.fn(),
  getManifest: vi.fn(),
  getManifests: vi.fn(),
  getManifestsInTransaction: vi.fn(),
  getContent: vi.fn(),
  deleteUnreferencedUpload: vi.fn(),
};

function service(): StudioWorkAssetService {
  return new StudioWorkAssetService(repository as unknown as StudioWorkAssetRepository);
}

function pngBytes(width = 1, height = 1): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes.set([8, 6, 0, 0, 0], 24);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes;
}

function apngBytes(): Uint8Array {
  const base = pngBytes();
  const bytes = new Uint8Array(base.byteLength + 20);
  bytes.set(base.subarray(0, 33));
  const view = new DataView(bytes.buffer);
  view.setUint32(33, 8, false);
  bytes.set([0x61, 0x63, 0x54, 0x4c], 37);
  view.setUint32(41, 2, false);
  view.setUint32(45, 0, false);
  bytes.set(base.subarray(33), 53);
  return bytes;
}

function gifBytes(width = 1, height = 1): Uint8Array {
  const bytes = new Uint8Array(10);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

function jpegBytes(width = 1, height = 1): Uint8Array {
  return Uint8Array.of(
    0xff, 0xd8,
    0xff, 0xc0,
    0x00, 0x0b,
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9
  );
}

function webpBytes(width = 1, height = 1): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46]);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x58], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 22, true);
  view.setUint32(16, 10, true);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  bytes.set([
    widthMinusOne & 0xff,
    (widthMinusOne >> 8) & 0xff,
    (widthMinusOne >> 16) & 0xff,
  ], 24);
  bytes.set([
    heightMinusOne & 0xff,
    (heightMinusOne >> 8) & 0xff,
    (heightMinusOne >> 16) & 0xff,
  ], 27);
  return bytes;
}

function glb(document: Record<string, unknown>): Uint8Array {
  const raw = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(raw.byteLength / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(raw, 20);
  return bytes;
}

describe("studio work asset binary admission", () => {
  it("sniffs image bytes, canonicalizes MIME, hashes, and copies the caller buffer", () => {
    const bytes = pngBytes();
    const admitted = admitStudioWorkAssetPayload("image", "application/octet-stream", bytes);
    expect(admitted.mimeType).toBe("image/png");
    expect(admitted.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(admitted.payload).toEqual(bytes);
    expect(admitted.payload).not.toBe(bytes);
    expect(admitted.intrinsicImage).toEqual({ width: 1, height: 1, decodedRgbaBytes: 4 });
    bytes[0] = 0;
    expect(admitted.payload[0]).toBe(0x89);
  });

  it("rejects extension/MIME spoofing before persistence", () => {
    expect(() => admitStudioWorkAssetPayload("image", "image/jpeg", pngBytes()))
      .toThrow(/MIME/u);
    expect(() => admitStudioWorkAssetPayload("image", "image/svg+xml", new TextEncoder().encode("<svg/>")))
      .toThrow(/PNG/u);
  });

  it("reads bounded logical dimensions from every admitted static raster header", () => {
    expect(readStudioWorkAssetImageDimensions("image/png", pngBytes(320, 240)))
      .toEqual({ width: 320, height: 240 });
    expect(readStudioWorkAssetImageDimensions("image/jpeg", jpegBytes(800, 600)))
      .toEqual({ width: 800, height: 600 });
    expect(readStudioWorkAssetImageDimensions("image/webp", webpBytes(1024, 768)))
      .toEqual({ width: 1024, height: 768 });
  });

  it("rejects GIF, animated PNG, and animated WebP before decoder amplification", () => {
    expect(() => admitStudioWorkAssetPayload("image", "image/gif", gifBytes()))
      .toThrow(/GIF/u);
    expect(() => admitStudioWorkAssetPayload("image", "image/png", apngBytes()))
      .toThrow(/APNG/u);
    const animatedWebp = webpBytes();
    animatedWebp[20] = 0x02;
    expect(() => admitStudioWorkAssetPayload("image", "image/webp", animatedWebp))
      .toThrow(/움직이는 WebP/u);
  });

  it("rejects truncated, zero-sized, over-axis, and decompression-bomb dimensions", () => {
    expect(() => admitStudioWorkAssetPayload(
      "image",
      "image/png",
      pngBytes().subarray(0, 24)
    )).toThrow(/잘렸/u);
    expect(() => admitStudioWorkAssetPayload("image", "image/png", pngBytes(0, 10)))
      .toThrow(/이하/u);
    expect(() => admitStudioWorkAssetPayload("image", "image/png", pngBytes(16_385, 1)))
      .toThrow(/16,384px/u);
    expect(() => admitStudioWorkAssetPayload("image", "image/png", pngBytes(4_097, 4_097)))
      .toThrow(/16MP/u);
  });

  it("accepts embedded GLB and requires a real VRM extension for VRM assets", () => {
    const vrm = glb({
      asset: { version: "2.0" },
      extensionsUsed: ["VRMC_vrm"],
      extensions: { VRMC_vrm: { specVersion: "1.0" } },
    });
    expect(admitStudioWorkAssetPayload("vrm", "application/vrm", vrm).mimeType)
      .toBe("model/gltf-binary");
    expect(admitStudioWorkAssetPayload("background3d", "model/gltf-binary", vrm).mimeType)
      .toBe("model/gltf-binary");
    expect(() => admitStudioWorkAssetPayload(
      "vrm",
      "model/gltf-binary",
      glb({ asset: { version: "2.0" } })
    )).toThrow(/VRM/u);
  });

  it("rejects GLB files that could fetch external resources", () => {
    expect(() => admitStudioWorkAssetPayload(
      "background3d",
      "model/gltf-binary",
      glb({ asset: { version: "2.0" }, images: [{ uri: "https://private.example/texture.png" }] })
    )).toThrow(/외부 리소스/u);
  });
});

describe("StudioWorkAssetService", () => {
  beforeEach(() => {
    process.env.STUDIO_WORK_ASSET_ADMISSION =
      STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN;
    repository.upsert.mockReset();
    repository.getManifest.mockReset();
    repository.getManifests.mockReset();
    repository.getManifestsInTransaction.mockReset();
    repository.getContent.mockReset();
    repository.deleteUnreferencedUpload.mockReset();
  });

  afterEach(() => {
    delete process.env.STUDIO_WORK_ASSET_ADMISSION;
  });

  it("keeps every work-asset upload default-off without the exact server opt-in token", async () => {
    delete process.env.STUDIO_WORK_ASSET_ADMISSION;
    const bytes = Buffer.from(pngBytes());
    await expect(service().upload(
      "editor",
      "work-1",
      "asset-1",
      "image",
      JSON.stringify(manifest.descriptor),
      { buffer: bytes, size: bytes.byteLength, mimetype: "image/png" }
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it("validates exact descriptor identity and never sends data URLs to the repository", async () => {
    repository.upsert.mockResolvedValue(manifest);
    const bytes = Buffer.from(pngBytes());
    await expect(service().upload(
      "editor",
      "work-1",
      "asset-1",
      "image",
      JSON.stringify(manifest.descriptor),
      { buffer: bytes, size: bytes.byteLength, mimetype: "image/png" }
    )).resolves.toEqual(manifest);
    expect(repository.upsert).toHaveBeenCalledWith("editor", expect.objectContaining({
      workId: "work-1",
      assetId: "asset-1",
      elementType: "image",
      mimeType: "image/png",
      descriptor: manifest.descriptor,
    }));

    await expect(service().upload(
      "editor",
      "work-1",
      "asset-1",
      "image",
      JSON.stringify({
        ...manifest.descriptor,
        element: { ...manifest.descriptor.element, src: "data:image/png;base64,private" },
      }),
      { buffer: bytes, size: bytes.byteLength, mimetype: "image/png" }
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.upsert).toHaveBeenCalledTimes(1);
  });

  it("rejects missing or inconsistent multipart files", async () => {
    await expect(service().upload(
      "editor", "work-1", "asset-1", "image", JSON.stringify(manifest.descriptor), undefined
    )).rejects.toBeInstanceOf(BadRequestException);
    await expect(service().upload(
      "editor",
      "work-1",
      "asset-1",
      "image",
      JSON.stringify(manifest.descriptor),
      { buffer: Buffer.from(pngBytes()), size: 999, mimetype: "image/png" }
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it("revalidates at-rest payload size and SHA-256 before streaming", async () => {
    const payload = pngBytes(2, 2);
    const admitted = admitStudioWorkAssetPayload("image", "image/png", payload);
    const storedManifest = {
      ...manifest,
      byteSize: payload.byteLength,
      sha256: admitted.sha256,
      intrinsicImage: admitted.intrinsicImage,
    };
    repository.getContent.mockResolvedValue({ manifest: storedManifest, payload });
    await expect(service().getContent("viewer", "work-1", "asset-1", "image"))
      .resolves.toEqual({ manifest: storedManifest, payload });

    repository.getContent.mockResolvedValue({
      manifest: { ...storedManifest, sha256: "b".repeat(64) },
      payload,
    });
    await expect(service().getContent("viewer", "work-1", "asset-1", "image"))
      .rejects.toThrow(/integrity/u);
  });

  it("batch-validates authorized immutable identities for durable CRDT admission", async () => {
    repository.getManifests.mockResolvedValue([manifest]);
    await expect(service().assertReferencesStored("editor", "work-1", [
      { assetId: "asset-1", elementType: "image" },
      { assetId: "asset-1", elementType: "image" },
    ])).resolves.toBeUndefined();
    expect(repository.getManifests).toHaveBeenCalledWith(
      "editor",
      "work-1",
      ["asset-1"]
    );

    repository.getManifests.mockResolvedValue([]);
    await expect(service().assertReferencesStored("editor", "work-1", [
      { assetId: "asset-1", elementType: "image" },
    ])).rejects.toBeInstanceOf(BadRequestException);

    repository.getManifests.mockResolvedValue([{
      ...manifest,
      elementType: "vrm",
      mimeType: "model/gltf-binary",
      intrinsicImage: null,
      descriptor: {
        ...manifest.descriptor,
        element: { ...manifest.descriptor.element, type: "vrm" },
      },
    }]);
    await expect(service().assertReferencesStored("editor", "work-1", [
      { assetId: "asset-1", elementType: "image" },
    ])).rejects.toBeInstanceOf(BadRequestException);
  });

  it("binds R8 CRDT references to the exact stored PNG hash, bytes, and dimensions", async () => {
    const source = {
      kind: "r8-texture-v1",
      asset: {
        assetId: manifest.assetId,
        encodedSha256: `sha256:${manifest.sha256}`,
        decodedSha256: `sha256:${"b".repeat(64)}`,
        byteLength: manifest.byteSize,
        mediaType: "image/png",
        width: manifest.intrinsicImage!.width,
        height: manifest.intrinsicImage!.height,
        channel: "luminance",
        encoding: "r8-unorm",
      },
    } as const;
    repository.getManifests.mockResolvedValue([manifest]);

    await expect(service().assertR8GrainReferencesStored(
      "editor",
      "work-1",
      [source, source],
    )).resolves.toBeUndefined();
    expect(repository.getManifests).toHaveBeenCalledWith(
      "editor",
      "work-1",
      [manifest.assetId],
    );

    for (const mismatched of [
      { ...manifest, sha256: "a".repeat(64) },
      { ...manifest, byteSize: manifest.byteSize + 1 },
      {
        ...manifest,
        intrinsicImage: {
          ...manifest.intrinsicImage!,
          width: manifest.intrinsicImage!.width + 1,
          decodedRgbaBytes: (manifest.intrinsicImage!.width + 1)
            * manifest.intrinsicImage!.height
            * 4,
        },
      },
    ]) {
      repository.getManifests.mockResolvedValueOnce([mismatched]);
      await expect(service().assertR8GrainReferencesStored(
        "editor",
        "work-1",
        [source],
      )).rejects.toBeInstanceOf(BadRequestException);
    }

    repository.getManifests.mockClear();
    await expect(service().assertR8GrainReferencesStored(
      "editor",
      "work-1",
      [
        source,
        {
          ...source,
          asset: {
            ...source.asset,
            decodedSha256: `sha256:${"c".repeat(64)}`,
          },
        },
      ],
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.getManifests).not.toHaveBeenCalled();
  });

  it("keeps new durable work-asset references default-off without the server opt-in token", async () => {
    delete process.env.STUDIO_WORK_ASSET_ADMISSION;
    await expect(service().assertReferencesStored("editor", "work-1", [
      { assetId: "asset-1", elementType: "image" },
    ])).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.getManifests).not.toHaveBeenCalled();
  });

  it("reuses the active CRDT append transaction for storage admission", async () => {
    const transaction = {} as DrizzleStudioCrdtTransaction;
    repository.getManifestsInTransaction.mockResolvedValue([manifest]);

    await expect(service().assertReferencesStored(
      "editor",
      "work-1",
      [{ assetId: "asset-1", elementType: "image" }],
      transaction
    )).resolves.toBeUndefined();

    expect(repository.getManifestsInTransaction).toHaveBeenCalledWith(
      transaction,
      "editor",
      "work-1",
      ["asset-1"]
    );
    expect(repository.getManifests).not.toHaveBeenCalled();
  });

  it("forwards exact receipt-bound cleanup and returns its idempotent outcome", async () => {
    repository.deleteUnreferencedUpload.mockResolvedValue(true);
    await expect(service().deleteUnreferencedUpload(
      "editor",
      "work-1",
      "asset-1",
      "image",
      "a".repeat(64)
    )).resolves.toBe(true);
    expect(repository.deleteUnreferencedUpload).toHaveBeenCalledWith(
      "editor",
      "work-1",
      "asset-1",
      "image",
      "a".repeat(64)
    );
  });

  it.each([
    [new StudioWorkAssetNotFoundError(), NotFoundException],
    [new StudioWorkAssetForbiddenError("view"), ForbiddenException],
    [new StudioWorkAssetTypeConflictError(), ConflictException],
    [new StudioWorkAssetImmutableConflictError(), ConflictException],
    [new StudioWorkAssetCleanupOwnershipError(), ForbiddenException],
    [new StudioWorkAssetReferencedError(), ConflictException],
    [new StudioWorkAssetQuotaError("bytes"), PayloadTooLargeException],
  ] as const)("maps repository boundary %s to a public HTTP error", async (error, expected) => {
    repository.getManifest.mockRejectedValue(error);
    await expect(service().getManifest("viewer", "work-1", "asset-1", "image"))
      .rejects.toBeInstanceOf(expected);
  });
});
