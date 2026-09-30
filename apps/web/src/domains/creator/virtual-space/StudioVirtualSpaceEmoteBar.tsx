import { useEffect } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_EMOTES,
  studioEmoteKindForKey,
  type StudioEmoteKind,
  type StudioEmoteState,
} from "./studio-virtual-space-emotes";

/**
 * 이모트 바 (Gather Town Z키·이모트 휠 대응)
 *
 * - 이모지 버튼으로 이모트 실행/토글
 * - 키보드 단축키 (Z·1-9) 지원
 * - 실행 중인 이모트 하이라이트
 */
export function StudioVirtualSpaceEmoteBar({
  emoteState,
  onEmote,
  disabled = false,
}: {
  readonly emoteState: StudioEmoteState;
  readonly onEmote: (kind: StudioEmoteKind) => void;
  readonly disabled?: boolean;
}) {
  const bt = useBilingual("StudioVirtualSpaceEmoteBar");

  useEffect(() => {
    if (disabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.nativeEvent?.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const kind = studioEmoteKindForKey(event.key);
      if (kind) {
        event.preventDefault();
        onEmote(kind);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [disabled, onEmote]);

  return (
    <div
      className="studio-vspace-emote-bar"
      role="toolbar"
      aria-label={bt("이모트", "Emotes")}
      aria-disabled={disabled}
    >
      {STUDIO_EMOTES.map((emote) => {
        const active = emoteState.active === emote.kind;
        return (
          <button
            key={emote.kind}
            type="button"
            className="studio-vspace-emote-button"
            data-active={active}
            data-emote-kind={emote.kind}
            disabled={disabled}
            onClick={() => onEmote(emote.kind)}
            aria-pressed={active}
            aria-label={bt(emote.labelKo, emote.labelEn)}
            title={emote.shortcut ? `${bt(emote.labelKo, emote.labelEn)} (${emote.shortcut})` : bt(emote.labelKo, emote.labelEn)}
          >
            <span aria-hidden>{emote.icon}</span>
            {emote.shortcut && (
              <kbd className="studio-vspace-emote-shortcut" aria-hidden>{emote.shortcut}</kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}
