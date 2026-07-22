import { describe, expect, it } from "vitest";

import {
  parseStudioWorkAssetDescriptor,
  parseStudioWorkAssetSourceUri,
  isStudioWorkAssetAdmissionOptedIn,
  isStudioWorkAssetImageAdmissionOptedIn,
  STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN,
  STUDIO_WORK_ASSET_IMAGE_ADMISSION_OPT_IN_TOKEN,
  STUDIO_WORK_ASSET_MAX_CURVE_POINTS,
  STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS,
  STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS,
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

  it("accepts an ordered bounded smart-filter program on image references only", () => {
    const smartFilters = {
      version: 1 as const,
      entries: [
        { id: "tone-1", engine: "brightness-contrast" as const, enabled: true, params: { brightness: 0.2 } },
        { id: "tone-2", engine: "brightness-contrast" as const, enabled: true, params: { brightness: -0.1 } },
      ],
    };
    const parsed = parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: { ...descriptor().element, smartFilters },
    }, { assetId: "asset-1", elementType: "image" });

    expect(STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS).toContain("smartFilters");
    expect(parsed.element.smartFilters).toEqual(smartFilters);
    expect(() => parseStudioWorkAssetDescriptor({
      ...descriptor("asset-1", "vrm"),
      element: { ...descriptor("asset-1", "vrm").element, smartFilters },
    }, { assetId: "asset-1", elementType: "vrm" })).toThrow(/이미지/u);
    expect(() => parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: {
        ...descriptor().element,
        smartFilters: {
          version: 1,
          entries: Array.from({ length: 25 }, (_, index) => ({
            id: `filter-${index}`,
            engine: "blur",
            enabled: true,
            params: {},
          })),
        },
      },
    }, { assetId: "asset-1", elementType: "image" })).toThrow();
  });

  it("preserves the bounded page-composite cache hint on image references", () => {
    const parsed = parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: { ...descriptor().element, filterPageComposite: true },
    }, { assetId: "asset-1", elementType: "image" });

    expect(STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS).toContain("filterPageComposite");
    expect(parsed.element.filterPageComposite).toBe(true);
  });

  it.each([
    { type: "gaussian" as const, strength: 100, radius: 40, angle: 0 },
    { type: "motion" as const, strength: 100, radius: 40, angle: 360 },
  ])("preserves bounded $type blur, tonal extrema, and normalized RGB curves", (blurFx) => {
    const curve = [
      { x: 0, y: 8 },
      { x: 96, y: 72 },
      { x: 255, y: 248 },
    ];
    const curveCh = {
      r: [{ x: 0, y: 0 }, { x: 128, y: 144 }, { x: 255, y: 255 }],
      g: [{ x: 0, y: 12 }, { x: 255, y: 244 }],
      b: [{ x: 0, y: 0 }, { x: 255, y: 232 }],
    };
    const parsed = parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: {
        ...descriptor().element,
        blurFx,
        curve,
        curveCh,
        brightness: 0.8,
        contrast: -80,
        hue: 180,
        saturation: -1,
      },
    }, { assetId: "asset-1", elementType: "image" });

    expect(STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS).toEqual([
      "blurFx",
      "curve",
      "curveCh",
      "smartFilters",
    ]);
    expect(STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS).toEqual(expect.arrayContaining([
      "blurFx",
      "curve",
      "curveCh",
    ]));
    expect(parsed.element).toMatchObject({
      blurFx,
      curve,
      curveCh,
      brightness: 0.8,
      contrast: -80,
      hue: 180,
      saturation: -1,
    });

    const oppositeExtrema = parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: {
        ...descriptor().element,
        brightness: -0.8,
        contrast: 80,
        hue: -180,
        saturation: 1,
      },
    }, { assetId: "asset-1", elementType: "image" });
    expect(oppositeExtrema.element).toMatchObject({
      brightness: -0.8,
      contrast: 80,
      hue: -180,
      saturation: 1,
    });
  });

  it("rejects malformed, non-normalized, and over-point curve metadata", () => {
    const parseCurve = (curve: unknown) => parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: { ...descriptor().element, curve },
    }, { assetId: "asset-1", elementType: "image" });
    const overPointCurve = Array.from(
      { length: STUDIO_WORK_ASSET_MAX_CURVE_POINTS + 1 },
      (_, index) => ({
        x: Math.round(index * 255 / STUDIO_WORK_ASSET_MAX_CURVE_POINTS),
        y: index,
      })
    );

    expect(() => parseCurve(overPointCurve)).toThrow();
    expect(() => parseCurve([{ x: 0, y: 0 }, { x: 0, y: 80 }, { x: 255, y: 255 }]))
      .toThrow(/오름차순/u);
    expect(() => parseCurve([{ x: 1, y: 0 }, { x: 255, y: 255 }]))
      .toThrow(/첫 입력점/u);
    expect(() => parseCurve([{ x: 0, y: 0 }, { x: 255, y: 255.5 }])).toThrow();
    expect(() => parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: {
        ...descriptor().element,
        curveCh: { r: [{ x: 0, y: 0 }, { x: 255, y: 255 }], alpha: [] },
      },
    }, { assetId: "asset-1", elementType: "image" })).toThrow();
  });

  it("accepts expanded local filter engines at the immutable asset boundary", () => {
    const engines = [
      "spin-blur",
      "zoom-blur",
      "pixelate",
      "posterize",
      "ink-threshold",
      "line-extraction",
      "screentone",
      "color-halftone",
      "chromatic-aberration",
      "grayscale",
      "sepia",
      "edge-detect",
      "emboss",
      "high-pass",
      "median-despeckle",
      "solarize",
      "oil-paint",
      "smart-sharpen",
    ] as const;
    const parsed = parseStudioWorkAssetDescriptor({
      ...descriptor(),
      element: {
        ...descriptor().element,
        smartFilters: {
          version: 1,
          entries: engines.map((engine) => ({
            id: `filter-${engine}`,
            engine,
            enabled: true,
            params: {},
          })),
        },
      },
    }, { assetId: "asset-1", elementType: "image" });

    expect(parsed.element.smartFilters?.entries.map((entry) => entry.engine)).toEqual(engines);
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
