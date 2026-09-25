import type { StudioVirtualNameplateMode } from "./studio-virtual-space-experience-preference";

export type StudioVirtualNameplateLod = "full" | "compact" | "dot" | "hidden";

export interface StudioVirtualNameplatePresentation {
  readonly lod: StudioVirtualNameplateLod;
  readonly visible: boolean;
  readonly text: string;
  readonly alpha: number;
  readonly scale: number;
}

export function studioVirtualDisambiguatedName(
  name: string,
  sessionId: string,
  duplicateCount: number,
): string {
  if (duplicateCount <= 1) return name;
  const suffix = sessionId.replace(/[^a-z0-9]/giu, "").slice(-4).toUpperCase() || "0000";
  return `${name} · ${suffix}`;
}

export function studioVirtualNameplatePresentation(input: {
  readonly name: string;
  readonly sessionId: string;
  readonly duplicateCount: number;
  readonly distance: number;
  readonly mode: StudioVirtualNameplateMode;
  readonly important?: boolean;
  readonly activity?: "available" | "focused" | "reviewing" | "away";
}): StudioVirtualNameplatePresentation {
  const distance = Number.isFinite(input.distance) ? Math.max(0, input.distance) : Number.POSITIVE_INFINITY;
  let lod: StudioVirtualNameplateLod;
  if (input.mode !== "auto") lod = input.mode;
  else if (input.important || distance <= 170) lod = "full";
  else if (distance <= 340) lod = "compact";
  else if (distance <= 560) lod = "dot";
  else lod = "hidden";
  const status = input.activity === "focused" ? " · FOCUS"
    : input.activity === "reviewing" ? " · REVIEW"
      : input.activity === "away" ? " · AWAY" : "";
  const fullName = studioVirtualDisambiguatedName(input.name, input.sessionId, input.duplicateCount);
  const text = lod === "full" ? `${fullName}${status}` : lod === "compact" ? fullName : lod === "dot" ? "●" : "";
  return Object.freeze({
    lod,
    visible: lod !== "hidden",
    text,
    alpha: lod === "full" ? 1 : lod === "compact" ? .86 : lod === "dot" ? .68 : 0,
    scale: lod === "full" ? 1 : lod === "compact" ? .88 : .72,
  });
}

export interface StudioVirtualNameplateCandidate {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly priority: number;
}

export interface StudioVirtualNameplateOffset {
  readonly x: number;
  readonly y: number;
}

function overlaps(a: StudioVirtualNameplateCandidate, b: StudioVirtualNameplateCandidate): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 4
    && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 3;
}

/** Greedy screen-space decluttering; higher-priority labels stay closest to their actor. */
export function layoutStudioVirtualNameplates(
  candidates: readonly StudioVirtualNameplateCandidate[],
): ReadonlyMap<string, StudioVirtualNameplateOffset> {
  const placed: StudioVirtualNameplateCandidate[] = [];
  const result = new Map<string, StudioVirtualNameplateOffset>();
  const ordered = [...candidates].sort((left, right) => right.priority - left.priority || right.y - left.y || left.id.localeCompare(right.id));
  for (const candidate of ordered) {
    let shifted = candidate;
    let offsetY = 0;
    for (let attempt = 0; attempt < 6 && placed.some((entry) => overlaps(shifted, entry)); attempt += 1) {
      offsetY -= candidate.height + 3;
      shifted = { ...candidate, y: candidate.y + offsetY };
    }
    placed.push(shifted);
    result.set(candidate.id, Object.freeze({ x: 0, y: offsetY }));
  }
  return result;
}
