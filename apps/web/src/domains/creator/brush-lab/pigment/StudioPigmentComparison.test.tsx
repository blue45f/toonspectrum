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
    fireEvent.change(screen.getByLabelText(/광학 두께/u), { target: { value: "0" } });
    expect(screen.getByLabelText("광학 층 계산 결과").textContent).toBe("#ffffff");
    expect(onSelect).not.toHaveBeenCalled();
  });
});

  it("compares premixing and both layer orders without changing the brush, then returns to the substrate", () => {
    const onSelect = vi.fn();
    render(<StudioPigmentComparison primary="#002185" secondary="#fcd200" node="pigment-spectral-js" secondaryActive onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "K–M 광학 층 실험 열기" }));
    const names = ["미리 섞은 도막", "주 색을 위에 덧칠", "보조 색을 위에 덧칠"];
    expect(new Set(names.map((name) => screen.getByLabelText(name).textContent)).size).toBe(3);
    fireEvent.change(screen.getByLabelText(/주 색 도막 두께/u), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/보조 색 도막 두께/u), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("겹칠 비교 바탕색"), { target: { value: "#123456" } });
    for (const name of names) expect(screen.getByLabelText(name).textContent).toBe("#123456");
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "K–M 광학 층 실험 닫기" }));
    expect(screen.queryByRole("region", { name: "KM 혼합과 겹칠 비교" })).toBeNull();
  });
