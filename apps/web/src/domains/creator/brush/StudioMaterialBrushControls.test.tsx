// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialStroke, normalizeBrushStudioV6MaterialConfig } from "../brush-lab/brush-studio-v6-material-engine";
import { StudioBrushEngineProgramControls } from "./StudioBrushEngineProgramControls";
import type { StudioBrushEngineProgramSet } from "./studio-brush-engine-program-set";

afterEach(() => { cleanup(); localStorage.clear(); });

describe("material brush controls inside Studio", () => {
  it("disables the secondary pigment for a primary-only material and enables it for bristle mixing", () => {
    const material = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program("clean-ink"))!;
    const { rerender } = render(<StudioBrushEngineProgramControls brushId="brush" programSet={{ version: 1, material }} onChange={vi.fn()} />);
    const inactive = screen.getByLabelText("혼합·문양 색") as HTMLInputElement;
    expect(inactive.disabled).toBe(true);
    expect(inactive.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("현재 재료 조합에서 사용하지 않음")).toBeTruthy();
    const bristle = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program("oil-hair-mixer"))!;
    const onChange = vi.fn();
    rerender(<StudioBrushEngineProgramControls brushId="brush" programSet={{ version: 1, material: bristle }} onChange={onChange} />);
    const active = screen.getByLabelText("혼합·문양 색") as HTMLInputElement;
    expect(active.disabled).toBe(false);
    fireEvent.change(active, { target: { value: "#113355" } });
    expect(onChange.mock.calls[0]?.[0].material.tuning.secondaryColor).toBe("#113355");
  });

  it("edits real contact parameters while retaining the material snapshot and suppressing legacy no-op switches", () => {
    const material = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program("oil-hair-mixer"))!;
    const onChange = vi.fn();
    render(<StudioBrushEngineProgramControls brushId="oil" programSet={{ version: 1, material }} onChange={onChange} />);
    expect(screen.queryByText("원하는 질감으로 고르기")).toBeNull();
    expect(screen.queryByText("전문 엔진 그래프")).toBeNull();
    expect(screen.queryByRole("slider", { name: /수분/u })).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: /안료 저장량/u }), { target: { value: "0.1" } });
    const next = onChange.mock.calls[0]![0] as StudioBrushEngineProgramSet;
    expect(next.material?.tuning.reservoir).toBe(0.1);
    expect(next.material?.seed).toBe(material.seed);
    expect(next.material?.slots).toEqual(material.slots);
    expect(next.material?.input).toEqual(material.input);
    const point = { x: 30, y: 20, pressure: 0.8 };
    expect(createBrushStudioV6MaterialStroke(next.material!).push(point))
      .not.toEqual(createBrushStudioV6MaterialStroke(material).push(point));
    fireEvent.click(screen.getByRole("button", { name: "기본 브러시로 전환" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("hands the exact material, seed and pressure response to a separate Brush Editor draft", () => {
    const material = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program("dendritic-copper"))!;
    render(<StudioBrushEngineProgramControls brushId="brush" programSet={{ version: 1, material }} onChange={vi.fn()} />);
    const link = screen.getByRole("link", { name: "브러시 편집기에서 비교·실험" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    const program = JSON.parse(localStorage.getItem(`toonspectrum.brush-program-v6:${encodeURIComponent(`brush:material-${material.seed}`)}`)!);
    expect(program.tuning).toEqual(material.tuning);
    expect(program.input).toEqual(material.input);
    expect(program.slots).toEqual(material.slots);
    expect(program.seed).toBe(material.seed);
    expect(link.getAttribute("href")).toBe(`/studio/assets/brushes/material-${material.seed}/edit`);
  });
});
