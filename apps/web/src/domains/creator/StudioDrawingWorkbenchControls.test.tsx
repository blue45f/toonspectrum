// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { StudioDrawingWorkbenchControls } from "./StudioDrawingWorkbenchControls";

afterEach(cleanup);

it("delegates layout-only actions and exposes the dock state without hiding labels", () => {
  const handlers = { toggleBrushDock: vi.fn(), restoreDrawingLayout: vi.fn(), undoDrawingLayoutRestore: vi.fn() };
  const view = render(<StudioDrawingWorkbenchControls libraryOpen={false} undoAvailable={false} handlers={handlers} />);
  fireEvent.click(screen.getByRole("button", { name: "브러시 패널 열기" }));
  expect(handlers.toggleBrushDock).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "드로잉 기본 배치 복원" }));
  expect(handlers.restoreDrawingLayout).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "이전 작업 배치로 되돌리기" })).toBeNull();
  view.rerender(<StudioDrawingWorkbenchControls libraryOpen undoAvailable handlers={handlers} />);
  expect(screen.getByRole("button", { name: "브러시 패널 접기" }).getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "이전 작업 배치로 되돌리기" }));
  expect(handlers.undoDrawingLayoutRestore).toHaveBeenCalledOnce();
});

it("does not offer disconnected workbench actions", () => {
  const view = render(<StudioDrawingWorkbenchControls libraryOpen={false} undoAvailable handlers={{}} />);
  expect(view.container.childElementCount).toBe(0);
});

it("opens quick access at the click position with an icon that differs from the layout restore action", () => {
  const openQuickAccess = vi.fn();
  render(<StudioDrawingWorkbenchControls libraryOpen={false} undoAvailable={false}
    handlers={{ openQuickAccess, restoreDrawingLayout: vi.fn() }} />);
  const quick = screen.getByRole("button", { name: "빠른 실행 열기" });
  const restore = screen.getByRole("button", { name: "드로잉 기본 배치 복원" });
  fireEvent.click(quick, { clientX: 41, clientY: 77 });
  expect(openQuickAccess).toHaveBeenCalledWith({ x: 41, y: 77 });
  // 같은 아이콘이면 두 버튼을 글자 없이는 구분할 수 없다(좁은 폭에서는 글자가 숨는다).
  expect(quick.querySelector("svg")?.getAttribute("class")).not.toBe(restore.querySelector("svg")?.getAttribute("class"));
});
