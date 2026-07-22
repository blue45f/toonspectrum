import { describe, expect, it, vi } from "vitest";

import {
  isStudioEditableRasterCopyPlanCurrent,
  materializeStudioEditableRasterCopy,
  planStudioEditableRasterCopy,
  renderStudioEditableRasterCopy,
  summarizeStudioRasterPreparationSources,
} from "./studio-raster-edit-preparation";

import type { El } from "./studio-element-model";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function line(id = "line", patch: Partial<Extract<El, { type: "draw" }>> = {}): Extract<El, { type: "draw" }> {
  return {
    id,
    type: "draw",
    kind: "freehand",
    points: [10, 10, 40, 40],
    stroke: "#111111",
    strokeWidth: 4,
    brush: "gpen",
    ...patch,
  };
}

function text(id = "text"): Extract<El, { type: "text" }> {
  return {
    id,
    type: "text",
    text: "대사",
    x: 20,
    y: 20,
    width: 120,
    fontSize: 24,
    fill: "#111111",
    rotation: 0,
  };
}

describe("editable raster copy planning", () => {
  it("summarizes exact, hidden, locked, raster and vector sources for all UI surfaces", () => {
    expect(summarizeStudioRasterPreparationSources({
      width: 320,
      height: 480,
      elements: [
        line("visible"),
        line("eraser", { mode: "eraser" }),
        line("hidden", { hidden: true }),
        {
          id: "image",
          type: "image",
          src: PNG,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          locked: true,
        },
      ],
    })).toMatchObject({
      visibleContentCount: 3,
      hiddenContentCount: 1,
      visibleRasterCount: 1,
      visibleUnlockedRasterCount: 0,
      visibleVectorDrawCount: 1,
      exactRenderableVisibleCount: 2,
      unsupportedVisibleCount: 1,
      hasPageBackground: true,
    });
  });

  it("plans an opaque full-page visible copy while preserving original elements", () => {
    const elements: El[] = [line(), text()];
    const result = planStudioEditableRasterCopy({
      pageId: "page-1",
      width: 320,
      height: 480,
      elements,
      bg: "#f3e9d2",
      includeBackground: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.sourceIds).toEqual(["line", "text"]);
    expect(result.plan.insertionIndex).toBe(2);
    expect(result.plan.includeBackground).toBe(true);
    expect(elements).toHaveLength(2);
  });

  it("filters hidden items and honors an explicit selected-layer source set", () => {
    const result = planStudioEditableRasterCopy({
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [line("visible"), line("hidden", { hidden: true }), text("other")],
      sourceIds: ["visible", "hidden"],
      includeBackground: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.sourceIds).toEqual(["visible"]);
    expect(result.plan.includeBackground).toBe(false);
  });

  it("allows background-only merged filters but rejects an empty transparent copy", () => {
    expect(planStudioEditableRasterCopy({
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [],
      includeBackground: true,
    }).ok).toBe(true);
    expect(planStudioEditableRasterCopy({
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [],
      includeBackground: false,
    })).toMatchObject({ ok: false, code: "no-visible-source" });
  });

  it("fails closed for eraser/approximated fidelity and document locks", () => {
    expect(planStudioEditableRasterCopy({
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [line("eraser", { mode: "eraser" })],
      includeBackground: false,
    })).toMatchObject({ ok: false, code: "unsupported-fidelity" });
    expect(planStudioEditableRasterCopy({
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [line()],
      documentMutationBlockedReason: "검토 잠금을 해제하세요.",
    })).toEqual({
      ok: false,
      code: "document-locked",
      reason: "검토 잠금을 해제하세요.",
    });
  });

  it("guards missing page ids and unsafe canvas dimensions before rendering", () => {
    expect(planStudioEditableRasterCopy({
      pageId: " ",
      width: 320,
      height: 480,
      elements: [line()],
    })).toMatchObject({ ok: false, code: "invalid-page-id" });
    expect(planStudioEditableRasterCopy({
      pageId: "page-1",
      width: 100_000,
      height: 100_000,
      elements: [line()],
    })).toMatchObject({ ok: false, code: "invalid-dimensions" });
  });

  it("enforces source and SVG byte budgets before allocating a raster canvas", () => {
    const base = {
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [line()],
    } as const;
    expect(planStudioEditableRasterCopy({
      ...base,
      budgets: { maxSourceBytes: 8 },
    })).toMatchObject({ ok: false, code: "source-budget-exceeded" });
    expect(planStudioEditableRasterCopy({
      ...base,
      budgets: { maxSvgBytes: 8 },
    })).toMatchObject({ ok: false, code: "svg-budget-exceeded" });
  });
});

describe("editable raster copy rendering", () => {
  it("uses the shared SVG-to-PNG seam and materializes exactly one full-page ImageEl", async () => {
    const planned = planStudioEditableRasterCopy({
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [line(), text()],
      bg: "#f3e9d2",
      name: "필터 합성 레이어",
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const rasterize = vi.fn(async (request: { svg: string; width: number; height: number }) => ({
      dataUrl: PNG,
      width: request.width,
      height: request.height,
    }));
    const rendered = await renderStudioEditableRasterCopy(planned.plan, {
      workerFactory: null,
      rasterize,
    });
    expect(rasterize).toHaveBeenCalledOnce();
    expect(rasterize.mock.calls[0]?.[0].svg).toContain("#f3e9d2");
    expect(materializeStudioEditableRasterCopy({
      plan: planned.plan,
      rendered,
      newId: "copy-1",
    })).toMatchObject({
      id: "copy-1",
      type: "image",
      name: "필터 합성 레이어",
      src: PNG,
      x: 0,
      y: 0,
      width: 320,
      height: 480,
      rotation: 0,
    });
  });

  it("detects stale source geometry after an async boundary", () => {
    const input = {
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [line()],
      includeBackground: false,
    } as const;
    const result = planStudioEditableRasterCopy(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isStudioEditableRasterCopyPlanCurrent(result.plan, input)).toBe(true);
    expect(isStudioEditableRasterCopyPlanCurrent(result.plan, {
      ...input,
      elements: [line("line", { strokeWidth: 9 })],
    })).toBe(false);
  });
});
