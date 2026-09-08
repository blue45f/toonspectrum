/**
 * Legacy public seam for the Studio scenario surface.
 *
 * The implementation now lives in the focused AI comic director domain while the existing lazy
 * registry and parent-owned scenario orchestration keep the same component and prop contract.
 */
export {
  StudioAiComicDirectorPanel as StudioScenarioAutoLayoutPanel,
} from "./ai/StudioAiComicDirectorPanel";
export type {
  StudioAiComicDirectorPanelProps as StudioScenarioAutoLayoutPanelProps,
} from "./ai/StudioAiComicDirectorPanel";
