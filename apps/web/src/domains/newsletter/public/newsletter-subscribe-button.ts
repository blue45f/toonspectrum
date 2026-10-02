/**
 * 뉴스레터 도메인의 공개 경계 — 다른 도메인(catalog 작가/작품 페이지)이
 * 구독 토글을 가져다 쓰는 유일한 진입점. 도메인 내부 파일로 직접 들어오는
 * deep import는 아키텍처 래칫이 금지한다.
 */
export { NewsletterSubscribeButton } from "../NewsletterSubscribeButton";
