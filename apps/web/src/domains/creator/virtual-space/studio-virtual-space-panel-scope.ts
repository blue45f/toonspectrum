/**
 * 가상 스튜디오 HUD의 우측 패널 체계.
 *
 * - 탭(tab)은 패널 상단에서 바로 고르는 1차 화면이다.
 * - 세부 뷰(detail)는 탭 안에서 '뒤로' 버튼으로 돌아가는 2차 화면이다.
 * 기존 기능(작업함·세션·화이트보드·라이브 주석·팀·자리·연결 상태·제작 공간)은 세부 뷰로 모두 남긴다.
 */
export const STUDIO_VIRTUAL_SPACE_HUD_TABS = ["people", "chat", "today", "places", "build", "settings"] as const;
export const STUDIO_VIRTUAL_SPACE_HUD_DETAILS = ["work", "sessions", "board", "annotation", "team", "town", "rtc", "seats"] as const;

export type StudioVirtualSpaceHudTab = typeof STUDIO_VIRTUAL_SPACE_HUD_TABS[number];
export type StudioVirtualSpaceHudDetail = typeof STUDIO_VIRTUAL_SPACE_HUD_DETAILS[number];
/** 패널이 열 수 있는 모든 화면. 공간 상호작용 결과도 이 값 중 하나로만 연결한다. */
export type StudioVirtualWorkspacePanel = StudioVirtualSpaceHudTab | StudioVirtualSpaceHudDetail;

/** 세부 뷰가 속한 탭. '뒤로'를 누르면 이 탭으로 돌아간다. */
export const STUDIO_VIRTUAL_SPACE_DETAIL_PARENT: Readonly<Record<StudioVirtualSpaceHudDetail, StudioVirtualSpaceHudTab>> = Object.freeze({
  work: "today",
  sessions: "today",
  board: "chat",
  annotation: "chat",
  team: "people",
  town: "places",
  rtc: "settings",
  seats: "places",
});

/** 개인 공간에는 팀 프로젝트가 없어서 열지 않는 화면. */
const PROJECT_PANELS: ReadonlySet<StudioVirtualWorkspacePanel> = new Set<StudioVirtualWorkspacePanel>([
  "today", "team", "work", "sessions", "board", "annotation", "rtc",
]);

const TAB_SET: ReadonlySet<string> = new Set(STUDIO_VIRTUAL_SPACE_HUD_TABS);

export function isStudioVirtualSpaceHudTab(panel: StudioVirtualWorkspacePanel): panel is StudioVirtualSpaceHudTab {
  return TAB_SET.has(panel);
}

/** 화면이 속한 탭. 탭이면 자기 자신이다. */
export function studioVirtualSpaceHudTabOf(panel: StudioVirtualWorkspacePanel): StudioVirtualSpaceHudTab {
  return isStudioVirtualSpaceHudTab(panel) ? panel : STUDIO_VIRTUAL_SPACE_DETAIL_PARENT[panel];
}

export function isStudioVirtualProjectPanel(panel: StudioVirtualWorkspacePanel): boolean {
  return PROJECT_PANELS.has(panel);
}

/** 개인 아틀리에에서는 프로젝트 도구를 비활성 카드로 열지 않는다. */
export function studioVirtualWorkspacePanelForScope(panel: StudioVirtualWorkspacePanel | null, personal: boolean): StudioVirtualWorkspacePanel | null {
  return personal && panel !== null && PROJECT_PANELS.has(panel) ? null : panel;
}
