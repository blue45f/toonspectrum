import { describe, expect, it } from "vitest";

import {
  mmToPxAtDpi,
  planStudioExportDialogueTxt,
  preflightStudioExportPackage,
  pxToMmAtDpi,
  recommendExportScaleForPrint,
  resolveStudioExportPageRange,
  STUDIO_EXPORT_BLEED_MM_RANGE,
  STUDIO_EXPORT_DPI_RANGE,
  STUDIO_EXPORT_TRIM_MM_RANGE,
  studioExportGeometryPreset,
  validateStudioExportGeometry,
} from "./studio-export-package-preflight";

import type { DialoguePageLike } from "./studio-dialogue-batch";

const dialoguePages: DialoguePageLike[] = [
  {
    id: "p1",
    elements: [
      { id: "b1", type: "bubble", text: "안녕", x: 0, y: 0, width: 100, height: 60 },
      { id: "t1", type: "text", text: "지문", x: 0, y: 80, width: 100 },
    ],
  },
  {
    id: "p2",
    elements: [
      { id: "b2", type: "bubble", text: "잘 가", x: 0, y: 0, width: 100, height: 60 },
    ],
  },
  {
    id: "p3",
    elements: [{ id: "frame", type: "frame", x: 0, y: 0, width: 100, height: 100 }],
  },
];

describe("resolveStudioExportPageRange", () => {
  it("defaults to the full inclusive range", () => {
    expect(resolveStudioExportPageRange(3)).toEqual({ ok: true, indices: [0, 1, 2] });
  });

  it("rejects inverted, out-of-bounds, and empty page counts with Korean reasons", () => {
    const empty = resolveStudioExportPageRange(0);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.issues[0]?.message).toContain("페이지");

    const inverted = resolveStudioExportPageRange(3, { fromIndex: 2, toIndex: 1 });
    expect(inverted.ok).toBe(false);
    if (!inverted.ok) expect(inverted.issues[0]?.code).toBe("PAGE_RANGE_INVALID");

    const oob = resolveStudioExportPageRange(3, { fromIndex: 0, toIndex: 9 });
    expect(oob.ok).toBe(false);
  });

  it("keeps a contiguous sub-range", () => {
    expect(resolveStudioExportPageRange(5, { fromIndex: 1, toIndex: 3 })).toEqual({
      ok: true,
      indices: [1, 2, 3],
    });
  });
});

describe("mm/px conversion and geometry presets", () => {
  it("converts mm ↔ px at DPI with 25.4 mm/inch", () => {
    // 25.4 mm at 300 dpi → 300 px (one inch).
    expect(mmToPxAtDpi(25.4, 300)).toBeCloseTo(300, 5);
    expect(pxToMmAtDpi(300, 300)).toBeCloseTo(25.4, 5);
    // Round-trip.
    expect(pxToMmAtDpi(mmToPxAtDpi(148, 300), 300)).toBeCloseTo(148, 5);
  });

  it("exports inclusive editor ranges aligned with validation", () => {
    expect(STUDIO_EXPORT_DPI_RANGE).toEqual({ min: 36, max: 1200 });
    expect(STUDIO_EXPORT_BLEED_MM_RANGE).toEqual({ min: 0, max: 50 });
    expect(STUDIO_EXPORT_TRIM_MM_RANGE).toEqual({ min: 0.1, max: 2000 });
  });

  it("returns named geometry presets", () => {
    expect(studioExportGeometryPreset("webtoon72")).toEqual({ dpi: 72 });
    expect(studioExportGeometryPreset("print300-b6")).toEqual({
      dpi: 300,
      trimWidthMm: 148,
      trimHeightMm: 210,
      bleedMm: 3,
    });
    expect(studioExportGeometryPreset("print300-a4")).toEqual({
      dpi: 300,
      trimWidthMm: 210,
      trimHeightMm: 297,
      bleedMm: 3,
    });
  });

  it("recommends integer export scale 1–3 to cover trim at DPI", () => {
    // Canvas already larger than B6 @ 72 dpi → scale 1.
    expect(
      recommendExportScaleForPrint({
        canvasWidthPx: 2000,
        canvasHeightPx: 3000,
        trimWidthMm: 148,
        trimHeightMm: 210,
        dpi: 72,
      })
    ).toBe(1);

    // Tiny canvas vs A4 @ 300 dpi needs max scale.
    expect(
      recommendExportScaleForPrint({
        canvasWidthPx: 400,
        canvasHeightPx: 600,
        trimWidthMm: 210,
        trimHeightMm: 297,
        dpi: 300,
      })
    ).toBe(3);

    // Invalid inputs fall back to 1.
    expect(
      recommendExportScaleForPrint({
        canvasWidthPx: 0,
        canvasHeightPx: 100,
        trimWidthMm: 148,
        trimHeightMm: 210,
        dpi: 300,
      })
    ).toBe(1);
  });
});

describe("validateStudioExportGeometry", () => {
  it("accepts screen webtoon geometry without trim/bleed", () => {
    const result = validateStudioExportGeometry({
      widthPx: 800,
      heightPx: 1280,
      dpi: 72,
    });
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.outputSizeMm).toBeNull();
  });

  it("blocks invalid DPI and bleed that consumes trim", () => {
    const dpi = validateStudioExportGeometry({
      widthPx: 800,
      heightPx: 1280,
      dpi: 12,
    });
    expect(dpi.issues.some((issue) => issue.code === "DPI_INVALID" && issue.severity === "error")).toBe(
      true
    );

    const bleed = validateStudioExportGeometry({
      widthPx: 2400,
      heightPx: 3600,
      dpi: 300,
      trimWidthMm: 10,
      trimHeightMm: 15,
      bleedMm: 6,
    });
    expect(bleed.issues.some((issue) => issue.code === "BLEED_EXCEEDS_TRIM")).toBe(true);
  });

  it("computes output size with valid bleed", () => {
    const result = validateStudioExportGeometry({
      widthPx: 2400,
      heightPx: 3600,
      dpi: 300,
      trimWidthMm: 148,
      trimHeightMm: 210,
      bleedMm: 3,
    });
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.outputSizeMm).toEqual({ width: 154, height: 216 });
  });
});

describe("planStudioExportDialogueTxt / preflightStudioExportPackage", () => {
  it("serializes dialogue as TXT for the selected page range", () => {
    const plan = planStudioExportDialogueTxt({
      pages: dialoguePages,
      title: "에피소드1",
      pageIndices: [0, 1],
    });
    expect(plan).not.toBeNull();
    expect(plan?.cueCount).toBe(3);
    expect(plan?.fileName).toBe("에피소드1.txt");
    expect(plan?.text).toContain("안녕");
    expect(plan?.text).toContain("잘 가");
    expect(plan?.text).not.toContain("frame");
  });

  it("embeds 漢字(かんじ) ruby preview when the source element has rubySpans", () => {
    const pagesWithRuby: DialoguePageLike[] = [
      {
        id: "p-ruby",
        elements: [
          {
            id: "b-ruby",
            type: "bubble",
            text: "漢字テスト",
            x: 0,
            y: 0,
            width: 100,
            height: 60,
            // DialoguePageLike is structural; rubySpans live on elements at runtime.
            ...({
              rubySpans: [{ start: 0, end: 2, ruby: "かんじ" }],
            } as object),
          },
          {
            id: "t-plain",
            type: "text",
            text: "지문 그대로",
            x: 0,
            y: 80,
            width: 100,
          },
        ],
      },
    ];
    const plan = planStudioExportDialogueTxt({
      pages: pagesWithRuby,
      title: "ruby-export",
    });
    expect(plan).not.toBeNull();
    expect(plan?.cueCount).toBe(2);
    expect(plan?.text).toContain("漢字(かんじ)テスト");
    // Sibling without rubySpans stays plain.
    expect(plan?.text).toContain("지문 그대로");
    expect(plan?.text).not.toContain("지문 그대로(");
  });

  it("keeps plain cue text when the source element has no rubySpans", () => {
    const plan = planStudioExportDialogueTxt({
      pages: dialoguePages,
      title: "plain-export",
      pageIndices: [0],
    });
    expect(plan).not.toBeNull();
    expect(plan?.cueCount).toBe(2);
    expect(plan?.text).toContain("안녕");
    expect(plan?.text).toContain("지문");
    // No furigana parentheticals when elements lack rubySpans.
    expect(plan?.text).not.toMatch(/\S+\([^)]+\)/u);
  });

  it("accepts a valid package and rejects bad range or missing required dialogue", () => {
    const ok = preflightStudioExportPackage({
      pageCount: 3,
      pageRange: { fromIndex: 0, toIndex: 1 },
      geometry: { widthPx: 800, heightPx: 1280, dpi: 72 },
      requireDialogueTxt: true,
      pagesForDialogue: dialoguePages,
      dialogueTitle: "test",
    });
    expect(ok.canExport).toBe(true);
    expect(ok.pageIndices).toEqual([0, 1]);
    expect(ok.dialogueTxt?.cueCount).toBe(3);
    expect(ok.errors).toEqual([]);

    const badRange = preflightStudioExportPackage({
      pageCount: 3,
      pageRange: { fromIndex: 2, toIndex: 0 },
    });
    expect(badRange.canExport).toBe(false);
    expect(badRange.errors[0]?.message).toMatch(/페이지 범위/);

    const emptyDialogue = preflightStudioExportPackage({
      pageCount: 3,
      pageRange: { fromIndex: 2, toIndex: 2 },
      requireDialogueTxt: true,
      pagesForDialogue: dialoguePages,
    });
    expect(emptyDialogue.canExport).toBe(false);
    expect(emptyDialogue.errors.some((issue) => issue.code === "DIALOGUE_TXT_EMPTY")).toBe(true);
  });
});
