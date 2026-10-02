import { Ellipsis, Map as MapIcon, SmilePlus, UsersRound } from "lucide-react";
import { memo, type ReactNode, type RefObject } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioVirtualSpaceMenuSheet } from "../StudioVirtualSpaceActionSheet";
import type { StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";
import { SpaceEmotePicker } from "./SpaceEmotePicker";
import type { SpaceDockMenuItem, SpaceDockPopover } from "./space-dock-model";

const MENU_GROUPS = {
  work: ["작업", "Work"],
  space: ["공간", "Space"],
  help: ["도움", "Help"],
} as const;

/**
 * 모바일 5칸 도크: 리액션 · 참가자 · 작업 시작(가운데 강조) · 지도 · 더보기.
 * - 리액션은 토글이다. 펼친 리액션 줄은 화면을 막지 않아 조이스틱으로 걸으면서 보낼 수 있다.
 * - 더보기는 공용 메뉴 시트(StudioVirtualSpaceMenuSheet)로 열고, 항목은 HUD 인벤토리와 같은 기준을 쓴다.
 * 각 칸은 44px 이상이다.
 */
export const SpaceMobileDock = memo(function SpaceMobileDock({
  popover, peopleBadge, peopleOpen, mapOpen, moreItems, workLauncher, dockRef,
  onPopover, onEmote, onTogglePeople, onToggleMap,
}: {
  readonly popover: SpaceDockPopover | null;
  readonly peopleBadge: { readonly nearby: number; readonly incoming: number };
  readonly peopleOpen: boolean;
  readonly mapOpen: boolean;
  readonly moreItems: readonly SpaceDockMenuItem[];
  readonly workLauncher: ReactNode;
  readonly dockRef?: RefObject<HTMLElement | null>;
  readonly onPopover: (next: SpaceDockPopover | null) => void;
  readonly onEmote: (id: StudioSpaceEmoteId) => void;
  readonly onTogglePeople: () => void;
  readonly onToggleMap: () => void;
}) {
  const bt = useBilingual("SpaceMobileDock");
  const peopleCount = peopleBadge.incoming > 0 ? peopleBadge.incoming : peopleBadge.nearby;
  const reactionsOpen = popover === "react";
  return <nav ref={dockRef} className="space-mobile-dock" aria-label={bt("가상 스튜디오 도구", "Virtual studio tools")} data-space-interactive="true">
    {reactionsOpen ? <div className="space-mobile-reactions" data-space-interactive="true">
      <SpaceEmotePicker variant="strip" onEmote={onEmote} />
    </div> : null}
    <button type="button" data-mobile-slot="react" className="space-mobile-dock__slot" aria-expanded={reactionsOpen}
      onClick={() => onPopover(reactionsOpen ? null : "react")}>
      <SmilePlus size={20} aria-hidden /><span>{bt("리액션", "React")}</span>
    </button>
    <button type="button" data-mobile-slot="people" className="space-mobile-dock__slot" aria-pressed={peopleOpen} onClick={onTogglePeople}>
      <UsersRound size={20} aria-hidden /><span>{bt("참가자", "People")}</span>
      {peopleCount > 0 ? <b className="space-dock__badge" data-alert={peopleBadge.incoming > 0 || undefined}>
        <span aria-hidden>{peopleCount}</span>
        <span className="sr-only">{peopleBadge.incoming > 0
          ? bt(`받은 요청 ${peopleBadge.incoming}건`, `${peopleBadge.incoming} incoming requests`)
          : bt(`근처 ${peopleBadge.nearby}명`, `${peopleBadge.nearby} nearby`)}</span>
      </b> : null}
    </button>
    <div data-mobile-slot="work" className="space-mobile-dock__work">{workLauncher}</div>
    <button type="button" data-mobile-slot="map" data-space-toggle="map" className="space-mobile-dock__slot" aria-pressed={mapOpen} onClick={onToggleMap}>
      <MapIcon size={20} aria-hidden /><span>{bt("지도", "Map")}</span>
    </button>
    <button type="button" data-mobile-slot="more" className="space-mobile-dock__slot" aria-haspopup="dialog" aria-expanded={popover === "more"}
      onClick={() => onPopover(popover === "more" ? null : "more")}>
      <Ellipsis size={20} aria-hidden /><span>{bt("더보기", "More")}</span>
    </button>
    {popover === "more" ? <StudioVirtualSpaceMenuSheet variant="list"
      titleKo="더 많은 공간 메뉴" titleEn="More space menus"
      descriptionKo="자주 쓰지 않는 작업·공간 메뉴를 모았어요." descriptionEn="Less-used work and space menus in one place."
      items={moreItems.map((item) => {
        const Icon = item.icon;
        return {
          id: item.id, icon: <Icon size={18} aria-hidden />, labelKo: item.labelKo, labelEn: item.labelEn,
          descriptionKo: item.descriptionKo, descriptionEn: item.descriptionEn, active: item.active,
          groupKo: MENU_GROUPS[item.group][0], groupEn: MENU_GROUPS[item.group][1],
          disabledReasonKo: item.disabledReasonKo, disabledReasonEn: item.disabledReasonEn,
        };
      })}
      onSelect={(id) => moreItems.find((item) => item.id === id)?.onSelect()}
      onClose={() => onPopover(null)} /> : null}
  </nav>;
});
