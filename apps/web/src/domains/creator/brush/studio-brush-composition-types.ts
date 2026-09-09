import type { StudioBrushCompositionSlotId } from "./studio-brush-engine-program-set";

export type StudioBrushCompositionIntegration =
  | "connected"
  | "adapter-ready"
  | "lab";
export type StudioBrushCompositionRights =
  | "permissive"
  | "copyleft"
  | "private-grant";
export type StudioBrushCompositionCost = "light" | "balanced" | "intensive";

export interface StudioBrushCompositionNode {
  readonly id: string;
  readonly slot: StudioBrushCompositionSlotId;
  readonly label: string;
  readonly provider: string;
  readonly description: string;
  readonly integration: StudioBrushCompositionIntegration;
  readonly rights: StudioBrushCompositionRights;
  readonly cost: StudioBrushCompositionCost;
  readonly supportedFamilies: "all" | readonly string[];
  readonly tags: readonly string[];
}

type NodeSeed = Omit<StudioBrushCompositionNode, "supportedFamilies" | "tags"> & {
  readonly supportedFamilies?: "all" | readonly string[];
  readonly tags?: readonly string[];
};

export function defineStudioBrushCompositionNode(
  seed: NodeSeed,
): StudioBrushCompositionNode {
  return Object.freeze({
    ...seed,
    supportedFamilies: seed.supportedFamilies ?? "all",
    tags: Object.freeze([...(seed.tags ?? [])]),
  });
}

export const STUDIO_BRUSH_COMPOSITION_SLOT_LABELS: Readonly<
  Record<StudioBrushCompositionSlotId, string>
> = Object.freeze({
  motion: "필기감",
  carrier: "획 캐리어",
  tip: "촉·접촉면",
  surface: "종이·표면",
  deposition: "재료 도포",
  pigment: "색·안료",
  pickup: "픽업·스머지",
  physics: "물리 엔진",
  pattern: "패턴·문양",
  feedback: "피드백",
  output: "출력",
});
