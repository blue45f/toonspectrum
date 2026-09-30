// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { StudioPoserPage } from "./StudioPoserPage";

afterEach(cleanup);

vi.mock("./StudioMannequinPoserPanel", () => ({
  StudioMannequinPoserPanel: ({
    open,
    onClose,
    initialPosePresetId,
  }: {
    open: boolean;
    onClose: () => void;
    onInsert: (result: unknown) => boolean;
    initialPosePresetId?: string;
  }) => (
    <div
      data-testid="poser-panel"
      data-open={String(open)}
      data-initial-preset={initialPosePresetId ?? ""}
    >
      <button type="button" onClick={onClose}>
        닫기
      </button>
    </div>
  ),
}));

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderPage(initialEntry = "/studio/poser"): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/studio/poser" element={<StudioPoserPage />} />
        <Route path="/studio" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StudioPoserPage (/studio/poser)", () => {
  it("포저 패널을 열린 상태로 마운트한다", () => {
    renderPage();
    const panel = screen.getByTestId("poser-panel");
    expect(panel.getAttribute("data-open")).toBe("true");
  });

  it("?starter= 쿼리를 읽어 포저 패널의 시작 프리셋으로 전달한다", () => {
    renderPage("/studio/poser?starter=run");
    const panel = screen.getByTestId("poser-panel");
    expect(panel.getAttribute("data-initial-preset")).toBe("run");
  });

  it("?starter= 쿼리가 없으면 시작 프리셋을 전달하지 않는다", () => {
    renderPage();
    const panel = screen.getByTestId("poser-panel");
    expect(panel.getAttribute("data-initial-preset")).toBe("");
  });

  it("포저를 닫으면 /studio로 복귀한다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.getByTestId("location").textContent).toBe("/studio");
  });
});
