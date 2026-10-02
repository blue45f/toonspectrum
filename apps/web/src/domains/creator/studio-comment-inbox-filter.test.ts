import { describe, expect, it } from "vitest";

import {
  collectStudioCommentMentionCandidates,
  deriveStudioCommentMentionsFromBody,
  studioCommentActorsRepresentSamePerson,
  studioCommentThreadAssignedToActor,
  studioCommentThreadMentionsActor,
  withDerivedStudioCommentMentions,
} from "./studio-comment-inbox-filter";

import type { StudioCommentActor, StudioCommentThread } from "./studio-comments";

const NOW = "2026-09-05T00:00:00.000Z";
const CURRENT: StudioCommentActor = { id: "actor-current", displayName: "희준" };

function thread(overrides: Partial<StudioCommentThread> = {}): StudioCommentThread {
  return {
    id: "thread-1",
    author: { id: "reviewer", displayName: "검수자" },
    body: "말풍선 위치를 확인해 주세요.",
    mentions: [],
    createdAt: NOW,
    updatedAt: NOW,
    anchor: { type: "page", pageId: "page-1" },
    replies: [],
    resolved: false,
    ...overrides,
  };
}

describe("Studio comment smart inbox", () => {
  it("keeps account IDs authoritative", () => {
    expect(studioCommentActorsRepresentSamePerson(
      CURRENT,
      { id: "actor-current", displayName: "변경된 이름" }
    )).toBe(true);
    expect(studioCommentActorsRepresentSamePerson(CURRENT, { displayName: "희준" })).toBe(false);
  });

  it("normalizes display-name-only legacy actors", () => {
    expect(studioCommentActorsRepresentSamePerson(
      { displayName: "  ＨＥＥＪＵＮ  " },
      { displayName: "heejun" }
    )).toBe(true);
  });

  it("matches assigned threads", () => {
    expect(studioCommentThreadAssignedToActor(thread({ assignee: CURRENT }), CURRENT)).toBe(true);
    expect(studioCommentThreadAssignedToActor(thread(), CURRENT)).toBe(false);
  });

  it("matches mentions in the opening message and replies", () => {
    expect(studioCommentThreadMentionsActor(thread({ mentions: [CURRENT] }), CURRENT)).toBe(true);
    expect(studioCommentThreadMentionsActor(thread({
      replies: [{
        id: "reply-1",
        author: { id: "reviewer", displayName: "검수자" },
        body: "수정 확인 부탁드립니다.",
        mentions: [CURRENT],
        createdAt: NOW,
        updatedAt: NOW,
      }],
    }), CURRENT)).toBe(true);
  });

  it("rejects unrelated mentions", () => {
    expect(studioCommentThreadMentionsActor(thread({
      mentions: [{ id: "someone-else", displayName: "다른 사용자" }],
    }), CURRENT)).toBe(false);
  });
});

describe("Studio comment derived mentions", () => {
  it("collects mention candidates with the current actor first and without duplicates", () => {
    const candidates = collectStudioCommentMentionCandidates(
      {
        threads: [
          thread(),
          thread({
            id: "thread-2",
            author: CURRENT,
            replies: [{
              id: "reply-1",
              author: { id: "reviewer", displayName: "검수자" },
              body: "확인했습니다.",
              mentions: [],
              createdAt: NOW,
              updatedAt: NOW,
            }],
          }),
        ],
      },
      CURRENT
    );
    expect(candidates[0]).toEqual(CURRENT);
    expect(candidates.filter((actor) => actor.displayName === "검수자")).toHaveLength(1);
    expect(candidates.filter((actor) => actor.displayName === "희준")).toHaveLength(1);
  });

  it("derives mentions from @이름 in the body and keeps the known actor id", () => {
    expect(deriveStudioCommentMentionsFromBody("@희준 확인해 주세요", [CURRENT])).toEqual([CURRENT]);
    expect(deriveStudioCommentMentionsFromBody("@희준이 남긴 댓글입니다", [CURRENT])).toEqual([CURRENT]);
    expect(deriveStudioCommentMentionsFromBody("멘션이 없는 댓글", [CURRENT])).toEqual([]);
    expect(deriveStudioCommentMentionsFromBody("메일은 a@b.com 입니다", [CURRENT])).toEqual([]);
    expect(deriveStudioCommentMentionsFromBody("@없는사람 보세요", [CURRENT])).toEqual([
      { displayName: "없는사람" },
    ]);
    // 조사와 같은 글자로 끝나는 이름은 원형 그대로 매칭돼야 한다 ("김작가"의 가).
    const authorNamed: StudioCommentActor = { id: "actor-author", displayName: "김작가" };
    expect(deriveStudioCommentMentionsFromBody("@김작가 확인해 주세요", [authorNamed])).toEqual([
      authorNamed,
    ]);
  });

  it("fills display mentions only when none were persisted", () => {
    const derived = withDerivedStudioCommentMentions(
      thread({ body: "@희준 이 부분 봐주세요" }),
      [CURRENT]
    );
    expect(derived.mentions).toEqual([CURRENT]);
    expect(studioCommentThreadMentionsActor(derived, CURRENT)).toBe(true);

    const persisted = thread({
      body: "@희준 이 부분 봐주세요",
      mentions: [{ id: "actor-x", displayName: "엑스" }],
    });
    expect(withDerivedStudioCommentMentions(persisted, [CURRENT])).toBe(persisted);
  });

  it("derives reply mentions independently of the opening message", () => {
    const derived = withDerivedStudioCommentMentions(
      thread({
        replies: [{
          id: "reply-1",
          author: { id: "reviewer", displayName: "검수자" },
          body: "@희준 답글에서 부릅니다",
          mentions: [],
          createdAt: NOW,
          updatedAt: NOW,
        }],
      }),
      [CURRENT]
    );
    expect(derived.replies[0]?.mentions).toEqual([CURRENT]);
    expect(studioCommentThreadMentionsActor(derived, CURRENT)).toBe(true);
  });
});
