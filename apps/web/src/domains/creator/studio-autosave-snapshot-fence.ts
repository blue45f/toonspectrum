export interface StudioAutosaveSnapshotFrontier {
  readonly generation: number;
  readonly pendingFingerprint: string;
  readonly session: unknown;
}

/** A debounce or async preparation may outlive the snapshot it captured. Never publish that
 * snapshot over a newer pointer-up checkpoint, or acknowledge it in a different document. */
export function createStudioAutosaveSnapshotFence(
  scheduled: StudioAutosaveSnapshotFrontier,
  readCurrent: () => StudioAutosaveSnapshotFrontier,
): () => boolean {
  return () => {
    const current = readCurrent();
    return scheduled.generation === current.generation
      && scheduled.pendingFingerprint === current.pendingFingerprint
      && scheduled.session === current.session;
  };
}
