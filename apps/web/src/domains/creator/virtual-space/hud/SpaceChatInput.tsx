import { MessageCircle, SendHorizonal } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_PRESENCE_BUBBLE_MAX_LENGTH } from "../studio-virtual-space-presence";
import { spaceShortcutIgnored } from "./use-space-shortcuts";

/**
 * 말풍선 채팅 입력. 지금까지 presence에 말풍선을 보낼 UI 자체가 없어
 * 플레이어끼리 텍스트로 말을 걸 방법이 없었다.
 *
 * - 닫힌 상태: Enter 키(또는 힌트 버튼)로 연다. 다른 표면이 열려 있으면(blocked)
 *   Enter를 가로채지 않고 힌트도 숨긴다.
 * - 열린 상태: 입력이 있으면 타이핑 신호를 올리고, Enter 전송 / Esc 취소 /
 *   포커스를 잃으면 전송 없이 닫는다. 입력 요소에 포커스가 있으므로
 *   캔버스 이동 키와 HUD 단축키는 기존 가드(입력 타깃 무시)로 충돌하지 않는다.
 * - 채널은 전체 채널이 실제로 없으므로 "근처" 하나로 고정한다 —
 *   없는 채널을 있는 척하지 않는다.
 */
export const SpaceChatInput = memo(function SpaceChatInput({ blocked, touch, onTypingChange, onSend, onClosed }: {
  /** 대화·패널 등 다른 표면이 열려 있는 동안에는 열지 않는다. */
  readonly blocked: boolean;
  /** 터치 기기에서는 키 힌트 대신 아이콘 버튼으로 보인다. */
  readonly touch: boolean;
  readonly onTypingChange: (typing: boolean) => void;
  readonly onSend: (text: string) => void;
  /** 전송·취소로 닫힌 뒤 호출된다(월드 포커스 복귀 등). */
  readonly onClosed: () => void;
}) {
  const bt = useBilingual("SpaceChatInput");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const composingRef = useRef(false);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const openRef = useRef(open);
  openRef.current = open;

  const close = useCallback((send: boolean) => {
    const text = value.trim();
    setOpen(false);
    setValue("");
    onTypingChange(false);
    if (send && text) onSend(text.slice(0, STUDIO_PRESENCE_BUBBLE_MAX_LENGTH));
    onClosed();
  }, [onClosed, onSend, onTypingChange, value]);

  // 다른 표면이 열리면 작성 중이어도 전송 없이 닫는다.
  useEffect(() => {
    if (blocked && open) close(false);
  }, [blocked, close, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open ]);

  // Enter로 열기. 버튼·링크에 포커스가 있으면 그쪽 Enter(활성화)를 방해하지 않는다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (openRef.current || blockedRef.current) return;
      if (event.key !== "Enter" || event.repeat) return;
      if (spaceShortcutIgnored(event)) return;
      const target = event.target;
      if (target instanceof Element && target.closest('button, a, [role="button"], [role="menu"], [role="dialog"]')) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) {
    if (blocked) return null;
    return <button type="button" className="space-chat-input__hint" data-space-interactive="true"
      aria-keyshortcuts={touch ? undefined : "Enter"}
      aria-label={bt("채팅 열기", "Open chat")}
      onClick={() => setOpen(true)}>
      <MessageCircle size={16} aria-hidden />
      {touch ? <span>{bt("채팅", "Chat")}</span> : <><kbd aria-hidden>Enter</kbd><span aria-hidden>{bt("채팅하기", "Chat")}</span></>}
    </button>;
  }

  return <form className="space-chat-input" data-space-interactive="true"
    onSubmit={(event) => { event.preventDefault(); if (!composingRef.current) close(true); }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(false); }}>
    <span className="space-chat-input__channel" aria-hidden>{bt("근처", "Nearby")}</span>
    <input ref={inputRef} type="text" value={value} maxLength={STUDIO_PRESENCE_BUBBLE_MAX_LENGTH}
      aria-label={bt("근처 사람들에게 보낼 말", "Message for people nearby")}
      placeholder={bt("근처 사람들에게 말하기…", "Message people nearby…")}
      autoComplete="off" enterKeyHint="send"
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; }}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        onTypingChange(next.trim().length > 0);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); close(false); }
      }} />
    <button type="submit" className="space-chat-input__send" disabled={value.trim().length === 0}
      aria-label={bt("보내기", "Send")}>
      <SendHorizonal size={16} aria-hidden />
    </button>
    <span className="sr-only" role="note">{bt("Enter 전송, Esc 취소", "Enter to send, Escape to cancel")}</span>
  </form>;
});
