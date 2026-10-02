import { memo, type Ref } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_SPACE_EMOTES, type StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";

/**
 * 16종 이모트 격자. 배열 순서가 곧 표시 순서이며 단축키가 있으면 배지로 보여 준다.
 * 선택은 onEmote(id)로만 알리고, 실제 전송·월드 재생은 호출 측이 맡는다.
 * strip은 모바일 도크 위에 펼치는 가로 한 줄(가로 스크롤·스냅)이다.
 */
export const SpaceEmotePicker = memo(function SpaceEmotePicker({ onEmote, activeId = null, firstButtonRef, variant = "grid" }: {
  readonly onEmote: (id: StudioSpaceEmoteId) => void;
  readonly activeId?: StudioSpaceEmoteId | null;
  readonly firstButtonRef?: Ref<HTMLButtonElement>;
  readonly variant?: "grid" | "strip";
}) {
  const bt = useBilingual("SpaceEmotePicker");
  return <div className="space-emote-picker" data-variant={variant} role="group" aria-label={variant === "strip" ? bt("리액션 보내기", "Send a reaction") : bt("리액션 16종", "16 reactions")}>
    {STUDIO_SPACE_EMOTES.map((emote, index) => {
      const label = bt(emote.labelKo, emote.labelEn);
      const shortcut = emote.shortcut;
      return <button key={emote.id} ref={index === 0 ? firstButtonRef : undefined} type="button" className="space-emote-picker__item"
        data-emote-id={emote.id} data-active={activeId === emote.id || undefined}
        aria-label={shortcut ? bt(`${emote.labelKo} (단축키 ${shortcut})`, `${emote.labelEn} (shortcut ${shortcut})`) : label}
        aria-keyshortcuts={shortcut ?? undefined}
        onClick={() => onEmote(emote.id)}>
        <span className="space-emote-picker__glyph" aria-hidden>{emote.glyph}</span>
        <span className="space-emote-picker__label" aria-hidden>{label}</span>
        {shortcut ? <kbd className="space-emote-picker__key" aria-hidden>{shortcut}</kbd> : null}
      </button>;
    })}
  </div>;
});
