/** Transitional BG3D aliases for the renderer-neutral Scene3D command core. */
export {
  STUDIO_SCENE3D_COMMAND_CORE_REVISION as STUDIO_BG3D_COMMAND_CORE_REVISION,
  STUDIO_SCENE3D_COMMAND_DEFAULT_MAX_ENTRIES as STUDIO_BG3D_COMMAND_DEFAULT_MAX_ENTRIES,
  STUDIO_SCENE3D_COMMAND_MAX_TRANSACTION_STEPS as STUDIO_BG3D_COMMAND_MAX_TRANSACTION_STEPS,
  StudioScene3dCommandTimeline as StudioBg3dCommandTimeline,
  canonicalizeStudioScene3dCommandState as canonicalizeStudioBg3dCommandState,
  createStudioScene3dReplacementCommand as createStudioBg3dReplacementCommand,
  hashStudioScene3dCommandState as hashStudioBg3dCommandState,
} from "../scene3d/studio-scene3d-command-core";

export type {
  StudioScene3dCommandCommitReceipt as StudioBg3dCommandCommitReceipt,
  StudioScene3dCommandHistoryEntry as StudioBg3dCommandHistoryEntry,
  StudioScene3dCommandRevisionFence as StudioBg3dCommandRevisionFence,
  StudioScene3dCommandSource as StudioBg3dCommandSource,
  StudioScene3dCommandStepReceipt as StudioBg3dCommandStepReceipt,
  StudioScene3dCommandTimelineOptions as StudioBg3dCommandTimelineOptions,
  StudioScene3dCommandTimelineSnapshot as StudioBg3dCommandTimelineSnapshot,
  StudioScene3dCommandTransaction as StudioBg3dCommandTransaction,
  StudioScene3dGestureToken as StudioBg3dGestureToken,
  StudioScene3dStateCommand as StudioBg3dStateCommand,
} from "../scene3d/studio-scene3d-command-core";
