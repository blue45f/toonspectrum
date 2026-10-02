import { useEffect, useRef } from "react";

import { studioSpaceEmoteForKey, type StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";

export interface SpaceShortcutHandlers {
  /** 1~9·Z 이모트. */
  readonly onEmote: (id: StudioSpaceEmoteId) => void;
  /** M: 지도 열기/닫기. */
  readonly onToggleMap: () => void;
  /** P: 참가자 패널 열기/닫기. */
  readonly onTogglePeople: () => void;
  /** ?: 단축키 도움말. */
  readonly onHelp: () => void;
  /** Esc: 가장 위에 열린 HUD 레이어를 닫는다. 닫은 레이어가 있으면 true. */
  readonly onEscape: () => boolean;
}

const TEXT_ENTRY_SELECTOR = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';

/** 입력 요소·IME 조합·보조키 조합은 HUD 단축키로 해석하지 않는다. */
export function spaceShortcutIgnored(event: Pick<KeyboardEvent, "isComposing" | "ctrlKey" | "metaKey" | "altKey" | "target" | "defaultPrevented">): boolean {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target;
  return target instanceof Element && Boolean(target.closest(TEXT_ENTRY_SELECTOR));
}

/**
 * HUD(window) 단축키: 1~9·Z 이모트, M 지도, P 참가자, ? 도움말, Esc 최상위 레이어 닫기.
 * 이동(WASD·방향키)과 상호작용(X)은 캔버스가 맡으므로 여기서 바인딩하지 않는다.
 */
export function useSpaceShortcuts(handlers: SpaceShortcutHandlers, enabled = true): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.isComposing || event.defaultPrevented) return;
        if (latest.current.onEscape()) event.preventDefault();
        return;
      }
      if (event.repeat || spaceShortcutIgnored(event)) return;
      const emote = studioSpaceEmoteForKey(event.key);
      if (emote) {
        event.preventDefault();
        latest.current.onEmote(emote.id);
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "m") { event.preventDefault(); latest.current.onToggleMap(); }
      else if (key === "p") { event.preventDefault(); latest.current.onTogglePeople(); }
      else if (event.key === "?") { event.preventDefault(); latest.current.onHelp(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
