import { useEffect, useRef, useState } from "react";

import { formatI18nTemplate, translateBilingualPair } from "@/shared/lib/i18n-bilingual-copy";
import { collabButton } from "../collaboration-ui";

import type { CreatorRoomMessage, CreatorRoomParticipant } from "../../../../../../packages/contracts/src/creator-hiring";

const SCOPE = "domains.collaboration.meetingPresence";

const copy = {
  participants: () =>
    translateBilingualPair(SCOPE, "현재 표시 가능한 참여자", "Participants currently visible"),
  me: () => translateBilingualPair(SCOPE, "나", "me"),
  host: () => translateBilingualPair(SCOPE, "호스트", "Host"),
  checkedAgo: (seconds: number) =>
    formatI18nTemplate(
      translateBilingualPair(SCOPE, "참여자·대화 {n}초 전 확인됨", "Participants & messages checked {n}s ago"),
      { n: seconds },
    ),
  checkedJustNow: () =>
    translateBilingualPair(SCOPE, "방금 확인됨", "Checked just now"),
  conversation: () =>
    translateBilingualPair(SCOPE, "텍스트 대화", "Text conversation"),
  newMessages: (count: number) =>
    formatI18nTemplate(
      translateBilingualPair(SCOPE, "새 메시지 {n}개 보기", "View {n} new messages"),
      { n: count },
    ),
  admit: (name: string) =>
    formatI18nTemplate(
      translateBilingualPair(SCOPE, "{name} 입장 승인", "Admit {name}"),
      { name },
    ),
  remove: (name: string) =>
    formatI18nTemplate(
      translateBilingualPair(SCOPE, "{name} 퇴장", "Remove {name}"),
      { name },
    ),
};

const STATUS_STYLE: Record<CreatorRoomParticipant["status"], string> = {
  admitted: "bg-good/15 text-good",
  waiting: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  invited: "bg-accent/10 text-accent",
  removed: "bg-raised text-fg-3",
  left: "bg-raised text-fg-3",
};
const STATUS_LABEL: Record<CreatorRoomParticipant["status"], () => string> = {
  invited: () => translateBilingualPair(SCOPE, "초대됨", "Invited"),
  waiting: () => translateBilingualPair(SCOPE, "호스트 입장 승인 대기", "Waiting for host approval"),
  admitted: () => translateBilingualPair(SCOPE, "텍스트 대화 입장 승인됨", "Admitted to chat"),
  removed: () => translateBilingualPair(SCOPE, "퇴장됨", "Removed"),
  left: () => translateBilingualPair(SCOPE, "나감", "Left"),
};

export function ParticipantChips({
  participants,
  actorId,
  isHost,
  busy,
  onAdmit,
  onRemove,
}: {
  participants: CreatorRoomParticipant[];
  actorId: string;
  isHost: boolean;
  busy: boolean;
  onAdmit: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label={copy.participants()}>
      {participants.map((p) => {
        const me = p.userId === actorId;
        return (
          <li
            key={p.userId}
            className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-line bg-raised py-1.5 pl-1.5 pr-2.5"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent"
            >
              {p.displayName.slice(0, 1)}
            </span>
            <span className="max-w-32 truncate text-sm font-semibold text-fg">
              {p.displayName}
            </span>
            {me && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">
                {copy.me()}
              </span>
            )}
            {p.role === "host" && (
              <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-bold text-fg-2 ring-1 ring-line">
                {copy.host()}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[p.status]}`}
            >
              {STATUS_LABEL[p.status]()}
            </span>
            {isHost && !me && p.status === "waiting" && (
              <button
                type="button"
                disabled={busy}
                className={`${collabButton} min-h-8 px-2.5 py-1 text-xs`}
                aria-label={copy.admit(p.displayName)}
                onClick={() => onAdmit(p.userId)}
              >
                {translateBilingualPair(SCOPE, "승인", "Admit")}
              </button>
            )}
            {isHost && !me && !["removed", "left"].includes(p.status) && (
              <button
                type="button"
                disabled={busy}
                className={`${collabButton} min-h-8 px-2.5 py-1 text-xs`}
                aria-label={copy.remove(p.displayName)}
                onClick={() => onRemove(p.userId)}
              >
                {translateBilingualPair(SCOPE, "퇴장", "Remove")}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 마지막으로 방 상태를 확인한 시점을 "N초 전" 형태로 보여준다. */
export function PresenceFreshness({ lastCheckedAt }: { lastCheckedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lastCheckedAt == null) return;
    const timer = globalThis.setInterval(() => setNow(Date.now()), 10_000);
    return () => globalThis.clearInterval(timer);
  }, [lastCheckedAt]);
  if (lastCheckedAt == null) return null;
  const seconds = Math.max(0, Math.round((now - lastCheckedAt) / 1000));
  return (
    <p role="status" className="text-xs text-fg-3">
      {seconds < 5 ? copy.checkedJustNow() : copy.checkedAgo(seconds)}
    </p>
  );
}

const NEAR_BOTTOM_PX = 80;

export function MeetingMessageList({ messages }: { messages: CreatorRoomMessage[] }) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const previousCount = useRef(0);
  const [unseen, setUnseen] = useState(0);
  useEffect(() => {
    const list = listRef.current;
    const delta = messages.length - previousCount.current;
    previousCount.current = messages.length;
    if (!list || delta <= 0) return;
    const nearBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom) {
      list.scrollTop = list.scrollHeight;
      setUnseen(0);
    } else {
      setUnseen((count) => count + delta);
    }
  }, [messages]);
  function scrollToBottom() {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    setUnseen(0);
  }
  return (
    <div className="relative">
      <ol
        ref={listRef}
        aria-label={copy.conversation()}
        aria-live="polite"
        onScroll={(event) => {
          const list = event.currentTarget;
          if (list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX) {
            setUnseen(0);
          }
        }}
        className="max-h-80 space-y-2 overflow-y-auto rounded border border-line p-3"
      >
        {messages.map((m) => (
          <li key={m.id}>
            <span className="text-xs text-fg-3">
              {m.displayName} · {new Date(m.createdAt).toLocaleTimeString("ko-KR")}
            </span>
            <p className="whitespace-pre-wrap break-words">{m.text}</p>
          </li>
        ))}
      </ol>
      {unseen > 0 && (
        <button
          type="button"
          className={`${collabButton} absolute inset-x-0 bottom-2 mx-auto w-fit shadow-lg`}
          onClick={scrollToBottom}
        >
          {copy.newMessages(unseen)}
        </button>
      )}
    </div>
  );
}
