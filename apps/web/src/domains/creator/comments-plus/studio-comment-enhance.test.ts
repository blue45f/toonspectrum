import { describe, expect, it } from "vitest";

import {
  TYPING_EXPIRY_MS,
  aggregateReactions,
  computeUnread,
  createTypingTracker,
  filterThreads,
  parseMentions,
  sortThreads,
  toggleReaction,
  type EnhanceThread,
} from "./studio-comment-enhance";

describe("parseMentions", () => {
  it("한글 이름을 파싱한다", () => {
    const mentions = parseMentions("@김민준 이 부분 봐줘");
    expect(mentions).toHaveLength(1);
    expect(mentions[0].name).toBe("김민준");
    expect(mentions[0].start).toBe(0);
    expect("@김민준 이 부분 봐줘".slice(mentions[0].start, mentions[0].end)).toBe(
      "@김민준"
    );
  });

  it("여러 멘션을 모두 찾는다", () => {
    const mentions = parseMentions("@지훈 @sarah_01 확인 부탁");
    expect(mentions.map((m) => m.name)).toEqual(["지훈", "sarah_01"]);
  });

  it("이메일 주소의 @는 멘션이 아니다", () => {
    expect(parseMentions("메일은 user@example.com 으로")).toEqual([]);
  });

  it("문장 중간 멘션도 찾고 조사(가)를 떼어낸다", () => {
    const mentions = parseMentions("이건 @민수가 고쳐줘");
    expect(mentions).toHaveLength(1);
    expect(mentions[0].name).toBe("민수");
  });

  it("다양한 조사를 떼어낸다", () => {
    expect(parseMentions("@지훈이 봐줘")[0].name).toBe("지훈");
    expect(parseMentions("@지훈은 어때")[0].name).toBe("지훈");
    expect(parseMentions("@sarah_01 확인")[0].name).toBe("sarah_01");
  });

  it("멘션이 없으면 빈 배열", () => {
    expect(parseMentions("그냥 댓글")).toEqual([]);
  });
});

describe("aggregateReactions", () => {
  it("이모지별로 집계하고 count 내림차순으로 정렬한다", () => {
    const summary = aggregateReactions(
      [
        { emoji: "👍", userId: "a" },
        { emoji: "❤️", userId: "b" },
        { emoji: "👍", userId: "c" },
      ],
      "me"
    );
    expect(summary[0]).toMatchObject({ emoji: "👍", count: 2 });
    expect(summary[1]).toMatchObject({ emoji: "❤️", count: 1 });
  });

  it("내 리액션 여부를 표시한다", () => {
    const summary = aggregateReactions([{ emoji: "👍", userId: "me" }], "me");
    expect(summary[0].reactedByMe).toBe(true);
  });

  it("같은 사용자의 중복 리액션은 한 번만 센다", () => {
    const summary = aggregateReactions(
      [
        { emoji: "👍", userId: "a" },
        { emoji: "👍", userId: "a" },
      ],
      "me"
    );
    expect(summary[0].count).toBe(1);
  });
});

describe("toggleReaction", () => {
  it("없으면 추가한다", () => {
    const next = toggleReaction([], "👍", "me");
    expect(next).toEqual([{ emoji: "👍", userId: "me" }]);
  });

  it("내가 이미 눌렀으면 제거한다 (낙관적 토글)", () => {
    const next = toggleReaction([{ emoji: "👍", userId: "me" }], "👍", "me");
    expect(next).toEqual([]);
  });

  it("다른 사람의 리액션은 건드리지 않는다", () => {
    const next = toggleReaction([{ emoji: "👍", userId: "other" }], "👍", "me");
    expect(next).toHaveLength(2);
  });

  it("원본 배열을 변경하지 않는다", () => {
    const original = [{ emoji: "👍", userId: "me" }];
    toggleReaction(original, "👍", "me");
    expect(original).toHaveLength(1);
  });
});

describe("createTypingTracker", () => {
  it("markTyping 후 3초 안에는 타이핑 중으로 보인다", () => {
    const tracker = createTypingTracker();
    tracker.markTyping("u1", "민준", 1000);
    expect(tracker.typingUsers(1000 + TYPING_EXPIRY_MS - 1)).toEqual([
      { userId: "u1", userName: "민준" },
    ]);
  });

  it("3초가 지나면 만료된다", () => {
    const tracker = createTypingTracker();
    tracker.markTyping("u1", "민준", 1000);
    expect(tracker.typingUsers(1000 + TYPING_EXPIRY_MS)).toEqual([]);
  });

  it("계속 입력하면 만료가 연장된다", () => {
    const tracker = createTypingTracker();
    tracker.markTyping("u1", "민준", 1000);
    tracker.markTyping("u1", "민준", 3500);
    expect(tracker.typingUsers(6000)).toEqual([
      { userId: "u1", userName: "민준" },
    ]);
  });

  it("prune이 만료 기록을 지운다", () => {
    const tracker = createTypingTracker();
    tracker.markTyping("u1", "민준", 1000);
    tracker.prune(1000 + TYPING_EXPIRY_MS);
    expect(tracker.typingUsers(1000 + TYPING_EXPIRY_MS)).toEqual([]);
  });
});

const thread = (overrides: Partial<EnhanceThread>): EnhanceThread => ({
  id: "t",
  resolved: false,
  comments: [],
  lastActivityAt: 0,
  ...overrides,
});

describe("sortThreads", () => {
  it("미해결이 먼저, 그 안에서 최근 활동순", () => {
    const threads = [
      thread({ id: "old-unresolved", lastActivityAt: 100 }),
      thread({ id: "resolved", resolved: true, lastActivityAt: 999 }),
      thread({ id: "new-unresolved", lastActivityAt: 500 }),
    ];
    const sorted = sortThreads(threads, "unresolved-first", "me");
    expect(sorted.map((t) => t.id)).toEqual([
      "new-unresolved",
      "old-unresolved",
      "resolved",
    ]);
  });

  it("내 스레드 우선 정렬", () => {
    const threads = [
      thread({
        id: "others",
        lastActivityAt: 900,
        comments: [
          { id: "c1", authorId: "x", authorName: "X", body: "hi", createdAt: 900 },
        ],
      }),
      thread({
        id: "mine",
        lastActivityAt: 100,
        comments: [
          { id: "c2", authorId: "me", authorName: "Me", body: "hi", createdAt: 100 },
        ],
      }),
    ];
    const sorted = sortThreads(threads, "my-threads-first", "me");
    expect(sorted[0].id).toBe("mine");
  });

  it("원본 배열을 변경하지 않는다", () => {
    const threads = [thread({ id: "a" }), thread({ id: "b" })];
    sortThreads(threads, "recent-activity", "me");
    expect(threads.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("filterThreads", () => {
  const threads = [
    thread({
      id: "t1",
      comments: [
        { id: "c1", authorId: "x", authorName: "X", body: "@민준 봐줘", createdAt: 200 },
      ],
      lastActivityAt: 200,
    }),
    thread({
      id: "t2",
      resolved: true,
      comments: [
        { id: "c2", authorId: "me", authorName: "민준", body: "완료", createdAt: 100 },
      ],
      lastActivityAt: 100,
    }),
  ];
  const opts = { myUserId: "me", myUserName: "민준" };

  it("mentions-me: 나를 멘션한 스레드만", () => {
    expect(filterThreads(threads, "mentions-me", opts).map((t) => t.id)).toEqual([
      "t1",
    ]);
  });

  it("mine: 내가 참여한 스레드만", () => {
    expect(filterThreads(threads, "mine", opts).map((t) => t.id)).toEqual(["t2"]);
  });

  it("unresolved/resolved", () => {
    expect(filterThreads(threads, "unresolved", opts).map((t) => t.id)).toEqual([
      "t1",
    ]);
    expect(filterThreads(threads, "resolved", opts).map((t) => t.id)).toEqual([
      "t2",
    ]);
  });

  it("unread: lastReadAt 이후 남의 댓글", () => {
    const withRead = { ...opts, lastReadAtByThread: { t1: 150, t2: 200 } };
    expect(filterThreads(threads, "unread", withRead).map((t) => t.id)).toEqual([
      "t1",
    ]);
  });
});

describe("computeUnread", () => {
  it("lastReadAt 이후의 남의 댓글만 센다", () => {
    const t = thread({
      comments: [
        { id: "c1", authorId: "x", authorName: "X", body: "a", createdAt: 100 },
        { id: "c2", authorId: "me", authorName: "Me", body: "b", createdAt: 200 },
        { id: "c3", authorId: "x", authorName: "X", body: "c", createdAt: 300 },
      ],
    });
    expect(computeUnread(t, 150, "me")).toBe(1);
    expect(computeUnread(t, 0, "me")).toBe(2);
    expect(computeUnread(t, 500, "me")).toBe(0);
  });
});
