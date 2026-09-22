import { useRef } from "react";

import type { StudioCommittedInkSurfaceHandoff } from "./studio-committed-ink-handoff-coordinator";
import {
  createStudioSkiaCommittedInkHostRuntime,
  type StudioSkiaCommittedInkHostRuntime,
} from "./studio-skia-committed-ink-bridge";

type CurrentRef<T> = { current: T };

/**
 * Owns ephemeral Skia handoff receipts and retry counters outside the editor host.
 * Document, Undo, storage, export and permission authority remain unchanged.
 */
export function useStudioSkiaCommittedInkHostRuntime(
  handoffsRef: CurrentRef<StudioCommittedInkSurfaceHandoff[]>,
  wakeRef: CurrentRef<() => void>,
): StudioSkiaCommittedInkHostRuntime {
  const runtimeRef = useRef<StudioSkiaCommittedInkHostRuntime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = createStudioSkiaCommittedInkHostRuntime({
      readQueue: () => handoffsRef.current,
      wake: () => wakeRef.current(),
    });
  }
  return runtimeRef.current;
}
