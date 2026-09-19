// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { StudioPigmentComparison } from "./StudioPigmentComparison";

afterEach(cleanup);
describe("pigment comparison UI", () => {
  it("compares real palettes and commits only an explicitly selected provider id", () => {
    const onSelect = vi.fn();
    render(<StudioPigmentComparison primary="#002185" secondary="#fcd200" node="pigment-spectral"
      secondaryActive onSelect={onSelect} />);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("#3d933e")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Spectral.js 3 선택" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("pigment-spectral-js");
    expect(screen.getByRole("button", { name: "기존 WGM 선택" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("keeps finite-layer probe local and exposes a zero-thickness substrate result", () => {
    const onSelect = vi.fn();
    render(<StudioPigmentComparison primary="#002185" secondary="#fcd200" node="pigment-spectral-js"
      secondaryActive={false} onSelect={onSelect} />);
    expect(screen.getByRole("note").textContent).toContain("보조 색을 사용하지 않습니다");
    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "K–M 광학 층 실험 열기" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    expect(screen.getByLabelText("광학 층 계산 결과").textContent).toBe("#ffffff");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
