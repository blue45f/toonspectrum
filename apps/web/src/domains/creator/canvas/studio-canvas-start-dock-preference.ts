/**
 * 빈 캔버스 시작 도크를 이 기기에서 한 번이라도 닫거나 사용했는지 기억한다.
 * 이후 빈 페이지에서는 도크를 접힌 버튼으로만 보여 캔버스를 가리지 않는다.
 * 저장소를 쓸 수 없으면(사생활 보호 모드 등) 매번 펼친 상태로 보여 준다.
 */
export const STUDIO_CANVAS_START_DOCK_STORAGE_KEY = "toonstudio.canvas-start-dock.v1";
const COLLAPSED_VALUE = "collapsed";

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStudioCanvasStartDockCollapsed(): boolean {
  try {
    return browserStorage()?.getItem(STUDIO_CANVAS_START_DOCK_STORAGE_KEY) === COLLAPSED_VALUE;
  } catch {
    return false;
  }
}

export function rememberStudioCanvasStartDockCollapsed(): void {
  try {
    browserStorage()?.setItem(STUDIO_CANVAS_START_DOCK_STORAGE_KEY, COLLAPSED_VALUE);
  } catch {
    // 저장하지 못하면 다음 빈 페이지에서도 펼친 안내를 보여 준다.
  }
}
