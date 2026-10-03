/**
 * 플레이어 말풍선 채팅의 순수 도메인 로직.
 *
 * Gather처럼 "다가가서 바로 말 걸기"를 위한 계약이다. 전송·수신 자체는
 * presence 컨트롤러(studio-virtual-space-presence.ts)가 맡고, 여기서는 범위
 * 판정·로그 누적·말풍선 표시 시간·타이핑 만료·기본 금칙 마스킹만 다룬다.
 * 렌더링(Phaser 말풍선·HUD 로그)은 이 값들을 읽기만 한다.
 */

/** 채팅 범위: nearby는 대화 반경 안만, all은 방 전체. */
export type StudioVirtualSpaceChatScope = "nearby" | "all";

export const STUDIO_CHAT_SCOPES: readonly StudioVirtualSpaceChatScope[] = ["nearby", "all"];

/** "근처" 채팅이 닿는 거리(px). 설계 문서의 대화 반경 200px 기준. */
export const STUDIO_CHAT_NEARBY_RADIUS_PX = 200;
/** 채팅 로그 보관 상한. 오래된 것부터 버린다. */
export const STUDIO_CHAT_LOG_LIMIT = 100;
/** typing 신호가 새로고침 없이 유지되는 시간. 이 시간이 지나면 입력 종료로 본다. */
export const STUDIO_CHAT_TYPING_TTL_MS = 3_500;
/** typing=true를 보낸 뒤 재전송(새로고침)까지의 최소 간격. */
export const STUDIO_CHAT_TYPING_REFRESH_MS = 2_000;

export interface StudioVirtualSpaceChatMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly displayName: string;
  readonly scope: StudioVirtualSpaceChatScope;
  readonly text: string;
  readonly at: number;
  /** 내가 보낸 메시지인지. */
  readonly self: boolean;
}

export interface StudioVirtualSpaceChatBubble {
  readonly sessionId: string;
  readonly text: string;
  readonly expiresAt: number;
}

export interface StudioVirtualSpaceChatTyping {
  readonly sessionId: string;
  readonly scope: StudioVirtualSpaceChatScope;
  readonly expiresAt: number;
}

export function isStudioVirtualSpaceChatScope(value: unknown): value is StudioVirtualSpaceChatScope {
  return value === "nearby" || value === "all";
}

/** 범위와 거리로 수신 허용 여부를 정한다. all은 거리 무관, nearby는 반경 안만. */
export function studioChatScopeAllows(scope: StudioVirtualSpaceChatScope, distancePx: number): boolean {
  if (scope === "all") return true;
  return Number.isFinite(distancePx) && distancePx <= STUDIO_CHAT_NEARBY_RADIUS_PX;
}

/** 말풍선 표시 시간: 기본 4초에서 글자 수만큼 늘려 최대 10초. 긴 문장을 읽을 시간을 준다. */
export function studioChatBubbleDurationMs(text: string): number {
  return Math.min(10_000, 4_000 + text.length * 40);
}

/** 로그에 메시지를 붙이고 상한을 넘으면 오래된 것부터 버린다. */
export function appendStudioChatMessage(
  log: readonly StudioVirtualSpaceChatMessage[],
  message: StudioVirtualSpaceChatMessage,
): readonly StudioVirtualSpaceChatMessage[] {
  return Object.freeze([...log, message].slice(-STUDIO_CHAT_LOG_LIMIT));
}

/**
 * 기본 금칙 마스킹. 명백한 비속어 어간만 가리고 일상 단어(새끼·미친 등)는 건드리지 않는다.
 * 목록은 확장을 전제로 한 최소 집합이며, 송신 직전과 수신 파싱 양쪽에서 적용한다.
 */
const STUDIO_CHAT_MASK_PATTERNS: readonly RegExp[] = [
  /시발|씨발|씨ㅂ|ㅅㅂ|ㅆㅂ/gu,
  /병신|ㅂㅅ/gu,
  /개새끼|지랄|엿먹어/gu,
  /\bfuck(?:ing|er)?\b/giu,
  /\bshit\b/giu,
  /\bbitch\b/giu,
];

export function maskStudioChatProfanity(text: string): string {
  let masked = text;
  for (const pattern of STUDIO_CHAT_MASK_PATTERNS) {
    masked = masked.replace(pattern, (match) => "*".repeat(match.length));
  }
  return masked;
}

/** 만료된 말풍선·타이핑 항목을 걸러 낸다. snapshot 계산과 정리 양쪽에서 쓴다. */
export function studioChatBubbleAlive(bubble: StudioVirtualSpaceChatBubble, now: number): boolean {
  return bubble.expiresAt > now;
}

export function studioChatTypingAlive(typing: StudioVirtualSpaceChatTyping, now: number): boolean {
  return typing.expiresAt > now;
}
