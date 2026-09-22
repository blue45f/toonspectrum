import {
  gateStudioCanvasMutation,
  type StudioCanvasMutationIntent,
} from "./studio-live-canvas-mutation-gate";
import {
  planStudioLiveHeldResourceReplace,
  selfHoldsStudioLiveLock,
  studioLiveMutationResources,
} from "./studio-live-mutation-guard";
import {
  releaseStudioLiveMutationLocks,
  replaceStudioLiveMutationLocks,
} from "./studio-live-mutation-lock-coordinator";

import type { StudioLiveRoom } from "./studio-live-collaboration-room";

interface MutableRef<T> {
  current: T;
}

interface PendingStudioLiveMutation {
  readonly room: StudioLiveRoom;
  readonly key: string;
  readonly promise: Promise<boolean>;
}

interface CreateStudioLiveResourceLeaseControllerOptions {
  readonly heldResourcesRef: MutableRef<string[]>;
  readonly mutationGenerationRef: MutableRef<number>;
  readonly pageId: string;
  readonly pendingMutationRef: MutableRef<PendingStudioLiveMutation | null>;
  readonly reportError: (message: string | null) => void;
  readonly roomRef: MutableRef<StudioLiveRoom | null>;
}

export interface StudioLiveResourceLeaseController {
  readonly begin: (
    elementIds?: readonly string[] | null,
    intent?: StudioCanvasMutationIntent,
  ) => boolean;
  readonly beginAsync: (
    elementIds?: readonly string[] | null,
    intent?: StudioCanvasMutationIntent,
  ) => Promise<boolean>;
  readonly end: () => void;
}

/**
 * Coordinates page/element mutation leases without exposing lock protocol details to canvas UI.
 * The controller preserves the synchronous local-preview path and the serialized authoritative
 * server-room path while keeping all held-resource bookkeeping in the live-session runtime.
 */
export function createStudioLiveResourceLeaseController({
  heldResourcesRef,
  mutationGenerationRef,
  pageId,
  pendingMutationRef,
  reportError,
  roomRef,
}: CreateStudioLiveResourceLeaseControllerOptions): StudioLiveResourceLeaseController {
  const resourcesFor = (elementIds?: readonly string[] | null): string[] =>
    studioLiveMutationResources({ pageId, elementIds });

  const canStartEdit = (room: StudioLiveRoom): boolean => {
    if (
      room.ready
      && ["owner", "admin", "editor"].includes(room.participant.role)
    ) return true;
    reportError("편집 연결과 권한을 확인한 뒤 다시 시도해 주세요.");
    return false;
  };

  const preflight = (
    room: StudioLiveRoom,
    elementIds?: readonly string[] | null,
    intent: StudioCanvasMutationIntent = "transform",
  ): boolean => {
    const decision = gateStudioCanvasMutation({
      locks: room.getLocks(),
      pageId,
      elementIds,
      selfSessionId: room.participant.sessionId,
      intent,
      allowSelectWithoutLease: false,
    });
    if (decision.ok) return true;
    reportError(decision.reason);
    return false;
  };

  const usesSynchronousLocks = (room: StudioLiveRoom): boolean =>
    room.mode !== "server" || room.canvasLockPolicy === "cooperative";

  // A genuinely new stroke never mutates an existing shared resource. Keep it off the lock path
  // in peer-only rooms so mesh setup/reconnect cannot interrupt continuous pen input.
  const peerOnlyDecision = (
    room: StudioLiveRoom,
    elementIds: readonly string[] | null | undefined,
    intent: StudioCanvasMutationIntent,
  ): boolean | undefined => {
    if (room.mode !== "server") return undefined;
    const independentAppend =
      intent === "append-stroke" && (elementIds?.length ?? 0) === 0;
    if (room.canvasLockPolicy === "cooperative") {
      if (!independentAppend) return undefined;
      reportError(null);
      return true;
    }
    if (room.canvasLockPolicy !== "append-only") return undefined;
    if (!independentAppend) {
      reportError("현재 연결에서는 새 획을 추가할 수 있습니다. 기존 요소 수정은 편집 잠금 서버 연결이 필요합니다.");
      return false;
    }
    reportError(null);
    return true;
  };

  const beginAsync = async (
    elementIds?: readonly string[] | null,
    intent: StudioCanvasMutationIntent = "transform",
  ): Promise<boolean> => {
    const room = roomRef.current;
    if (!room) return true;
    if (!canStartEdit(room)) return false;
    if (!preflight(room, elementIds, intent)) return false;
    const peerOnly = peerOnlyDecision(room, elementIds, intent);
    if (peerOnly !== undefined) return peerOnly;
    if (
      room.mode === "server"
      && !usesSynchronousLocks(room)
      && room.serverLockSupported === false
    ) {
      reportError("편집 잠금 서버를 사용할 수 없습니다. 연결 설정을 확인해 주세요.");
      return false;
    }
    const resources = resourcesFor(elementIds);
    const key = JSON.stringify(resources);
    const pending = pendingMutationRef.current;
    if (pending) {
      if (pending.room === room && pending.key === key) return pending.promise;
      reportError("다른 편집 잠금을 확인하고 있어요. 확인이 끝난 뒤 다시 시도해 주세요.");
      return false;
    }

    const generation = ++mutationGenerationRef.current;
    const operation = replaceStudioLiveMutationLocks({
      room,
      previouslyHeld: heldResourcesRef.current,
      nextResources: resources,
    }).then((result) => {
      if (generation !== mutationGenerationRef.current) {
        if (result.ok) releaseStudioLiveMutationLocks(room, result.held);
        return false;
      }
      heldResourcesRef.current = [...result.held];
      if (!result.ok) {
        reportError(result.failure.message);
        return false;
      }
      reportError(null);
      return true;
    });
    const entry = { room, key, promise: operation };
    pendingMutationRef.current = entry;
    const clearPending = (): void => {
      if (pendingMutationRef.current === entry) pendingMutationRef.current = null;
    };
    // `finally()` creates a second rejecting promise when an adapter throws. Settle both paths
    // explicitly so one transport failure cannot become an unhandled browser rejection.
    void operation.then(clearPending, clearPending);
    return operation;
  };

  const begin = (
    elementIds?: readonly string[] | null,
    intent: StudioCanvasMutationIntent = "drag",
  ): boolean => {
    const room = roomRef.current;
    if (!room) return true;
    if (!canStartEdit(room)) return false;
    if (!preflight(room, elementIds, intent)) return false;
    const peerOnly = peerOnlyDecision(room, elementIds, intent);
    if (peerOnly !== undefined) return peerOnly;
    if (
      room.mode === "server"
      && !usesSynchronousLocks(room)
      && room.serverLockSupported === false
    ) {
      reportError("편집 잠금 서버를 사용할 수 없습니다. 연결 설정을 확인해 주세요.");
      return false;
    }
    const resources = resourcesFor(elementIds);

    // Local and cooperative rooms arbitrate synchronously. Claim/renew the complete next set
    // before releasing obsolete resources so a failed multi-selection never leaves a partial edit.
    // Required server rooms still wait for correlated authoritative acknowledgements below.
    if (usesSynchronousLocks(room)) {
      const previous = [...heldResourcesRef.current];
      const previousSet = new Set(previous);
      const newlyClaimed: string[] = [];
      for (const resource of resources) {
        if (room.claimLock(resource)) {
          if (!previousSet.has(resource)) newlyClaimed.push(resource);
          continue;
        }
        releaseStudioLiveMutationLocks(room, newlyClaimed);
        heldResourcesRef.current = previous;
        if (preflight(room, elementIds, intent)) {
          reportError(
            "협업 연결이 불안정하여 편집 잠금을 공유하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
          );
        }
        return false;
      }
      const plan = planStudioLiveHeldResourceReplace(previous, resources);
      for (const resource of plan.toRelease) room.releaseLock(resource);
      heldResourcesRef.current = [...plan.held];
      reportError(null);
      return true;
    }

    const locks = room.getLocks();
    if (
      resources.every((resource) =>
        selfHoldsStudioLiveLock(locks, resource, room.participant.sessionId))
    ) {
      const plan = planStudioLiveHeldResourceReplace(heldResourcesRef.current, resources);
      for (const resource of plan.toRelease) room.releaseLock(resource);
      heldResourcesRef.current = [...plan.held];
      return true;
    }

    const key = JSON.stringify(resources);
    const pending = pendingMutationRef.current;
    if (!pending || pending.room !== room || pending.key !== key) {
      void beginAsync(elementIds, intent);
    }
    // Pending acquisition is not permission to mutate an existing shared element.
    return false;
  };

  const end = (): void => {
    const room = roomRef.current;
    ++mutationGenerationRef.current;
    heldResourcesRef.current = [
      ...releaseStudioLiveMutationLocks(room, heldResourcesRef.current),
    ];
  };

  return { begin, beginAsync, end };
}
