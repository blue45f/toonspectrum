import {
  parseStudioDeterministicJson,
  studioDeterministicContentId,
  studioDeterministicJson,
} from "../studio-deterministic-serialization";

export const STUDIO_STROKE_PROPOSAL_SCHEMA_VERSION = 1 as const;

export interface StudioStrokeProposalPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly twist?: number;
  readonly timeMs?: number;
}

export interface StudioStrokeProposalStroke {
  readonly id: string;
  readonly brushId: string;
  readonly color: string;
  readonly width: number;
  readonly opacity: number;
  readonly points: readonly StudioStrokeProposalPoint[];
}

export interface StudioStrokeProposalProvenance {
  readonly provider: string;
  readonly model: string;
  readonly seed: number;
  readonly promptHash: string;
  readonly sourceHash: string;
  readonly requestIdHash: string;
  readonly generatedAtMs: number;
  readonly transport: "local" | "byom" | "byok" | "server";
}

export interface StudioStrokeProposalVariant {
  readonly id: string;
  readonly label: string;
  readonly strokes: readonly StudioStrokeProposalStroke[];
  readonly provenance: StudioStrokeProposalProvenance;
  readonly contentId: string;
}

export interface StudioStrokeProposalResponse {
  readonly schemaVersion: typeof STUDIO_STROKE_PROPOSAL_SCHEMA_VERSION;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly variants: readonly StudioStrokeProposalVariant[];
}

export interface StudioCommittedStrokeContext {
  readonly id: string;
  readonly brushId: string;
  readonly color: string;
  readonly width: number;
  readonly opacity: number;
  readonly points: readonly StudioStrokeProposalPoint[];
  readonly committedAtMs: number;
}

export interface StudioStrokeProposalContext {
  readonly schemaVersion: typeof STUDIO_STROKE_PROPOSAL_SCHEMA_VERSION;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly viewport: StudioDocumentRect;
  readonly selection?: StudioDocumentRect;
  readonly recentStrokes: readonly StudioCommittedStrokeContext[];
  readonly semanticSummary: string;
  readonly referenceHashes: readonly string[];
}

export interface StudioDocumentRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioStrokeProposalLimits {
  readonly maxVariants: number;
  readonly maxStrokesPerVariant: number;
  readonly maxPointsPerStroke: number;
  readonly maxTotalPoints: number;
  readonly maxContextStrokes: number;
  readonly maxContextPoints: number;
  readonly maxCoordinate: number;
}

export const DEFAULT_STUDIO_STROKE_PROPOSAL_LIMITS: StudioStrokeProposalLimits =
  Object.freeze({
    maxVariants: 4,
    maxStrokesPerVariant: 64,
    maxPointsPerStroke: 2_048,
    maxTotalPoints: 16_384,
    maxContextStrokes: 48,
    maxContextPoints: 8_192,
    maxCoordinate: 1_000_000,
  });

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be finite.`);
  }
  return value;
}

function boundedString(value: unknown, field: string, maxLength = 240): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new RangeError(`${field} must contain 1-${maxLength} characters.`);
  }
  return normalized;
}

function integer(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const number = finite(value, field);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new RangeError(`${field} must be an integer from ${min} to ${max}.`);
  }
  return number;
}

function normalizeColor(value: unknown): string {
  const color = boundedString(value, "stroke.color", 32).toLowerCase();
  if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/u.test(color)) {
    throw new TypeError("stroke.color must be #rrggbb or #rrggbbaa.");
  }
  return color;
}

function normalizePoint(
  value: unknown,
  limits: StudioStrokeProposalLimits,
): StudioStrokeProposalPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("stroke point must be an object.");
  }
  const point = value as Record<string, unknown>;
  const x = finite(point.x, "point.x");
  const y = finite(point.y, "point.y");
  if (Math.abs(x) > limits.maxCoordinate || Math.abs(y) > limits.maxCoordinate) {
    throw new RangeError("stroke point exceeds the document coordinate budget.");
  }
  const pressure = point.pressure === undefined ? 0.5 : finite(point.pressure, "point.pressure");
  if (pressure < 0 || pressure > 1) throw new RangeError("point.pressure must be 0-1.");
  const optionalAngle = (key: "tiltX" | "tiltY" | "twist", min: number, max: number) => {
    const raw = point[key];
    if (raw === undefined) return undefined;
    const number = finite(raw, `point.${key}`);
    if (number < min || number > max) throw new RangeError(`point.${key} is out of range.`);
    return number;
  };
  const timeMs = point.timeMs === undefined ? undefined : integer(point.timeMs, "point.timeMs");
  return Object.freeze({
    x,
    y,
    pressure,
    ...(optionalAngle("tiltX", -90, 90) !== undefined
      ? { tiltX: optionalAngle("tiltX", -90, 90) }
      : {}),
    ...(optionalAngle("tiltY", -90, 90) !== undefined
      ? { tiltY: optionalAngle("tiltY", -90, 90) }
      : {}),
    ...(optionalAngle("twist", 0, 359.999) !== undefined
      ? { twist: optionalAngle("twist", 0, 359.999) }
      : {}),
    ...(timeMs !== undefined ? { timeMs } : {}),
  });
}

function normalizeStroke(
  value: unknown,
  limits: StudioStrokeProposalLimits,
): StudioStrokeProposalStroke {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("proposal stroke must be an object.");
  }
  const stroke = value as Record<string, unknown>;
  if (!Array.isArray(stroke.points) || stroke.points.length < 1) {
    throw new TypeError("proposal stroke must include points.");
  }
  if (stroke.points.length > limits.maxPointsPerStroke) {
    throw new RangeError("proposal stroke exceeds its point budget.");
  }
  const width = finite(stroke.width, "stroke.width");
  const opacity = finite(stroke.opacity, "stroke.opacity");
  if (width <= 0 || width > 4_096) throw new RangeError("stroke.width is out of range.");
  if (opacity < 0 || opacity > 1) throw new RangeError("stroke.opacity must be 0-1.");
  return Object.freeze({
    id: boundedString(stroke.id, "stroke.id"),
    brushId: boundedString(stroke.brushId, "stroke.brushId"),
    color: normalizeColor(stroke.color),
    width,
    opacity,
    points: Object.freeze(stroke.points.map((point) => normalizePoint(point, limits))),
  });
}

function normalizeProvenance(value: unknown): StudioStrokeProposalProvenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("proposal provenance must be an object.");
  }
  const item = value as Record<string, unknown>;
  const transport = item.transport;
  if (transport !== "local" && transport !== "byom" && transport !== "byok" && transport !== "server") {
    throw new TypeError("proposal transport is unsupported.");
  }
  return Object.freeze({
    provider: boundedString(item.provider, "provenance.provider"),
    model: boundedString(item.model, "provenance.model"),
    seed: integer(item.seed, "provenance.seed", 0, 2_147_483_647),
    promptHash: boundedString(item.promptHash, "provenance.promptHash", 128),
    sourceHash: boundedString(item.sourceHash, "provenance.sourceHash", 128),
    requestIdHash: boundedString(item.requestIdHash, "provenance.requestIdHash", 128),
    generatedAtMs: integer(item.generatedAtMs, "provenance.generatedAtMs"),
    transport,
  });
}

export function validateStudioStrokeProposalResponse(
  value: unknown,
  limits: StudioStrokeProposalLimits = DEFAULT_STUDIO_STROKE_PROPOSAL_LIMITS,
): StudioStrokeProposalResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("stroke proposal response must be an object.");
  }
  const response = value as Record<string, unknown>;
  if (response.schemaVersion !== STUDIO_STROKE_PROPOSAL_SCHEMA_VERSION) {
    throw new TypeError("unsupported stroke proposal schema version.");
  }
  if (!Array.isArray(response.variants) || response.variants.length < 1) {
    throw new TypeError("stroke proposal response must include variants.");
  }
  if (response.variants.length > limits.maxVariants) {
    throw new RangeError("stroke proposal response exceeds its variant budget.");
  }
  let totalPoints = 0;
  const seenVariantIds = new Set<string>();
  const seenContentIds = new Set<string>();
  const variants = response.variants.map((rawVariant, variantIndex) => {
    if (!rawVariant || typeof rawVariant !== "object" || Array.isArray(rawVariant)) {
      throw new TypeError(`variant ${variantIndex} must be an object.`);
    }
    const variant = rawVariant as Record<string, unknown>;
    if (!Array.isArray(variant.strokes) || variant.strokes.length < 1) {
      throw new TypeError(`variant ${variantIndex} must contain strokes.`);
    }
    if (variant.strokes.length > limits.maxStrokesPerVariant) {
      throw new RangeError(`variant ${variantIndex} exceeds its stroke budget.`);
    }
    const strokes = variant.strokes.map((stroke) => normalizeStroke(stroke, limits));
    totalPoints += strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
    if (totalPoints > limits.maxTotalPoints) {
      throw new RangeError("stroke proposal response exceeds its total point budget.");
    }
    const id = boundedString(variant.id, `variant ${variantIndex}.id`);
    if (seenVariantIds.has(id)) throw new TypeError(`duplicate variant id: ${id}`);
    seenVariantIds.add(id);
    const provenance = normalizeProvenance(variant.provenance);
    const canonical = { strokes, provenance };
    const contentId = studioDeterministicContentId(canonical);
    if (seenContentIds.has(contentId)) {
      throw new TypeError("duplicate proposal variant content is not allowed.");
    }
    seenContentIds.add(contentId);
    return Object.freeze({
      id,
      label: boundedString(variant.label ?? `Variant ${variantIndex + 1}`, "variant.label", 120),
      strokes: Object.freeze(strokes),
      provenance,
      contentId,
    });
  });
  return Object.freeze({
    schemaVersion: STUDIO_STROKE_PROPOSAL_SCHEMA_VERSION,
    documentId: boundedString(response.documentId, "documentId"),
    documentGeneration: integer(response.documentGeneration, "documentGeneration"),
    variants: Object.freeze(variants),
  });
}

function normalizeRect(rect: StudioDocumentRect, field: string): StudioDocumentRect {
  const x = finite(rect.x, `${field}.x`);
  const y = finite(rect.y, `${field}.y`);
  const width = finite(rect.width, `${field}.width`);
  const height = finite(rect.height, `${field}.height`);
  if (width <= 0 || height <= 0) throw new RangeError(`${field} must have positive dimensions.`);
  return Object.freeze({ x, y, width, height });
}

export function buildBoundedStudioStrokeProposalContext(input: {
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly viewport: StudioDocumentRect;
  readonly selection?: StudioDocumentRect;
  readonly recentStrokes: readonly StudioCommittedStrokeContext[];
  readonly semanticSummary?: string;
  readonly referenceHashes?: readonly string[];
  readonly limits?: StudioStrokeProposalLimits;
}): StudioStrokeProposalContext {
  const limits = input.limits ?? DEFAULT_STUDIO_STROKE_PROPOSAL_LIMITS;
  const selected: StudioCommittedStrokeContext[] = [];
  let points = 0;
  for (let index = input.recentStrokes.length - 1; index >= 0; index -= 1) {
    const stroke = input.recentStrokes[index];
    if (!stroke) continue;
    if (selected.length >= limits.maxContextStrokes) break;
    if (points + stroke.points.length > limits.maxContextPoints) break;
    selected.push(stroke);
    points += stroke.points.length;
  }
  selected.reverse();
  return Object.freeze({
    schemaVersion: STUDIO_STROKE_PROPOSAL_SCHEMA_VERSION,
    documentId: boundedString(input.documentId, "documentId"),
    documentGeneration: integer(input.documentGeneration, "documentGeneration"),
    viewport: normalizeRect(input.viewport, "viewport"),
    ...(input.selection ? { selection: normalizeRect(input.selection, "selection") } : {}),
    recentStrokes: Object.freeze(selected.map((stroke) => Object.freeze({ ...stroke }))),
    semanticSummary: (input.semanticSummary ?? "").trim().slice(0, 4_096),
    referenceHashes: Object.freeze(
      [...new Set(input.referenceHashes ?? [])]
        .map((hash) => hash.trim())
        .filter(Boolean)
        .slice(0, 32),
    ),
  });
}

export interface StudioStrokeGhostTransform {
  readonly viewportWidthCss: number;
  readonly viewportHeightCss: number;
  readonly zoom: number;
  readonly dpr: number;
  readonly rotationDeg: number;
  readonly panXCss: number;
  readonly panYCss: number;
  readonly canvasOriginXCss?: number;
  readonly canvasOriginYCss?: number;
}

export interface StudioStrokeGhostPath {
  readonly strokeId: string;
  readonly color: string;
  readonly widthCss: number;
  readonly opacity: number;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly clipped: boolean;
}

function transformPoint(
  point: StudioStrokeProposalPoint,
  transform: StudioStrokeGhostTransform,
): { readonly x: number; readonly y: number } {
  const radians = (transform.rotationDeg * Math.PI) / 180;
  const scaledX = point.x * transform.zoom;
  const scaledY = point.y * transform.zoom;
  const rotatedX = scaledX * Math.cos(radians) - scaledY * Math.sin(radians);
  const rotatedY = scaledX * Math.sin(radians) + scaledY * Math.cos(radians);
  return Object.freeze({
    x: (transform.canvasOriginXCss ?? 0) + transform.panXCss + rotatedX,
    y: (transform.canvasOriginYCss ?? 0) + transform.panYCss + rotatedY,
  });
}

export function planStudioStrokeGhostPreview(
  variant: StudioStrokeProposalVariant,
  transform: StudioStrokeGhostTransform,
): readonly StudioStrokeGhostPath[] {
  if (transform.zoom <= 0 || transform.dpr <= 0) {
    throw new RangeError("ghost transform zoom and DPR must be positive.");
  }
  const fringe = 48;
  return Object.freeze(
    variant.strokes.map((stroke) => {
      const points = stroke.points.map((point) => transformPoint(point, transform));
      const visible = points.filter(
        (point) =>
          point.x >= -fringe &&
          point.y >= -fringe &&
          point.x <= transform.viewportWidthCss + fringe &&
          point.y <= transform.viewportHeightCss + fringe,
      );
      return Object.freeze({
        strokeId: stroke.id,
        color: stroke.color,
        widthCss: Math.max(0.5, (stroke.width * transform.zoom) / transform.dpr),
        opacity: stroke.opacity,
        points: Object.freeze(visible),
        clipped: visible.length !== points.length,
      });
    }),
  );
}

export interface StudioStrokeProposalReview {
  readonly proposal: StudioStrokeProposalResponse;
  readonly selectedVariantId: string;
  readonly selectedStrokeIds: ReadonlySet<string>;
  readonly status: "reviewing" | "applied" | "cancelled";
}

export function createStudioStrokeProposalReview(
  proposal: StudioStrokeProposalResponse,
  variantId = proposal.variants[0]?.id,
): StudioStrokeProposalReview {
  const variant = proposal.variants.find((item) => item.id === variantId);
  if (!variant) throw new TypeError("selected proposal variant does not exist.");
  return Object.freeze({
    proposal,
    selectedVariantId: variant.id,
    selectedStrokeIds: new Set(variant.strokes.map((stroke) => stroke.id)),
    status: "reviewing",
  });
}

export function selectStudioStrokeProposalVariant(
  review: StudioStrokeProposalReview,
  variantId: string,
): StudioStrokeProposalReview {
  if (review.status !== "reviewing") return review;
  const variant = review.proposal.variants.find((item) => item.id === variantId);
  if (!variant) throw new TypeError("selected proposal variant does not exist.");
  return Object.freeze({
    ...review,
    selectedVariantId: variantId,
    selectedStrokeIds: new Set(variant.strokes.map((stroke) => stroke.id)),
  });
}

export function setStudioStrokeProposalSelection(
  review: StudioStrokeProposalReview,
  strokeIds: readonly string[],
): StudioStrokeProposalReview {
  if (review.status !== "reviewing") return review;
  const variant = review.proposal.variants.find((item) => item.id === review.selectedVariantId);
  if (!variant) throw new TypeError("selected proposal variant does not exist.");
  const valid = new Set(variant.strokes.map((stroke) => stroke.id));
  const selected = new Set(strokeIds.filter((id) => valid.has(id)));
  return Object.freeze({ ...review, selectedStrokeIds: selected });
}

export interface StudioStrokeProposalTransaction {
  readonly id: string;
  readonly documentId: string;
  readonly baseGeneration: number;
  readonly variantId: string;
  readonly addedStrokes: readonly StudioStrokeProposalStroke[];
  readonly provenance: StudioStrokeProposalProvenance;
  readonly contentId: string;
}

export function applyStudioStrokeProposalReview(
  review: StudioStrokeProposalReview,
  options: {
    readonly documentId: string;
    readonly documentGeneration: number;
    readonly activePointerStroke: boolean;
    readonly existingStrokeIds?: ReadonlySet<string>;
    readonly transactionId: string;
  },
): { readonly review: StudioStrokeProposalReview; readonly transaction: StudioStrokeProposalTransaction } {
  if (review.status !== "reviewing") throw new Error("proposal is no longer reviewable.");
  if (options.activePointerStroke) throw new Error("proposal cannot apply during an active pointer stroke.");
  if (options.documentId !== review.proposal.documentId) throw new Error("proposal document changed.");
  if (options.documentGeneration !== review.proposal.documentGeneration) {
    throw new Error("proposal is stale for the current document generation.");
  }
  const variant = review.proposal.variants.find((item) => item.id === review.selectedVariantId);
  if (!variant) throw new TypeError("selected proposal variant does not exist.");
  const existing = options.existingStrokeIds ?? new Set<string>();
  const addedStrokes = variant.strokes.filter(
    (stroke) => review.selectedStrokeIds.has(stroke.id) && !existing.has(stroke.id),
  );
  if (addedStrokes.length < 1) throw new Error("select at least one unapplied proposal stroke.");
  const transaction = Object.freeze({
    id: boundedString(options.transactionId, "transactionId"),
    documentId: options.documentId,
    baseGeneration: options.documentGeneration,
    variantId: variant.id,
    addedStrokes: Object.freeze(addedStrokes),
    provenance: variant.provenance,
    contentId: studioDeterministicContentId({
      documentId: options.documentId,
      variantId: variant.id,
      strokes: addedStrokes,
      provenance: variant.provenance,
    }),
  });
  return Object.freeze({
    review: Object.freeze({ ...review, status: "applied" as const }),
    transaction,
  });
}

export function cancelStudioStrokeProposalReview(
  review: StudioStrokeProposalReview,
): StudioStrokeProposalReview {
  return review.status === "reviewing"
    ? Object.freeze({ ...review, status: "cancelled" as const })
    : review;
}

export function rollbackStudioStrokeProposalTransaction(
  strokeIds: readonly string[],
  transaction: StudioStrokeProposalTransaction,
): readonly string[] {
  const added = new Set(transaction.addedStrokes.map((stroke) => stroke.id));
  return Object.freeze(strokeIds.filter((id) => !added.has(id)));
}

export function serializeStudioStrokeProposal(
  proposal: StudioStrokeProposalResponse,
): string {
  return studioDeterministicJson(proposal);
}

export function restoreStudioStrokeProposal(
  serialized: string,
  limits?: StudioStrokeProposalLimits,
): StudioStrokeProposalResponse {
  return validateStudioStrokeProposalResponse(
    parseStudioDeterministicJson<unknown>(serialized, 2_000_000),
    limits,
  );
}

export type StudioStrokeProposalDeliveryState =
  | "idle"
  | "in-flight"
  | "delivery-unknown"
  | "settled"
  | "cancelled";

export class StudioStrokeProposalRequestFence {
  readonly requestKey: string;
  readonly sourceHash: string;
  #state: StudioStrokeProposalDeliveryState = "idle";
  #generation = 0;

  constructor(requestKey: string, source: unknown) {
    this.requestKey = boundedString(requestKey, "requestKey");
    this.sourceHash = studioDeterministicContentId(source);
  }

  get state(): StudioStrokeProposalDeliveryState {
    return this.#state;
  }

  begin(documentGeneration: number): number {
    if (this.#state === "in-flight" || this.#state === "delivery-unknown") {
      throw new Error("the proposal request is already owned or may have been delivered.");
    }
    this.#generation = integer(documentGeneration, "documentGeneration");
    this.#state = "in-flight";
    return this.#generation;
  }

  settle(ticket: number, currentDocumentGeneration: number): boolean {
    if (this.#state !== "in-flight" || ticket !== this.#generation) return false;
    if (currentDocumentGeneration !== this.#generation) {
      this.#state = "cancelled";
      return false;
    }
    this.#state = "settled";
    return true;
  }

  markDeliveryUnknown(ticket: number): void {
    if (this.#state === "in-flight" && ticket === this.#generation) {
      this.#state = "delivery-unknown";
    }
  }

  cancel(ticket: number): void {
    if (ticket === this.#generation && this.#state === "in-flight") this.#state = "cancelled";
  }

  canRetry(providerConfirmedRejectedBeforeInference: boolean): boolean {
    if (this.#state !== "delivery-unknown") return this.#state !== "in-flight";
    return providerConfirmedRejectedBeforeInference;
  }
}
