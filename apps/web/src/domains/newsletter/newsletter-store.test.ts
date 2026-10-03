/**
 * 뉴스레터 스토어 테스트 — 구독 토글·게스트 가드·발송 가드·발송 이력 검증.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import type { NewsletterMailAdapter, NewsletterMailRequest } from "./newsletter-mail-adapter";
import { useNewsletterStore } from "./newsletter-store";

const AUTHOR = "김밤하늘";
const READER = "reader-1";

beforeEach(() => {
  window.localStorage.clear();
  useNewsletterStore.getState().resetForTests();
});

describe("newsletter store 구독", () => {
  it("게스트 구독 시도는 로그인 유도를 반환하고 상태를 바꾸지 않는다", () => {
    const result = useNewsletterStore.getState().toggleSubscribe(AUTHOR, null);
    expect(result).toEqual({ subscribed: false, needsLogin: true });
    expect(useNewsletterStore.getState().subscriptions).toHaveLength(0);
  });

  it("로그인 독자는 구독할 수 있고 기본 주기는 주 1회 묶음이다", () => {
    const result = useNewsletterStore.getState().subscribe(AUTHOR, READER);
    expect(result).toEqual({ subscribed: true, needsLogin: false });
    const subscriptions = useNewsletterStore.getState().subscriptions;
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      readerId: READER,
      authorName: AUTHOR,
      cadence: "weekly",
    });
  });

  it("같은 작가를 다시 구독해도 중복이 생기지 않는다", () => {
    const state = useNewsletterStore.getState();
    state.subscribe(AUTHOR, READER);
    state.subscribe(AUTHOR, READER);
    expect(useNewsletterStore.getState().subscriptions).toHaveLength(1);
  });

  it("토글하면 해지되고, 해지는 본인 구독만 지운다", () => {
    const state = useNewsletterStore.getState();
    state.subscribe(AUTHOR, READER);
    state.subscribe(AUTHOR, "reader-2");
    const off = state.toggleSubscribe(AUTHOR, READER);
    expect(off).toEqual({ subscribed: false, needsLogin: false });
    const remaining = useNewsletterStore.getState().subscriptions;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].readerId).toBe("reader-2");
  });

  it("발송 주기를 본인 구독에 한해 바꿀 수 있다", () => {
    const state = useNewsletterStore.getState();
    state.subscribe(AUTHOR, READER);
    expect(state.setCadence(AUTHOR, "reader-2", "instant")).toBe(false);
    expect(state.setCadence(AUTHOR, null, "instant")).toBe(false);
    expect(state.setCadence(AUTHOR, READER, "instant")).toBe(true);
    expect(useNewsletterStore.getState().subscriptions[0].cadence).toBe("instant");
  });
});

describe("newsletter store 초안", () => {
  it("초안을 만들고 수정할 수 있다", () => {
    const state = useNewsletterStore.getState();
    const issue = state.createIssue(AUTHOR, { title: "24화 소식", body: "본문" });
    expect(issue.status).toBe("draft");
    const updated = state.updateIssue(issue.id, { title: "25화 소식" });
    expect(updated?.title).toBe("25화 소식");
    expect(updated?.body).toBe("본문");
  });

  it("초안을 삭제할 수 있다", () => {
    const state = useNewsletterStore.getState();
    const issue = state.createIssue(AUTHOR, { title: "제목", body: "본문" });
    expect(state.deleteIssue(issue.id)).toBe(true);
    expect(useNewsletterStore.getState().issues).toHaveLength(0);
  });
});

describe("newsletter store 발송 가드", () => {
  it("없는 글은 not-found를 반환한다", async () => {
    const result = await useNewsletterStore.getState().sendIssue("missing-id");
    expect(result).toEqual({ sent: false, reason: "not-found" });
  });

  it("제목이 비면 empty-title로 차단한다", async () => {
    const state = useNewsletterStore.getState();
    state.subscribe(AUTHOR, READER);
    const issue = state.createIssue(AUTHOR, { title: "  ", body: "본문" });
    const result = await state.sendIssue(issue.id);
    expect(result).toEqual({ sent: false, reason: "empty-title" });
    expect(useNewsletterStore.getState().issues[0].status).toBe("draft");
  });

  it("본문이 비면 empty-body로 차단한다", async () => {
    const state = useNewsletterStore.getState();
    state.subscribe(AUTHOR, READER);
    const issue = state.createIssue(AUTHOR, { title: "제목", body: "\n\n" });
    const result = await state.sendIssue(issue.id);
    expect(result).toEqual({ sent: false, reason: "empty-body" });
  });

  it("구독자가 없으면 no-subscribers로 차단한다", async () => {
    const state = useNewsletterStore.getState();
    const issue = state.createIssue(AUTHOR, { title: "제목", body: "본문" });
    const result = await state.sendIssue(issue.id);
    expect(result).toEqual({ sent: false, reason: "no-subscribers" });
    expect(useNewsletterStore.getState().sendHistory).toHaveLength(0);
  });
});

describe("newsletter store 발송", () => {
  it("발송하면 상태가 sent가 되고 이력에 수신자 수와 어댑터가 기록된다", async () => {
    const state = useNewsletterStore.getState();
    state.subscribe(AUTHOR, READER);
    state.subscribe(AUTHOR, "reader-2");
    const issue = state.createIssue(AUTHOR, { title: " 24화 소식 ", body: "새 화가 나왔어요." });

    const result = await state.sendIssue(issue.id);
    expect(result.sent).toBe(true);
    expect(result.record).toMatchObject({
      issueId: issue.id,
      authorName: AUTHOR,
      issueTitle: "24화 소식",
      recipientCount: 2,
      adapterId: "local-log",
    });

    const after = useNewsletterStore.getState();
    expect(after.issues[0].status).toBe("sent");
    expect(after.issues[0].sentAt).not.toBeNull();
    expect(after.sendHistory).toHaveLength(1);
  });

  it("이미 보낸 글은 다시 보낼 수 없고 수정·삭제도 막힌다", async () => {
    const state = useNewsletterStore.getState();
    state.subscribe(AUTHOR, READER);
    const issue = state.createIssue(AUTHOR, { title: "제목", body: "본문" });
    await state.sendIssue(issue.id);

    const again = await state.sendIssue(issue.id);
    expect(again).toEqual({ sent: false, reason: "already-sent" });
    expect(state.updateIssue(issue.id, { title: "바꿔치기" })).toBeNull();
    expect(state.deleteIssue(issue.id)).toBe(false);
    expect(useNewsletterStore.getState().sendHistory).toHaveLength(1);
  });

  it("메일 어댑터에는 구독자 ID와 해지 경로만 넘어간다", async () => {
    const state = useNewsletterStore.getState();
    state.subscribe(AUTHOR, READER);
    const issue = state.createIssue(AUTHOR, { title: "제목", body: "본문" });

    let captured: NewsletterMailRequest | null = null;
    const spyAdapter: NewsletterMailAdapter = {
      id: "spy",
      async send(request) {
        captured = request;
        return { adapterId: "spy", acceptedCount: request.recipientIds.length, deliveredAt: "2026-10-02T00:00:00.000Z" };
      },
    };

    const result = await state.sendIssue(issue.id, null, spyAdapter);
    expect(result.sent).toBe(true);
    expect(captured).toMatchObject({
      authorName: AUTHOR,
      subject: "제목",
      recipientIds: [READER],
      unsubscribePath: "/newsletter",
    });
    expect(result.record?.adapterId).toBe("spy");
    expect(result.record?.sentAt).toBe("2026-10-02T00:00:00.000Z");
  });

  it("계정 소유 초안은 다른 계정이 수정·삭제·발송할 수 없다", async () => {
    const state = useNewsletterStore.getState();
    state.subscribe(AUTHOR, READER);
    const issue = state.createIssue(AUTHOR, { title: "A의 초안", body: "본문" }, "account-a");
    expect(issue.ownerId).toBe("account-a");

    expect(state.updateIssue(issue.id, { title: "B가 바꿈" }, "account-b")).toBeNull();
    expect(state.deleteIssue(issue.id, "account-b")).toBe(false);
    const sendByOther = await state.sendIssue(issue.id, "account-b");
    expect(sendByOther).toEqual({ sent: false, reason: "not-found" });

    expect(state.updateIssue(issue.id, { title: "A가 바꿈" }, "account-a")?.title).toBe("A가 바꿈");
    const sent = await state.sendIssue(issue.id, "account-a");
    expect(sent.sent).toBe(true);
    expect(sent.record?.ownerId).toBe("account-a");
  });

  it("미귀속 레거시는 claim한 계정 소유가 되고, 필명도 계정별로 갈린다", () => {
    const state = useNewsletterStore.getState();
    const legacy = state.createIssue(AUTHOR, { title: "레거시 초안", body: "본문" });
    expect(legacy.ownerId).toBeNull();
    state.setPenName("레거시필명");

    state.claimLegacyData("account-a");
    const after = useNewsletterStore.getState();
    expect(after.issues.find((item) => item.id === legacy.id)?.ownerId).toBe("account-a");
    expect(after.penNames["account-a"]).toBe("레거시필명");
    expect(after.penName).toBeNull();
    // 두 번째 계정이 claim해도 이미 귀속된 데이터는 넘어가지 않는다.
    after.claimLegacyData("account-b");
    const final = useNewsletterStore.getState();
    expect(final.issues.find((item) => item.id === legacy.id)?.ownerId).toBe("account-a");
    expect(final.penNames["account-b"]).toBeUndefined();

    final.setPenName("B필명", "account-b");
    expect(useNewsletterStore.getState().penNames["account-b"]).toBe("B필명");
    expect(useNewsletterStore.getState().penNames["account-a"]).toBe("레거시필명");
  });
});
