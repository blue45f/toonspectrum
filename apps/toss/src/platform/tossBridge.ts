import { createTossPlatformBridge } from '@heejun/platform-bridge/toss';

/**
 * 토스 PlatformBridge — 공통 패키지 @heejun/platform-bridge 의 팩토리 사용.
 * 토스 밖(웹/샌드박스 프리뷰)에서는 자동으로 웹 폴백한다.
 */
export const tossPlatformBridge = createTossPlatformBridge();
