import { Ellipsis, Map as MapIcon, SmilePlus, UsersRound } from "lucide-react";
import { memo, type ReactNode, type RefObject } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";
import { SpaceEmotePicker } from "./SpaceEmotePicker";
import { SpaceMenuList } from "./SpaceMenuList";
import { SpacePopover } from "./SpacePopover";
import type { SpaceDockMenuItem, SpaceDockPopover } from "./space-dock-model";

/**
 * 모바일 5칸 도크: 리액션 · 참가자 · 작업 시작(가운데 강조) · 지도 · 더보기.
 * 각 칸은 44px 이상이고, 리액션·더보기는 바텀시트로 연다.
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
  return <nav ref={dockRef} className="space-mobile-dock" aria-label={bt("가상 스튜디오 도구", "Virtual studio tools")} data-space-interactive="true">
    <button type="button" data-mobile-slot="react" className="space-mobile-dock__slot" aria-expanded={popover === "react"}
      onClick={() => onPopover(popover === "react" ? null : "react")}>
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
    <button type="button" data-mobile-slot="more" className="space-mobile-dock__slot" aria-expanded={popover === "more"}
      onClick={() => onPopover(popover === "more" ? null : "more")}>
      <Ellipsis size={20} aria-hidden /><span>{bt("더보기", "More")}</span>
    </button>
    <SpacePopover open={popover === "react"} sheet onClose={() => onPopover(null)} title={bt("리액션 보내기", "Send a reaction")} className="space-sheet--emotes">
      <SpaceEmotePicker onEmote={(id) => { onPopover(null); onEmote(id); }} />
    </SpacePopover>
    <SpacePopover open={popover === "more"} sheet onClose={() => onPopover(null)} title={bt("더보기", "More")}>
      <SpaceMenuList items={moreItems} onSelected={() => onPopover(null)} />
    </SpacePopover>
  </nav>;
});
