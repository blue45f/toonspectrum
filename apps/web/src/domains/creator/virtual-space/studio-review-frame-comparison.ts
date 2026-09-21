import type { StudioVirtualSpaceReviewPreview as Preview } from "./studio-virtual-space-review-preview";

type Frame = Extract<Preview["mapping"], { status: "mapped" }>["page"]["frames"][number];
export type ReviewFrameMatch =
  | { readonly kind: "matched"; readonly source: Frame; readonly target: Frame }
  | { readonly kind: "source-unavailable" | "source-ambiguous" | "target-unmapped" | "different-page" | "not-found" | "target-ambiguous" };

/** Only exact authoring identity within the same mapped page establishes correspondence.
 * The parent supplies two permission-checked snapshots of the same artifact.
 * Absence is scoped to the selected page, never asserted to mean deletion. */
export function matchReviewSourceFrame(source: Preview, target: Preview, frameId: string): ReviewFrameMatch {
  if (source.mapping.status !== "mapped") return { kind: "source-unavailable" };
  const originals = source.mapping.page.frames.filter((frame) => frame.id === frameId);
  if (!originals.length) return { kind: "source-unavailable" };
  if (originals.length !== 1) return { kind: "source-ambiguous" };
  if (target.mapping.status !== "mapped") return { kind: "target-unmapped" };
  if (source.mapping.page.id !== target.mapping.page.id) return { kind: "different-page" };
  const matches = target.mapping.page.frames.filter((frame) => frame.id === frameId);
  if (!matches.length) return { kind: "not-found" };
  if (matches.length !== 1) return { kind: "target-ambiguous" };
  return { kind: "matched", source: originals[0]!, target: matches[0]! };
}

/** Bounded DOM options, preserving exact IDs; source array order is not correspondence. */
export function reviewFrameChoices(preview: Preview, query: string, offset = 0) {
  const needle = query.trim().toLowerCase();
  const positions = new Map<string, number>();
  if (preview.mapping.status === "mapped") preview.mapping.page.frames.forEach((frame, index) => {
    if (!positions.has(frame.id)) positions.set(frame.id, index);
  });
  const matches = [...positions].filter(([id]) => id.toLowerCase().includes(needle));
  const start = Number.isSafeInteger(offset) ? Math.max(0, Math.min(Math.max(0, matches.length - 1), offset)) : 0;
  const items = matches.slice(start, start + 100).map(([id, ordinal]) => ({ id, ordinal }));
  return { ids: items.map((item) => item.id), items, total: matches.length, start, hasNext: start + 100 < matches.length };
}

export interface ReviewFrameCrop {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly imageWidth: number; readonly imageHeight: number; readonly imageLeft: number; readonly imageTop: number;
}
/** Authoring pixels are never rewritten as percentages. These values are display-only.
 * Polygon cuts use their bounding box, explicitly not a pixel mask or inferred membership. */
export function reviewFrameCrop(preview: Preview, frameId: string): ReviewFrameCrop | null {
  if (preview.mapping.status !== "mapped") return null;
  const { page } = preview.mapping;
  const matches = page.frames.filter((frame) => frame.id === frameId);
  if (matches.length !== 1) return null;
  const bounds = matches[0]!.bounds;
  if (![page.width, page.height, bounds.x, bounds.y, bounds.width, bounds.height,
    bounds.x + bounds.width, bounds.y + bounds.height].every(Number.isFinite)
    || page.width <= 0 || page.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return null;
  const x = Math.max(0, bounds.x), y = Math.max(0, bounds.y);
  const width = Math.min(page.width, bounds.x + bounds.width) - x;
  const height = Math.min(page.height, bounds.y + bounds.height) - y;
  // Reject empty or extreme transforms rather than allocating an unbounded CSS surface.
  if (width <= 0 || height <= 0 || page.width / width > 64 || page.height / height > 512
    || width / height > 64 || height / width > 64) return null;
  return { x, y, width, height, imageWidth: page.width / width * 100,
    imageHeight: page.height / height * 100, imageLeft: -x / width * 100, imageTop: -y / height * 100 };
}
