// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readStudioCuttoonEditorSource } from "./studio-cuttoon-editor/read-studio-cuttoon-editor-source";
import { STUDIO_POINTER_DISTANCE_BUDGETS_PX } from "./studio-oncanvas-command-surfaces";
import {
  StudioSelectionContextBar,
  type StudioSelectionContextBarHandlers,
} from "./StudioSelectionContextBar";

const SELECTION = { left: 600, top: 400, width: 120, height: 90 };
const CANVAS = { left: 224, top: 44, width: 900, height: 800 };

function handlers(
  overrides: Partial<StudioSelectionContextBarHandlers> = {}
): StudioSelectionContextBarHandlers {
  return {
    onQuickAction: vi.fn(),
    onReorder: vi.fn(),
    onAlign: vi.fn(),
    getSelectionRect: () => SELECTION,
    getCanvasRect: () => CANVAS,
    ...overrides,
  };
}

function renderBar(
  props: Partial<Parameters<typeof StudioSelectionContextBar>[0]> = {},
  bag: StudioSelectionContextBarHandlers = handlers()
) {
  const result = render(
    <StudioSelectionContextBar
      visible
      selectionCount={1}
      readOnly={false}
      canDelete
      stableHandlers={bag}
      {...props}
    />
  );
  return { ...result, bag };
}

function barNode(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-studio-selection-context-bar="true"]');
  if (!node) throw new Error("selection context bar not mounted");
  return node;
}

let rafQueue: FrameRequestCallback[] = [];

beforeEach(() => {
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  // jsdom reports 0×0 for everything; the planner needs a real bar box.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return this.dataset?.studioSelectionContextBar === "true" ? 232 : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return this.dataset?.studioSelectionContextBar === "true" ? 42 : 0;
    },
  });
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function flushFrames() {
  const queued = rafQueue;
  rafQueue = [];
  for (const callback of queued) callback(0);
}

describe("StudioSelectionContextBar", () => {
  it("puts the follow-a-selection commands beside the selection", () => {
    renderBar();
    flushFrames();
    const bar = barNode();
    expect(bar.style.visibility).toBe("visible");
    expect(bar.dataset.studioSelectionBarSide).toBe("top");
    expect(bar.dataset.studioSelectionBarWithinBudget).toBe("true");
    for (const key of ["duplicate", "forward", "backward", "bring-front", "properties", "delete"]) {
      expect(bar.querySelector(`[data-studio-selection-command="${key}"]`)).not.toBeNull();
    }
  });

  it("routes 복제·삭제·맨 앞으로·속성 through the shared quick-action dispatcher", () => {
    const bag = handlers();
    renderBar({}, bag);
    flushFrames();
    fireEvent.click(screen.getByRole("button", { name: "복제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "맨 앞으로" }));
    fireEvent.click(screen.getByRole("button", { name: "속성" }));
    expect(bag.onQuickAction).toHaveBeenNthCalledWith(1, "duplicate");
    expect(bag.onQuickAction).toHaveBeenNthCalledWith(2, "delete");
    expect(bag.onQuickAction).toHaveBeenNthCalledWith(3, "bring-front");
    expect(bag.onQuickAction).toHaveBeenNthCalledWith(4, "properties");
    expect(bag.onReorder).not.toHaveBeenCalled();
  });

  it("routes 앞으로·뒤로 through the shared reorder command", () => {
    const bag = handlers();
    renderBar({}, bag);
    flushFrames();
    fireEvent.click(screen.getByRole("button", { name: "앞으로" }));
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    expect(bag.onReorder).toHaveBeenNthCalledWith(1, "forward");
    expect(bag.onReorder).toHaveBeenNthCalledWith(2, "backward");
  });

  it("adds the group align row only when more than one element is selected", () => {
    const { rerender, bag } = renderBar();
    flushFrames();
    expect(screen.queryByRole("group", { name: "선택 정렬" })).toBeNull();

    rerender(
      <StudioSelectionContextBar
        visible
        selectionCount={3}
        readOnly={false}
        canDelete
        stableHandlers={bag}
      />
    );
    flushFrames();
    expect(screen.getByRole("group", { name: "선택 정렬" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "가로 분배" }));
    expect(bag.onAlign).toHaveBeenCalledWith("distributeH");
    expect(screen.getByRole("toolbar", { name: "선택 3개 명령" })).toBeTruthy();
  });

  it("stays inside the 180px budget from the selection box", () => {
    renderBar();
    flushFrames();
    const bar = barNode();
    const match = /translate3d\((-?\d+)px, (-?\d+)px/u.exec(bar.style.transform);
    expect(match).not.toBeNull();
    const left = Number(match?.[1]);
    const top = Number(match?.[2]);
    const corners = [
      [left, top],
      [left + 232, top],
      [left, top + 42],
      [left + 232, top + 42],
    ];
    for (const [x, y] of corners) {
      const dx = Math.max(SELECTION.left - x, 0, x - (SELECTION.left + SELECTION.width));
      const dy = Math.max(SELECTION.top - y, 0, y - (SELECTION.top + SELECTION.height));
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(
        STUDIO_POINTER_DISTANCE_BUDGETS_PX.selectionCommand
      );
    }
  });

  it("disables every command on a review-locked page", () => {
    renderBar({ readOnly: true, canDelete: false });
    flushFrames();
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveProperty("disabled", true);
    }
  });

  it("hides itself when the selection can no longer be projected", () => {
    renderBar({}, handlers({ getSelectionRect: () => null }));
    flushFrames();
    expect(barNode().style.visibility).toBe("hidden");
  });

  it("renders nothing when there is no selection", () => {
    renderBar({ visible: false, selectionCount: 0 });
    expect(document.querySelector('[data-studio-selection-context-bar="true"]')).toBeNull();
  });

  /**
   * D8 — 선택할 때마다 캔버스가 95px 밀리던 결함. 컨텍스트 바 자신은 body 포털 +
   * position:fixed 오버레이라 flow 를 차지하면 안 된다. 여기서 흐름으로 되돌아오면
   * 선택할 때마다 캔버스 원점이 다시 움직인다.
   */
  it("stays a body-portaled fixed overlay so the canvas box never reflows", () => {
    const host = document.createElement("div");
    host.dataset.canvasHost = "true";
    document.body.append(host);

    const { container } = renderBar();
    flushFrames();
    const bar = barNode();

    // React Testing Library 컨테이너(=레이아웃 흐름 대역)에는 아무것도 남지 않는다.
    expect(container.contains(bar)).toBe(false);
    expect(host.contains(bar)).toBe(false);
    expect(bar.parentElement).toBe(document.body);
    expect(bar.style.position).toBe("fixed");
    // 좌표는 transform 으로만 움직인다 — margin/top/left 로 밀면 형제가 함께 밀린다.
    expect(bar.style.left).toBe("0px");
    expect(bar.style.top).toBe("0px");
    expect(bar.style.transform).toContain("translate3d");
    host.remove();
  });
});

/**
 * 컨텍스트 바를 마운트하는 레이아웃 사이트(StudioPage) 계약. 브라우저 실측으로는
 * 선택 시 캔버스 원점이 95px 밀렸고, 그중 44px 은 "선택이 생길 때만" flow 에 끼어드는
 * 선택 옵션 스트립이었다. 스트립 높이를 선택 도구 세션 내내 예약해 두는 배선이
 * 사라지면 그 44px 점프가 그대로 돌아온다.
 *
 * 2차 실측에서는 잔여분이 남아 있었다 — 예약이 `tool === "select"` 에 묶여 있어 도구를
 * 바꾸는 순간 같은 44px 이 움직였다(펜 y=121/h=599 ↔ 선택 y=165/h=555). 예약 조건을
 * 도구·픽셀도구 무장과 분리해 캔버스 기하가 도구 전환에 반응하지 않게 한다.
 */
describe("Studio selection context integration", () => {
  const pageSource = readStudioCuttoonEditorSource();

  it("arms selection context by tool and actual selection without reserving a second row", () => {
    expect(pageSource).toContain("const selectionOptionsSuppressed =");
    expect(pageSource).toContain("const selectOptionsStripArmed =");
    expect(pageSource).toContain(
      'tool === "select" && !canvasOnlyMode && !selectionOptionsSuppressed;'
    );
    expect(pageSource).toContain(
      "visible: selectOptionsStripArmed && count > 0 && selectionLaneMounted,"
    );
    expect(pageSource).not.toContain("selectOptionsLaneReserved");
    expect(pageSource).not.toContain('data-studio-select-options-reserve="true"');
  });

  it("keeps the desktop selection context out of the mobile thumb workspace", () => {
    expect(pageSource).toContain("const selectionLaneMounted = !isMobile;");
    expect(pageSource).toContain("toggleSelectionLock: toggleSelectedElementsLocked,");
    expect(pageSource).toContain("editSelectionText: editSelectedElementText,");
    expect(pageSource).toContain("selectionLocked={mobileSelectionLocked}");
  });

  it("does not mount the legacy on-canvas object command bar", () => {
    expect(pageSource).not.toContain("<StudioSelectionContextBar");
  });
});
