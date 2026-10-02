import { RotateCcw } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { STUDIO_SPACE_EMOTES } from "../studio-virtual-space-emote-catalog";
import { SpacePopover } from "./SpacePopover";

const SHORTCUTS = [
  { keys: ["W", "A", "S", "D"], ko: "걷기 (방향키도 가능)", en: "Walk (arrow keys too)" },
  { keys: ["Shift"], ko: "누른 채 걸으면 달리기", en: "Hold to run" },
  { keys: ["X"], ko: "가까운 대상과 상호작용", en: "Interact with what is nearby" },
  { keys: ["Enter"], ko: "말풍선 채팅 열기 · 보내기", en: "Open · send bubble chat" },
  { keys: ["1~9", "Z"], ko: "리액션 · Z는 춤추기", en: "Reactions · Z to dance" },
  { keys: ["M"], ko: "지도 열기·닫기", en: "Open or close the map" },
  { keys: ["P"], ko: "참가자 패널 열기·닫기", en: "Open or close people" },
  { keys: ["Ctrl", "K"], ko: "방·사람 찾기", en: "Find rooms and people" },
  { keys: ["Esc"], ko: "이동 멈추기 · 맨 위 창 닫기", en: "Stop walking · close the top window" },
  { keys: ["?"], ko: "이 도움말", en: "This help" },
] as const;

/** ? 단축키 도움말. 3단계 미니 투어를 다시 볼 수 있다. */
export function SpaceShortcutsHelp({ open, sheet, onClose, onReplayTour }: {
  readonly open: boolean;
  readonly sheet: boolean;
  readonly onClose: () => void;
  readonly onReplayTour: () => void;
}) {
  const bt = useBilingual("SpaceShortcutsHelp");
  const emoteKeys = STUDIO_SPACE_EMOTES.filter((emote) => emote.shortcut);
  return <SpacePopover open={open} sheet={sheet} onClose={onClose} title={bt("단축키와 조작법", "Shortcuts & controls")} className="space-popover--help">
    <dl className="space-help__list">
      {SHORTCUTS.map((item) => <div key={item.ko} className="space-help__row">
        <dt>{item.keys.map((key) => <kbd key={key}>{key}</kbd>)}</dt>
        <dd>{bt(item.ko, item.en)}</dd>
      </div>)}
    </dl>
    <div className="space-help__emotes" role="group" aria-label={bt("리액션 단축키", "Reaction shortcuts")}>
      {emoteKeys.map((emote) => <span key={emote.id}><kbd>{emote.shortcut}</kbd><span aria-hidden>{emote.glyph}</span>{bt(emote.labelKo, emote.labelEn)}</span>)}
    </div>
    <button type="button" className="space-menu-row" onClick={() => { onClose(); onReplayTour(); }}>
      <RotateCcw size={16} aria-hidden /><span className="space-menu-row__label">{bt("미니 투어 다시 보기", "Replay the mini tour")}</span>
    </button>
  </SpacePopover>;
}
