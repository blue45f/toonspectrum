import {
  Armchair,
  BookOpen,
  Camera,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  LifeBuoy,
  MapPinned,
  MessageCircle,
  Palette,
  PenTool,
  Presentation,
  Radio,
  Search,
  Settings2,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";

import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import type { SpaceDockMenuItem } from "./space-dock-model";

export interface SpaceMoreItemActions {
  readonly openPanel: (panel: StudioVirtualWorkspacePanel) => void;
  readonly openSeats: () => void;
  readonly openSearch: () => void;
  readonly capturePhoto: () => void;
  readonly unstuck: () => void;
  readonly openHelp: () => void;
  readonly exit: () => void;
}

/**
 * 도크 ⋯ 메뉴 항목. 개인 공간에는 프로젝트 전용 도구를 넣지 않고,
 * 모바일 도크에 없는 대화·꾸미기·나가기는 좁은 화면에서만 메뉴에 둔다.
 */
export function spaceMoreItems({ personal, desktop }: { readonly personal: boolean; readonly desktop: boolean }, actions: SpaceMoreItemActions): readonly SpaceDockMenuItem[] {
  const panel = (panelId: StudioVirtualWorkspacePanel) => () => actions.openPanel(panelId);
  const projectItems: readonly SpaceDockMenuItem[] = personal ? [] : [
    { id: "today", labelKo: "오늘의 제작 동선", labelEn: "Today", icon: CalendarDays, group: "work", onSelect: panel("today") },
    { id: "work", labelKo: "검수·작업함", labelEn: "Reviews & inbox", icon: ClipboardList, group: "work", onSelect: panel("work") },
    { id: "sessions", labelKo: "공동 작업 세션", labelEn: "Work sessions", icon: BookOpen, group: "work", onSelect: panel("sessions") },
    { id: "board", labelKo: "공유 화이트보드", labelEn: "Whiteboard", icon: PenTool, group: "work", onSelect: panel("board") },
    { id: "annotation", labelKo: "라이브 화면 주석", labelEn: "Live annotation", icon: Presentation, group: "work", onSelect: panel("annotation") },
    { id: "team", labelKo: "팀·초대", labelEn: "Teams & invites", icon: UserPlus, group: "work", onSelect: panel("team") },
  ];
  const narrowItems: readonly SpaceDockMenuItem[] = desktop ? [] : [
    { id: "chat", labelKo: "대화", labelEn: "Chat", icon: MessageCircle, group: "space", onSelect: panel("chat") },
    { id: "build", labelKo: "꾸미기", labelEn: "Customize", icon: Palette, group: "space", onSelect: panel("build") },
  ];
  return [
    ...projectItems,
    { id: "seats", labelKo: personal ? "내 작업 자리로 걷기" : "작업 자리", labelEn: personal ? "Walk to my desk" : "Work desk", icon: Armchair, group: "work", onSelect: actions.openSeats },
    { id: "town", labelKo: "제작 공간·미니게임", labelEn: "Production spaces & games", icon: Sparkles, group: "space", onSelect: panel("town") },
    { id: "places", labelKo: "장소와 하위 맵", labelEn: "Places & sub-maps", icon: MapPinned, group: "space", onSelect: panel("places") },
    { id: "search", labelKo: "방·사람 찾기", labelEn: "Find rooms & people", icon: Search, group: "space", shortcut: "Ctrl K", onSelect: actions.openSearch },
    ...narrowItems,
    { id: "photo", labelKo: "월드 사진 찍기", labelEn: "Take a world photo", icon: Camera, group: "space", onSelect: actions.capturePhoto },
    { id: "settings", labelKo: "설정", labelEn: "Settings", icon: Settings2, group: "space", onSelect: panel("settings") },
    ...(personal ? [] : [{ id: "rtc", labelKo: "실시간 연결 상태", labelEn: "Live connection status", icon: Radio, group: "help" as const, onSelect: panel("rtc") }]),
    { id: "unstuck", labelKo: "끼었나요? 제자리로 이동", labelEn: "Stuck? Move to a safe spot", icon: LifeBuoy, group: "help", onSelect: actions.unstuck },
    { id: "help", labelKo: "단축키 도움말", labelEn: "Keyboard shortcuts", icon: CircleHelp, group: "help", shortcut: "?", onSelect: actions.openHelp },
    ...(desktop ? [] : [{ id: "exit", labelKo: "나가기", labelEn: "Leave", icon: X, group: "help" as const, onSelect: actions.exit }]),
  ];
}
