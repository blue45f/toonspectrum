/**
 * StudioCommentsPanel 표시 헬퍼 — 날짜·우선순위·행위자 관계 라벨,
 * 앵커 라벨처럼 패널 본문과 분리 가능한 순수 표시 로직만 모은다.
 * (2026-10-03 파일 크기 래칫 해소로 StudioCommentsPanel에서 추출 — 동작 변경 없음.)
 */

import {
  studioCommentAnchorsEqual,
  type StudioCommentActor,
  type StudioCommentAnchor,
} from "./studio-comments";
import type { StudioReviewTaskPriority } from "./studio-review-task-compiler";

export interface StudioCommentAnchorOption {
  anchor: StudioCommentAnchor;
  label: string;
}

export type CurrentActorRelation = "mentioned" | "assigned" | "authored" | "participated" | null;

export interface CommentMessageTarget {
  threadId: string;
  replyId?: string;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? DATE_FORMATTER.format(time) : value;
}

export function reviewTaskPriorityClass(priority: StudioReviewTaskPriority): string {
  if (priority === "urgent") return "border-bad/40 bg-bad/10 text-bad";
  if (priority === "high") return "border-warn/40 bg-warn/10 text-warn";
  if (priority === "low") return "border-line bg-raised text-fg-3";
  return "border-cool/35 bg-cool/10 text-cool";
}

export function actorInitial(actor: StudioCommentActor): string {
  return Array.from(actor.displayName.trim())[0] ?? "?";
}

export function studioCommentCurrentActorRelationLabel(
  relation: CurrentActorRelation
): string | null {
  if (relation === "mentioned") return "나를 멘션";
  if (relation === "assigned") return "내 담당";
  if (relation === "authored") return "내 댓글";
  if (relation === "participated") return "내가 참여";
  return null;
}

export function isStudioCommentTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.matches("input, textarea, select") || target.isContentEditable);
}

export function messageTargetsEqual(
  left: CommentMessageTarget | null,
  right: CommentMessageTarget
): boolean {
  return left?.threadId === right.threadId && left.replyId === right.replyId;
}

export function shortId(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 5)}…${value.slice(-4)}`;
}

export function fallbackAnchorLabel(anchor: StudioCommentAnchor): string {
  if (anchor.type === "page") return `페이지 · ${shortId(anchor.pageId)}`;
  if (anchor.type === "frame") return `컷 · ${shortId(anchor.frameId)}`;
  if (anchor.type === "point") return `위치 · ${Math.round(anchor.x * 100)}%, ${Math.round(anchor.y * 100)}%`;
  return `요소 · ${shortId(anchor.elementId)}`;
}

export function getAnchorLabel(
  anchor: StudioCommentAnchor,
  options: readonly StudioCommentAnchorOption[]
): string {
  return options.find((option) => studioCommentAnchorsEqual(option.anchor, anchor))?.label
    ?? fallbackAnchorLabel(anchor);
}
