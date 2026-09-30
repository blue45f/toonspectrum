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
  }: {
    open: boolean;
    onClose: () => void;
    onInsert: (result: unknown) => boolean;
  }) => (
    <div data-testid="poser-panel" data-open={String(open)}>
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

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/studio/poser"]}>
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

  it("포저를 닫으면 /studio로 복귀한다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.getByTestId("location").textContent).toBe("/studio");
  });
});
