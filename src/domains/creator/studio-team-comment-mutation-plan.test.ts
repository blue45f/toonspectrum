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
import { planStudioTeamCommentMutation } from "./studio-team-comment-mutation-plan";

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
      anchor: { type: "point", pageId: "page-1", x: 0.2, y: 0.3 },
      body: "검수",
    });

    const replied = addStudioCommentReply(created, "thread-1", {
      id: "reply-1",
      author: actor,
      body: "반영했습니다.",
    }, new Date("2026-07-18T01:01:00.000Z"));
    expect(planStudioTeamCommentMutation(created, replied)).toEqual({
      kind: "reply",
      threadId: "thread-1",
      body: "반영했습니다.",
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

  it("rejects unsupported mention, re-anchor, and delete data instead of dropping it", () => {
    const empty = createEmptyStudioCommentsDocument();
    const mentionedCreate = addStudioCommentThread(empty, {
      id: "thread-mentioned",
      anchor: { type: "page", pageId: "page-1" },
      author: actor,
      body: "확인 부탁드려요.",
      mentions: [{ id: "user-2", displayName: "민호" }],
    }, at);
    expect(planStudioTeamCommentMutation(empty, mentionedCreate)).toBeNull();

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
    expect(planStudioTeamCommentMutation(created, mentionedReply)).toBeNull();
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
});
