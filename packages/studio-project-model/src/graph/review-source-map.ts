import { z } from "zod";

// Authoring identities are preserved byte-for-byte. They are not graph ScopeRef identities.
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const dimension = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const ordinal = z.number().int().min(0).max(99_999);
const finite = z.number().finite();
const boundsSchema = z.object({ x: finite, y: finite, width: finite.positive(), height: finite.positive() }).strict();
const pointSchema = z.object({ x: finite, y: finite }).strict();
const frameSchema = z.object({ id: identity, bounds: boundsSchema,
  polygon: z.array(pointSchema).min(3).max(10_000).optional() }).strict();
const elementSchema = z.object({ id: identity, type: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
  origin: z.enum(["page", "master"]) }).strict();

export const studioReviewSourceReferenceSchema = z.object({
  version: z.literal(1), sourceServerRevision: z.number().int().positive().max(2_147_483_647),
  sourceContentDigest: digest, pageOrdinal: ordinal, pageId: identity,
  frameId: identity.optional(), elementId: identity.optional(),
}).strict().refine((value) => !(value.frameId && value.elementId), "Frame membership is never inferred from proximity");
export type StudioReviewSourceReference = z.infer<typeof studioReviewSourceReferenceSchema>;

export const studioReviewPageMappingSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("mapped"), version: z.literal(1),
    sourceServerRevision: z.number().int().positive().max(2_147_483_647), sourceContentDigest: digest,
    page: z.object({ ordinal, id: identity, width: dimension, height: dimension,
      renderWidth: dimension, renderHeight: dimension,
      frames: z.array(frameSchema).max(100_000), elements: z.array(elementSchema).max(100_000),
    }).strict(),
  }).strict(),
  z.object({ status: z.literal("unmapped"), reason: z.enum([
    "legacy-review", "source-unavailable", "source-identity-ambiguous", "source-geometry-unsupported", "render-geometry-mismatch",
  ]) }).strict(),
]).superRefine((mapping, context) => {
  if (mapping.status !== "mapped") return;
  const { page } = mapping;
  if (new Set(page.elements.map((element) => element.id)).size !== page.elements.length
    || new Set(page.frames.map((frame) => frame.id)).size !== page.frames.length
    || page.frames.some((frame) => !page.elements.some((element) => element.id === frame.id && element.type === "frame"))) {
    context.addIssue({ code: "custom", message: "Ambiguous authoring identity" });
  }
  // A raster export can round its scaled dimensions by one pixel, but cannot crop/stretch pages.
  if (Math.abs(page.renderWidth / page.width - page.renderHeight / page.height)
    > 1 / page.width + 1 / page.height) context.addIssue({ code: "custom", message: "Raster aspect does not match source" });
});
export type StudioReviewPageMapping = z.infer<typeof studioReviewPageMappingSchema>;
export type StudioReviewMappedPage = Extract<StudioReviewPageMapping, { status: "mapped" }>;
export type StudioReviewMappingFailure = Extract<StudioReviewPageMapping, { status: "unmapped" }>["reason"];

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;
const unmapped = (reason: StudioReviewMappingFailure): StudioReviewPageMapping => ({ status: "unmapped", reason });

/** Projects only immutable saved authoring data. Never reads current work or invents missing IDs. */
export function deriveStudioReviewPageMapping(doc: unknown, input: {
  readonly sourceServerRevision: number; readonly sourceContentDigest: string; readonly ordinal: number;
  readonly renderWidth: number; readonly renderHeight: number;
}): StudioReviewPageMapping {
  const source = record(doc), pages = source?.pagesList;
  if (!source || !Array.isArray(pages) || !ordinal.safeParse(input.ordinal).success) return unmapped("source-unavailable");
  const page = record(pages[input.ordinal]);
  if (!page || !identity.safeParse(page.id).success || pages.filter((candidate) => record(candidate)?.id === page.id).length !== 1
    || !Array.isArray(page.elements)) return unmapped("source-identity-ambiguous");
  if (!dimension.safeParse(source.width).success || !dimension.safeParse(page.canvasH).success) return unmapped("source-geometry-unsupported");
  const master = record(source.master);
  if (master && !Array.isArray(master.elements)) return unmapped("source-identity-ambiguous");
  const candidates = [
    ...page.elements.map((element) => ({ element, origin: "page" as const })),
    ...(page.hideMaster === true ? [] : (master?.elements as unknown[] | undefined ?? []).map((element) => ({ element, origin: "master" as const }))),
  ];
  const elements: StudioReviewMappedPage["page"]["elements"] = [], frames: StudioReviewMappedPage["page"]["frames"] = [];
  const ids = new Set<string>();
  for (const candidate of candidates) {
    const element = record(candidate.element);
    const parsed = elementSchema.safeParse({ id: element?.id, type: element?.type, origin: candidate.origin });
    if (!element || !parsed.success || ids.has(parsed.data.id)) return unmapped("source-identity-ambiguous");
    ids.add(parsed.data.id); elements.push(parsed.data);
    // Master frames have different semantic ownership and cannot become a page cut by inference.
    if (element.type !== "frame" || candidate.origin !== "page") continue;
    const bounds = boundsSchema.safeParse({ x: element.x, y: element.y, width: element.width, height: element.height });
    if (!bounds.success) return unmapped("source-geometry-unsupported");
    let polygon: z.infer<typeof pointSchema>[] | undefined;
    if (element.points !== undefined) {
      const points = element.points;
      if (!Array.isArray(points) || points.length < 6 || points.length % 2 !== 0
        || points.length > 20_000 || !points.every((point) => typeof point === "number" && Number.isFinite(point))) return unmapped("source-geometry-unsupported");
      polygon = Array.from({ length: points.length / 2 }, (_, index) => ({
        x: bounds.data.x + (points[index * 2] as number),
        y: bounds.data.y + (points[index * 2 + 1] as number),
      }));
    }
    frames.push({ id: parsed.data.id, bounds: bounds.data, ...(polygon ? { polygon } : {}) });
  }
  const mapping = studioReviewPageMappingSchema.safeParse({ status: "mapped", version: 1,
    sourceServerRevision: input.sourceServerRevision, sourceContentDigest: input.sourceContentDigest,
    page: { ordinal: input.ordinal, id: page.id, width: source.width, height: page.canvasH,
      renderWidth: input.renderWidth, renderHeight: input.renderHeight, elements, frames },
  });
  return mapping.success ? mapping.data : unmapped("render-geometry-mismatch");
}

export interface StudioReviewSpatialSelection {
  readonly kind: "page" | "panel" | "object" | "coordinate" | "region";
  readonly frameId?: string; readonly elementId?: string;
  readonly x?: number; readonly y?: number; readonly width?: number; readonly height?: number;
}
export interface StudioReviewSpatialAnchor extends Omit<StudioReviewSpatialSelection, "frameId" | "elementId"> {
  readonly source: StudioReviewSourceReference;
  readonly objectId?: string;
}

function containsPoint(frame: StudioReviewMappedPage["page"]["frames"][number], x: number, y: number): boolean {
  const points = frame.polygon ?? [
    { x: frame.bounds.x, y: frame.bounds.y }, { x: frame.bounds.x + frame.bounds.width, y: frame.bounds.y },
    { x: frame.bounds.x + frame.bounds.width, y: frame.bounds.y + frame.bounds.height }, { x: frame.bounds.x, y: frame.bounds.y + frame.bounds.height },
  ];
  let inside = false;
  for (let index = 0, last = points.length - 1; index < points.length; last = index++) {
    const a = points[index]!, b = points[last]!;
    const cross = (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
    if (Math.abs(cross) < 1e-7 && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)
      && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)) return true;
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function crosses(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }): boolean {
  const side = (p: typeof a, q: typeof a, r: typeof a) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** Source coordinates use authoring pixels, independent of preview display/export scale. */
export function createStudioReviewSpatialAnchor(mapping: StudioReviewPageMapping, selection: StudioReviewSpatialSelection): StudioReviewSpatialAnchor | null {
  if (mapping.status !== "mapped") return null;
  const source = { version: 1 as const, sourceServerRevision: mapping.sourceServerRevision, sourceContentDigest: mapping.sourceContentDigest,
    pageOrdinal: mapping.page.ordinal, pageId: mapping.page.id,
    ...(selection.frameId ? { frameId: selection.frameId } : {}), ...(selection.elementId ? { elementId: selection.elementId } : {}) };
  const { frameId: _frame, elementId: _element, ...geometry } = selection;
  const anchor = { ...geometry, source, ...(selection.kind === "object" ? { objectId: selection.elementId } : {}) };
  return validateStudioReviewSpatialAnchor(mapping, anchor) ? anchor : null;
}

export function validateStudioReviewSpatialAnchor(mapping: StudioReviewPageMapping, anchor: {
  readonly kind: string; readonly source?: StudioReviewSourceReference; readonly objectId?: string;
  readonly x?: number; readonly y?: number; readonly width?: number; readonly height?: number;
}): boolean {
  if (mapping.status !== "mapped" || !anchor.source) return false;
  const source = studioReviewSourceReferenceSchema.safeParse(anchor.source);
  if (!source.success || source.data.sourceServerRevision !== mapping.sourceServerRevision
    || source.data.sourceContentDigest !== mapping.sourceContentDigest || source.data.pageOrdinal !== mapping.page.ordinal
    || source.data.pageId !== mapping.page.id) return false;
  const frame = mapping.page.frames.find((item) => item.id === source.data.frameId);
  if (source.data.frameId && !frame) return false;
  if (source.data.elementId && !mapping.page.elements.some((item) => item.id === source.data.elementId)) return false;
  if (anchor.kind !== "object" && anchor.objectId !== undefined) return false;
  if (anchor.kind !== "region" && (anchor.width !== undefined || anchor.height !== undefined)) return false;
  if (anchor.kind === "page") return !source.data.frameId && !source.data.elementId && anchor.x === undefined && anchor.y === undefined;
  if (anchor.kind === "panel") return !!frame && !source.data.elementId && anchor.x === undefined && anchor.y === undefined;
  if (anchor.kind === "object") return !!source.data.elementId && anchor.objectId === source.data.elementId && anchor.x === undefined && anchor.y === undefined;
  if (anchor.kind !== "coordinate" && anchor.kind !== "region") return false;
  if (source.data.elementId || typeof anchor.x !== "number" || typeof anchor.y !== "number"
    || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return false;
  const points = [{ x: anchor.x, y: anchor.y }];
  if (anchor.kind === "region") {
    if (typeof anchor.width !== "number" || typeof anchor.height !== "number" || !Number.isFinite(anchor.width)
      || !Number.isFinite(anchor.height) || anchor.width <= 0 || anchor.height <= 0) return false;
    points.push({ x: anchor.x + anchor.width, y: anchor.y }, { x: anchor.x, y: anchor.y + anchor.height },
      { x: anchor.x + anchor.width, y: anchor.y + anchor.height });
    if (frame?.polygon?.some((point) => point.x > anchor.x! && point.x < anchor.x! + anchor.width!
      && point.y > anchor.y! && point.y < anchor.y! + anchor.height!)) return false;
    if (frame?.polygon) {
      const corners = [points[0]!, points[1]!, points[3]!, points[2]!];
      if (frame.polygon.some((point, index, polygon) => corners.some((corner, side) =>
        crosses(point, polygon[(index + 1) % polygon.length]!, corner, corners[(side + 1) % corners.length]!)))) return false;
    }
  }
  return points.every((point) => point.x >= 0 && point.y >= 0 && point.x <= mapping.page.width
    && point.y <= mapping.page.height && (!frame || containsPoint(frame, point.x, point.y)));
}
