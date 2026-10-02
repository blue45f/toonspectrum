/**
 * 뉴스레터 메일 발송 계약 지점 — 실제 이메일 전송은 이 파일에서만 연결한다.
 *
 * 현재 기본 어댑터(`localLogNewsletterMailAdapter`)는 네트워크 호출을 전혀 하지
 * 않고 수신자 수만 확정해 반환한다. 스토어는 그 결과로 상태 전이(발송 완료)와
 * 이력 기록만 수행하므로, 이 파일럿 단계에서 실제 이메일은 한 통도 나가지 않는다.
 *
 * 실제 발송을 붙일 때는 Resend 등 발송 서비스 어댑터를 새로 만들어
 * `NEWSLETTER_MAIL_ADAPTER`를 교체한다. 유료 발송 서비스 도입은 통당 과금과
 * 스팸 평판 관리가 걸려 있어 별도 승인 후 진행한다(설계 6.2-1).
 * 수신자 이메일 주소는 서버 계약 이후 어댑터 내부에서만 해석하고,
 * 이 인터페이스에는 사용자 ID만 넘긴다.
 */

export interface NewsletterMailRequest {
  readonly authorName: string;
  readonly subject: string;
  readonly body: string;
  /** 수신자 사용자 ID 목록. 이메일 주소는 포함하지 않는다. */
  readonly recipientIds: readonly string[];
  /** 구독 해지 안내 경로(예: "/newsletter"). 메일 하단에 필수로 실린다. */
  readonly unsubscribePath: string;
}

export interface NewsletterMailReceipt {
  readonly adapterId: string;
  readonly acceptedCount: number;
  /** ISO 8601. */
  readonly deliveredAt: string;
}

export interface NewsletterMailAdapter {
  readonly id: string;
  send(request: NewsletterMailRequest): Promise<NewsletterMailReceipt>;
}

/** 로컬 기록 전용 어댑터 — 실제 메일을 보내지 않고 접수 건수만 확정한다. */
export const localLogNewsletterMailAdapter: NewsletterMailAdapter = {
  id: "local-log",
  async send(request: NewsletterMailRequest): Promise<NewsletterMailReceipt> {
    return {
      adapterId: "local-log",
      acceptedCount: request.recipientIds.length,
      deliveredAt: new Date().toISOString(),
    };
  },
};

/** 스토어가 사용하는 현재 어댑터. 실제 발송 연결 시 이 한 줄만 교체한다. */
export const NEWSLETTER_MAIL_ADAPTER: NewsletterMailAdapter = localLogNewsletterMailAdapter;
