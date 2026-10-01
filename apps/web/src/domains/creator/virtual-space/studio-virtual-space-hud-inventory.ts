import { BookOpen, CalendarDays, Search, Settings, Sparkles, type LucideIcon } from "lucide-react";

import type { StudioVirtualWorkspacePanel } from "./studio-virtual-space-interaction-orchestrator";

/**
 * HUD 오버레이 표시 분류 (Track F: 점진적 공개).
 *
 * 첫 화면의 원칙은 "입장-이동-상호작용" 3동작뿐이다. 스테이지 위의 모든 오버레이는
 * 아래 세 분류 중 하나에 속하고, 분류 규칙은 STUDIO_VIRTUAL_SPACE_HUD_INVENTORY에
 * 문서화되어 있다.
 *
 * - always: 항상 표시. 3동작에 필요한 최소 HUD (미니맵·핵심 툴바·모바일 조작계).
 * - contextual: 상황별 표시. 조건이 생길 때만 나타나고 조건이 사라지면 자동으로 숨는다.
 * - hidden: 설정·토글 뒤에 숨김. 사용자가 명시적으로 열기 전에는 보이지 않는다.
 */
export type StudioVirtualSpaceHudCategory = "always" | "contextual" | "hidden";

export interface StudioVirtualSpaceHudOverlay {
  readonly id: string;
  readonly category: StudioVirtualSpaceHudCategory;
  readonly ko: string;
  readonly en: string;
  /** 언제 보이는지, 어떤 조건에서 자동으로 숨는지. */
  readonly visibilityKo: string;
  readonly visibilityEn: string;
}

export const STUDIO_VIRTUAL_SPACE_HUD_INVENTORY: readonly StudioVirtualSpaceHudOverlay[] = [
  // (a) 항상 표시
  {
    id: "minimap",
    category: "always",
    ko: "미니맵",
    en: "Minimap",
    visibilityKo: "접힌 상태로 항상 표시. 펼치기·이동은 사용자 조작으로만.",
    visibilityEn: "Always visible collapsed. Expanding and moving are user-initiated only.",
  },
  {
    id: "desktop-core-toolbar",
    category: "always",
    ko: "데스크톱 하단 핵심 툴바",
    en: "Desktop bottom core toolbar",
    visibilityKo: "항상 표시. 방 이름·이동 상태·E 상호작용 버튼만 둔다.",
    visibilityEn: "Always visible. Holds only the room name, movement state and the E interact button.",
  },
  {
    id: "mobile-joystick",
    category: "always",
    ko: "모바일 조이스틱",
    en: "Mobile joystick",
    visibilityKo: "터치 화면에서 항상 표시. 손잡이 설정(왼손/오른손)을 따른다.",
    visibilityEn: "Always visible on touch screens. Follows the handedness setting.",
  },
  {
    id: "mobile-interact-button",
    category: "always",
    ko: "모바일 상호작용 버튼",
    en: "Mobile interact button",
    visibilityKo: "터치 화면에서 항상 표시. E 키와 같은 동작.",
    visibilityEn: "Always visible on touch screens. Same action as the E key.",
  },
  {
    id: "mobile-room-pill",
    category: "always",
    ko: "모바일 방 표시",
    en: "Mobile room pill",
    visibilityKo: "터치 화면에서 현재 방 이름을 항상 표시.",
    visibilityEn: "Always shows the current room name on touch screens.",
  },
  // (b) 상황별 표시: 조건이 사라지면 자동으로 숨는다
  {
    id: "live-event-banner",
    category: "contextual",
    ko: "라이브 이벤트 배너",
    en: "Live event banner",
    visibilityKo: "타운 이벤트·Spotlight 진행 중에만 표시. 종료되면 자동 숨김.",
    visibilityEn: "Shown only while a town event or Spotlight is live. Auto-hides when it ends.",
  },
  {
    id: "movement-status-banner",
    category: "contextual",
    ko: "이동 상태 배너",
    en: "Movement status banner",
    visibilityKo: "동료에게 이동 중·도달 불가일 때만 표시.",
    visibilityEn: "Shown only while walking to a teammate or when unreachable.",
  },
  {
    id: "social-notice",
    category: "contextual",
    ko: "소셜 알림 토스트",
    en: "Social notice toast",
    visibilityKo: "알림(이벤트 디렉터 toast 포함)이 있을 때만 표시. 닫으면 숨김.",
    visibilityEn: "Shown only when there is a notice (including event-director toasts). Hidden on dismiss.",
  },
  {
    id: "space-ui-banner",
    category: "contextual",
    ko: "이벤트 디렉터 배너",
    en: "Event director banner",
    visibilityKo: "PhaserCanvas onSpaceUiEvent의 banner 이벤트가 있을 때만 표시. 닫으면 숨김.",
    visibilityEn: "Shown only for banner events from PhaserCanvas onSpaceUiEvent. Hidden on dismiss.",
  },
  {
    id: "action-sheet",
    category: "contextual",
    ko: "상호작용 액션시트",
    en: "Interaction action sheet",
    visibilityKo: "근접 상호작용을 선택했을 때만 표시. 닫히면 자동 숨김.",
    visibilityEn: "Shown only when a nearby interaction is chosen. Auto-hides on close.",
  },
  {
    id: "npc-dialogue",
    category: "contextual",
    ko: "NPC 대화 패널",
    en: "NPC dialogue panel",
    visibilityKo: "NPC와 대화 중일 때만 표시.",
    visibilityEn: "Shown only while talking to an NPC.",
  },
  {
    id: "mini-tour",
    category: "contextual",
    ko: "첫 방문 미니 투어",
    en: "First-visit mini tour",
    visibilityKo: "입장 로비를 처음 통과한 세션에서 1회만 표시. 완료·건너뛰기·다시 보지 않기로 종료.",
    visibilityEn: "Shown once per session right after the entry lobby on first visit. Ends on finish, skip or don't-show-again.",
  },
  {
    id: "follow-button",
    category: "contextual",
    ko: "따라가기 버튼",
    en: "Follow button",
    visibilityKo: "동료를 따라가는 중일 때만 표시.",
    visibilityEn: "Shown only while following a teammate.",
  },
  {
    id: "mobile-reaction-bar",
    category: "contextual",
    ko: "모바일 리액션 바",
    en: "Mobile reaction bar",
    visibilityKo: "스마일 토글을 눌렀을 때만 펼쳐진다. 다시 누르면 접힌다.",
    visibilityEn: "Expands only when the smile toggle is pressed. Collapses on a second press.",
  },
  // (c) 설정·토글 뒤 숨김
  {
    id: "control-hint-chips",
    category: "hidden",
    ko: "조작 힌트 칩",
    en: "Control hint chips",
    visibilityKo: "미니 투어를 완료(또는 다시 보지 않기)하면 자동으로 숨는다.",
    visibilityEn: "Auto-hides once the mini tour is finished or set to don't-show-again.",
  },
  {
    id: "guide-panel",
    category: "hidden",
    ko: "시작 안내 패널",
    en: "Getting-started guide panel",
    visibilityKo: "'시작 안내' 버튼 뒤. 접힌 키보드 단축키 목록을 포함한다.",
    visibilityEn: "Behind the 'Getting started' button. Includes the collapsed keyboard-shortcut list.",
  },
  {
    id: "experience-settings",
    category: "hidden",
    ko: "경험·게임필 설정",
    en: "Experience & game-feel settings",
    visibilityKo: "'장소·꾸미기 > 환경 설정' 뒤.",
    visibilityEn: "Behind 'Places & settings > Preferences'.",
  },
];

/** 인벤토리에 등록된 오버레이의 표시 분류를 돌려준다. 모르면 null. */
export function studioVirtualSpaceHudCategory(id: string): StudioVirtualSpaceHudCategory | null {
  return STUDIO_VIRTUAL_SPACE_HUD_INVENTORY.find((overlay) => overlay.id === id)?.category ?? null;
}

export interface StudioVirtualSpaceCommandBarItem {
  readonly panel: StudioVirtualWorkspacePanel;
  readonly icon: LucideIcon;
  readonly ko: string;
  readonly en: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}

/**
 * 커맨드바 단순화 (Track F): 5개 버튼 → 우선순위 3개 + "더보기" 오버플로우.
 *
 * 우선순위 3개는 가상 스튜디오의 핵심 동선(작업 시작·방/팀원 찾기·제작 공간)이고,
 * 오늘의 동선과 장소·꾸미기는 사용 빈도가 낮아 오버플로우 시트로 옮겼다.
 * 패널 id는 HUD 패널 체계(studio-virtual-space-panel-scope.ts)를 따른다:
 * 작업 시작=work, 방·팀원 찾기=people(⌘/Ctrl K 검색과 함께), 장소·꾸미기=places.
 */
export const STUDIO_VIRTUAL_SPACE_COMMAND_BAR_PRIMARY: readonly StudioVirtualSpaceCommandBarItem[] = [
  {
    panel: "work",
    icon: BookOpen,
    ko: "작업 시작",
    en: "Start work",
    descriptionKo: "웹툰 작업실을 연다.",
    descriptionEn: "Opens the webtoon office.",
  },
  {
    panel: "people",
    icon: Search,
    ko: "방·팀원 찾기",
    en: "Find rooms & people",
    descriptionKo: "방과 팀원을 검색한다. ⌘/Ctrl K.",
    descriptionEn: "Searches rooms and people. ⌘/Ctrl K.",
  },
  {
    panel: "town",
    icon: Sparkles,
    ko: "제작 공간",
    en: "Production spaces",
    descriptionKo: "함께 일하는 제작 공간과 이벤트를 연다.",
    descriptionEn: "Opens collaborative production spaces and events.",
  },
];

/** "더보기" 오버플로우에 들어가는 나머지 패널. 개인 아틀리에에서는 프로젝트 패널(오늘)을 뺀다. */
export function studioVirtualSpaceCommandBarOverflow(personal: boolean): readonly StudioVirtualSpaceCommandBarItem[] {
  const items: readonly StudioVirtualSpaceCommandBarItem[] = [
    {
      panel: "today",
      icon: CalendarDays,
      ko: "오늘",
      en: "Today",
      descriptionKo: "오늘의 제작 동선을 확인한다.",
      descriptionEn: "Checks today's production flow.",
    },
    {
      panel: "places",
      icon: Settings,
      ko: "장소·꾸미기",
      en: "Places & settings",
      descriptionKo: "장소·꾸미기·환경 설정을 연다.",
      descriptionEn: "Opens places, customization and preferences.",
    },
  ];
  return personal ? items.filter((item) => item.panel !== "today") : items;
}
