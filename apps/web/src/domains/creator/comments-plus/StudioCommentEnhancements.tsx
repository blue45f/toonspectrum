/**
 * Studio Comment Enhancements — 댓글 고도화 프레젠테이션 컴포넌트.
 *
 * 순수 코어(`studio-comment-enhance`)를 화면에 연결하는 브리지다.
 * 기존 댓글 패널은 건드리지 않는다.
 *
 * - TypingIndicator: "누가 입력 중" 애니메이션 표시.
 * - ReactionBar: 이모지 리액션 집계 + 낙관적 토글.
 * - MentionText: @멘션 하이라이트 렌더링.
 * - ThreadStatusChip: 해결/미해결 상태 칩.
 *
 * ko/en, 다크/라이트, 390px 모바일, reduced-motion, 키보드 접근성 대응.
 */
import type { ReactElement, ReactNode } from "react";
import { Check, CircleDashed } from "lucide-react";

import {
  getCurrentUiLocale,
  translateAuthoredSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  aggregateReactions,
  parseMentions,
  type Reaction,
  type ReactionSummary,
} from "./studio-comment-enhance";

function useTx(): (source: string) => string {
  useBilingualI18nRevision();
  const locale = getCurrentUiLocale();
  return (source: string) =>
    translateAuthoredSourceText(locale, "ko", "StudioCommentEnhancements", source);
}

// ── 타이핑 인디케이터 ──────────────────────────────────────────────────

export interface TypingUser {
  userId: string;
  userName: string;
}

export function TypingIndicator({
  users,
}: {
  /** 현재 타이핑 중인 사용자 (최대 3명까지 표시). */
  users: TypingUser[];
}): ReactElement | null {
  const tx = useTx();
  const visible = users.slice(0, 3);
  if (visible.length === 0) return null;

  const label =
    visible.length === 1
      ? tx("{name}님이 입력 중…").replace("{name}", visible[0].userName)
      : tx("{names} 외 {n}명이 입력 중…")
          .replace("{names}", visible.map((u) => u.userName).join(", "))
          .replace("{n}", String(visible.length - 1));

  return (
    <div
      className="flex items-center gap-2 text-xs text-fg-3"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <style>{`
        @keyframes sc-enh-typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } }
        .sc-enh-typing-dot { animation: sc-enh-typing-bounce 1.2s ease-in-out infinite; }
        .sc-enh-typing-dot:nth-child(2) { animation-delay: .15s; }
        .sc-enh-typing-dot:nth-child(3) { animation-delay: .3s; }
        @media (prefers-reduced-motion: reduce) { .sc-enh-typing-dot { animation: none; opacity: .7; } }
      `}</style>
      <span className="flex items-end gap-1" aria-hidden="true">
        <span className="sc-enh-typing-dot inline-block size-1.5 rounded-full bg-fuchsia-500" />
        <span className="sc-enh-typing-dot inline-block size-1.5 rounded-full bg-fuchsia-500" />
        <span className="sc-enh-typing-dot inline-block size-1.5 rounded-full bg-fuchsia-500" />
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}

// ── 리액션 바 ──────────────────────────────────────────────────────────

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "👏"] as const;

export function ReactionBar({
  reactions,
  myUserId,
  onToggle,
  onQuickAdd,
}: {
  reactions: Reaction[];
  myUserId: string;
  /** 이모지 토글 (낙관적 업데이트는 호출자가 처리). */
  onToggle: (emoji: string) => void;
  /** 빠른 추가 팝오버 등을 여는 용도. 없으면 빠른 추가 버튼을 숨긴다. */
  onQuickAdd?: () => void;
}): ReactElement {
  const tx = useTx();
  const summary: ReactionSummary[] = aggregateReactions(reactions, myUserId);

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tx("리액션")}>
      {summary.map(({ emoji, count, reactedByMe }) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          aria-pressed={reactedByMe}
          aria-label={`${emoji} ${count}개${reactedByMe ? `, ${tx("내 리액션")}` : ""}`}
          className={
            reactedByMe
              ? "inline-flex min-h-8 items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-amber-400 px-2.5 py-1 text-xs font-bold text-white shadow-md transition-transform hover:scale-105 active:scale-95"
              : "inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-2 transition-all hover:scale-105 hover:border-fuchsia-400 active:scale-95"
          }
        >
          <span aria-hidden="true">{emoji}</span>
          <span className="tabular-nums">{count}</span>
        </button>
      ))}
      {onQuickAdd && (
        <button
          type="button"
          onClick={onQuickAdd}
          aria-label={tx("리액션 추가")}
          title={tx("리액션 추가")}
          className="inline-flex min-h-8 size-8 items-center justify-center rounded-full border border-dashed border-line text-fg-3 transition-colors hover:border-fuchsia-400 hover:text-fuchsia-500"
        >
          <span aria-hidden="true" className="text-sm leading-none">+</span>
        </button>
      )}
      {summary.length === 0 && !onQuickAdd && (
        <span className="text-xs text-fg-4">{tx("아직 리액션이 없어요")}</span>
      )}
    </div>
  );
}

/** 빠른 리액션 선택기 (이모지 5종). */
export function QuickReactionPicker({
  onPick,
}: {
  onPick: (emoji: string) => void;
}): ReactElement {
  const tx = useTx();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={tx("빠른 리액션")}>
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          aria-label={`${emoji} ${tx("리액션")}`}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl text-xl transition-transform hover:scale-125 active:scale-95"
        >
          <span aria-hidden="true">{emoji}</span>
        </button>
      ))}
    </div>
  );
}

// ── 멘션 텍스트 ────────────────────────────────────────────────────────

export function MentionText({
  text,
  onMentionClick,
}: {
  text: string;
  /** 멘션 클릭 시 (프로필 이동 등). 없으면 클릭 불가. */
  onMentionClick?: (name: string) => void;
}): ReactElement {
  const mentions = parseMentions(text);
  if (mentions.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  mentions.forEach((m, i) => {
    if (m.start > cursor) parts.push(text.slice(cursor, m.start));
    const label = text.slice(m.start, m.end);
    parts.push(
      onMentionClick ? (
        <button
          key={i}
          type="button"
          onClick={() => onMentionClick(m.name)}
          className="rounded bg-fuchsia-500/15 px-0.5 font-semibold text-fuchsia-600 underline decoration-fuchsia-300 underline-offset-2 dark:text-fuchsia-300"
        >
          {label}
        </button>
      ) : (
        <span
          key={i}
          className="rounded bg-fuchsia-500/15 px-0.5 font-semibold text-fuchsia-600 dark:text-fuchsia-300"
        >
          {label}
        </span>
      )
    );
    cursor = m.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

// ── 스레드 상태 칩 ────────────────────────────────────────────────────

export function ThreadStatusChip({
  resolved,
  onToggle,
}: {
  resolved: boolean;
  /** 클릭 시 해결/다시 열기. 없으면 표시 전용. */
  onToggle?: () => void;
}): ReactElement {
  const tx = useTx();
  const label = resolved ? tx("해결됨") : tx("미해결");
  const inner = (
    <>
      {resolved ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <span className="relative flex size-2.5" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
        </span>
      )}
      {label}
    </>
  );
  const className = resolved
    ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300"
    : "inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300";

  if (!onToggle) {
    return (
      <span className={className} role="status">
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={resolved}
      aria-label={resolved ? tx("다시 열기") : tx("해결하기")}
      title={resolved ? tx("다시 열기") : tx("해결하기")}
      className={`${className} min-h-8 transition-transform hover:scale-105 active:scale-95`}
    >
      {inner}
      {!resolved && <CircleDashed className="size-3.5 opacity-60" aria-hidden="true" />}
    </button>
  );
}
