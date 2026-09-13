import type { StudioUiChromeRegion, StudioUiDensityMode } from "./studio-ui-density";

/** Disclosure changes chrome only. It never changes the document or saved workspace. */
export function studioToolbarIsExpanded(
  mode: StudioUiDensityMode,
  expanded: boolean,
): boolean {
  return mode === "full" || expanded;
}

/** Keep a small, complete creation path. Open contextual popovers are retained by the host. */
export function studioToolbarDisclosureAllows(
  mode: StudioUiDensityMode,
  expanded: boolean,
  region: StudioUiChromeRegion,
): boolean {
  if (studioToolbarIsExpanded(mode, expanded)) return true;
  return region === "toolbar-assets"
    || region === "toolbar-cut"
    || region === "toolbar-draw"
    || region === "toolbar-insert";
}

export type StudioGettingStartedAction =
  | "frame"
  | "draw"
  | "bubble"
  | "background"
  | "preview"
  | "help";

export interface StudioGettingStartedTask {
  readonly id: StudioGettingStartedAction;
  readonly label: string;
  readonly description: string;
  readonly changesDocument: boolean;
}

export const STUDIO_GETTING_STARTED_TASKS: readonly StudioGettingStartedTask[] = [
  { id: "frame", label: "만화 칸 만들기", description: "컷을 하나 추가하고 위치와 크기를 정해요.", changesDocument: true },
  { id: "draw", label: "그림 그리기", description: "펜으로 시작해요. 색과 굵기는 그리면서 바꿀 수 있어요.", changesDocument: true },
  { id: "bubble", label: "말풍선 넣기", description: "말풍선 모양을 고르고 대사를 적어요.", changesDocument: true },
  { id: "background", label: "배경 꾸미기", description: "색·장면·3D 배경 중 필요한 방법을 골라요.", changesDocument: true },
  { id: "preview", label: "독자처럼 미리보기", description: "세로로 읽으며 컷 사이 간격과 대사 흐름을 확인해요.", changesDocument: false },
  { id: "help", label: "사용법 살펴보기", description: "모르는 도구는 예제와 사용 안내로 배워요.", changesDocument: false },
];

export function studioGettingStartedTaskDisabled(
  task: StudioGettingStartedTask,
  documentLocked: boolean,
): boolean {
  return task.changesDocument && documentLocked;
}
