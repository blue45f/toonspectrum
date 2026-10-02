/**
 * 뉴스레터 데모 시드 — 서버 구독 집계가 붙기 전까지 화면 표시용 기준 구독자 수.
 *
 * 작가명은 컷츠 데모 시드(`cuts-seed.ts`)의 데모 작가와 맞췄다. 이 숫자는
 * "표시용 기준값"일 뿐 실제 발송 수신자 수가 아니다. 발송 시 수신자는
 * 로컬 스토어에 실제로 구독 중인 독자만으로 확정한다(`newsletter-store.ts`).
 * 서버 구독 API가 생기면 이 시드는 제거하고 서버 집계로 대체한다.
 */
export const NEWSLETTER_SEED_SUBSCRIBER_COUNTS: Readonly<Record<string, number>> = {
  김밤하늘: 128,
  박구름: 86,
  이매콤: 57,
};

export function seedSubscriberCount(authorName: string): number {
  return NEWSLETTER_SEED_SUBSCRIBER_COUNTS[authorName] ?? 0;
}
