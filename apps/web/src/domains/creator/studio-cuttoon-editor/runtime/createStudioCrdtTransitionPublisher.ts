import {
  canMirrorStudioOfflinePendingStrokeTransition,
  stageStudioOfflineSceneTransition,
} from "../../offline-branch/studio-offline-host-integration";

import type { StudioCrdtDocument } from "../../live/studio-crdt-document";
import type { StudioCrdtSceneGraphRuntime } from "../../live/StudioLiveCollaborationProvider";
import type { PageState } from "../../studio-page-state";

export interface StudioCrdtTransitionPublisherInput {
  readonly actorId: string | null;
  readonly automaticRasterPublicationEnabled: boolean;
  readonly getDocument: () => StudioCrdtDocument | null;
  readonly getRuntime: () => StudioCrdtSceneGraphRuntime | null;
  readonly reportError: (message: string) => void;
  readonly reportNotice: (message: string) => void;
}

export interface StudioCrdtTransitionPublisher {
  readonly publishSceneTransition: (
    previousPages: readonly PageState[],
    nextPages: readonly PageState[],
    registerNewDraws?: boolean,
    offlineRealtimeStrokeIds?: readonly string[],
  ) => boolean;
  readonly publishHistoryTransition: (
    previousPages: readonly PageState[],
    nextPages: readonly PageState[],
    offlineRealtimeStrokeIds?: readonly string[],
  ) => boolean;
}

export function createStudioCrdtTransitionPublisher(
  input: StudioCrdtTransitionPublisherInput,
): StudioCrdtTransitionPublisher {
  const publishSceneTransition = (
    previousPages: readonly PageState[],
    nextPages: readonly PageState[],
    registerNewDraws = true,
    offlineRealtimeStrokeIds: readonly string[] = [],
  ): boolean => {
    const document = input.getDocument();
    const runtime = input.getRuntime();
    const stagedOffline = stageStudioOfflineSceneTransition(
      runtime,
      previousPages,
      nextPages,
      input.reportNotice,
    );
    const mirrorOfflinePendingStroke = stagedOffline === true
      && canMirrorStudioOfflinePendingStrokeTransition(
        runtime,
        previousPages,
        nextPages,
        offlineRealtimeStrokeIds,
      );
    if (stagedOffline !== null && !mirrorOfflinePendingStroke) return stagedOffline;
    if (!document && !runtime) return true;
    if (!document || !runtime) return false;
    try {
      if (input.automaticRasterPublicationEnabled && input.actorId) {
        runtime.publishRasterHistoryTransition({
          document,
          previousPages,
          nextPages,
          actorId: input.actorId,
        });
      }
      runtime.publish(document, previousPages, nextPages, { registerNewDraws });
      return true;
    } catch (cause) {
      input.reportError(
        cause instanceof Error
          ? `실시간 장면 동기화: ${cause.message}`
          : "장면 요소와 페이지 순서를 팀 문서에 반영하지 못했습니다.",
      );
      return false;
    }
  };

  const publishHistoryTransition = (
    previousPages: readonly PageState[],
    nextPages: readonly PageState[],
    offlineRealtimeStrokeIds: readonly string[] = [],
  ): boolean => publishSceneTransition(
    previousPages,
    nextPages,
    false,
    offlineRealtimeStrokeIds,
  );

  return { publishHistoryTransition, publishSceneTransition };
}
