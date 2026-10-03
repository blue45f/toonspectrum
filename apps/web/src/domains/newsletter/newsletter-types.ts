/**
 * 작가 뉴스레터 도메인 타입.
 *
 * 구독 관계의 정본은 당분간 이 브라우저의 로컬 스토어다(컷츠·캐릭터 챗과 같은
 * 로컬-퍼스트 파일럿). 서버 구독/발송 계약이 생기면 스토어 어댑터만 교체한다.
 */

/** 발송 주기 — 설계 기본값은 주 1회 묶음 발송이다. */
export type NewsletterCadence = "weekly" | "instant";

export interface NewsletterSubscription {
  readonly readerId: string;
  readonly authorName: string;
  readonly cadence: NewsletterCadence;
  /** ISO 8601. */
  readonly subscribedAt: string;
}

export type NewsletterIssueStatus = "draft" | "sent";

export interface NewsletterIssue {
  readonly id: string;
  readonly authorName: string;
  /**
   * 소유 계정(actorId). 웨이브11 이전 데이터는 null(미귀속)이며, 작성 화면이
   * 현재 계정으로 귀속(claim)한 뒤부터는 계정이 다르면 목록·수정·발송에서 제외된다.
   */
  readonly ownerId: string | null;
  readonly title: string;
  readonly body: string;
  readonly status: NewsletterIssueStatus;
  /** ISO 8601. */
  readonly createdAt: string;
  /** ISO 8601. */
  readonly updatedAt: string;
  /** ISO 8601. 발송 전이면 null. */
  readonly sentAt: string | null;
}

/**
 * 발송 이력 1건. `recipientCount`는 메일 어댑터가 확정한 실제 수신자 수이고,
 * 화면 표시용 구독자 수(시드 기준 포함)와는 다를 수 있다.
 */
export interface NewsletterSendRecord {
  readonly id: string;
  readonly issueId: string;
  readonly authorName: string;
  /** 소유 계정(actorId). 이슈의 ownerId를 그대로 잇는다 (null = 미귀속 레거시). */
  readonly ownerId: string | null;
  readonly issueTitle: string;
  /** ISO 8601. */
  readonly sentAt: string;
  readonly recipientCount: number;
  /** 발송을 처리한 메일 어댑터 식별자. 현재는 "local-log"(실제 발송 없음). */
  readonly adapterId: string;
}

export interface SubscribeResult {
  readonly subscribed: boolean;
  /** 게스트라서 로그인 유도가 필요한 경우 true. 이때 상태는 바뀌지 않는다. */
  readonly needsLogin: boolean;
}

export type SendIssueFailureReason =
  | "not-found"
  | "already-sent"
  | "empty-title"
  | "empty-body"
  | "no-subscribers";

export interface SendIssueResult {
  readonly sent: boolean;
  readonly reason?: SendIssueFailureReason;
  readonly record?: NewsletterSendRecord;
}

export type IssueDraftFailureReason = "empty-title" | "empty-body";
