/**
 * 원고 뷰어 핀 피드백 — 순수 모델.
 *
 * 크레코(CRECO)의 "뷰어 기반 피드백"을 뛰어넘는 UX를 위한 도메인 모델.
 * 모든 좌표는 0..1 정규화 (원고 크기와 무관하게 재투영).
 * React에 의존하지 않으므로 단위 테스트가 쉽다.
 */

import type {
  StudioCommentAnchor,
  StudioCommentsDocument,
  StudioCommentThread,
} from "../studio-comments";

/** 핀 상태: 미해결 / 해결됨 / 긴급 */
export type ManuscriptPinStatus = "open" | "resolved" | "urgent";

export interface ManuscriptPin {
  readonly id: string;
  /** 0..1 정규화 X 좌표 */
  readonly x: number;
  /** 0..1 정규화 Y 좌표 */
  readonly y: number;
  readonly status: ManuscriptPinStatus;
  readonly authorId: string | null;
  readonly authorName: string;
  readonly createdAt: string;
  /** 연결된 댓글 스레드 ID (StudioCommentsPanel 브리지용) */
  readonly threadId: string | null;
  readonly replyCount: number;
  /** 표시용 순번 (1부터, 생성 순서) */
  readonly number: number;
}

export type ManuscriptPinInput = Omit<ManuscriptPin, "number">;

export type ManuscriptPinFilter = "all" | "open" | "mine";

export const MANUSCRIPT_PIN_FILTERS: readonly ManuscriptPinFilter[] = ["all", "open", "mine"] as const;

/** 좌표를 0..1 범위로 클램프 */
export function clampPinCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 핀 목록에 안정적인 표시 순번 부여 (createdAt 오름차순, 동점 시 id) */
export function numberManuscriptPins<T extends ManuscriptPinInput>(pins: readonly T[]): (T & { readonly number: number })[] {
  const sorted = [...pins].sort((a, b) => {
    const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
  return sorted.map((pin, index) => ({ ...pin, number: index + 1 }));
}

/** 필터 적용 */
export function filterManuscriptPins<T extends ManuscriptPin>(
  pins: readonly T[],
  filter: ManuscriptPinFilter,
  currentActorId: string | null,
): T[] {
  switch (filter) {
    case "open":
      return pins.filter((pin) => pin.status !== "resolved");
    case "mine":
      if (!currentActorId) return [];
      return pins.filter((pin) => pin.authorId === currentActorId);
    case "all":
    default:
      return [...pins];
  }
}

/** 미해결 핀 수 */
export function countOpenManuscriptPins(pins: readonly ManuscriptPin[]): number {
  return pins.filter((pin) => pin.status !== "resolved").length;
}

/**
 * 긴급 핀 본문 접두사.
 * 스레드 문서에는 긴급 표식을 저장할 별도 필드가 없어 본문 접두사로 인코딩한다.
 * UI에 표시할 때는 stripManuscriptPinUrgentPrefix로 제거한다.
 */
export const MANUSCRIPT_PIN_URGENT_PREFIX = "[긴급] ";

/** UI 표시용 본문에서 긴급 접두사를 제거한다 */
export function stripManuscriptPinUrgentPrefix(body: string): string {
  return body.startsWith(MANUSCRIPT_PIN_URGENT_PREFIX)
    ? body.slice(MANUSCRIPT_PIN_URGENT_PREFIX.length)
    : body;
}

/** 스레드의 resolved 여부와 긴급 표식을 핀 상태로 매핑 */
export function resolvePinStatusFromThread(thread: {
  readonly resolved: boolean;
  readonly body: string;
}): ManuscriptPinStatus {
  if (thread.resolved) return "resolved";
  if (thread.body.startsWith(MANUSCRIPT_PIN_URGENT_PREFIX)) return "urgent";
  return "open";
}

/**
 * 핀 → StudioCommentAnchor (point) 변환.
 * StudioCommentsPanel 브리지용: 핀 위치를 기존 앵커 체계와 호환시킨다.
 */
export function manuscriptPinToCommentAnchor(pin: Pick<ManuscriptPin, "x" | "y">, pageId: string): StudioCommentAnchor {
  return {
    type: "point",
    pageId,
    x: clampPinCoordinate(pin.x),
    y: clampPinCoordinate(pin.y),
  };
}

/**
 * StudioCommentThread → ManuscriptPin 변환.
 * point 앵커가 아닌 스레드는 null (핀으로 표시 불가).
 */
export function commentThreadToManuscriptPin(
  thread: StudioCommentThread,
  pageId: string,
  number: number,
): ManuscriptPin | null {
  if (thread.anchor.type !== "point" || thread.anchor.pageId !== pageId) return null;
  return {
    id: `pin-${thread.id}`,
    x: thread.anchor.x,
    y: thread.anchor.y,
    status: resolvePinStatusFromThread(thread),
    authorId: thread.author.id ?? null,
    authorName: thread.author.displayName,
    createdAt: thread.createdAt,
    threadId: thread.id,
    replyCount: thread.replies.length,
    number,
  };
}

/** 문서 전체를 핀 목록으로 변환 (현재 페이지의 point 앵커만) */
export function commentsDocumentToManuscriptPins(
  document: StudioCommentsDocument,
  pageId: string,
): ManuscriptPin[] {
  const pins: ManuscriptPin[] = [];
  for (const thread of document.threads) {
    const pin = commentThreadToManuscriptPin(thread, pageId, 0);
    if (pin) pins.push(pin);
  }
  // numberManuscriptPins로 순번 재부여
  return numberManuscriptPins(pins);
}

/**
 * 본문에서 `@이름` 멘션 토큰을 추출한다 (중복 제거, 등장 순서 유지).
 * 협업자 명단이 없어도 입력만으로 멘션을 기록할 수 있게 하기 위한 규칙이다.
 * trailing 구두점(쉼표·마침표 등)은 이름에 포함하지 않는다.
 */
const MENTION_TOKEN_PATTERN = /@([^\s@]{1,40})/gu;

export function extractMentionNamesFromBody(body: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN_PATTERN)) {
    const name = match[1].replace(/[.,!?;:)\]}>]+$/u, "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * 핀 ID → 연결된 스레드 ID 조회.
 * 브리지의 답글/해결/재오픈 핸들러가 공유한다 (문서 재변환 로직 중복 제거).
 */
export function findThreadIdForPin(
  document: StudioCommentsDocument,
  pageId: string,
  pinId: string,
): string | null {
  const pin = commentsDocumentToManuscriptPins(document, pageId).find(
    (candidate) => candidate.id === pinId,
  );
  return pin?.threadId ?? null;
}

/** 두 점 사이 거리 (정규화 좌표계) */
export function pinDistance(a: Pick<ManuscriptPin, "x" | "y">, b: Pick<ManuscriptPin, "x" | "y">): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 새 핀이 기존 핀과 너무 겹치는지 검사.
 * 겹치면 true — UI에서 살짝 오프셋하거나 경고 표시용.
 */
export function isPinOverlapping(
  candidate: Pick<ManuscriptPin, "x" | "y">,
  existing: readonly Pick<ManuscriptPin, "x" | "y">[],
  minDistance = 0.035,
): boolean {
  return existing.some((pin) => pinDistance(candidate, pin) < minDistance);
}

/** 핀 상태별 표시 순서 가중치 (긴급 > 미해결 > 해결됨) */
export function pinStatusWeight(status: ManuscriptPinStatus): number {
  switch (status) {
    case "urgent":
      return 0;
    case "open":
      return 1;
    case "resolved":
      return 2;
  }
}

/** 사이드바 정렬: 상태 우선 → 생성 순서 */
export function sortPinsForSidebar<T extends ManuscriptPin>(pins: readonly T[]): T[] {
  return [...pins].sort((a, b) => {
    const byStatus = pinStatusWeight(a.status) - pinStatusWeight(b.status);
    if (byStatus !== 0) return byStatus;
    return a.number - b.number;
  });
}

/** 뷰어 줌/패닝 상태 */
export interface ManuscriptPinViewTransform {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

/** 사이드바 핀 클릭 시 이동하는 목표 줌 배율 */
export const MANUSCRIPT_PIN_FLY_TO_ZOOM = 1.8;

/**
 * 사이드바에서 핀을 클릭했을 때의 목표 transform을 계산한다 (순수 함수).
 * 핀의 현재 화면 위치를 뷰어 중앙으로 옮기도록 패닝한다.
 */
export function computeFlyToTransform(args: {
  readonly viewerWidth: number;
  readonly viewerHeight: number;
  readonly pinScreenX: number;
  readonly pinScreenY: number;
  readonly current: ManuscriptPinViewTransform;
  readonly targetZoom?: number;
}): ManuscriptPinViewTransform {
  const zoom = args.targetZoom ?? MANUSCRIPT_PIN_FLY_TO_ZOOM;
  const scaleRatio = zoom / args.current.zoom;
  return {
    zoom,
    panX: args.current.panX * scaleRatio + (args.viewerWidth / 2 - args.pinScreenX * scaleRatio),
    panY: args.current.panY * scaleRatio + (args.viewerHeight / 2 - args.pinScreenY * scaleRatio),
  };
}

/* ------------------------------------------------------------------ */
/* 화면 표시용 핀 (스레드 본문·답글·멘션 포함)                          */
/* ------------------------------------------------------------------ */

/** 화면 표시용 핀: 모델 핀 + 스레드 본문·답글·멘션 */
export interface ManuscriptPinFeedbackPin extends ManuscriptPin {
  readonly body: string;
  readonly replies: readonly ManuscriptPinFeedbackReply[];
  /** 멘션된 표시 이름 목록 */
  readonly mentions: readonly string[];
}

export interface ManuscriptPinFeedbackReply {
  readonly authorName: string;
  readonly body: string;
  readonly createdAt: string;
}
