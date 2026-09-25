export interface StudioCinematicCanvasWelcomeVisibilityInput {
  readonly elementCount: number;
  readonly sourceHydrationPending: boolean;
  readonly workHydrationFailed: boolean;
  readonly collaborationDocumentUnavailable: boolean;
  readonly joinedStudioLiveJam: boolean;
}

/** A joined collaborator must see the shared document surface, never the local empty-page launcher. */
export function shouldShowStudioCinematicCanvasWelcome({
  elementCount,
  sourceHydrationPending,
  workHydrationFailed,
  collaborationDocumentUnavailable,
  joinedStudioLiveJam,
}: StudioCinematicCanvasWelcomeVisibilityInput): boolean {
  return elementCount === 0
    && !sourceHydrationPending
    && !workHydrationFailed
    && !collaborationDocumentUnavailable
    && !joinedStudioLiveJam;
}
