export interface StudioLivingInkProductAdmissionState {
  readonly busy: boolean;
  readonly finalizing: boolean;
  readonly hasActiveStroke: boolean;
  readonly hasCanonicalHandoff: boolean;
}

export interface StudioLivingInkAcceptedAuthority {
  readonly pageId: string;
  readonly replayToken: string;
  readonly canonicalSrc: string;
}

export function studioLivingInkCanReuseAcceptedAuthority(input: Readonly<{
  accepted: StudioLivingInkAcceptedAuthority | null;
  pageId: string;
  replayToken: string;
  canonicalSrc: string;
  coordinatorPageId: string | null;
  coordinatorState: "failed" | "loading" | "ready" | "unavailable";
}>): boolean {
  return input.coordinatorState === "ready"
    && input.coordinatorPageId === input.pageId
    && input.accepted?.pageId === input.pageId
    && input.accepted.replayToken === input.replayToken
    && input.accepted.canonicalSrc === input.canonicalSrc;
}

/**
 * Ink owns a recoverable coloured DrawEl, but the water tool owns no pigment geometry. Saving the
 * latter as a normal vector stroke after a Worker/route failure paints the selected foreground
 * colour and mutates a document that should have remained unchanged.
 */
export function studioLivingInkFailureDisposition(
  mode: "ink" | "water",
): "preserve-document-noop" | "save-vector-fallback" {
  return mode === "water" ? "preserve-document-noop" : "save-vector-fallback";
}

/**
 * A canonical PNG handoff is part of the authoring transaction, not a cosmetic decode. Keeping
 * admission closed until its exact-byte image receipt arrives prevents a delayed Clear/Stroke
 * image from releasing or covering a newer pointer session.
 */
export function studioLivingInkProductAdmissionBlocked(
  state: StudioLivingInkProductAdmissionState,
): boolean {
  return state.busy
    || state.finalizing
    || state.hasActiveStroke
    || state.hasCanonicalHandoff;
}
