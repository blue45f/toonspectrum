/**
 * Browser/Worker orchestration for destructive pixel-edit brushes.
 *
 * StudioPage loads this module only after an explicit Magic Wand, Smudge, or Heal/Clone action.
 * Their pure geometry/contracts stay in the eager drawing graph, while image decode and Worker
 * startup code no longer consume the initial Studio route budget.
 */
export { bakeHealCloneStrokeToCanvas } from "./studio-heal-clone-browser";
export { magicWandScanFromImage } from "./studio-magic-wand-browser";
export { smudgeStrokeImage } from "./studio-smudge-browser";
