import {
  StudioUnifiedAssetToolPopoverContent,
  type StudioUnifiedAssetToolPopoverContentProps,
} from "./StudioUnifiedAssetToolPopoverContent";
import { StudioInsertHubDirectDragBoundary } from "./StudioInsertHubDirectDragBoundary";

/**
 * Progressive enhancement wrapper for the existing insertion surface.
 * The owned click, keyboard, Undo, save, provenance, and review-lock paths remain
 * inside StudioUnifiedAssetToolPopoverContent; this layer only writes established
 * drag MIME envelopes when a supported result card starts a browser drag.
 */
export function StudioUnifiedAssetToolPopoverContentDirectDrag({
  toolBelt,
}: StudioUnifiedAssetToolPopoverContentProps) {
  return (
    <StudioInsertHubDirectDragBoundary toolBelt={toolBelt}>
      <StudioUnifiedAssetToolPopoverContent toolBelt={toolBelt} />
    </StudioInsertHubDirectDragBoundary>
  );
}
