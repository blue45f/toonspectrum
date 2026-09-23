import {
  createStudioLiveResourceLeaseController,
  type StudioLiveResourceLeaseController,
} from "../live/createStudioLiveResourceLeaseController";
import type { StudioCanvasMutationIntent } from "../live/studio-live-canvas-mutation-gate";
import type { StudioLiveRoom } from "../live/studio-live-collaboration-room";
import type { StudioOfflineBranchRuntime } from "./studio-offline-branch-runtime";

interface MutableRef<T> {
  current: T;
}

export type CreateStudioOfflineCapableResourceLeaseControllerOptions =
  Parameters<typeof createStudioLiveResourceLeaseController>[0] & {
    readonly runtimeRef: MutableRef<{
      readonly offlineBranch?: StudioOfflineBranchRuntime | null;
    } | null>;
    readonly reportNotice: (message: string | null) => void;
  };

function requiresExistingAuthority(
  elementIds: readonly string[] | null | undefined,
  intent: StudioCanvasMutationIntent,
): boolean {
  return intent !== "append-stroke" || (elementIds?.length ?? 0) > 0;
}

function requiresOfflineAuthorityFallback(
  room: StudioLiveRoom | null,
  elementIds: readonly string[] | null | undefined,
  intent: StudioCanvasMutationIntent,
): boolean {
  if (!requiresExistingAuthority(elementIds, intent)) return false;
  if (!room) return true;
  if (room.mode !== "server") return false;
  return !room.ready
    || room.canvasLockPolicy === "append-only"
    || room.serverLockSupported === false;
}

function canUseOfflineProposal(
  room: StudioLiveRoom | null,
  runtime: StudioOfflineBranchRuntime | null,
  elementIds: readonly string[] | null | undefined,
  intent: StudioCanvasMutationIntent,
): runtime is StudioOfflineBranchRuntime {
  return Boolean(
    runtime
    && requiresOfflineAuthorityFallback(room, elementIds, intent),
  );
}
export function createStudioOfflineCapableResourceLeaseController({
  runtimeRef,
  reportNotice,
  ...baseOptions
}: CreateStudioOfflineCapableResourceLeaseControllerOptions): StudioLiveResourceLeaseController {
  const base = createStudioLiveResourceLeaseController(baseOptions);
  const { pageId, reportError, roomRef } = baseOptions;
  let proposalRuntime: StudioOfflineBranchRuntime | null = null;

  const beginProposal = (
    elementIds: readonly string[] | null | undefined,
    intent: StudioCanvasMutationIntent,
  ): boolean => {
    const runtime = runtimeRef.current?.offlineBranch ?? null;
    if (!canUseOfflineProposal(roomRef.current, runtime, elementIds, intent)) return false;
    if (proposalRuntime && proposalRuntime !== runtime) {
      proposalRuntime.endProposal();
      proposalRuntime = null;
      reportNotice(null);
    }
    if (!proposalRuntime && runtime.beginProposal({
      pageId,
      elementIds: [...(elementIds ?? [])],
      intent,
    })) {
      proposalRuntime = runtime;
    }
    if (!proposalRuntime) return false;
    reportError(null);
    reportNotice(
      "서버 편집 잠금 없이 로컬 오프라인 제안으로 작업합니다. 재연결 후 정본과 비교해 합칩니다.",
    );
    return true;
  };

  const begin = (
    elementIds?: readonly string[] | null,
    intent: StudioCanvasMutationIntent = "drag",
  ): boolean => {
    if (beginProposal(elementIds, intent)) return true;
    if (requiresOfflineAuthorityFallback(roomRef.current, elementIds, intent)) {
      reportError(
        "서버 편집 잠금 또는 오프라인 제안 권위를 준비한 뒤 기존 요소를 수정해 주세요.",
      );
      return false;
    }
    return base.begin(elementIds, intent);
  };
  const beginAsync = async (
    elementIds?: readonly string[] | null,
    intent: StudioCanvasMutationIntent = "transform",
  ): Promise<boolean> => {
    if (beginProposal(elementIds, intent)) return true;
    if (requiresOfflineAuthorityFallback(roomRef.current, elementIds, intent)) {
      reportError(
        "서버 편집 잠금 또는 오프라인 제안 권위를 준비한 뒤 기존 요소를 수정해 주세요.",
      );
      return false;
    }
    return base.beginAsync(elementIds, intent);
  };

  const end = (): void => {
    if (proposalRuntime) {
      proposalRuntime.endProposal();
      proposalRuntime = null;
      reportNotice(null);
    }
    base.end();
  };

  return { begin, beginAsync, end };
}
