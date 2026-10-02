import {
  Armchair,
  CalendarDays,
  ClipboardList,
  Images,
  Map as MapIcon,
  MessageCircle,
  Mic,
  Palette,
  PenTool,
  Presentation,
  Radio,
  Settings2,
  Sparkles,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  STUDIO_VIRTUAL_SPACE_HUD_TABS,
  isStudioVirtualProjectPanel,
  type StudioVirtualSpaceHudTab,
  type StudioVirtualWorkspacePanel,
} from "../studio-virtual-space-panel-scope";

export interface SpaceHudPanelMeta {
  readonly titleKo: string;
  readonly titleEn: string;
  /** 탭 버튼에 쓰는 짧은 이름. */
  readonly shortKo: string;
  readonly shortEn: string;
  readonly icon: LucideIcon;
  readonly projectOnly: boolean;
}

function meta(titleKo: string, titleEn: string, shortKo: string, shortEn: string, icon: LucideIcon, panel: StudioVirtualWorkspacePanel): SpaceHudPanelMeta {
  return Object.freeze({ titleKo, titleEn, shortKo, shortEn, icon, projectOnly: isStudioVirtualProjectPanel(panel) });
}

/** 13단 삼항으로 흩어져 있던 패널 제목·아이콘·범위를 한 표로 관리한다. */
export const SPACE_HUD_PANEL_META: Readonly<Record<StudioVirtualWorkspacePanel, SpaceHudPanelMeta>> = Object.freeze({
  people: meta("참가자", "People", "참가자", "People", UsersRound, "people"),
  chat: meta("대화", "Chat", "대화", "Chat", MessageCircle, "chat"),
  today: meta("오늘의 제작 동선", "Today's production flow", "오늘", "Today", CalendarDays, "today"),
  places: meta("장소와 이동", "Places", "장소", "Places", MapIcon, "places"),
  build: meta("꾸미기", "Customize", "꾸미기", "Customize", Palette, "build"),
  settings: meta("설정", "Settings", "설정", "Settings", Settings2, "settings"),
  work: meta("검수·작업함", "Reviews & inbox", "작업함", "Inbox", ClipboardList, "work"),
  sessions: meta("공동 작업 세션", "Work sessions", "세션", "Sessions", CalendarDays, "sessions"),
  board: meta("P2P 공유 화이트보드", "P2P shared whiteboard", "화이트보드", "Whiteboard", PenTool, "board"),
  annotation: meta("공유 화면 라이브 주석", "Live shared-screen annotation", "라이브 주석", "Annotation", Presentation, "annotation"),
  team: meta("팀·그룹·초대", "Teams, groups & invites", "팀·초대", "Team", UserPlus, "team"),
  town: meta("함께 일하는 제작 공간", "Production spaces for collaboration", "제작 공간", "Spaces", Sparkles, "town"),
  rtc: meta("실시간 연결 상태", "Live connection status", "연결 상태", "Connection", Radio, "rtc"),
  seats: meta("내 작업 자리", "My workspace", "작업 자리", "Desk", Armchair, "seats"),
  booth: meta("녹음부스", "Recording booth", "녹음부스", "Booth", Mic, "booth"),
  gallery: meta("전시관", "Exhibition hall", "전시관", "Gallery", Images, "gallery"),
});

/** 현재 범위(개인·프로젝트)에서 보여 줄 탭 목록. */
export function spaceHudTabs(personal: boolean): readonly StudioVirtualSpaceHudTab[] {
  return STUDIO_VIRTUAL_SPACE_HUD_TABS.filter((tab) => !(personal && SPACE_HUD_PANEL_META[tab].projectOnly));
}
