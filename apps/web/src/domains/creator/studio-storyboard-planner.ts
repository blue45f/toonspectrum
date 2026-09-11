export type StudioStoryBeatKind = "setup" | "dialogue" | "action" | "reaction" | "reveal" | "transition";
export type StudioShotSize = "extreme-wide" | "wide" | "medium" | "close-up" | "extreme-close-up";

export interface StudioStoryBeat {
  readonly id: string;
  readonly sceneId: string;
  readonly order: number;
  readonly kind: StudioStoryBeatKind;
  readonly summary: string;
  readonly dialogue: string;
  readonly characterIds: readonly string[];
  readonly locationId: string | null;
}

export interface StudioStoryboardShot {
  readonly id: string;
  readonly beatId: string;
  readonly sceneId: string;
  readonly order: number;
  readonly shotSize: StudioShotSize;
  readonly camera: string;
  readonly composition: string;
  readonly reserveDialogueAreaRatio: number;
  readonly scrollGapAfterPx: number;
  readonly estimatedHeightPx: number;
}

export interface StudioStoryboardPlan {
  readonly status: "ready" | "review";
  readonly shots: readonly StudioStoryboardShot[];
  readonly estimatedCanvasHeightPx: number;
  readonly warnings: readonly string[];
}

const SHOT_BY_KIND: Readonly<Record<StudioStoryBeatKind, StudioShotSize>> = {
  setup: "wide",
  dialogue: "medium",
  action: "wide",
  reaction: "close-up",
  reveal: "extreme-close-up",
  transition: "extreme-wide",
};

const CAMERA_BY_KIND: Readonly<Record<StudioStoryBeatKind, string>> = {
  setup: "eye-level establishing",
  dialogue: "shot-reverse-shot",
  action: "dynamic three-quarter",
  reaction: "eye-line close-up",
  reveal: "controlled push-in",
  transition: "environmental bridge",
};

function dialogueRatio(text: string): number {
  if (!text.trim()) return 0.12;
  return Math.min(0.42, 0.16 + text.length / 240);
}

function shotHeight(kind: StudioStoryBeatKind): number {
  if (kind === "action") return 900;
  if (kind === "reveal") return 780;
  if (kind === "transition") return 520;
  return 680;
}

export function planStudioStoryboard(
  beats: readonly StudioStoryBeat[],
): StudioStoryboardPlan {
  if (beats.length === 0) throw new Error("Storyboard planning requires at least one story beat.");
  const ids = beats.map((beat) => beat.id);
  if (new Set(ids).size !== ids.length) throw new Error("Story beat ids must be unique.");
  const ordered = [...beats].sort((left, right) => left.order - right.order);
  const orders = ordered.map((beat) => beat.order);
  if (new Set(orders).size !== orders.length) throw new Error("Story beat order must be unique.");
  const warnings: string[] = [];
  const shots = ordered.map((beat, index): StudioStoryboardShot => {
    if (!beat.id.trim() || !beat.sceneId.trim() || !beat.summary.trim()
      || !Number.isSafeInteger(beat.order) || beat.order < 0) {
      throw new Error("Story beats require valid ids, order and summaries.");
    }
    if (beat.kind === "dialogue" && beat.dialogue.length > 100) {
      warnings.push(`long-dialogue:${beat.id}`);
    }
    if ((beat.kind === "dialogue" || beat.kind === "reaction") && beat.characterIds.length === 0) {
      warnings.push(`character-missing:${beat.id}`);
    }
    const next = ordered[index + 1];
    const sceneBreak = next !== undefined && next.sceneId !== beat.sceneId;
    const scrollGapAfterPx = sceneBreak
      ? 240
      : beat.kind === "reveal" ? 180 : beat.kind === "action" ? 60 : 100;
    return Object.freeze({
      id: `shot:${beat.id}`,
      beatId: beat.id,
      sceneId: beat.sceneId,
      order: index,
      shotSize: SHOT_BY_KIND[beat.kind],
      camera: CAMERA_BY_KIND[beat.kind],
      composition: beat.characterIds.length > 1 ? "multi-character readable staging" : "single focal subject",
      reserveDialogueAreaRatio: dialogueRatio(beat.dialogue),
      scrollGapAfterPx,
      estimatedHeightPx: shotHeight(beat.kind),
    });
  });
  const estimatedCanvasHeightPx = shots.reduce(
    (sum, shot) => sum + shot.estimatedHeightPx + shot.scrollGapAfterPx,
    0,
  );
  return Object.freeze({
    status: warnings.length > 0 ? "review" : "ready",
    shots: Object.freeze(shots),
    estimatedCanvasHeightPx,
    warnings: Object.freeze(warnings),
  });
}
