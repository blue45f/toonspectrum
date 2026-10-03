/**
 * 캐릭터 챗 스레드 — 메시지 로그와 입력창.
 *
 * 팬 페이지와 작가 관리 페이지(테스트 대화)가 함께 쓴다. 금지 주제 가드는
 * 엔진 호출 전에 여기서 걸고, 막힌 턴은 스토어에 횟수만 남긴다(내용은 남기지
 * 않는다). 대화 자체는 스토어 세션에 쌓이며 이 브라우저를 벗어나지 않는다.
 */

import { Send, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { guardCharacterChatTurn } from "./character-chat-filter";
import { useCharacterChatHydrated, useCharacterChatStore } from "./character-chat-store";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";
import type { CharacterChatEngine } from "./character-chat-engine";
import type {
  CharacterChatMessage,
  CharacterChatProfile,
} from "./character-chat-types";

export function CharacterAvatar({
  profile,
  size = "md",
}: {
  readonly profile: CharacterChatProfile;
  readonly size?: "sm" | "md";
}) {
  const classes = size === "sm" ? "size-9 text-sm" : "size-12 text-lg";
  if (profile.avatarUrl) {
    return (
      <img src={profile.avatarUrl} alt="" className={cn("shrink-0 rounded-full object-cover", classes)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full bg-accent-soft font-black text-accent", classes)}
    >
      {profile.characterName.slice(0, 1)}
    </span>
  );
}

function MessageBubble({
  message,
  profile,
}: {
  readonly message: CharacterChatMessage;
  readonly profile: CharacterChatProfile;
}) {
  const isFan = message.role === "fan";
  return (
    <li className={cn("flex gap-2.5", isFan ? "flex-row-reverse" : "flex-row")}>
      {!isFan ? <CharacterAvatar profile={profile} size="sm" /> : null}
      <div className={cn("max-w-[80%]", isFan ? "text-right" : "text-left")}>
        {!isFan ? (
          <p className="mb-1 text-xs font-semibold text-fg-3">{profile.characterName}</p>
        ) : null}
        <p
          className={cn(
            "inline-block whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed",
            isFan
              ? "rounded-br-md bg-accent text-on-accent"
              : "rounded-bl-md border border-line bg-card text-fg",
          )}
        >
          {message.text}
        </p>
      </div>
    </li>
  );
}

export function CharacterChatThread({
  profile,
  engine,
  ready,
}: {
  readonly profile: CharacterChatProfile;
  readonly engine: CharacterChatEngine;
  readonly ready: boolean;
}) {
  const t = useBilingual("characterChat");
  const actorId = useAuthActorId();
  const hydrated = useCharacterChatHydrated();
  const ensureSession = useCharacterChatStore((state) => state.ensureSession);
  const appendMessage = useCharacterChatStore((state) => state.appendMessage);
  const recordBlockedTurn = useCharacterChatStore((state) => state.recordBlockedTurn);
  // 대화 세션은 나눈 본인의 것만 본다 — 다른 계정의 대화가 이어 보이면 안 된다.
  const session = useCharacterChatStore((state) =>
    state.sessions.find(
      (item) => item.profileId === profile.id && (item.ownerId ?? null) === actorId,
    ),
  );

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<{ readonly text: string; readonly retryText: string } | null>(null);
  const logRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 복원이 끝나기 전에 세션을 만들면 복원된 기존 대화에 덮여 사라진다.
  useEffect(() => {
    if (hydrated) ensureSession(profile.id);
  }, [hydrated, ensureSession, profile.id]);

  useEffect(() => {
    setDraft("");
    setNotice(null);
    setError(null);
  }, [profile.id]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [session?.messages.length, sending]);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || sending) return;
      const guard = guardCharacterChatTurn(profile, text);
      if (!guard.allowed) {
        recordBlockedTurn(profile.id);
        setError(null);
        setNotice(
          t(
            `작가가 정한 금지 주제(${guard.matchedTopics.join(", ")})는 이야기할 수 없어요. 다른 걸 물어봐 주세요.`,
            `The author set this topic (${guard.matchedTopics.join(", ")}) as off-limits. Try asking something else.`,
          ),
        );
        return;
      }
      setNotice(null);
      setError(null);
      const history = session?.messages ?? [];
      appendMessage(profile.id, "fan", text);
      setDraft("");
      setSending(true);
      const result = await engine.generateReply({ profile, history, userText: text });
      setSending(false);
      if (result.ok) {
        appendMessage(profile.id, "character", result.text);
      } else {
        setError({ text: result.error, retryText: text });
      }
      inputRef.current?.focus();
    },
    [appendMessage, engine, profile, recordBlockedTurn, sending, session?.messages, t],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  return (
    <div className="flex min-h-[28rem] flex-1 flex-col">
      <ul
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label={t("대화 내용", "Conversation")}
        className="flex max-h-[26rem] flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
      >
        {(session?.messages ?? []).map((message) => (
          <MessageBubble key={message.id} message={message} profile={profile} />
        ))}
        {sending ? (
          <li className="flex gap-2.5" aria-label={t("캐릭터가 답을 쓰는 중", "Character is typing")}>
            <CharacterAvatar profile={profile} size="sm" />
            <p className="rounded-2xl rounded-bl-md border border-line bg-card px-3.5 py-2.5 text-sm text-fg-3">
              {profile.characterName}
              {t("님이 입력 중…", " is typing…")}
            </p>
          </li>
        ) : null}
      </ul>

      <div className="border-t border-line bg-card px-4 py-3">
        {notice ? (
          <p role="alert" className="mb-2 flex items-start gap-1.5 text-xs leading-relaxed text-warn">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
            {notice}
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 text-xs text-bad">
            <span className="flex-1 leading-relaxed">{error.text}</span>
            <button
              type="button"
              onClick={() => void send(error.retryText)}
              className="min-h-11 rounded-lg border border-line px-3 font-bold text-fg-2 hover:border-accent/50 hover:text-accent"
            >
              {t("다시 시도", "Retry")}
            </button>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`character-chat-input-${profile.id}`}>
            {t("캐릭터에게 보낼 메시지", "Message to the character")}
          </label>
          <textarea
            id={`character-chat-input-${profile.id}`}
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            maxLength={1000}
            disabled={!ready || sending}
            placeholder={
              ready
                ? t(`${profile.characterName}에게 말을 걸어 보세요`, `Say something to ${profile.characterName}`)
                : t("AI 키를 등록하면 대화할 수 있어요", "Register an AI key to chat")
            }
            className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!ready || sending || !draft.trim()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={15} aria-hidden />
            {t("보내기", "Send")}
          </button>
        </form>
        <p className="mt-2 text-[0.65rem] leading-relaxed text-fg-3">
          {t(
            "Enter로 보내고 Shift+Enter로 줄을 바꿔요. 대화는 이 브라우저에만 남아요.",
            "Press Enter to send, Shift+Enter for a new line. This conversation stays in your browser.",
          )}
        </p>
      </div>
    </div>
  );
}
