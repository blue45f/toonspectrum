// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioBrushCompositionBaseline } from "./studio-brush-composition-catalog";
import {
  STUDIO_OIL_PROGRAM_MATRIX_BRUSH_IDS,
  studioBrushEngineProgramSetFromComposition,
  studioBrushEngineProgramSetFromOil,
} from "./studio-brush-engine-program-set";
import { studioBrushPresetById } from "./studio-draw-ux";
import { StudioBrushEngineProgramControls } from "./StudioBrushEngineProgramControls";

describe("StudioBrushEngineProgramControls", () => {
  afterEach(cleanup);

  it("exposes the universal BrushGraph composer for non-oil brushes", () => {
    const onChange = vi.fn();
    render(
      <StudioBrushEngineProgramControls brushId="pen" programSet={null} onChange={onChange} />,
    );
    expect(screen.getByText("범용 BrushGraph 컴포저")).toBeTruthy();
    expect(screen.getByLabelText("필기감 선택")).toHaveValue("adaptive-ema");
    expect(screen.getByLabelText("물리 엔진 선택")).toHaveValue("no-physics");
    expect(screen.getByText("authority 충돌 없이 컴파일 가능한 조합입니다.")).toBeTruthy();
  });

  it("persists a distinctive pattern selection instead of reducing it to a scalar", () => {
    const onChange = vi.fn();
    render(
      <StudioBrushEngineProgramControls brushId="pen" programSet={null} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("패턴·문양 선택"), {
      target: { value: "kaleido-symmetry" },
    });
    const next = onChange.mock.calls[0]![0];
    expect(next?.composition?.pattern).toBe("kaleido-symmetry");
    expect(next?.composition?.carrier).toBe("webgpu-causal-ink");
  });

  it("compiles the living-chroma recipe into the connected watercolor program", () => {
    const onChange = vi.fn();
    render(
      <StudioBrushEngineProgramControls
        brushId="inkwash-pen"
        programSet={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^리빙 크로마 잉크/u }));
    const next = onChange.mock.calls[0]![0];
    expect(next?.composition?.physics).toBe("inkwash-fluid");
    expect(next?.watercolor).toEqual({ livingInkBakeProgramId: "sumi-flow-bake" });
  });

  it("resets composition and its connected family patch together", () => {
    const onChange = vi.fn();
    const initial = studioBrushEngineProgramSetFromComposition(
      createStudioBrushCompositionBaseline("pen", "pen"),
    );
    render(
      <StudioBrushEngineProgramControls brushId="pen" programSet={initial} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "기본 조합" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows the preset baseline and literal oil paint-order toggles", () => {
    render(
      <StudioBrushEngineProgramControls
        brushId="oil--impasto-ribbon"
        programSet={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("유화 · 임파스토(소모 없음)와 같은 조합")).toBeTruthy();
    expect(screen.getByRole("button", { name: /붓털 물리/u }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByRole("button", { name: /임파스토 릴리프/u }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByRole("button", { name: /물감 소모/u }).getAttribute("aria-pressed"))
      .toBe("false");
  });

  it("exposes all eight connected oil combinations exactly once", () => {
    render(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={null}
        onChange={vi.fn()}
      />,
    );
    for (const name of [
      "기본 본체",
      "부드러운 강모",
      "마른 획",
      "두꺼운 능선",
      "자연 강모",
      "강모 임파스토",
      "건조 임파스토",
      "풀 피직스",
    ]) {
      expect(screen.getByRole("button", { name: `유화 조합: ${name}` })).toBeTruthy();
    }
    expect(screen.getByText("2³ 조합")).toBeTruthy();
  });

  it("applies a matrix recipe as a durable engine program set", () => {
    const onChange = vi.fn();
    render(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "유화 조합: 건조 임파스토" }));
    expect(onChange).toHaveBeenCalledWith(
      studioBrushEngineProgramSetFromOil({
        bristlePhysics: false,
        bristleLoadDynamics: true,
        impastoRelief: true,
      }),
    );
  });

  it("preserves the generic composition when a connected oil pass changes", () => {
    const onChange = vi.fn();
    const composition = createStudioBrushCompositionBaseline("oil--filbert-ribbon", "oil");
    const initial = studioBrushEngineProgramSetFromComposition(composition);
    render(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={initial}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /물감 소모/u }));
    const next = onChange.mock.calls[0]![0];
    expect(next?.composition).toEqual(composition);
    expect(next?.oil?.bristleLoadDynamics).toBe(true);
  });

  it("sends a set after a detailed toggle and names matching shipped presets", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StudioBrushEngineProgramControls
        brushId="oil--impasto-ribbon"
        programSet={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /물감 소모/u }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0];
    expect(next?.oil).toEqual({
      bristlePhysics: true,
      bristleLoadDynamics: true,
      impastoRelief: true,
    });

    rerender(
      <StudioBrushEngineProgramControls
        brushId="oil--impasto-ribbon"
        programSet={next}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("유화 붓와 같은 조합")).toBeTruthy();
    expect(screen.queryByText(/이 조합과 같은 프리셋은 없습니다/u)).toBeNull();
    expect(screen.getAllByText("변경됨")).toHaveLength(1);
  });

  it("calls only combinations absent from the shipped matrix custom", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StudioBrushEngineProgramControls
        brushId="brush--impasto-relief"
        programSet={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /물감 소모/u }));
    const next = onChange.mock.calls[0]![0];
    expect(next?.oil).toEqual({
      bristlePhysics: false,
      bristleLoadDynamics: true,
      impastoRelief: true,
    });

    rerender(
      <StudioBrushEngineProgramControls
        brushId="brush--impasto-relief"
        programSet={next}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("커스텀 조합")).toBeTruthy();
    expect(screen.getByText(/이 조합과 같은 프리셋은 없습니다/u)).toBeTruthy();
  });

  it("names fully enabled general-purpose paints by their own preset", () => {
    for (const [brushId, name] of [["oil", "유화 붓"], ["acrylic", "아크릴 물감"]] as const) {
      render(
        <StudioBrushEngineProgramControls brushId={brushId} programSet={null} onChange={vi.fn()} />,
      );
      expect(screen.getByText(`${name}와 같은 조합`), brushId).toBeTruthy();
      expect(screen.queryByText("커스텀 조합"), brushId).toBeNull();
      cleanup();
    }
  });

  it("never labels a catalogued matrix baseline as custom", () => {
    let checked = 0;
    for (const brushId of STUDIO_OIL_PROGRAM_MATRIX_BRUSH_IDS) {
      if (!studioBrushPresetById(brushId)) continue;
      checked += 1;
      render(
        <StudioBrushEngineProgramControls brushId={brushId} programSet={null} onChange={vi.fn()} />,
      );
      expect(screen.queryByText("커스텀 조합"), brushId).toBeNull();
      cleanup();
    }
    expect(checked).toBeGreaterThanOrEqual(7);
  });

  it("emits null when a toggle or matrix recipe returns to the id baseline", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={studioBrushEngineProgramSetFromOil({
          bristlePhysics: true,
          bristleLoadDynamics: false,
          impastoRelief: true,
        })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /임파스토 릴리프/u }));
    expect(onChange).toHaveBeenLastCalledWith(null);

    onChange.mockClear();
    rerender(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={studioBrushEngineProgramSetFromOil({
          bristlePhysics: false,
          bristleLoadDynamics: true,
          impastoRelief: true,
        })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "유화 조합: 부드러운 강모" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows preset restore only for changed oil combinations", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={null}
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("button", { name: /프리셋으로/u })).toBeNull();

    rerender(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={studioBrushEngineProgramSetFromOil({
          bristlePhysics: false,
          bristleLoadDynamics: true,
          impastoRelief: false,
        })}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /프리셋으로/u }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
