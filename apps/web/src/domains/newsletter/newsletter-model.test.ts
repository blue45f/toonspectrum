/**
 * 뉴스레터 순수 로직 테스트 — 초안 검증, 구독자 집계, 미리보기 모델.
 */

import { describe, expect, it } from "vitest";

import {
  buildNewsletterPreview,
  countNewsletterSubscribers,
  listMyNewsletterSubscriptions,
  listNewsletterRecipientIds,
  validateNewsletterIssueDraft,
} from "./newsletter-model";
import type { NewsletterSubscription } from "./newsletter-types";

function sub(
  readerId: string,
  authorName: string,
  subscribedAt = "2026-10-01T00:00:00.000Z",
): NewsletterSubscription {
  return { readerId, authorName, cadence: "weekly", subscribedAt };
}

describe("validateNewsletterIssueDraft", () => {
  it("제목이 비면 empty-title", () => {
    expect(validateNewsletterIssueDraft({ title: " ", body: "본문" })).toEqual({
      ok: false,
      reason: "empty-title",
    });
  });

  it("본문이 비면 empty-body", () => {
    expect(validateNewsletterIssueDraft({ title: "제목", body: "" })).toEqual({
      ok: false,
      reason: "empty-body",
    });
  });

  it("제목과 본문이 있으면 통과", () => {
    expect(validateNewsletterIssueDraft({ title: "제목", body: "본문" })).toEqual({ ok: true });
  });
});

describe("countNewsletterSubscribers", () => {
  it("시드가 없는 작가는 로컬 구독 수만 센다", () => {
    const subs = [sub("r1", "새작가"), sub("r2", "새작가"), sub("r3", "다른작가")];
    expect(countNewsletterSubscribers(subs, "새작가")).toBe(2);
  });

  it("데모 시드 기준값에 로컬 구독을 더한다", () => {
    // 김밤하늘 시드 기준 128명.
    expect(countNewsletterSubscribers([], "김밤하늘")).toBe(128);
    expect(countNewsletterSubscribers([sub("r1", "김밤하늘")], "김밤하늘")).toBe(129);
  });

  it("같은 독자의 중복 레코드는 한 번만 센다", () => {
    const subs = [sub("r1", "새작가"), sub("r1", "새작가")];
    expect(countNewsletterSubscribers(subs, "새작가")).toBe(1);
  });
});

describe("listNewsletterRecipientIds", () => {
  it("작가별 구독자 ID를 중복 없이 구독 순으로 돌려준다", () => {
    const subs = [sub("r2", "작가"), sub("r1", "작가"), sub("r2", "작가"), sub("r9", "다른작가")];
    expect(listNewsletterRecipientIds(subs, "작가")).toEqual(["r2", "r1"]);
  });
});

describe("listMyNewsletterSubscriptions", () => {
  it("내 구독만 최근 구독 순으로 돌려준다", () => {
    const subs = [
      sub("me", "작가A", "2026-09-01T00:00:00.000Z"),
      sub("other", "작가B"),
      sub("me", "작가C", "2026-10-01T00:00:00.000Z"),
    ];
    const mine = listMyNewsletterSubscriptions(subs, "me");
    expect(mine.map((item) => item.authorName)).toEqual(["작가C", "작가A"]);
  });
});

describe("buildNewsletterPreview", () => {
  it("제목을 다듬고 본문을 빈 줄 기준으로 단락으로 나눈다", () => {
    const preview = buildNewsletterPreview({
      authorName: "김밤하늘",
      title: " 24화 소식 ",
      body: "첫 단락\n같은 단락 둘째 줄\n\n둘째 단락\n\n\n셋째 단락",
    });
    expect(preview.fromName).toBe("김밤하늘");
    expect(preview.subject).toBe("24화 소식");
    expect(preview.paragraphs).toEqual(["첫 단락\n같은 단락 둘째 줄", "둘째 단락", "셋째 단락"]);
  });

  it("해지 경로는 구독 관리 페이지로 고정된다", () => {
    const preview = buildNewsletterPreview({ authorName: "작가", title: "제목", body: "본문" });
    expect(preview.unsubscribePath).toBe("/newsletter");
  });

  it("본문이 비면 단락이 없다", () => {
    const preview = buildNewsletterPreview({ authorName: "작가", title: "제목", body: "  " });
    expect(preview.paragraphs).toEqual([]);
  });
});
