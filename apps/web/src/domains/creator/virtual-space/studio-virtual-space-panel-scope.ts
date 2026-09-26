import type { StudioVirtualWorkspacePanel } from "./studio-virtual-space-interaction-orchestrator";

const PROJECT_PANELS = new Set<StudioVirtualWorkspacePanel>(["team", "work", "sessions", "board", "annotation", "rtc", "today"]);

/** 개인 아틀리에에서는 프로젝트 도구를 비활성 카드로 열지 않는다. */
export function studioVirtualWorkspacePanelForScope(panel: StudioVirtualWorkspacePanel | null, personal: boolean): StudioVirtualWorkspacePanel | null {
  return personal && panel !== null && PROJECT_PANELS.has(panel) ? null : panel;
}
