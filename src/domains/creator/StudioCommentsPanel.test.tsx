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

describe("StudioCommentsPanel review rail contract", () => {
  it("coexists with the canvas instead of blocking the viewport as a modal", () => {
    expect(source).toContain('data-studio-comments-rail="true"');
    expect(source).toContain("sm:right-3 sm:left-auto");
    expect(source).toContain("h-[min(62dvh,36rem)]");
    expect(source).toContain("bottom-[calc(7rem+env(safe-area-inset-bottom))]");
    expect(source).not.toContain('aria-modal="true"');
    expect(source).not.toContain("body.style.overflow");
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

  it("exposes one permission-aware desktop inbox trigger tied to the review dialog", () => {
    expect(studioPageSource).toContain('data-studio-comments-inbox="true"');
    expect(studioPageSource).toContain('aria-controls="studio-comments-review-dialog"');
    expect(studioPageSource).toContain(
      "disabled={collaborationDocumentLocked && !sharedDocument?.capabilities.view}"
    );
    expect(studioPageSource).toContain("lg:inline-flex");
    expect(studioPageSource).toContain('commentsOpen\n                ? "댓글 검토함 닫기"');
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
    expect(source).toContain('setFilter(activeAnchor ? "current" : "all")');
    expect(source).toContain("setComposerExpanded(capabilities.create && Boolean(activeAnchor)");
    expect(source).toContain("flex min-w-0 items-start gap-2");
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
    expect(source).toContain("thread.id === replyingThreadId && !thread.resolved");
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
  });

  it("exposes guarded edit and delete operations for the current actor", () => {
    expect(source).toContain("actorsRepresentSamePerson(thread.author, currentActor)");
    expect(source).toContain("actorsRepresentSamePerson(reply.author, currentActor)");
    expect(source).toContain("editStudioCommentThread(document");
    expect(source).toContain("editStudioCommentReply(document");
    expect(source).toContain("removeStudioCommentThread(document");
    expect(source).toContain("removeStudioCommentReply(document");
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
    expect(source).toContain("!isReadOnlyArchive && capabilities.reply");
    expect(source).toContain("!isReadOnlyArchive && capabilities.resolve");
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
    expect(studioPageSource).toContain("setCommentPinArmed(false)");
    expect(studioPageSource).toContain("if (newestThreadId)");
    expect(studioPageSource).not.toContain("Promise.all(threadIds.map");
  });

  it("keeps mobile review controls to two compact rows", () => {
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("sr-only sm:not-sr-only");
    expect(source).toContain('aria-label="댓글 정렬"');
    expect(source).not.toContain('className="basis-full"');
  });
});
