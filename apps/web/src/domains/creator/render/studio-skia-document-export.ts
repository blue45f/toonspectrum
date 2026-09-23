import type {
  SkiaDocumentItem,
  SkiaDocumentRenderer,
} from "@toonspectrum/studio-engine-skia";

import { resolveStudioPaperGrainVisibleV1 } from "../brush/studio-paper-grain-visibility-v1";
import { CANVAS_W } from "../studio-assets";
import type { El } from "../studio-element-model";
import { isEffectivelyHidden } from "../studio-layers";
import { composeMasterRenderElements } from "../studio-master-page";
import type { PageState } from "../studio-page-state";
import { parseSupportedCssColorToIR } from "./studio-document-scene-lower";
import { createStudioSkiaDocumentProjector } from "./studio-skia-document-plan";
import {
  prepareStudioSkiaSpecialistDocumentProjection,
  type StudioSkiaSpecialistDocumentProjection,
} from "./studio-skia-specialist-document-projection";

const EXPORT_BACKGROUND_ID = "__toonspectrum_skia_export_background__";

export type StudioSkiaDocumentExportResult =
  | {
      readonly status: "captured";
      readonly canvas: HTMLCanvasElement;
      readonly ownedDocumentIds: readonly string[];
    }
  | {
      readonly status: "unsupported" | "unavailable";
      readonly reason: string;
    };

export interface StudioSkiaDocumentExportInput {
  readonly page: PageState;
  readonly masterElements?: readonly El[];
  readonly exportScale: number;
  readonly transparent: boolean;
  readonly frameTheme?: "classic" | "soft" | "vivid";
  readonly signal?: AbortSignal;
}

interface StudioSkiaDocumentExportDependencies {
  readonly createRenderer?: (
    canvas: HTMLCanvasElement,
  ) => Promise<SkiaDocumentRenderer>;
  readonly prepareSpecialistProjection?: typeof prepareStudioSkiaSpecialistDocumentProjection;
  readonly createCanvas?: () => HTMLCanvasElement;
  readonly decodePng?: (
    bytes: Uint8Array,
    width: number,
    height: number,
  ) => Promise<HTMLCanvasElement>;
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function visibleExportElements(
  page: PageState,
  masterElements: readonly El[],
): El[] {
  const pageElements = page.elements.filter(
    (element) => !isEffectivelyHidden(element, page.groups ?? []),
  );
  if (page.hideMaster || masterElements.length === 0) return pageElements;
  return [
    ...composeMasterRenderElements({ elements: [...masterElements] }),
    ...pageElements,
  ];
}

function backgroundItem(
  page: PageState,
  occupiedIds: ReadonlySet<string>,
): SkiaDocumentItem | StudioSkiaDocumentExportResult {
  const fill = parseSupportedCssColorToIR(page.bg);
  if (!fill) {
    return { status: "unsupported", reason: "unsupported-page-background" };
  }
  let id = EXPORT_BACKGROUND_ID;
  while (occupiedIds.has(id)) id = `_${id}`;
  return {
    id,
    revision: Object.freeze({ pageId: page.id, fill }),
    panel: {
      x: 0,
      y: 0,
      width: CANVAS_W,
      height: page.canvasH,
      fill,
      stroke: { r: 0, g: 0, b: 0, a: 0 },
      strokeWidth: 0,
      radius: 0,
      dashed: false,
    },
  };
}

async function createRenderer(canvas: HTMLCanvasElement): Promise<SkiaDocumentRenderer> {
  const [engine, fontSource] = await Promise.all([
    import("@toonspectrum/studio-engine-skia"),
    import("./studio-skia-document-font-source"),
  ]);
  return engine.createSkiaDocumentRenderer(canvas, {
    loadFontData: fontSource.loadStudioSkiaDocumentFontData,
  });
}

function createCanvas(): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("document-export-surface-unavailable");
  }
  return document.createElement("canvas");
}

async function decodePng(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("document-export-png-decoder-unavailable");
  }
  const encoded = new Uint8Array(bytes.byteLength);
  encoded.set(bytes);
  const bitmap = await createImageBitmap(
    new Blob([encoded.buffer], { type: "image/png" }),
    { premultiplyAlpha: "premultiply" },
  );
  try {
    if (bitmap.width !== width || bitmap.height !== height) {
      throw new Error("document-export-snapshot-size-mismatch");
    }
    const output = createCanvas();
    output.width = width;
    output.height = height;
    const context = output.getContext("2d");
    if (!context) throw new Error("document-export-copy-surface-unavailable");
    context.drawImage(bitmap, 0, 0);
    return output;
  } finally {
    bitmap.close();
  }
}

/**
 * Produces a detached, exact-revision Skia raster for export without reading the visible viewport.
 * Unsupported document states return a reason so the existing canonical compatibility export can
 * remain authoritative; no approximate substitution is emitted.
 */
export async function captureStudioSkiaDocumentForExport(
  input: StudioSkiaDocumentExportInput,
  dependencies: StudioSkiaDocumentExportDependencies = {},
): Promise<StudioSkiaDocumentExportResult> {
  const { page, transparent, signal } = input;
  if (aborted(signal)) return { status: "unavailable", reason: "document-export-aborted" };
  if (!Number.isFinite(input.exportScale) || input.exportScale <= 0) {
    return { status: "unsupported", reason: "invalid-export-scale" };
  }
  if (!Number.isFinite(page.canvasH) || page.canvasH <= 0) {
    return { status: "unsupported", reason: "invalid-document-height" };
  }
  if (page.bgGrad?.length && !transparent) {
    return { status: "unsupported", reason: "gradient-page-background" };
  }
  if (resolveStudioPaperGrainVisibleV1(page)) {
    return { status: "unsupported", reason: "paper-grain-background" };
  }
  if (page.animTimeline) {
    return { status: "unsupported", reason: "timeline-projection-required" };
  }
  if (page.colorProof) {
    return { status: "unsupported", reason: "color-proof-projection-required" };
  }

  const width = Math.ceil(CANVAS_W * input.exportScale);
  const height = Math.ceil(page.canvasH * input.exportScale);
  if (width > 8192 || height > 8192 || width * height > 16 * 1024 * 1024) {
    return { status: "unsupported", reason: "document-export-backing-budget" };
  }

  const elements = visibleExportElements(page, input.masterElements ?? []);
  const projector = createStudioSkiaDocumentProjector();
  let projection: StudioSkiaSpecialistDocumentProjection | null = null;
  let renderer: SkiaDocumentRenderer | null = null;
  try {
    projection = await (dependencies.prepareSpecialistProjection
      ?? prepareStudioSkiaSpecialistDocumentProjection)(elements, { signal });
    if (aborted(signal)) return { status: "unavailable", reason: "document-export-aborted" };
    const plan = projector.project(
      elements,
      input.frameTheme ?? "classic",
      projection.sources,
    );
    if (!plan.supported) {
      return { status: "unsupported", reason: plan.reason ?? "unsupported-document" };
    }

    const items = [...plan.items];
    if (!transparent) {
      const background = backgroundItem(page, new Set(plan.ownedDocumentIds));
      if ("status" in background) return background;
      items.unshift(background);
    }
    const revision = Object.freeze({
      pageId: page.id,
      page,
      scale: input.exportScale,
      transparent,
    });
    const surface = (dependencies.createCanvas ?? createCanvas)();
    renderer = await (dependencies.createRenderer ?? createRenderer)(surface);
    const receipt = await renderer.present({
      revision,
      items,
      width: CANVAS_W,
      height: page.canvasH,
      documentWidth: CANVAS_W,
      documentHeight: page.canvasH,
      dpr: input.exportScale,
      camera: { scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0 },
    });
    if (receipt.status !== "presented") {
      return {
        status: receipt.status === "unsupported" ? "unsupported" : "unavailable",
        reason: "reason" in receipt ? receipt.reason : `document-export-${receipt.status}`,
      };
    }
    if (receipt.revision !== revision) {
      return { status: "unavailable", reason: "document-export-receipt-mismatch" };
    }
    const bytes = renderer.snapshotPng(revision);
    if (!bytes) {
      return { status: "unavailable", reason: "document-export-snapshot-unavailable" };
    }
    const canvas = await (dependencies.decodePng ?? decodePng)(bytes, width, height);
    canvas.dataset.studioRasterExportBackend = "skia-document";
    return {
      status: "captured",
      canvas,
      ownedDocumentIds: plan.ownedDocumentIds,
    };
  } catch (cause) {
    if (aborted(signal)) return { status: "unavailable", reason: "document-export-aborted" };
    return {
      status: "unavailable",
      reason: cause instanceof Error ? cause.message : "document-export-failed",
    };
  } finally {
    renderer?.dispose();
    projection?.release({ invalidateLiveFrames: true });
    projector.clear();
  }
}
