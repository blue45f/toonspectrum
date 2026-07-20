import { StudioCommentsPanel } from "./StudioCommentsPanel";

import type {
  StudioLazyPanelStackHandlers,
  StudioLazyPanelStackProps,
} from "./StudioLazyPanelStack";

type StudioCommentsPanelSessionHandlers = Pick<
  StudioLazyPanelStackHandlers,
  | "applyStudioCommentsPanelChange"
  | "disarmAllPixelTools"
  | "markAllStudioCommentThreadsRead"
  | "markStudioCommentThreadRead"
  | "refreshStudioTeamComments"
  | "selectStudioCommentAnchor"
>;

export type StudioCommentsPanelSessionProps = Pick<
  StudioLazyPanelStackProps,
  | "activeCommentAnchor"
  | "collaborationDocumentLocked"
  | "commentsOpen"
  | "isStudioCommentAnchorValid"
  | "setCommentPinArmed"
  | "setCommentsOpen"
  | "setStudioCommentFocusRequest"
  | "setStudioCommentPinsHidden"
  | "studioCommentActor"
  | "studioCommentAnchorOptions"
  | "studioCommentFocusRequest"
  | "studioComments"
  | "studioCommentPinsHidden"
  | "studioCommentSyncError"
  | "studioLegacyCommentThreadIdSet"
  | "studioTeamCommentCapabilities"
  | "studioTeamCommentsSyncing"
  | "studioTeamCommentsWorkId"
  | "studioTeamUnreadCommentIdSet"
  | "workId"
> & {
  stableHandlers: StudioCommentsPanelSessionHandlers;
};

/**
 * Keeps comment mutation retries and drafts alive after the review rail has been opened once.
 * This session is the only lazy boundary; the stateful panel itself is a static child so opening
 * comments never creates a second, sequential dynamic-import waterfall.
 */
export function StudioCommentsPanelSession({
  activeCommentAnchor,
  collaborationDocumentLocked,
  commentsOpen,
  isStudioCommentAnchorValid,
  setCommentPinArmed,
  setCommentsOpen,
  setStudioCommentFocusRequest,
  setStudioCommentPinsHidden,
  stableHandlers,
  studioCommentActor,
  studioCommentAnchorOptions,
  studioCommentFocusRequest,
  studioComments,
  studioCommentPinsHidden,
  studioCommentSyncError,
  studioLegacyCommentThreadIdSet,
  studioTeamCommentCapabilities,
  studioTeamCommentsSyncing,
  studioTeamCommentsWorkId,
  studioTeamUnreadCommentIdSet,
  workId,
}: StudioCommentsPanelSessionProps) {
  const {
    applyStudioCommentsPanelChange,
    disarmAllPixelTools,
    markAllStudioCommentThreadsRead,
    markStudioCommentThreadRead,
    refreshStudioTeamComments,
    selectStudioCommentAnchor,
  } = stableHandlers;

  return (
    <StudioCommentsPanel
      open={commentsOpen}
      onClose={() => setCommentsOpen(false)}
      document={studioComments}
      onChange={applyStudioCommentsPanelChange}
      activeAnchor={activeCommentAnchor}
      currentActor={studioCommentActor}
      anchorOptions={studioCommentAnchorOptions}
      isAnchorValid={isStudioCommentAnchorValid}
      onSelectAnchor={selectStudioCommentAnchor}
      focusRequest={studioCommentFocusRequest}
      onFocusRequestHandled={(requestId) => {
        setStudioCommentFocusRequest((current) => current?.requestId === requestId
          ? null
          : current);
      }}
      onArmPinPlacement={() => {
        // Close the rail, then arm exactly one canvas click for a point anchor.
        disarmAllPixelTools();
        setCommentsOpen(false);
        setCommentPinArmed(true);
      }}
      capabilities={workId
        ? {
            create: studioTeamCommentCapabilities?.comment === true,
            reply: studioTeamCommentCapabilities?.comment === true,
            editOwn: false,
            deleteOwn: false,
            resolve: studioTeamCommentCapabilities?.resolve === true,
            assign: false,
          }
        : {
            create: !collaborationDocumentLocked,
            reply: !collaborationDocumentLocked,
            editOwn: !collaborationDocumentLocked,
            deleteOwn: !collaborationDocumentLocked,
            resolve: !collaborationDocumentLocked,
            assign: !collaborationDocumentLocked,
          }}
      mutationDisabledReason={workId && !studioTeamCommentCapabilities
        ? "팀 댓글 권한과 기록을 확인하는 중이에요."
        : workId && !studioTeamCommentCapabilities?.comment
          ? "열람자는 댓글을 읽고 위치로 이동할 수 있지만 작성할 수는 없어요."
          : undefined}
      syncError={studioCommentSyncError ?? undefined}
      syncing={studioTeamCommentsSyncing}
      onRefresh={studioTeamCommentsWorkId ? refreshStudioTeamComments : undefined}
      storageMode={workId ? "team" : "document"}
      unreadThreadIds={studioTeamUnreadCommentIdSet}
      readOnlyThreadIds={studioLegacyCommentThreadIdSet}
      pinsHidden={studioCommentPinsHidden}
      onTogglePinsHidden={() => setStudioCommentPinsHidden((hidden) => !hidden)}
      onMarkThreadRead={studioTeamCommentsWorkId && studioTeamCommentCapabilities?.view
        ? markStudioCommentThreadRead
        : undefined}
      onMarkAllRead={studioTeamCommentsWorkId && studioTeamCommentCapabilities?.view
        ? markAllStudioCommentThreadsRead
        : undefined}
    />
  );
}
