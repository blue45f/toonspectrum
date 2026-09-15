import {
  StudioBg3dCommandTimeline,
  createStudioBg3dReplacementCommand,
  hashStudioBg3dCommandState,
  type StudioBg3dCommandCommitReceipt,
  type StudioBg3dCommandSource,
  type StudioBg3dCommandStepReceipt,
} from "./studio-bg3d-command-core";
import {
  createStudioBg3dHistorySnapshot,
  type StudioBg3dHistorySnapshot,
} from "./studio-bg3d-editor-derivations";

export const STUDIO_BG3D_HISTORY_MAX_SNAPSHOTS = 60;

export type StudioBg3dHistoryCommandTimeline =
  StudioBg3dCommandTimeline<StudioBg3dHistorySnapshot>;

export interface StudioBg3dHistoryCommandRefs {
  readonly historyRef: { current: StudioBg3dHistorySnapshot[] };
  readonly historyIndexRef: { current: number };
  readonly historyCommandTimelineRef: {
    current: StudioBg3dHistoryCommandTimeline | null;
  };
}

export interface StudioBg3dHistoryTransitionInput {
  readonly before: StudioBg3dHistorySnapshot;
  readonly after: StudioBg3dHistorySnapshot;
  readonly commandId?: string;
  readonly label?: string;
  readonly source?: StudioBg3dCommandSource;
}

export interface StudioBg3dHistoryTransitionReceipt {
  readonly pendingCommit: StudioBg3dCommandCommitReceipt | null;
  readonly commandCommit: StudioBg3dCommandCommitReceipt;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

function cloneHistorySnapshot(
  snapshot: Readonly<StudioBg3dHistorySnapshot>,
): StudioBg3dHistorySnapshot {
  return createStudioBg3dHistorySnapshot(snapshot);
}

function createTimeline(
  initial: StudioBg3dHistorySnapshot,
): StudioBg3dHistoryCommandTimeline {
  return new StudioBg3dCommandTimeline(initial, {
    clone: cloneHistorySnapshot,
    // 60 retained snapshots means at most 59 transitions plus the checkpoint.
    maxEntries: STUDIO_BG3D_HISTORY_MAX_SNAPSHOTS - 1,
  });
}

function syncLegacyRefs(
  refs: StudioBg3dHistoryCommandRefs,
  timeline: StudioBg3dHistoryCommandTimeline,
): void {
  const retained = timeline.readRetainedStates();
  refs.historyRef.current = retained.states.map(cloneHistorySnapshot);
  refs.historyIndexRef.current = retained.index;
}

function hydrateLegacyTimeline(
  refs: StudioBg3dHistoryCommandRefs,
  fallback: StudioBg3dHistorySnapshot,
): StudioBg3dHistoryCommandTimeline {
  const legacy = refs.historyRef.current;
  const first = legacy[0] ?? fallback;
  const timeline = createTimeline(first);
  for (let index = 1; index < legacy.length; index += 1) {
    timeline.commit(createStudioBg3dReplacementCommand({
      id: "bg3d.history.hydrate-snapshot",
      label: "Hydrate 3D history",
      source: "restore",
      nextState: legacy[index],
      clone: cloneHistorySnapshot,
    }));
  }
  const targetIndex = Math.max(0, Math.min(refs.historyIndexRef.current, legacy.length - 1));
  while (timeline.cursor > targetIndex) timeline.undo();
  refs.historyCommandTimelineRef.current = timeline;
  syncLegacyRefs(refs, timeline);
  return timeline;
}

export function ensureStudioBg3dHistoryCommandTimeline(
  refs: StudioBg3dHistoryCommandRefs,
  fallback: StudioBg3dHistorySnapshot,
): StudioBg3dHistoryCommandTimeline {
  return refs.historyCommandTimelineRef.current ?? hydrateLegacyTimeline(refs, fallback);
}

export function clearStudioBg3dCommandHistory(refs: StudioBg3dHistoryCommandRefs): void {
  // Defensive: restore/readiness harnesses and remount paths may pass a partial refs bag.
  // Never crash production restore effects when a ref object is missing.
  if (refs.historyCommandTimelineRef) {
    refs.historyCommandTimelineRef.current = null;
  }
  if (refs.historyRef) {
    refs.historyRef.current = [];
  }
  if (refs.historyIndexRef) {
    refs.historyIndexRef.current = -1;
  }
}

export function resetStudioBg3dCommandHistory(
  refs: StudioBg3dHistoryCommandRefs,
  initial: StudioBg3dHistorySnapshot,
): StudioBg3dHistoryCommandTimeline {
  const timeline = createTimeline(initial);
  refs.historyCommandTimelineRef.current = timeline;
  syncLegacyRefs(refs, timeline);
  return timeline;
}

export function commitStudioBg3dHistoryTransition(
  refs: StudioBg3dHistoryCommandRefs,
  input: StudioBg3dHistoryTransitionInput,
): StudioBg3dHistoryTransitionReceipt {
  const timeline = ensureStudioBg3dHistoryCommandTimeline(refs, input.before);
  const beforeHash = hashStudioBg3dCommandState(input.before);
  let pendingCommit: StudioBg3dCommandCommitReceipt | null = null;
  if (timeline.stateHash !== beforeHash) {
    pendingCommit = timeline.commit(createStudioBg3dReplacementCommand({
      id: "bg3d.history.flush-pending-edit",
      label: "Commit pending 3D edit",
      source: "system",
      nextState: input.before,
      clone: cloneHistorySnapshot,
    }));
  }
  const commandCommit = timeline.commit(createStudioBg3dReplacementCommand({
    id: input.commandId ?? "bg3d.history.immediate-edit",
    label: input.label ?? "3D edit",
    source: input.source ?? "inspector",
    nextState: input.after,
    clone: cloneHistorySnapshot,
  }));
  syncLegacyRefs(refs, timeline);
  return Object.freeze({
    pendingCommit,
    commandCommit,
    canUndo: timeline.canUndo,
    canRedo: timeline.canRedo,
  });
}

/**
 * Orbit is rebased into the current anchor, while actual object/document edits still become one
 * undoable command. This preserves the existing "undo never jumps camera" product contract.
 */
export function commitStudioBg3dDebouncedHistory(
  refs: StudioBg3dHistoryCommandRefs,
  input: {
    readonly rebasedCurrent: StudioBg3dHistorySnapshot;
    readonly next: StudioBg3dHistorySnapshot;
  },
): StudioBg3dHistoryTransitionReceipt {
  const timeline = ensureStudioBg3dHistoryCommandTimeline(refs, input.rebasedCurrent);
  if (timeline.stateHash !== hashStudioBg3dCommandState(input.rebasedCurrent)) {
    timeline.rebaseCurrent(input.rebasedCurrent);
  }
  const commandCommit = timeline.commit(createStudioBg3dReplacementCommand({
    id: "bg3d.history.commit-debounced-edit",
    label: "3D property edit",
    source: "inspector",
    nextState: input.next,
    clone: cloneHistorySnapshot,
  }));
  syncLegacyRefs(refs, timeline);
  return Object.freeze({
    pendingCommit: null,
    commandCommit,
    canUndo: timeline.canUndo,
    canRedo: timeline.canRedo,
  });
}

export function stepStudioBg3dCommandHistory(
  refs: StudioBg3dHistoryCommandRefs,
  direction: "undo" | "redo",
): StudioBg3dCommandStepReceipt<StudioBg3dHistorySnapshot> | null {
  const timeline = refs.historyCommandTimelineRef.current;
  if (!timeline) return null;
  const receipt = direction === "undo" ? timeline.undo() : timeline.redo();
  syncLegacyRefs(refs, timeline);
  return receipt;
}
