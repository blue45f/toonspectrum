// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioMobileHistoryTouchGestures } from "./studio-mobile-history-touch-gesture-host";

import type { StudioAppSettings } from "./studio-app-settings";
import type { StudioMobileHistoryGestureActions } from "./studio-mobile-history-touch-gesture-host";

// 페이지 셸 전체를 초기화하지 않고 실제 HUD 선택자와 DOM 조상 판정 경계를 유지한다.
vi.mock("./studio-page-shell-runtime", () => ({
  isStudioViewToolsHudEventTarget: (target: unknown) =>
    target instanceof Element && target.closest("[data-studio-view-tools-hud]") !== null,
}));

type TouchPoint = { identifier: number; clientX: number; clientY: number };

function settings(
  twoFinger: "pan-zoom" | "undo-redo",
  threeFinger: "undo" | "toggle-ui" | "none",
): StudioAppSettings {
  return { touch: { twoFinger, threeFinger } } as unknown as StudioAppSettings;
}

/**
 * 훅은 event.touches / event.target / preventDefault 만 읽는다. jsdom 은 TouchEvent 생성자를
 * 신뢰할 수 없게 구현하므로 평범한 Event 에 touches 를 얹어 보낸다.
 */
function fire(node: HTMLElement, type: string, points: TouchPoint[], from: HTMLElement = node) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: points });
  from.dispatchEvent(event);
  return event;
}

const TWO: TouchPoint[] = [
  { identifier: 1, clientX: 100, clientY: 100 },
  { identifier: 2, clientX: 160, clientY: 100 },
];
const THREE: TouchPoint[] = [...TWO, { identifier: 3, clientX: 220, clientY: 100 }];
const FOUR: TouchPoint[] = [...THREE, { identifier: 4, clientX: 280, clientY: 100 }];

function mount(options?: {
  appSettings?: StudioAppSettings;
  viewportWidth?: number;
  owned?: boolean;
}) {
  vi.stubGlobal("innerWidth", options?.viewportWidth ?? 390);
  const node = document.createElement("div");
  const workspace = document.createElement("div");
  workspace.id = "studio-workspace";
  workspace.append(node);
  document.body.append(workspace);
  const actions: StudioMobileHistoryGestureActions = { undo: vi.fn(), toggleUi: vi.fn() };
  const vibrate = vi.fn();
  Object.defineProperty(globalThis.navigator, "vibrate", { value: vibrate, configurable: true });
  // 훅이 두 번(터치 시작·종료) 읽는 시계를 직접 쥐고 탭과 롱프레스를 갈라 놓는다.
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  let owned = options?.owned ?? false;
  const canvasPointerGestureIsOwned = () => owned;
  const surfaceRef = { current: node };
  const appSettingsRef = { current: options?.appSettings ?? settings("undo-redo", "toggle-ui") };
  const gestureRef = { current: actions };
  const view = renderHook(() =>
    useStudioMobileHistoryTouchGestures({
      surfaceRef,
      canvasPointerGestureIsOwned,
      appSettingsRef,
      gestureRef,
    }),
  );
  return {
    node, workspace, actions, vibrate, view, appSettingsRef,
    advance: (ms: number) => { now += ms; },
    setOwned: (value: boolean) => { owned = value; },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("useStudioMobileHistoryTouchGestures", () => {
  it("통합 Studio와 Draw 화면은 캔버스 호스트의 단일 터치 처리기만 연결한다", () => {
    const viewSource = readFileSync(join(process.cwd(), "apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorView.tsx"), "utf8");
    const hostSource = readFileSync(join(process.cwd(), "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx"), "utf8");
    expect(viewSource).not.toContain("StudioDrawingGestureBridge");
    expect(hostSource.match(/useStudioMobileHistoryTouchGestures\(\{/gu)).toHaveLength(1);
  });

  it("runs undo on a settled two-finger tap and buzzes once", () => {
    const { node, actions, vibrate, advance } = mount();
    fire(node, "touchstart", TWO);
    advance(120);
    const end = fire(node, "touchend", []);
    expect(actions.undo).toHaveBeenCalledTimes(1);
    expect(actions.toggleUi).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(8);
    // 탭으로 인정된 순간에만 브라우저 기본 동작을 막는다.
    expect(end.defaultPrevented).toBe(true);
  });

  it("routes the three-finger tap by preference, and does nothing when it is off", () => {
    const toggle = mount();
    fire(toggle.node, "touchstart", THREE);
    toggle.advance(50);
    fire(toggle.node, "touchend", []);
    expect(toggle.actions.toggleUi).toHaveBeenCalledTimes(1);
    expect(toggle.actions.undo).not.toHaveBeenCalled();
    cleanup();

    const undo = mount({ appSettings: settings("undo-redo", "undo") });
    fire(undo.node, "touchstart", THREE);
    undo.advance(50);
    fire(undo.node, "touchend", []);
    expect(undo.actions.undo).toHaveBeenCalledTimes(1);
    cleanup();

    const off = mount({ appSettings: settings("pan-zoom", "none") });
    fire(off.node, "touchstart", THREE);
    off.advance(50);
    const end = fire(off.node, "touchend", []);
    expect(off.actions.undo).not.toHaveBeenCalled();
    expect(off.actions.toggleUi).not.toHaveBeenCalled();
    // 제스처로 인정하지 않았으면 기본 동작도 그대로 둬야 스크롤이 살아 있다.
    expect(end.defaultPrevented).toBe(false);
  });

  it("네 손가락 탭은 두/세 손가락 설정과 독립적으로 UI를 한 번 전환한다", () => {
    const { node, actions, advance, vibrate } = mount({ appSettings: settings("pan-zoom", "none") });
    let canvasOnly = false;
    vi.mocked(actions.toggleUi).mockImplementation(() => { canvasOnly = !canvasOnly; });
    fire(node, "touchstart", FOUR);
    advance(100);
    fire(node, "touchend", []);
    expect(actions.toggleUi).toHaveBeenCalledTimes(1);
    expect(canvasOnly).toBe(true);
    expect(actions.undo).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("캔버스 밖의 작업공간 터치는 이력을 바꾸지 않고 캔버스 탭은 한 단계만 되돌린다", () => {
    const { node, workspace, actions, advance } = mount();
    let historyDepth = 3;
    vi.mocked(actions.undo).mockImplementation(() => { historyDepth -= 1; });
    const inspector = document.createElement("button");
    workspace.append(inspector);
    fire(node, "touchstart", TWO, inspector);
    advance(100);
    fire(node, "touchend", [], inspector);
    expect(historyDepth).toBe(3);
    const canvas = document.createElement("canvas");
    node.append(canvas);
    fire(node, "touchstart", TWO, canvas);
    advance(100);
    fire(node, "touchend", [], canvas);
    expect(historyDepth).toBe(2);
    expect(actions.undo).toHaveBeenCalledTimes(1);
  });

  it("rejects a drag past the 12px slop and a hold past 320ms", () => {
    const dragged = mount();
    fire(dragged.node, "touchstart", TWO);
    fire(dragged.node, "touchmove", [
      { identifier: 1, clientX: 100, clientY: 113 },
      { identifier: 2, clientX: 160, clientY: 100 },
    ]);
    dragged.advance(60);
    fire(dragged.node, "touchend", []);
    expect(dragged.actions.undo).not.toHaveBeenCalled();
    cleanup();

    const held = mount();
    fire(held.node, "touchstart", TWO);
    held.advance(321);
    fire(held.node, "touchend", []);
    expect(held.actions.undo).not.toHaveBeenCalled();
  });

  it("stands down for an owned canvas gesture, a HUD target, and a lifted finger", () => {
    const owned = mount({ owned: true });
    fire(owned.node, "touchstart", TWO);
    owned.advance(50);
    fire(owned.node, "touchend", []);
    expect(owned.actions.undo).not.toHaveBeenCalled();
    cleanup();

    const hud = mount();
    const button = document.createElement("button");
    button.dataset.studioViewToolsHud = "true";
    hud.node.append(button);
    fire(hud.node, "touchstart", TWO, button);
    hud.advance(50);
    fire(hud.node, "touchend", []);
    expect(hud.actions.undo).not.toHaveBeenCalled();
    cleanup();

    // 세 손가락 중 하나만 떼면 아직 제스처가 끝난 게 아니다.
    const partial = mount();
    fire(partial.node, "touchstart", THREE);
    partial.advance(50);
    fire(partial.node, "touchend", [TWO[0]!, TWO[1]!]);
    expect(partial.actions.toggleUi).not.toHaveBeenCalled();
  });

  it.each([{ points: TWO }, { points: THREE }, { points: FOUR }])("HUD 내부 아이콘에서 시작한 $points.length 손가락 탭은 소비하지 않는다", ({ points }) => {
    const { node, actions, advance } = mount();
    const hud = document.createElement("button");
    hud.dataset.studioViewToolsHud = "true";
    const icon = document.createElement("span");
    hud.append(icon);
    node.append(hud);
    fire(node, "touchstart", points, icon);
    advance(100);
    const end = fire(node, "touchend", [], icon);
    expect(actions.undo).not.toHaveBeenCalled();
    expect(actions.toggleUi).not.toHaveBeenCalled();
    expect(end.defaultPrevented).toBe(false);
  });

  it("탭 도중 펜이나 편집 제스처가 캔버스를 소유하면 종료 시 명령을 실행하지 않는다", () => {
    const { node, actions, advance, setOwned } = mount();
    fire(node, "touchstart", TWO);
    setOwned(true);
    advance(100);
    fire(node, "touchend", []);
    expect(actions.undo).not.toHaveBeenCalled();
    expect(actions.toggleUi).not.toHaveBeenCalled();
  });

  it("취소되거나 하위 컨트롤이 처리한 터치의 종료를 실행 취소로 바꾸지 않는다", () => {
    const { node, actions, advance } = mount();
    fire(node, "touchstart", TWO);
    fire(node, "touchcancel", []);
    advance(100);
    fire(node, "touchend", []);
    const child = document.createElement("canvas");
    child.addEventListener("touchend", (event) => event.preventDefault());
    node.append(child);
    fire(node, "touchstart", TWO, child);
    advance(100);
    fire(node, "touchend", [], child);
    expect(actions.undo).not.toHaveBeenCalled();
    expect(actions.toggleUi).not.toHaveBeenCalled();
  });

  it("렌더 중에도 후보를 유지하고 종료 시 최신 설정을 적용한다", () => {
    const { node, actions, advance, view, appSettingsRef } = mount();
    fire(node, "touchstart", THREE);
    view.rerender();
    advance(100);
    fire(node, "touchend", []);
    expect(actions.toggleUi).toHaveBeenCalledTimes(1);
    fire(node, "touchstart", THREE);
    appSettingsRef.current = settings("pan-zoom", "none");
    view.rerender();
    advance(100);
    const end = fire(node, "touchend", []);
    expect(actions.toggleUi).toHaveBeenCalledTimes(1);
    expect(actions.undo).not.toHaveBeenCalled();
    expect(end.defaultPrevented).toBe(false);
  });

  it("데스크톱 터치 기기에서도 한 번 실행하고 언마운트하면 구독을 해제한다", () => {
    const desktop = mount({ viewportWidth: 1440 });
    fire(desktop.node, "touchstart", TWO);
    desktop.advance(50);
    fire(desktop.node, "touchend", []);
    expect(desktop.actions.undo).toHaveBeenCalledTimes(1);
    cleanup();

    const mobile = mount();
    mobile.view.unmount();
    fire(mobile.node, "touchstart", TWO);
    mobile.advance(50);
    fire(mobile.node, "touchend", []);
    expect(mobile.actions.undo).not.toHaveBeenCalled();
  });
});
