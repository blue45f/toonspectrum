interface StudioLayerCompSynchronizationSnapshot {
  document: object | null;
  room: object | null;
  runtime: { flushAndWaitForDelivery: () => Promise<void> } | null;
}

/** Both sides of a leased edit must settle the binding that accepted the operation. */
export function captureStudioLayerCompSynchronization(
  getSnapshot: () => StudioLayerCompSynchronizationSnapshot,
): () => Promise<void> {
  const captured = getSnapshot();
  const requireCurrentBinding = () => {
    const current = getSnapshot();
    if (current.document !== captured.document || current.room !== captured.room
      || current.runtime !== captured.runtime) {
      throw new Error("공동 편집 문서가 바뀌어 이전 동기화 작업을 계속할 수 없습니다.");
    }
  };
  return async () => {
    requireCurrentBinding();
    if (captured.runtime) {
      await captured.runtime.flushAndWaitForDelivery();
    } else if (captured.room || captured.document) {
      throw new Error("공동 편집 문서의 동기화가 아직 준비되지 않았습니다.");
    }
    requireCurrentBinding();
  };
}

interface StudioLayerCompLeaseSnapshot {
  document: object | null;
  room: object | null;
  pageId: string;
  generation: number;
  resources: readonly string[];
}

/** A delayed completion must never release a replacement operation's resources. */
export function captureStudioLayerCompLeaseRelease(
  getSnapshot: () => StudioLayerCompLeaseSnapshot,
  release: () => void,
): () => void {
  const captured = getSnapshot();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = getSnapshot();
    if (captured.room && current.room === captured.room && current.document === captured.document
      && current.pageId === captured.pageId && current.generation === captured.generation
      && current.resources === captured.resources) release();
  };
}
