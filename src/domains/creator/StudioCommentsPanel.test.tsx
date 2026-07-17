import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioCommentsPanel.tsx", import.meta.url), "utf8");
const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

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
    expect(source).toContain("reviewRail?.contains(activeElement)");
    expect(source).toContain("event.currentTarget.form?.requestSubmit()");
    expect(source).toContain("<dialog");
    expect(source).toContain("aria-labelledby={titleId}");
    expect(source).toContain("aria-describedby={descriptionId}");
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

  it("keeps server review state out of the persisted project comment document", () => {
    expect(studioPageSource).toContain("const [studioTeamComments, setStudioTeamCommentsState]");
    expect(studioPageSource).toContain("studioComments={studioCommentViewDocument}");
    expect(studioPageSource).toContain("comments: studioComments");
    expect(studioPageSource).not.toContain("comments: studioCommentViewDocument");
  });
});
