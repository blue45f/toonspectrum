import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

const exportOwners = new WeakMap<object, symbol>();

export type CharacterExportEdge = 1024 | 2048 | 4096;
export const CHARACTER_EXPORT_EDGES: readonly CharacterExportEdge[] = [1024, 2048, 4096];

/** Keep the mounted camera's aspect; the UI always discloses the separate PSD budget. */
export function characterExportSize(width: number, height: number, edge: CharacterExportEdge) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("내보낼 화면 크기를 읽지 못했습니다.");
  }
  const scale = edge / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface CharacterExportSession {
  readonly signal: AbortSignal;
  assertCurrent(): void;
  cancel(): void;
  release(): void;
}

/** Shares the poser's synchronous capture authority with insert, thumbnails, and pose sharing. */
export function acquireCharacterExportSession(
  host: StudioVrmPoserHost,
  readHost: () => StudioVrmPoserHost,
): CharacterExportSession {
  if (host.pendingPersistentIkCommandRef?.current || host.persistentIkReconciling
    || host.jointHandleInteracting || host.isViewportHandIkDragging || host.texturePaintStrokeActive) {
    throw new Error("관절 조절이나 드로잉을 마친 뒤에 내보낼 수 있습니다.");
  }
  if (!host.acquireVrmCaptureOperation("export")) {
    throw new Error("다른 캡처가 끝난 뒤에 내보낼 수 있습니다.");
  }
  const owner = Symbol("character-export");
  const operationRef = host.captureOperationRef;
  exportOwners.set(operationRef, owner);
  const controller = new AbortController();
  const capture = { ...host.captureRef.current };
  const model = host.vrm;
  const modelId = host.activeModelId;
  const visualIdentity = host.captureVisualAuthorityRef?.current?.identity;
  const paintRuntime = host.texturePaintRuntimeRef?.current;
  const paintRevision = paintRuntime?.getContentRevision();
  const previousPaintLock = host.texturePaintMutationBlockedRef?.current ?? false;
  const previousWardrobeLock = host.wardrobeMutationBlockedRef?.current ?? false;
  let released = false;
  if (host.texturePaintMutationBlockedRef) host.texturePaintMutationBlockedRef.current = true;
  if (host.wardrobeMutationBlockedRef) host.wardrobeMutationBlockedRef.current = true;
  host.setIsCapturing(true);

  const release = () => {
    if (released) return;
    released = true;
    // Model disposal resets capture authority. Never unlock a newer capture's transaction.
    if (exportOwners.get(operationRef) !== owner) return;
    exportOwners.delete(operationRef);
    if (operationRef.current !== "export") return;
    if (host.texturePaintMutationBlockedRef) host.texturePaintMutationBlockedRef.current = previousPaintLock;
    if (host.wardrobeMutationBlockedRef) host.wardrobeMutationBlockedRef.current = previousWardrobeLock;
    host.releaseVrmCaptureOperation("export");
    host.setIsCapturing(false);
  };
  return {
    signal: controller.signal,
    assertCurrent() {
      if (controller.signal.aborted) throw new DOMException("내보내기를 취소했습니다.", "AbortError");
      const current = readHost();
      if (current.vrm !== model || current.activeModelId !== modelId
        || current.captureRef?.current?.gl !== capture.gl
        || current.captureRef?.current?.scene !== capture.scene
        || current.captureRef?.current?.camera !== capture.camera
        || exportOwners.get(operationRef) !== owner
        || current.captureOperationRef !== operationRef
        || operationRef.current !== "export"
        || current.captureVisualAuthorityRef?.current?.identity !== visualIdentity
        || current.texturePaintRuntimeRef?.current !== paintRuntime
        || paintRuntime?.getContentRevision() !== paintRevision) {
        throw new Error("내보내는 동안 캐릭터가 바뀌었습니다. 현재 상태로 다시 내보내 주세요.");
      }
    },
    // The caller releases only after every temporary scene mutation is restored.
    cancel() { controller.abort(); },
    release,
  };
}
