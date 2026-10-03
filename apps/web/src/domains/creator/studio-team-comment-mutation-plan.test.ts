import { describe, expect, it } from "vitest";

import {
  addStudioCommentReply,
  addStudioCommentThread,
  assignStudioCommentThread,
  createEmptyStudioCommentsDocument,
  editStudioCommentThread,
  reanchorStudioCommentThread,
  removeStudioCommentThread,
  reopenStudioCommentThread,
  resolveStudioCommentThread,
} from "./studio-comments";
import {
  planStudioTeamCommentMutation,
  planStudioTeamCommentReanchorMutation,
  planStudioTeamCommentReplyMentions,
} from "./studio-team-comment-mutation-plan";

const actor = { id: "user-1", displayName: "하린" };
const at = new Date("2026-07-18T01:00:00.000Z");

describe("planStudioTeamCommentMutation", () => {
  it("allows exactly one create, reply, resolve, or reopen transition", () => {
    const empty = createEmptyStudioCommentsDocument();
    const created = addStudioCommentThread(empty, {
      id: "thread-1",
      anchor: { type: "point", pageId: "page-1", x: 0.2, y: 0.3 },
      author: actor,
      body: "검수",
    }, at);
    expect(planStudioTeamCommentMutation(empty, created)).toEqual({
      kind: "create",
      mutationId: "thread-1",
      anchor: { type: "point", pageId: "page-1", x: 0.2, y: 0.3 },
      body: "검수",
      mentions: [],
    });

    const replied = addStudioCommentReply(created, "thread-1", {
      id: "reply-1",
      author: actor,
      body: "반영했습니다.",
    }, new Date("2026-07-18T01:01:00.000Z"));
    expect(planStudioTeamCommentMutation(created, replied)).toEqual({
      kind: "reply",
      mutationId: "reply-1",
      threadId: "thread-1",
      body: "반영했습니다.",
      mentions: [],
    });

    const resolved = resolveStudioCommentThread(
      replied,
      "thread-1",
      actor,
      new Date("2026-07-18T01:02:00.000Z")
    );
    expect(planStudioTeamCommentMutation(replied, resolved)).toEqual({
      kind: "resolve",
      threadId: "thread-1",
    });
    const reopened = reopenStudioCommentThread(
      resolved,
      "thread-1",
      new Date("2026-07-18T01:03:00.000Z")
    );
    expect(planStudioTeamCommentMutation(resolved, reopened)).toEqual({
      kind: "reopen",
      threadId: "thread-1",
    });
  });

  it("rejects edits, assignment, and compound transitions", () => {
    const empty = createEmptyStudioCommentsDocument();
    const created = addStudioCommentThread(empty, {
      id: "thread-1",
      anchor: { type: "page", pageId: "page-1" },
      author: actor,
      body: "검수",
    }, at);
    expect(planStudioTeamCommentMutation(
      created,
      editStudioCommentThread(created, "thread-1", { body: "바꾼 내용" }, at)
    )).toBeNull();
    expect(planStudioTeamCommentMutation(
      created,
      assignStudioCommentThread(created, "thread-1", actor, at)
    )).toBeNull();

    const second = addStudioCommentThread(created, {
      id: "thread-2",
      anchor: { type: "page", pageId: "page-1" },
      author: actor,
      body: "두 번째",
    }, at);
    const compound = resolveStudioCommentThread(second, "thread-1", actor, at);
    expect(planStudioTeamCommentMutation(created, compound)).toBeNull();
  });

  it("carries mentions in create and reply plans, derives unrecorded ones, and still rejects re-anchor and delete data", () => {
    const empty = createEmptyStudioCommentsDocument();
    const mentionedCreate = addStudioCommentThread(empty, {
      id: "thread-mentioned",
      anchor: { type: "page", pageId: "page-1" },
      author: actor,
      body: "확인 부탁드려요.",
      mentions: [{ id: "user-2", displayName: "민호" }],
    }, at);
    expect(planStudioTeamCommentMutation(empty, mentionedCreate)).toEqual({
      kind: "create",
      mutationId: "thread-mentioned",
      anchor: { type: "page", pageId: "page-1" },
      body: "확인 부탁드려요.",
      mentions: [{ id: "user-2", displayName: "민호" }],
    });

    const created = addStudioCommentThread(empty, {
      id: "thread-1",
      anchor: { type: "page", pageId: "page-1" },
      author: actor,
      body: "검수",
    }, at);
    const mentionedReply = addStudioCommentReply(created, "thread-1", {
      id: "reply-mentioned",
      author: actor,
      body: "확인했습니다.",
      mentions: [{ id: "user-2", displayName: "민호" }],
    }, new Date("2026-07-18T01:01:00.000Z"));
    expect(planStudioTeamCommentMutation(created, mentionedReply)).toEqual({
      kind: "reply",
      mutationId: "reply-mentioned",
      threadId: "thread-1",
      body: "확인했습니다.",
      mentions: [{ id: "user-2", displayName: "민호" }],
    });

    // 기록된 멘션이 없으면 본문의 @이름을 기존 문서의 협업자 후보로 해석해 생성 시점에 확정한다.
    const minhoThread = addStudioCommentThread(empty, {
      id: "thread-minho",
      anchor: { type: "page", pageId: "page-1" },
      author: { id: "user-2", displayName: "민호" },
      body: "먼저 남긴 댓글",
    }, at);
    const derivedReply = addStudioCommentReply(minhoThread, "thread-minho", {
      id: "reply-derived",
      author: actor,
      body: "@민호 확인했어요",
    }, new Date("2026-07-18T01:01:00.000Z"));
    expect(planStudioTeamCommentMutation(minhoThread, derivedReply)).toEqual({
      kind: "reply",
      mutationId: "reply-derived",
      threadId: "thread-minho",
      body: "@민호 확인했어요",
      mentions: [{ id: "user-2", displayName: "민호" }],
    });

    expect(planStudioTeamCommentMutation(
      created,
      reanchorStudioCommentThread(
        created,
        "thread-1",
        { type: "point", pageId: "page-1", x: 0.5, y: 0.5 },
        new Date("2026-07-18T01:01:00.000Z")
      )
    )).toBeNull();
    expect(planStudioTeamCommentMutation(
      created,
      removeStudioCommentThread(created, "thread-1")
    )).toBeNull();
  });

  it("plans exactly one CAS-protected re-anchor when the caller supplies its remote frontier", () => {
    const empty = createEmptyStudioCommentsDocument();
    const created = addStudioCommentThread(empty, {
      id: "thread-1",
      anchor: { type: "page", pageId: "page-1" },
      author: actor,
      body: "검수",
    }, at);
    const moved = reanchorStudioCommentThread(
      created,
      "thread-1",
      { type: "point", pageId: "page-1", x: 0.375, y: 0.625 },
      new Date("2026-07-18T01:01:00.000Z")
    );

    expect(planStudioTeamCommentReanchorMutation(created, moved, {
      mutationId: "mutation-reanchor-1",
      expectedActivitySequence: "27",
    })).toEqual({
      kind: "reanchor",
      mutationId: "mutation-reanchor-1",
      threadId: "thread-1",
      anchor: { type: "point", pageId: "page-1", x: 0.375, y: 0.625 },
      expectedActivitySequence: "27",
    });
  });

  it("rejects re-anchor plans without a valid retry key/frontier or with compound edits", () => {
    const empty = createEmptyStudioCommentsDocument();
    const created = addStudioCommentThread(empty, {
      id: "thread-1",
      anchor: { type: "page", pageId: "page-1" },
      author: actor,
      body: "검수",
    }, at);
    const moved = reanchorStudioCommentThread(
      created,
      "thread-1",
      { type: "frame", pageId: "page-1", frameId: "frame-2" },
      new Date("2026-07-18T01:01:00.000Z")
    );
    for (const command of [
      { mutationId: "", expectedActivitySequence: "1" },
      { mutationId: "bad\nkey", expectedActivitySequence: "1" },
      { mutationId: "mutation-1", expectedActivitySequence: "0" },
      { mutationId: "mutation-1", expectedActivitySequence: "9223372036854775808" },
    ]) {
      expect(planStudioTeamCommentReanchorMutation(created, moved, command)).toBeNull();
    }

    const edited = editStudioCommentThread(moved, "thread-1", { body: "함께 바꿈" }, at);
    expect(planStudioTeamCommentReanchorMutation(created, edited, {
      mutationId: "mutation-compound",
      expectedActivitySequence: "1",
    })).toBeNull();
  });
});

describe("planStudioTeamCommentReplyMentions", () => {
  it("settles a quick reply's mentions from the body against the document's collaborators", () => {
    const empty = createEmptyStudioCommentsDocument();
    const minhoThread = addStudioCommentThread(empty, {
      id: "thread-minho",
      anchor: { type: "page", pageId: "page-1" },
      author: { id: "user-2", displayName: "민호" },
      body: "먼저 남긴 댓글",
    }, at);

    expect(planStudioTeamCommentReplyMentions("@민호 확인했어요", minhoThread, actor))
      .toEqual([{ id: "user-2", displayName: "민호" }]);

    // 문서-diff 플래너가 같은 본문·문서로 만드는 답글 계획의 멘션과 일치해야 한다.
    const replied = addStudioCommentReply(minhoThread, "thread-minho", {
      id: "reply-1",
      author: actor,
      body: "@민호 확인했어요",
    }, new Date("2026-07-18T01:01:00.000Z"));
    const planned = planStudioTeamCommentMutation(minhoThread, replied);
    expect(planned?.kind).toBe("reply");
    if (planned?.kind === "reply") {
      expect(planned.mentions).toEqual(
        planStudioTeamCommentReplyMentions("@민호 확인했어요", minhoThread, actor)
      );
    }
  });

  it("returns no mentions without @name tokens, and keeps unmatched names as name-only mentions", () => {
    const empty = createEmptyStudioCommentsDocument();
    const created = addStudioCommentThread(empty, {
      id: "thread-1",
      anchor: { type: "page", pageId: "page-1" },
      author: actor,
      body: "검수",
    }, at);

    expect(planStudioTeamCommentReplyMentions("멘션 없이 남기는 답글", created, actor))
      .toEqual([]);
    // 문서가 모르는 이름도 패널 경로와 같은 계약으로 이름만 있는 멘션으로 확정된다.
    expect(planStudioTeamCommentReplyMentions("@없는사람 확인해 주세요", created, actor))
      .toEqual([{ displayName: "없는사람" }]);
  });
});
