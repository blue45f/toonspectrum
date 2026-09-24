import { useRef } from "react";

import {
  appendStudioRetainedStrokeRealtimeHistoryRange,
  studioRetainedStrokeRealtimeIdsForRedo,
  studioRetainedStrokeRealtimeIdsForUndo,
  truncateStudioRetainedStrokeRealtimeHistoryRanges,
  type StudioRetainedStrokeRealtimeHistoryRange,
} from "../../studio-retained-stroke-history";

type PendingStrokeLike = {
  readonly strokes: readonly { readonly id: string }[];
} | null;

export interface StudioRetainedStrokeRealtimeHistoryController {
  readonly recordBatch: (
    batch: Exclude<PendingStrokeLike, null>,
    finalIndex: number,
  ) => void;
  readonly truncate: (historyIndex: number) => void;
  readonly idsForUndo: (
    pendingBeforeUndo: PendingStrokeLike,
    pendingAfterUndo: PendingStrokeLike,
    undoIndex: number,
  ) => readonly string[];
  readonly idsForRedo: (
    historyIndex: number,
    nextIndex: number,
  ) => readonly string[];
}

export function useStudioRetainedStrokeRealtimeHistory():
StudioRetainedStrokeRealtimeHistoryController {
  const rangesRef = useRef<readonly StudioRetainedStrokeRealtimeHistoryRange[]>([]);

  return {
    recordBatch(batch, finalIndex) {
      rangesRef.current = appendStudioRetainedStrokeRealtimeHistoryRange(
        rangesRef.current,
        batch.strokes.map((stroke) => stroke.id),
        finalIndex,
      );
    },
    truncate(historyIndex) {
      rangesRef.current = truncateStudioRetainedStrokeRealtimeHistoryRanges(
        rangesRef.current,
        historyIndex,
      );
    },
    idsForUndo(pendingBeforeUndo, pendingAfterUndo, undoIndex) {
      if (
        pendingBeforeUndo
        && pendingAfterUndo === null
        && pendingBeforeUndo.strokes.length > 0
      ) {
        return pendingBeforeUndo.strokes.map((stroke) => stroke.id);
      }
      return studioRetainedStrokeRealtimeIdsForUndo(rangesRef.current, undoIndex);
    },
    idsForRedo(historyIndex, nextIndex) {
      return studioRetainedStrokeRealtimeIdsForRedo(
        rangesRef.current,
        historyIndex,
        nextIndex,
      );
    },
  };
}
