export type StudioBg3dFrameLoop = "always" | "demand";

export interface StudioBg3dRenderActivity {
  readonly modelAnimationPlaying: boolean;
  readonly physicsPlaying: boolean;
  readonly transforming: boolean;
  readonly capturing: boolean;
  readonly batchRendering: boolean;
}

/** Static scene composition is event-driven; only time-varying local work receives a 60fps loop. */
export function resolveStudioBg3dFrameLoop(
  activity: StudioBg3dRenderActivity,
): StudioBg3dFrameLoop {
  return Object.values(activity).some(Boolean) ? "always" : "demand";
}
