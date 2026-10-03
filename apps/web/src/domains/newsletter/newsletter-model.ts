/**
 * 뉴스레터 순수 로직 — 초안 검증, 구독자 집계, 메일 미리보기 모델.
 * 스토어와 페이지가 공유하고, 단위 테스트는 이 모듈을 직접 검증한다.
 */

import { seedSubscriberCount } from "./newsletter-seed";
import type {
  IssueDraftFailureReason,
  NewsletterIssue,
  NewsletterSendRecord,
  NewsletterSubscription,
} from "./newsletter-types";

/** 구독 해지 안내 경로. 메일 미리보기와 발송 요청이 같은 값을 쓴다. */
export const NEWSLETTER_UNSUBSCRIBE_PATH = "/newsletter";

export type IssueDraftValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: IssueDraftFailureReason };

/** 발송 직전 가드와 같은 규칙으로 초안을 검증한다(제목→본문 순서). */
export function validateNewsletterIssueDraft(input: {
  readonly title: string;
  readonly body: string;
}): IssueDraftValidation {
  if (input.title.trim().length === 0) return { ok: false, reason: "empty-title" };
  if (input.body.trim().length === 0) return { ok: false, reason: "empty-body" };
  return { ok: true };
}

/**
 * 화면 표시용 구독자 수 — 데모 시드 기준값 + 이 브라우저에서 실제로 구독 중인
 * 독자 수(중복 제거). 실제 발송 수신자 수와는 다를 수 있다.
 */
export function countNewsletterSubscribers(
  subscriptions: readonly NewsletterSubscription[],
  authorName: string,
): number {
  const localReaders = new Set(
    subscriptions.filter((sub) => sub.authorName === authorName).map((sub) => sub.readerId),
  );
  return seedSubscriberCount(authorName) + localReaders.size;
}

/** 실제로 발송 대상이 되는 로컬 구독자 ID 목록(중복 제거, 구독 순). */
export function listNewsletterRecipientIds(
  subscriptions: readonly NewsletterSubscription[],
  authorName: string,
): string[] {
  const seen = new Set<string>();
  const recipientIds: string[] = [];
  for (const sub of subscriptions) {
    if (sub.authorName !== authorName || seen.has(sub.readerId)) continue;
    seen.add(sub.readerId);
    recipientIds.push(sub.readerId);
  }
  return recipientIds;
}

export function findNewsletterSubscription(
  subscriptions: readonly NewsletterSubscription[],
  readerId: string,
  authorName: string,
): NewsletterSubscription | undefined {
  return subscriptions.find((sub) => sub.readerId === readerId && sub.authorName === authorName);
}

/** 내 구독 목록 — 최근 구독 순. */
export function listMyNewsletterSubscriptions(
  subscriptions: readonly NewsletterSubscription[],
  readerId: string,
): NewsletterSubscription[] {
  return subscriptions
    .filter((sub) => sub.readerId === readerId)
    .sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));
}

/** 작가의 글 목록 — 최근 수정 순. */
export function listAuthorNewsletterIssues(
  issues: readonly NewsletterIssue[],
  authorName: string,
): NewsletterIssue[] {
  return issues
    .filter((issue) => issue.authorName === authorName)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 작가의 발송 이력 — 최근 발송 순. */
export function listAuthorNewsletterSendHistory(
  sendHistory: readonly NewsletterSendRecord[],
  authorName: string,
): NewsletterSendRecord[] {
  return sendHistory
    .filter((record) => record.authorName === authorName)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export interface NewsletterPreview {
  readonly fromName: string;
  readonly subject: string;
  /** 빈 줄로 나눈 본문 단락. 단락 안의 줄바꿈은 그대로 유지한다. */
  readonly paragraphs: readonly string[];
  readonly unsubscribePath: string;
}

/** 메일 미리보기 모델 — 작성 화면과 (향후) 발송 템플릿이 같은 구조를 쓴다. */
export function buildNewsletterPreview(issue: {
  readonly authorName: string;
  readonly title: string;
  readonly body: string;
}): NewsletterPreview {
  const paragraphs = issue.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  return {
    fromName: issue.authorName,
    subject: issue.title.trim(),
    paragraphs,
    unsubscribePath: NEWSLETTER_UNSUBSCRIBE_PATH,
  };
}
