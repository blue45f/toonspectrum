import { describe, expect, it } from "vitest";

import {
  parseStudioWorkAssetDescriptor,
  parseStudioWorkAssetSourceUri,
  isStudioWorkAssetAdmissionOptedIn,
  isStudioWorkAssetImageAdmissionOptedIn,
  STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN,
  STUDIO_WORK_ASSET_IMAGE_ADMISSION_OPT_IN_TOKEN,
  StudioWorkAssetManifestSchema,
  studioWorkAssetReferenceKey,
  studioWorkAssetSourceUri,
} from "./studio-work-asset-contract";

function descriptor(id = "asset-1", type: "image" | "vrm" | "background3d" = "image") {
  return {
    version: 1 as const,
    element: { id, type, x: 10, y: 20, width: 300, height: 400, rotation: 0 },
  };
}

describe("studio work asset wire contract", () => {
  it("keeps experimental work-asset admission default-off behind one exact token", () => {
    expect(isStudioWorkAssetAdmissionOptedIn(undefined)).toBe(false);
    expect(isStudioWorkAssetAdmissionOptedIn("true")).toBe(false);
    expect(isStudioWorkAssetAdmissionOptedIn(
      STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN
    )).toBe(true);
    expect(isStudioWorkAssetImageAdmissionOptedIn(undefined)).toBe(false);
    expect(isStudioWorkAssetImageAdmissionOptedIn("true")).toBe(false);
    expect(isStudioWorkAssetImageAdmissionOptedIn(
      STUDIO_WORK_ASSET_IMAGE_ADMISSION_OPT_IN_TOKEN
    )).toBe(true);
  });

  it("keeps only bounded placement metadata and exact reference identity", () => {
    expect(parseStudioWorkAssetDescriptor(descriptor(), {
      assetId: "asset-1",
      elementType: "image",
    })).toEqual(descriptor());
    expect(() => parseStudioWorkAssetDescriptor(descriptor("asset-2"), {
      assetId: "asset-1",
      elementType: "image",
    })).toThrow(/식별자/u);
    expect(() => parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: { ...descriptor().element, src: "data:image/png;base64,private" },
    }, {
      assetId: "asset-1",
      elementType: "image",
    })).toThrow();
    expect(parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: {
        ...descriptor().element,
        opacity: 0.5,
        flippedY: true,
        lockAspect: true,
        blur: 12,
        saturation: -0.4,
      },
    }, {
      assetId: "asset-1",
      elementType: "image",
    }).element).toMatchObject({
      opacity: 0.5,
      flippedY: true,
      lockAspect: true,
      blur: 12,
      saturation: -0.4,
    });
    expect(() => parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: { ...descriptor().element, blur: 31 },
    }, {
      assetId: "asset-1",
      elementType: "image",
    })).toThrow();
  });

  it("rejects MIME/type mismatches and over-limit manifests", () => {
    const common = {
      version: 1,
      assetId: "asset-1",
      elementType: "image",
      byteSize: 32,
      sha256: "a".repeat(64),
      intrinsicImage: { width: 2, height: 4, decodedRgbaBytes: 32 },
      descriptor: descriptor(),
      updatedAt: "2026-07-16T00:00:00.000Z",
    };
    expect(StudioWorkAssetManifestSchema.safeParse({
      ...common,
      mimeType: "image/png",
    }).success).toBe(true);
    expect(StudioWorkAssetManifestSchema.safeParse({
      ...common,
      mimeType: "model/gltf-binary",
    }).success).toBe(false);
    expect(StudioWorkAssetManifestSchema.safeParse({
      ...common,
      byteSize: 9 * 1024 * 1024,
      mimeType: "image/png",
    }).success).toBe(false);
    expect(StudioWorkAssetManifestSchema.safeParse({
      ...common,
      intrinsicImage: { width: 2, height: 4, decodedRgbaBytes: 31 },
      mimeType: "image/png",
    }).success).toBe(false);
    expect(StudioWorkAssetManifestSchema.safeParse({
      ...common,
      intrinsicImage: null,
      mimeType: "image/png",
    }).success).toBe(false);
    expect(StudioWorkAssetManifestSchema.safeParse({
      ...common,
      intrinsicImage: null,
      elementType: "vrm",
      mimeType: "model/gltf-binary",
      descriptor: descriptor("asset-1", "vrm"),
    }).success).toBe(true);
  });

  it("uses a collision-free compound reference key", () => {
    expect(studioWorkAssetReferenceKey({ assetId: "a:b", elementType: "image" }))
      .not.toBe(studioWorkAssetReferenceKey({ assetId: "a", elementType: "image" }));
    const reference = { assetId: "asset / 한글", elementType: "background3d" as const };
    expect(parseStudioWorkAssetSourceUri(studioWorkAssetSourceUri(reference))).toEqual(reference);
    expect(parseStudioWorkAssetSourceUri("data:image/png;base64,private")).toBeNull();
    expect(parseStudioWorkAssetSourceUri(
      "work-asset://background3d/asset%20%2f%20%ed%95%9c%ea%b8%80"
    )).toBeNull();
  });
});
