import type { BrushStudioV6ProgramPatch } from "./brush-studio-v6-engine";

export interface BrushStudioV6RecipeSeed {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly description: string;
  readonly delta: BrushStudioV6ProgramPatch;
}

export function defineBrushStudioV6RecipeSeed(
  id: string,
  label: string,
  group: string,
  description: string,
  delta: BrushStudioV6ProgramPatch,
): BrushStudioV6RecipeSeed {
  return Object.freeze({ id, label, group, description, delta });
}
