import { describe, expect, it, vi } from "vitest";

import {
  applyStudioEditableRasterCopy,
  createStudioEditablePageRasterContext,
  isStudioEditableRasterCopyPlanCurrent,
  materializeStudioEditableRasterCopy,
  planStudioEditableRasterCopy,
  renderStudioEditableRasterCopy,
  summarizeStudioRasterPreparationSources,
} from "./studio-raster-edit-preparation";
import { renderStudioVectorReference } from "./studio-vector-fill-reference";

import type { El } from "./studio-element-model";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const PAGE_COMPOSITE_MAX_BYTES = 4 * 1024 * 1024;

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

function pageRasterContext(options: {
  width?: number;
  height?: number;
  sharedDocument?: boolean;
  localHiddenElementIds?: ReadonlySet<string>;
  budgets?: {
    maxPixelCount?: number;
    maxPngBytes?: number;
  };
} = {}) {
  const pageElements: El[] = [line()];
  return createStudioEditablePageRasterContext({
    page: {
      id: "page-1",
      canvasH: options.height ?? 480,
      elements: pageElements,
      bg: "#ffffff",
    },
    canvasWidth: options.width ?? 320,
    masterElements: [],
    localHiddenElementIds: options.localHiddenElementIds ?? new Set<string>(),
    name: "필터 · 현재 페이지 합성",
    collaborationLockedReason: null,
    sharedDocument: options.sharedDocument ?? false,
    masterEditMode: false,
    reviewLocked: false,
    timelinePlaying: false,
    viewTransformSuppressed: false,
    budgets: options.budgets,
  });
}

function fullPageComposite(
  plan: { readonly width: number; readonly height: number },
  src = PNG,
): Extract<El, { type: "image" }> {
  return {
    id: "filtered-copy",
    type: "image",
    src,
    x: 0,
    y: 0,
    width: plan.width,
    height: plan.height,
    rotation: 0,
  };
}

function oversizedPngDataUrl(): string {
  const minimumPayloadLength = Math.ceil((PAGE_COMPOSITE_MAX_BYTES + 1) * 4 / 3);
  const alignedPayloadLength = Math.ceil(minimumPayloadLength / 4) * 4;
  const signature = "iVBORw0KGgo";
  return `data:image/png;base64,${signature}${"A".repeat(alignedPayloadLength - signature.length)}`;
}

describe("editable raster copy planning", () => {
  it("caps page-composite pixel and PNG budgets at exactly 4 Mi units", () => {
    const defaults = pageRasterContext();
    const clamped = pageRasterContext({
      budgets: {
        maxPixelCount: 64 * 1024 * 1024,
        maxPngBytes: 64 * 1024 * 1024,
      },
    });
    const stricter = pageRasterContext({
      budgets: {
        maxPixelCount: 1_000_000,
        maxPngBytes: 2_000_000,
      },
    });

    expect(defaults.input.budgets).toMatchObject({
      maxPixelCount: PAGE_COMPOSITE_MAX_BYTES,
      maxPngBytes: PAGE_COMPOSITE_MAX_BYTES,
    });
    expect(clamped.input.budgets).toMatchObject({
      maxPixelCount: PAGE_COMPOSITE_MAX_BYTES,
      maxPngBytes: PAGE_COMPOSITE_MAX_BYTES,
    });
    expect(stricter.input.budgets).toMatchObject({
      maxPixelCount: 1_000_000,
      maxPngBytes: 2_000_000,
    });
  });

  it("rejects a page-composite pixel budget before the injected renderer can run", () => {
    const context = pageRasterContext({ width: 2_048, height: 2_049 });
    const renderer = vi.fn();

    expect(planStudioEditableRasterCopy(context.input)).toMatchObject({
      ok: false,
      code: "invalid-dimensions",
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "shared documents",
      options: { sharedDocument: true },
      recovery: /공동 작업 문서.*동일한 픽셀 결과.*선택 이미지 필터/u,
    },
    {
      label: "local-only hidden layers",
      options: { localHiddenElementIds: new Set(["line"]) },
      recovery: /나만 숨기기.*다시 표시.*공유·저장/u,
    },
  ])("fails closed for $label in the extracted page context", ({ options, recovery }) => {
    const context = pageRasterContext(options);

    expect(context.input.documentMutationBlockedReason).toMatch(recovery);
    expect(planStudioEditableRasterCopy(context.input)).toMatchObject({
      ok: false,
      code: "document-locked",
      reason: expect.stringMatching(recovery),
    });
    expect(context.destinationElements).toHaveLength(1);
    expect(context.destinationElements[0]).toBe(context.input.elements[0]);
  });

  it("ignores local-only hidden ids that belong to another page", () => {
    const context = pageRasterContext({
      localHiddenElementIds: new Set(["different-page-line"]),
    });

    expect(context.input.documentMutationBlockedReason).toBeNull();
    expect(planStudioEditableRasterCopy(context.input)).toMatchObject({ ok: true });
  });

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

  it("accepts a visible draw-only page as an exact filter source", () => {
    const result = planStudioEditableRasterCopy({
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [line("only-visible-line")],
      includeBackground: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.sourceIds).toEqual(["only-visible-line"]);
    expect(result.plan.sourceElementCount).toBe(1);
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
    const rendered = await renderStudioEditableRasterCopy(
      planned.plan,
      renderStudioVectorReference,
      {
        workerFactory: null,
        rasterize,
      },
    );
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

  it("renders a background-only page through the same filter raster seam", async () => {
    const planned = planStudioEditableRasterCopy({
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [],
      bg: "#f3e9d2",
      includeBackground: true,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const rasterize = vi.fn(async (request: { svg: string; width: number; height: number }) => ({
      dataUrl: PNG,
      width: request.width,
      height: request.height,
    }));
    await renderStudioEditableRasterCopy(
      planned.plan,
      renderStudioVectorReference,
      { workerFactory: null, rasterize },
    );
    expect(rasterize).toHaveBeenCalledOnce();
    expect(rasterize.mock.calls[0]?.[0].svg).toContain("#f3e9d2");
  });

  it("rejects an injected renderer result that exceeds the plan PNG budget", async () => {
    const context = pageRasterContext();
    const planned = planStudioEditableRasterCopy(context.input);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;

    await expect(renderStudioEditableRasterCopy(
      planned.plan,
      async () => ({
        dataUrl: oversizedPngDataUrl(),
        fingerprint: planned.plan.sourceFingerprint,
        elementCount: planned.plan.sourceElementCount,
        width: planned.plan.width,
        height: planned.plan.height,
        svgByteLength: 1,
        pngByteLength: 4 * 1024 * 1024 + 1,
        execution: "direct",
      }),
    )).rejects.toThrow(/허용치/u);
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
    expect(isStudioEditableRasterCopyPlanCurrent(result.plan, {
      ...input,
      documentMutationBlockedReason: "검토 잠금을 해제하세요.",
    })).toBe(false);
  });
});

describe("editable raster copy commit contract", () => {
  it("rejects oversized and malformed PNG composites without mutating authored elements", () => {
    const context = pageRasterContext();
    const planned = planStudioEditableRasterCopy(context.input);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const authored = context.destinationElements;
    const original = authored[0];

    const oversized = applyStudioEditableRasterCopy({
      plan: planned.plan,
      current: context.input,
      destinationElements: authored,
      composite: fullPageComposite(planned.plan, oversizedPngDataUrl()),
    });
    const malformed = applyStudioEditableRasterCopy({
      plan: planned.plan,
      current: context.input,
      destinationElements: authored,
      composite: fullPageComposite(
        planned.plan,
        "data:image/png;base64,iVBORw0KGgo*",
      ),
    });

    expect(oversized).toMatchObject({ ok: false, code: "invalid-composite" });
    expect(malformed).toMatchObject({ ok: false, code: "invalid-composite" });
    expect(context.destinationElements).toHaveLength(1);
    expect(context.destinationElements[0]).toBe(original);
    expect(context.input.elements).toHaveLength(1);
    expect(context.input.elements[0]).toBe(original);
  });

  it("treats preview cancellation as zero mutation", async () => {
    const first = Object.freeze(line());
    const second = Object.freeze(text());
    const elements: readonly El[] = Object.freeze([first, second]);
    const current = {
      pageId: "page-1",
      width: 320,
      height: 480,
      elements,
      includeBackground: true,
    } as const;
    const planned = planStudioEditableRasterCopy(current);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const rendered = await renderStudioEditableRasterCopy(
      planned.plan,
      renderStudioVectorReference,
      {
        workerFactory: null,
        rasterize: async (request) => ({ dataUrl: PNG, width: request.width, height: request.height }),
      },
    );
    materializeStudioEditableRasterCopy({ plan: planned.plan, rendered, newId: "discarded-preview" });

    expect(current.elements).toEqual([line(), text()]);
    expect(current.elements[0]).toBe(first);
    expect(current.elements[1]).toBe(second);
  });

  it("applies one filtered composite while retaining every original object unchanged", async () => {
    const originals: El[] = [line(), text()];
    const current = {
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: originals,
      includeBackground: true,
      name: "가우시안 블러 · 페이지 합성",
    } as const;
    const planned = planStudioEditableRasterCopy(current);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const rendered = await renderStudioEditableRasterCopy(
      planned.plan,
      renderStudioVectorReference,
      {
        workerFactory: null,
        rasterize: async (request) => ({ dataUrl: PNG, width: request.width, height: request.height }),
      },
    );
    const composite = {
      ...materializeStudioEditableRasterCopy({
        plan: planned.plan,
        rendered,
        newId: "filtered-copy",
      }),
      blur: 12,
      noClip: true,
    };
    const applied = applyStudioEditableRasterCopy({ plan: planned.plan, current, composite });

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.elements).not.toBe(originals);
    expect(applied.elements).toHaveLength(3);
    expect(applied.elements[0]).toBe(originals[0]);
    expect(applied.elements[1]).toBe(originals[1]);
    expect(applied.elements[2]).toBe(composite);
    expect(originals).toEqual([line(), text()]);
  });

  it("fingerprints a visible master underlay without inserting it into the authored page", async () => {
    const masterUnderlay = line("master-line", { locked: true });
    const authored = [text("page-text")];
    const current = {
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [masterUnderlay, ...authored],
      includeBackground: true,
      insertionIndex: authored.length,
    } as const;
    const planned = planStudioEditableRasterCopy(current);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const rendered = await renderStudioEditableRasterCopy(
      planned.plan,
      renderStudioVectorReference,
      {
        workerFactory: null,
        rasterize: async (request) => ({ dataUrl: PNG, width: request.width, height: request.height }),
      },
    );
    const composite = materializeStudioEditableRasterCopy({
      plan: planned.plan,
      rendered,
      newId: "master-page-filter-copy",
    });
    const applied = applyStudioEditableRasterCopy({
      plan: planned.plan,
      current,
      composite,
      destinationElements: authored,
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.elements).toEqual([authored[0], composite]);
    expect(applied.elements).not.toContain(masterUnderlay);
  });

  it("fails closed after a fingerprint or lock change without touching current elements", async () => {
    const original = line();
    const initial = {
      pageId: "page-1",
      width: 320,
      height: 480,
      elements: [original],
      includeBackground: true,
    } as const;
    const planned = planStudioEditableRasterCopy(initial);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const rendered = await renderStudioEditableRasterCopy(
      planned.plan,
      renderStudioVectorReference,
      {
        workerFactory: null,
        rasterize: async (request) => ({ dataUrl: PNG, width: request.width, height: request.height }),
      },
    );
    const composite = materializeStudioEditableRasterCopy({
      plan: planned.plan,
      rendered,
      newId: "filtered-copy",
    });
    const changedElements: El[] = [line("line", { strokeWidth: 9 })];

    expect(applyStudioEditableRasterCopy({
      plan: planned.plan,
      current: { ...initial, elements: changedElements },
      composite,
    })).toMatchObject({ ok: false, code: "stale-plan" });
    expect(applyStudioEditableRasterCopy({
      plan: planned.plan,
      current: { ...initial, documentMutationBlockedReason: "검토 잠금" },
      composite,
    })).toMatchObject({ ok: false, code: "stale-plan" });
    expect(changedElements).toEqual([line("line", { strokeWidth: 9 })]);
    expect(initial.elements).toEqual([original]);
  });
});
