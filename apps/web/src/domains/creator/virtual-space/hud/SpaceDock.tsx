import {
  Camera,
  CameraOff,
  ChevronDown,
  Ellipsis,
  LogOut,
  Map as MapIcon,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Palette,
  SmilePlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { memo, useId, useRef, type ReactNode, type RefObject } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";
import type { StudioVirtualSpaceActivity, StudioVirtualSpacePresenceState } from "../studio-virtual-space-model";
import type { StudioUserStatus } from "../studio-virtual-space-user-status";
import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import { SpaceAvatar } from "./SpaceAvatar";
import { SpaceEmotePicker } from "./SpaceEmotePicker";
import { SpaceMenuList } from "./SpaceMenuList";
import { SpacePopover } from "./SpacePopover";
import { SpaceStatusMenu } from "./SpaceStatusMenu";
import { spaceStatusOption, type SpaceDockMenuItem, type SpaceDockPopover, type SpaceStatusOption } from "./space-dock-model";

export interface SpaceDockSelf {
  readonly identity: string;
  readonly name: string;
  readonly activity: StudioVirtualSpaceActivity;
  /** 회의 중·휴식 중 같은 명시 상태(없으면 활동 표시). */
  readonly userStatus?: StudioUserStatus | null;
  readonly avatarIndex: number;
  readonly appearance?: StudioVirtualSpacePresenceState["appearance"];
}

export interface SpaceDockMedia {
  /** 팀 프로젝트 공간이고 대화가 연결될 수 있으면 true. 직접 마이크를 켜지는 않는다. */
  readonly available: boolean;
  readonly onOpen: () => void;
  /** 가까이 가면 영상: 각 장치가 켜져 있으면 눌림 상태로 보인다. 처리기가 없으면 onOpen을 쓴다. */
  readonly micOn?: boolean;
  readonly cameraOn?: boolean;
  readonly screenOn?: boolean;
  readonly onMic?: () => void;
  readonly onCamera?: () => void;
  readonly onScreen?: () => void;
}

interface DockButtonProps {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly shortcut?: string;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly controls?: string;
  readonly disabledReason?: string | null;
  readonly badge?: ReactNode;
  readonly onClick: () => void;
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
  readonly tone?: "default" | "danger";
  /** 여러 곳에서 여닫는 창(지도)의 바깥 누르기 예외 표시. */
  readonly toggle?: string;
}

/** 아이콘 + 툴팁(라벨·단축키) 버튼. 비활성 사유가 있으면 포커스는 받되 aria-disabled로 사유를 읽어 준다. */
function DockButton({ icon: Icon, label, shortcut, pressed, expanded, controls, disabledReason, badge, onClick, buttonRef, tone = "default", toggle }: DockButtonProps) {
  const reasonId = useId();
  const tooltip = [label, shortcut, disabledReason].filter(Boolean).join(" · ");
  return <span className="space-dock__item">
    <button ref={buttonRef} type="button" className="space-dock__button" data-tone={tone} data-space-toggle={toggle}
      aria-label={label} aria-pressed={pressed} aria-expanded={expanded} aria-controls={controls}
      aria-keyshortcuts={shortcut} aria-disabled={disabledReason ? true : undefined}
      aria-describedby={disabledReason ? reasonId : undefined}
      data-tooltip={tooltip} onClick={onClick}>
      <Icon size={20} aria-hidden />
      {badge}
    </button>
    {disabledReason ? <span id={reasonId} className="sr-only">{disabledReason}</span> : null}
  </span>;
}

/**
 * 하단 중앙 단일 도크(데스크톱).
 * [나·상태] | [마이크][카메라][화면 공유] | [리액션] | [대화][참가자][지도][꾸미기] | [⋯] | [작업 시작] | [나가기]
 */
export const SpaceDock = memo(function SpaceDock({
  self, media, panel, mapOpen, peopleBadge, popover, moreItems, workLauncher, panelId, dockRef,
  onPopover, onStatus, onEditCharacter, onEmote, onTogglePanel, onToggleMap, onExit,
}: {
  readonly self: SpaceDockSelf;
  readonly media: SpaceDockMedia;
  readonly panel: StudioVirtualWorkspacePanel | null;
  readonly mapOpen: boolean;
  readonly peopleBadge: { readonly nearby: number; readonly incoming: number };
  readonly popover: SpaceDockPopover | null;
  readonly moreItems: readonly SpaceDockMenuItem[];
  readonly workLauncher: ReactNode;
  readonly panelId: string;
  readonly dockRef?: RefObject<HTMLDivElement | null>;
  readonly onPopover: (next: SpaceDockPopover | null) => void;
  readonly onStatus: (status: SpaceStatusOption) => void;
  readonly onEditCharacter: () => void;
  readonly onEmote: (id: StudioSpaceEmoteId) => void;
  readonly onTogglePanel: (panel: StudioVirtualWorkspacePanel) => void;
  readonly onToggleMap: () => void;
  readonly onExit: () => void;
}) {
  const bt = useBilingual("SpaceDock");
  const meRef = useRef<HTMLDivElement>(null);
  const reactRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const status = spaceStatusOption(self.activity, self.userStatus);
  const mediaReason = media.available ? null : bt("팀 프로젝트 공간에서 대화가 연결되면 쓸 수 있어요", "Available once a team project space conversation is connected");
  const toggle = (next: SpaceDockPopover) => onPopover(popover === next ? null : next);
  const chatOpen = panel === "chat" || panel === "board" || panel === "annotation";
  const peopleOpen = panel === "people" || panel === "team";
  const buildOpen = panel === "build";
  const peopleCount = peopleBadge.incoming > 0 ? peopleBadge.incoming : peopleBadge.nearby;
  return <div ref={dockRef} className="space-dock" role="toolbar" aria-label={bt("가상 스튜디오 도구", "Virtual studio tools")} data-space-interactive="true">
    <div ref={meRef} className="space-dock__group space-dock__anchor">
      <button type="button" className="space-dock__me" aria-haspopup="dialog" aria-expanded={popover === "me"}
        onClick={() => toggle("me")} aria-label={bt(`내 상태: ${status.labelKo} · ${self.name}`, `My status: ${status.labelEn} · ${self.name}`)}>
        <SpaceAvatar identity={self.identity} activity={self.activity} avatarIndex={self.avatarIndex} appearance={self.appearance} self size="sm" />
        <span className="space-dock__me-text" aria-hidden>
          <strong>{self.name}</strong>
          <small><span className="space-status-dot" data-activity={self.activity} data-status={status.id} />{bt(status.labelKo, status.labelEn)}</small>
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>
      <SpacePopover open={popover === "me"} sheet={false} anchorRef={meRef} onClose={() => onPopover(null)} title={bt("내 상태", "My status")} className="space-popover--me">
        <SpaceStatusMenu status={status.id} onStatus={(next, close) => { onStatus(next); if (close) onPopover(null); }}
          onEditCharacter={() => { onPopover(null); onEditCharacter(); }} />
      </SpacePopover>
    </div>
    <span className="space-dock__divider" aria-hidden />
    <div className="space-dock__group" role="group" aria-label={bt("마이크·카메라·화면 공유", "Microphone, camera and screen share")}>
      <DockButton icon={media.micOn ? Mic : MicOff} label={bt("마이크", "Microphone")} disabledReason={mediaReason} pressed={media.onMic ? Boolean(media.micOn) : undefined}
        onClick={media.onMic ?? media.onOpen} />
      <DockButton icon={media.cameraOn ? Camera : CameraOff} label={bt("카메라", "Camera")} disabledReason={mediaReason} pressed={media.onCamera ? Boolean(media.cameraOn) : undefined}
        onClick={media.onCamera ?? media.onOpen} />
      <DockButton icon={MonitorUp} label={bt("화면 공유", "Share screen")} disabledReason={mediaReason} pressed={media.onScreen ? Boolean(media.screenOn) : undefined}
        onClick={media.onScreen ?? media.onOpen} />
    </div>
    <span className="space-dock__divider" aria-hidden />
    <div ref={reactRef} className="space-dock__group space-dock__anchor">
      <DockButton icon={SmilePlus} label={bt("리액션", "Reactions")} shortcut="1~9, Z" expanded={popover === "react"} onClick={() => toggle("react")} />
      <SpacePopover open={popover === "react"} sheet={false} anchorRef={reactRef} onClose={() => onPopover(null)} title={bt("리액션 보내기", "Send a reaction")} className="space-popover--emotes">
        <SpaceEmotePicker onEmote={(id) => { onPopover(null); onEmote(id); }} />
      </SpacePopover>
    </div>
    <span className="space-dock__divider" aria-hidden />
    <div className="space-dock__group" role="group" aria-label={bt("대화·참가자·지도·꾸미기", "Chat, people, map and customize")}>
      <DockButton icon={MessageCircle} label={bt("대화", "Chat")} pressed={chatOpen} controls={panelId} onClick={() => onTogglePanel("chat")} />
      <DockButton icon={UsersRound} label={bt("참가자", "People")} shortcut="P" pressed={peopleOpen} controls={panelId} onClick={() => onTogglePanel("people")}
        badge={peopleCount > 0 ? <span className={cn("space-dock__badge", peopleBadge.incoming > 0 && "space-dock__badge--alert")}>
          <span aria-hidden>{peopleCount}</span>
          <span className="sr-only">{peopleBadge.incoming > 0
            ? bt(`받은 요청 ${peopleBadge.incoming}건`, `${peopleBadge.incoming} incoming requests`)
            : bt(`근처 ${peopleBadge.nearby}명`, `${peopleBadge.nearby} nearby`)}</span>
        </span> : null} />
      <DockButton icon={MapIcon} label={bt("지도", "Map")} shortcut="M" pressed={mapOpen} toggle="map" onClick={onToggleMap} />
      <DockButton icon={Palette} label={bt("꾸미기", "Customize")} pressed={buildOpen} controls={panelId} onClick={() => onTogglePanel("build")} />
    </div>
    <span className="space-dock__divider" aria-hidden />
    <div ref={moreRef} className="space-dock__group space-dock__anchor">
      <DockButton icon={Ellipsis} label={bt("더보기", "More")} expanded={popover === "more"} onClick={() => toggle("more")} />
      <SpacePopover open={popover === "more"} sheet={false} anchorRef={moreRef} onClose={() => onPopover(null)} title={bt("더보기", "More")} className="space-popover--more">
        <SpaceMenuList items={moreItems} onSelected={() => onPopover(null)} />
      </SpacePopover>
    </div>
    {workLauncher}
    <DockButton icon={LogOut} label={bt("나가기", "Leave")} tone="danger" onClick={onExit} />
  </div>;
});
