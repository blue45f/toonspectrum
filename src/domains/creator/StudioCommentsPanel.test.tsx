import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioCommentsPanel.tsx", import.meta.url), "utf8");
const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const studioLazyPanelStackSource = readFileSync(
  new URL("./StudioLazyPanelStack.tsx", import.meta.url),
  "utf8"
);
const studioCommentsPanelSessionSource = readFileSync(
  new URL("./StudioCommentsPanelSession.tsx", import.meta.url),
  "utf8"
);
const studioCanvasOverlaySource = readFileSync(
  new URL("./StudioLiveCanvasOverlay.tsx", import.meta.url),
  "utf8"
);
const studioPointCommentComposerSource = readFileSync(
  new URL("./StudioPointCommentComposer.tsx", import.meta.url),
  "utf8"
);
const studioPageLazyUiSource = readFileSync(
  new URL("./studio-page-lazy-ui.ts", import.meta.url),
  "utf8"
);

describe("StudioCommentsPanel review rail contract", () => {
  it("coexists with the canvas instead of blocking the viewport as a modal", () => {
    expect(source).toContain('data-studio-comments-rail="true"');
    expect(source).toContain("sm:right-3 sm:left-auto");
    expect(source).toContain("h-[min(62dvh,36rem)]");
    expect(source).toContain("bottom-[calc(7rem+env(safe-area-inset-bottom))]");
    expect(source).not.toContain('aria-modal="true"');
    expect(source).not.toContain("body.style.overflow");
    expect(source).toContain('setComposerExpanded(false);');
    expect(source).not.toContain("hasThreadAtAnchor");
    expect(source).not.toContain("FOCUSABLE_SELECTOR");
  });

  it("keeps keyboard close/send and focus restoration semantics", () => {
    expect(source).toContain('event.key !== "Escape"');
    expect(source).toContain("event.nativeEvent.isComposing");
    expect(source.match(/nativeEvent\.isComposing/g)?.length).toBeGreaterThanOrEqual(5);
    expect(source).toContain("reviewRail?.contains(activeElement)");
    expect(source).toContain("focusReviewRail");
    expect(source).toContain("event.currentTarget.form?.requestSubmit()");
    expect(source).toContain("<dialog");
    expect(source).toContain("aria-labelledby={titleId}");
    expect(source).toContain("aria-describedby={descriptionId}");
    expect(source).toContain('id="studio-comments-review-dialog"');
  });

  it("opens a compact single-click point composer instead of forcing the full review rail", () => {
    expect(studioPageSource).toContain("setPointCommentComposer({");
    expect(studioPageSource).toContain('commentId: createStudioCommentMessageId("comment")');
    expect(studioPageSource).toContain("setCommentsOpen(false)");
    expect(studioPageSource).toContain("submitStudioPointComment");
    expect(studioPointCommentComposerSource).toContain(
      'data-studio-point-comment-composer="true"'
    );
    expect(studioPointCommentComposerSource).not.toContain(
      'data-studio-point-comment-backdrop="true"'
    );
    expect(studioPointCommentComposerSource).toContain(
      "data-studio-point-comment-layout={position.mode}"
    );
    expect(studioPointCommentComposerSource).not.toContain('aria-modal="true"');
    expect(studioPointCommentComposerSource).toContain('aria-label="위치 댓글 내용"');
    expect(studioPointCommentComposerSource).toContain("globalThis.visualViewport");
    expect(studioPointCommentComposerSource).toContain(
      "event.currentTarget.form?.requestSubmit()"
    );
    expect(studioCanvasOverlaySource).toContain('data-studio-comment-pin-preview="true"');
    expect(studioPageSource).toContain("studioCommentMutationReceiptOwnsDraft(");
    expect(studioPageSource).toContain("restoreStudioCanvasViewportFocus");
    expect(studioPageSource).toContain("if (!setStudioComments(nextDocument)) return false");
  });

  it("keeps Magma-style comment placement active after success but exits on explicit cancel", () => {
    const submitStart = studioPageSource.indexOf("async function submitStudioPointComment");
    const submitEnd = studioPageSource.indexOf(
      "async function markStudioCommentThreadRead",
      submitStart
    );
    const submitSource = studioPageSource.slice(submitStart, submitEnd);
    const cancelStart = studioPageSource.indexOf("function cancelStudioPointCommentComposer");
    const cancelEnd = studioPageSource.indexOf("useEffect(() =>", cancelStart);
    const cancelSource = studioPageSource.slice(cancelStart, cancelEnd);
    const disarmStart = studioPageSource.indexOf("function disarmAllPixelTools()");
    const disarmEnd = studioPageSource.indexOf(
      "function finishPolyLassoSession()",
      disarmStart
    );
    const disarmSource = studioPageSource.slice(disarmStart, disarmEnd);

    expect(studioPageSource).toContain("commentPlacementPhaseRef");
    expect(studioPageSource).toContain('const commentPlacementActive = commentPlacementPhase !== "idle"');
    expect(studioPageSource.match(/commentPinArmed=\{commentPlacementActive\}/gu)).toHaveLength(2);
    expect(studioPageSource).toContain('setStudioCommentPlacementPhase("placing")');
    expect(studioPageSource).toContain('setStudioCommentPlacementPhase("composing")');
    expect(studioPageSource).toContain("stopStudioCommentPlacementSession");
    expect(submitSource).toContain(
      'commentPlacementPhaseRef.current === "composing"'
    );
    expect(submitSource).toContain(
      'setStudioCommentPlacementPhase(continuePlacement ? "placing" : "idle")'
    );
    expect(submitSource).toContain("다음 위치를 선택하세요");
    expect(cancelSource).toContain("stopStudioCommentPlacementSession()");
    expect(cancelSource).not.toContain('setStudioCommentPlacementPhase("placing")');
    expect(disarmSource).toContain("stopStudioCommentPlacementSession()");
    expect(studioPageSource).toMatch(
      /else if \(commentPinArmed\) \{[\s\S]*?stopStudioCommentPlacementSession\(\)/u
    );
    expect(studioPageSource).toMatch(
      /if \(viewTool !== null\) \{[\s\S]*?stopStudioCommentPlacementEffect\(\)/u
    );
    expect(studioPageSource).toContain(
      'if (!e.repeat && matchStudioShortcut(sc["tool-comment"], e))'
    );
  });

  it("moves a single point pin directly with permission and activity-sequence fences", () => {
    const reanchorStart = studioPageSource.indexOf("async function reanchorStudioCommentPin");
    const reanchorEnd = studioPageSource.indexOf(
      "function openStudioCommentThreadPopover",
      reanchorStart
    );
    const reanchorSource = studioPageSource.slice(reanchorStart, reanchorEnd);

    expect(reanchorStart).toBeGreaterThanOrEqual(0);
    expect(reanchorEnd).toBeGreaterThan(reanchorStart);
    expect(studioCanvasOverlaySource).toContain("projectStudioCommentPointerToPointAnchor");
    expect(studioCanvasOverlaySource).toContain("nudgeStudioCommentPointAnchor");
    expect(studioCanvasOverlaySource).toContain("setPointerCapture");
    expect(studioCanvasOverlaySource).toContain("Alt+Shift+ArrowLeft");
    expect(studioCanvasOverlaySource).toContain(
      'data-studio-comment-pin-reanchorable={reanchorable ? "true" : undefined}'
    );
    expect(studioPageSource).toContain("studioCommentPinReanchorableThreadIds");
    expect(reanchorSource).toContain("studioTeamCommentCapabilities?.reanchor !== true");
    expect(reanchorSource).toContain("expectedActivitySequence: expectedSequence.toString()");
    expect(reanchorSource).toContain("mergeStudioTeamCommentMutationReceipt(");
    expect(reanchorSource).toContain("applyStudioTeamCommentReanchorReceipt(");
    expect(reanchorSource).toContain("studioTeamCommentReanchorQueueRef.current.set");
    expect(reanchorSource).toContain("previousUpdatedAt");
    expect(reanchorSource).toContain("void reanchorStudioCommentPin(queued)");
    expect(studioPageSource).toContain(
      "studioCommentThreadPopoverScreenProjectionHandlers.getScreenPoint"
    );
  });

  it("refreshes only the changed live thread instead of polling every comment", () => {
    const refreshStart = studioPageSource.indexOf(
      "function queueStudioTeamCommentLiveRefresh"
    );
    const refreshEnd = studioPageSource.indexOf(
      "studioLiveCommentEventHandlerRef.current = queueStudioTeamCommentLiveRefresh",
      refreshStart
    );
    const refreshSource = studioPageSource.slice(refreshStart, refreshEnd);

    expect(refreshStart).toBeGreaterThanOrEqual(0);
    expect(refreshEnd).toBeGreaterThan(refreshStart);
    expect(studioPageSource).toContain('event.type !== "comment-changed"');
    expect(refreshSource).toContain("studioTeamCommentLiveTargetSequenceRef");
    expect(refreshSource).toContain("studioTeamCommentLiveRefreshFlightRef");
    expect(refreshSource).toContain("getStudioTeamCommentThread(");
    expect(refreshSource).toContain("{ messageLimit: 51 }");
    expect(refreshSource).toContain("decideStudioTeamCommentLiveResponse");
    expect(refreshSource).toContain("targetSequence: latestTarget");
    expect(refreshSource).toContain('liveDecision.status === "retry"');
    expect(refreshSource).toContain("liveDecision.remainsUnread");
    expect(refreshSource).not.toContain("listAllStudioTeamComments(");
    expect(refreshSource).not.toContain("setInterval(");
  });

  it("preloads the compact composer without pulling the full review rail into pin placement", () => {
    const toggleStart = studioPageSource.indexOf("function startStudioCommentPlacementSession()");
    const toggleEnd = studioPageSource.indexOf("const [pointCommentAnchor", toggleStart);
    const toggleSource = studioPageSource.slice(toggleStart, toggleEnd);

    expect(toggleStart).toBeGreaterThanOrEqual(0);
    expect(toggleEnd).toBeGreaterThan(toggleStart);
    expect(studioPageLazyUiSource).toContain(
      'import("./StudioPointCommentComposer").then((mod) => ({'
    );
    expect(studioPageLazyUiSource).toContain("studioPointCommentComposerLoader.load");
    expect(studioPageLazyUiSource).toContain("studioPointCommentComposerLoader.preload()");
    expect(studioPageLazyUiSource).not.toContain(
      'import("./StudioLiveCanvasOverlay").then((mod) => ({ default: mod.StudioPointCommentComposer }))'
    );
    expect(studioCanvasOverlaySource).not.toContain("StudioPointCommentComposer");
    expect(toggleSource).toContain("preloadStudioPointCommentComposer();");
    expect(toggleSource).not.toContain("preloadStudioCommentsPanelSession();");
    expect(studioPageSource).toMatch(
      /function openStudioCommentInbox\([^)]*\)[\s\S]*?preloadStudioCommentsPanelSession\(\);/u
    );
  });

  it("exposes one permission-aware desktop inbox trigger tied to the review dialog", () => {
    expect(studioPageSource).toContain('data-studio-comments-inbox="true"');
    expect(studioPageSource).toContain('aria-controls="studio-comments-review-dialog"');
    expect(studioPageSource).toContain(
      "disabled={collaborationDocumentLocked && !sharedDocument?.capabilities.view}"
    );
    expect(studioPageSource).toContain("lg:inline-flex");
    expect(studioPageSource).toMatch(/commentsOpen\s*\?\s*"댓글 검토함 닫기"/u);
    expect(studioPageSource).toContain('id: "menubar-comment-inbox"');
    expect(studioPageSource).toContain('preview: "comment-inbox"');
    expect(studioPageSource).toContain('openStudioCommentCount > 99 ? "99+" : openStudioCommentCount');
  });

  it("keeps the inbox dense until the user explicitly composes and restores anchor context", () => {
    expect(source).toContain("composerExpanded");
    expect(source).toContain("composerAnchor");
    expect(source).toContain("composerAnchorValid");
    expect(source).toContain("composerAnchorLabelSnapshot");
    expect(source).toContain("frozenComposerAnchorOption");
    expect(source).toContain("isAnchorValid(composerAnchor)");
    expect(source).toContain("댓글을 연결한 위치가 삭제되었습니다");
    expect(source).toContain("anchor: composerAnchor");
    expect(source).toContain("선택한 피드백 위치");
    expect(source).toContain("위치 변경");
    expect(source).toContain(
      'setFilter(preserveReplyDraft ? "all" : activeAnchor ? "current" : "all")'
    );
    expect(source).toContain("!preserveReplyDraft");
    expect(source).toContain("flex min-w-0 items-start gap-2");
    expect(source).toContain("uniqueStudioCommentAnchorOptions(anchorOptions)");
    expect(source).toContain("const seenAnchorKeys = new Set<string>()");
    expect(source).not.toContain("anchorOptions.findIndex");
  });

  it("switches pin placement into a compact Figma-style composer without review filters", () => {
    expect(source).toContain("reviewRailClassName");
    expect(source).toContain('composerExpanded ? "새 댓글" : "검토 댓글"');
    expect(source).toContain("클릭한 위치에 바로 피드백을 남겨요.");
    expect(source).toContain("composerLocationPickerOpen");
    expect(source).toContain("위치 변경");
    expect(source).toContain("{!composerExpanded ? (");
    expect(source).toContain("수정할 점이나 확인이 필요한 내용을 남겨 주세요.");
    expect(source).not.toContain("@이름으로 함께 볼 사람");
  });

  it("reuses mutation ids only while the retried comment or reply payload stays identical", () => {
    expect(source).toContain("pendingNewCommentIdRef");
    expect(source).toContain("pendingReplyIdRef");
    expect(source).toContain("payloadSignature");
    expect(source).toContain("pendingNewCommentIdRef.current?.payloadSignature === payloadSignature");
    expect(source).toContain('pendingReplyIdRef.current?.threadId === threadId');
    expect(source).toContain("pendingReplyIdRef.current.payloadSignature === payloadSignature");
    expect(source).toContain("preserveReplyDraft");
    expect(source).toContain("activeReplyThreadId === thread.id");
    expect(source).toContain("&& !thread.resolved");
    expect(source).toContain("id: pendingReply.replyId");
  });

  it("adds deterministic review sorting without removing search and status filters", () => {
    expect(source).toContain('type CommentSort = "recent" | "oldest" | "location"');
    expect(source).toContain("최근 활동순");
    expect(source).toContain("오래된 활동순");
    expect(source).toContain("위치순");
    expect(source).toContain("getAnchorLabel(left.anchor, anchorOptions).localeCompare");
  });

  it("moves keyboard focus to the newest thread when a canvas pin selects an anchor", () => {
    expect(source).toContain("focusRequest");
    expect(source).toContain("focusRequest.threadId");
    expect(source).toContain("focusRequest.requestId");
    expect(source).toContain("pendingFocusThreadIdRef");
    expect(source).toContain('[data-studio-comment-thread-id]');
    expect(source).toContain('thread.focus({ preventScroll: true })');
    expect(source).toContain('thread.scrollIntoView({ block: "nearest", behavior: "auto" })');
    expect(studioCanvasOverlaySource).toContain("aria-keyshortcuts={keyboardShortcuts}");
    expect(studioCanvasOverlaySource).toContain(
      '"ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter"'
    );
    expect(studioCanvasOverlaySource).toContain("focusCommentPin(pin.key, destination)");
  });

  it("restores rail focus after resolve or reopen removes a filtered thread", () => {
    expect(source).toContain("aria-pressed={thread.resolved}");
    expect(source).toContain("if (!saved) return;");
    expect(source).toContain("focusReviewRail();");
  });

  it("exposes guarded edit operations for the current actor", () => {
    expect(source).toContain("actorsRepresentSamePerson(thread.author, currentActor)");
    expect(source).toContain("actorsRepresentSamePerson(reply.author, currentActor)");
    expect(source).toContain("editStudioCommentThread(document");
    expect(source).toContain("editStudioCommentReply(document");
  });

  it("keeps viewer-specific unread and pin visibility controls out of the document model", () => {
    expect(source).toContain('value: "unread"');
    expect(source).toContain("unreadThreadIds.has(thread.id)");
    expect(source).toContain("onMarkThreadRead(threadId)");
    expect(source).toContain("onMarkAllRead()");
    expect(source).toContain("onTogglePinsHidden");
    expect(source).toContain("작성자와 댓글 검색");
    expect(source).not.toContain("thread.unread =");
  });

  it("keeps pre-server document comments visible without exposing team mutation actions", () => {
    expect(source).toContain("readOnlyThreadIds.has(thread.id)");
    expect(source).toContain("로컬 보관본 · 읽기 전용");
    expect(source).toContain("const canReply =");
    expect(source).toContain("&& capabilities.reply");
    expect(source).toContain("!isReadOnlyArchive && capabilities.resolve");
  });

  it("keeps quick replies inline, touch-sized, and free from a duplicate reply action", () => {
    expect(source).toContain('data-studio-comment-quick-reply="true"');
    expect(source).toContain('data-studio-comment-inline-reply="true"');
    expect(source).toContain('aria-keyshortcuts="Meta+Enter Control+Enter Escape"');
    expect(source).toContain("min-h-11 w-full");
    expect(source).toContain("sm:opacity-0 sm:group-hover:opacity-100");
    expect(source).not.toContain("답글{thread.replies.length");
    expect(source).not.toContain("shadow-[inset_3px");
  });

  it("renders comment sync failures in a dedicated rail status instead of collaboration notices", () => {
    expect(source).toContain("팀 댓글 동기화 지연");
    expect(source).toContain('aria-live="polite"');
  });

  it("uses explicit event-driven refresh instead of polling the complete team history", () => {
    expect(studioPageSource).toContain("createStudioTeamCommentRefreshSession");
    expect(studioPageSource).toContain('request("panel-open")');
    expect(studioPageSource).toContain('request("manual")');
    expect(studioPageSource).not.toContain("commentsOpen ? 5_000 : 30_000");
    expect(source).toContain("팀 댓글 새로고침");
    expect(source).toContain("motion-reduce:animate-none");
  });

  it("keeps server review state out of the persisted project comment document", () => {
    expect(studioPageSource).toContain("const [studioTeamComments, setStudioTeamCommentsState]");
    expect(studioPageSource).toContain("studioComments={studioCommentViewDocument}");
    expect(studioPageSource).toContain("comments: studioComments");
    expect(studioPageSource).not.toContain("comments: studioCommentViewDocument");
  });

  it("keeps retry ids mounted across rail close and validates frozen anchors across the controller boundary", () => {
    expect(studioLazyPanelStackSource).toContain("commentsPanelMounted ? (");
    expect(studioLazyPanelStackSource).toContain("<StudioCommentsPanelSession");
    expect(studioCommentsPanelSessionSource).toContain("<StudioCommentsPanel");
    expect(studioCommentsPanelSessionSource).toContain("open={commentsOpen}");
    expect(studioCommentsPanelSessionSource).toContain(
      "isAnchorValid={isStudioCommentAnchorValid}"
    );
    expect(studioPageSource).toContain("commentsPanelMounted={commentsPanelMounted}");
    expect(studioPageSource).toContain("const isStudioCommentAnchorValid = useCallback");
  });

  it("cancels pin placement explicitly and never marks an entire clustered pin as read", () => {
    expect(studioPageSource).toContain('announceDrawingShortcut("댓글 핀 배치 취소")');
    expect(studioPageSource).toContain("studioCommentFocusRequestSequenceRef");
    expect(studioPageSource).toContain('setStudioCommentPlacementPhase("idle")');
    expect(studioPageSource).toContain(
      "void markStudioCommentThreadRead(selection.selected.id)"
    );
    expect(studioPageSource).toContain("void markStudioCommentThreadRead(nextThread.id)");
    expect(studioPageSource).not.toContain("Promise.all(threadIds.map");
  });

  it("keeps mobile review controls to two compact rows", () => {
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("sr-only sm:not-sr-only");
    expect(source).toContain('aria-label="댓글 정렬"');
    expect(source).not.toContain('className="basis-full"');
  });
});
