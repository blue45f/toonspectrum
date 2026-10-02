import {
  Armchair,
  BookOpen,
  Camera,
  CircleHelp,
  ClipboardList,
  LifeBuoy,
  MessageCircle,
  Palette,
  PenTool,
  PersonStanding,
  Presentation,
  Radio,
  Search,
  Settings2,
  Sparkles,
  UserPlus,
  Video,
  VideoOff,
  X,
} from "lucide-react";

import { studioVirtualSpaceCommandBarOverflow } from "../studio-virtual-space-hud-inventory";
import type { StudioSpacePose } from "../studio-virtual-space-pose-controller";
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
  /** 자세 토글 (서 있으면 쉬기 — 앉기·눕기는 문맥으로 고르고, 앉거나 누워 있으면 일어서기). */
  readonly togglePose: () => void;
  /** 가까이 가면 영상 켜기·끄기(모바일 도크에는 카메라 버튼이 없어 ⋯에 둔다). */
  readonly toggleProximityVideo?: () => void;
}

/**
 * 도크 ⋯ 메뉴 항목. 개인 공간에는 프로젝트 전용 도구를 넣지 않고,
 * 모바일 도크에 없는 대화·꾸미기·나가기는 좁은 화면에서만 메뉴에 둔다.
 * '오늘'·'장소' 같은 오버플로 패널은 HUD 인벤토리(studioVirtualSpaceCommandBarOverflow)를 단일 기준으로 쓴다.
 */
export function spaceMoreItems({ personal, desktop, panel: openPanelId = null, proximityVideoOn = false, pose }: {
  readonly personal: boolean;
  readonly desktop: boolean;
  /** 지금 열린 패널. 같은 항목을 '열림'으로 표시한다. */
  readonly panel?: StudioVirtualWorkspacePanel | null;
  readonly proximityVideoOn?: boolean;
  /** 지금 내 자세. 주면 '자세 바꾸기'에 현재 상태를 함께 표시한다. */
  readonly pose?: StudioSpacePose;
}, actions: SpaceMoreItemActions): readonly SpaceDockMenuItem[] {
  const panel = (panelId: StudioVirtualWorkspacePanel) => () => actions.openPanel(panelId);
  const overflow = new Map(studioVirtualSpaceCommandBarOverflow(personal).map((item) => [item.panel, item] as const));
  const inventoryItem = (panelId: StudioVirtualWorkspacePanel, group: SpaceDockMenuItem["group"]): readonly SpaceDockMenuItem[] => {
    const item = overflow.get(panelId);
    return item ? [{
      id: panelId, labelKo: item.ko, labelEn: item.en, descriptionKo: item.descriptionKo, descriptionEn: item.descriptionEn,
      icon: item.icon, group, active: openPanelId === panelId, onSelect: panel(panelId),
    }] : [];
  };
  const projectItems: readonly SpaceDockMenuItem[] = personal ? [] : [
    ...inventoryItem("today", "work"),
    { id: "work", labelKo: "검수·작업함", labelEn: "Reviews & inbox", icon: ClipboardList, group: "work", onSelect: panel("work") },
    { id: "sessions", labelKo: "공동 작업 세션", labelEn: "Work sessions", icon: BookOpen, group: "work", onSelect: panel("sessions") },
    { id: "board", labelKo: "공유 화이트보드", labelEn: "Whiteboard", icon: PenTool, group: "work", onSelect: panel("board") },
    { id: "annotation", labelKo: "라이브 화면 주석", labelEn: "Live annotation", icon: Presentation, group: "work", onSelect: panel("annotation") },
    { id: "team", labelKo: "팀·초대", labelEn: "Teams & invites", icon: UserPlus, group: "work", onSelect: panel("team") },
  ];
  const narrowItems: readonly SpaceDockMenuItem[] = desktop ? [] : [
    ...(!personal && actions.toggleProximityVideo ? [{
      id: "proximity-video", labelKo: proximityVideoOn ? "가까이 가면 영상 끄기" : "가까이 가면 영상 켜기",
      labelEn: proximityVideoOn ? "Turn off proximity video" : "Turn on proximity video",
      descriptionKo: "근처 팀원과 자동으로 영상을 연결해요.", descriptionEn: "Connects video with teammates nearby automatically.",
      icon: proximityVideoOn ? VideoOff : Video, group: "space" as const, onSelect: actions.toggleProximityVideo,
    }] : []),
    { id: "chat", labelKo: "대화", labelEn: "Chat", icon: MessageCircle, group: "space", onSelect: panel("chat") },
    { id: "build", labelKo: "꾸미기", labelEn: "Customize", icon: Palette, group: "space", onSelect: panel("build") },
  ];
  return [
    ...projectItems,
    { id: "seats", labelKo: personal ? "내 작업 자리로 걷기" : "작업 자리", labelEn: personal ? "Walk to my desk" : "Work desk", icon: Armchair, group: "work", onSelect: actions.openSeats },
    { id: "town", labelKo: "제작 공간·미니게임", labelEn: "Production spaces & games", icon: Sparkles, group: "space", onSelect: panel("town") },
    { id: "pose", labelKo: "자세 바꾸기", labelEn: "Change pose", icon: PersonStanding, group: "space",
      ...(pose ? {
        descriptionKo: pose === "sit" ? "지금 앉아 있어요" : pose === "lie" ? "지금 누워 있어요" : "지금 서 있어요",
        descriptionEn: pose === "sit" ? "Currently sitting" : pose === "lie" ? "Currently lying down" : "Currently standing",
        active: pose !== "stand",
      } : {}),
      onSelect: actions.togglePose },
    ...inventoryItem("places", "space"),
    { id: "search", labelKo: "방·사람 찾기", labelEn: "Find rooms & people", icon: Search, group: "space", shortcut: "Ctrl K", onSelect: actions.openSearch },
    ...narrowItems,
    { id: "photo", labelKo: "월드 사진 찍기", labelEn: "Take a world photo", icon: Camera, group: "space", onSelect: actions.capturePhoto },
    { id: "settings", labelKo: "설정", labelEn: "Settings", icon: Settings2, group: "space", onSelect: panel("settings") },
    ...(personal ? [] : [{ id: "rtc", labelKo: "실시간 연결 상태", labelEn: "Live connection status", icon: Radio, group: "help" as const, onSelect: panel("rtc") }]),
    { id: "unstuck", labelKo: "제자리로 이동", labelEn: "Move to a safe spot", descriptionKo: "끼었을 때 눌러요", descriptionEn: "Use when you're stuck", icon: LifeBuoy, group: "help", onSelect: actions.unstuck },
    { id: "help", labelKo: "단축키 도움말", labelEn: "Keyboard shortcuts", icon: CircleHelp, group: "help", shortcut: "?", onSelect: actions.openHelp },
    ...(desktop ? [] : [{ id: "exit", labelKo: "나가기", labelEn: "Leave", icon: X, group: "help" as const, onSelect: actions.exit }]),
  ];
}
