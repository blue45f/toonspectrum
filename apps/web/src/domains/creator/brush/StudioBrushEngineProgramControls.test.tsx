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

function openExpertGraph(): void {
  fireEvent.click(screen.getByText("전문 엔진 그래프"));
}

function openOilFineTuning(): void {
  fireEvent.click(screen.getByText("각 물리 효과를 직접 켜고 끄기"));
}

describe("StudioBrushEngineProgramControls", () => {
  afterEach(cleanup);

  it("explains the result before exposing the universal engine graph", () => {
    const onChange = vi.fn();
    render(
      <StudioBrushEngineProgramControls brushId="pen" programSet={null} onChange={onChange} />,
    );
    expect(screen.getByText("펜·잉크")).toBeTruthy();
    expect(screen.getByText("목표 결과: 깨끗하고 예측 가능한 선")).toBeTruthy();
    expect(screen.getByText("전문 엔진 그래프")).toBeTruthy();
    openExpertGraph();
    expect(screen.getByText("범용 BrushGraph 컴포저")).toBeTruthy();
    expect((screen.getByLabelText("필기감 선택") as HTMLSelectElement).value).toBe("adaptive-ema");
    expect((screen.getByLabelText("물리 엔진 선택") as HTMLSelectElement).value).toBe("no-physics");
    expect(screen.getByText("authority 충돌 없이 컴파일 가능한 조합입니다.")).toBeTruthy();
  });

  it("persists a distinctive pattern selection instead of reducing it to a scalar", () => {
    const onChange = vi.fn();
    render(
      <StudioBrushEngineProgramControls brushId="pen" programSet={null} onChange={onChange} />,
    );
    openExpertGraph();
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
    expect(screen.getByText("수채")).toBeTruthy();
    openExpertGraph();
    fireEvent.click(screen.getByRole("button", { name: /^리빙 크로마 잉크/u }));
    const next = onChange.mock.calls[0]![0];
    expect(next?.composition?.physics).toBe("inkwash-fluid");
    expect(next?.watercolor).toEqual({ livingInkBakeProgramId: "sumi-flow-bake" });
  });

  it("opens an existing customized composition so the change is never hidden", () => {
    const onChange = vi.fn();
    const initial = studioBrushEngineProgramSetFromComposition(
      createStudioBrushCompositionBaseline("pen", "pen"),
    );
    render(
      <StudioBrushEngineProgramControls brushId="pen" programSet={initial} onChange={onChange} />,
    );
    expect(screen.getByText("범용 BrushGraph 컴포저")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기본 조합" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows the preset baseline while keeping literal oil toggles behind fine tuning", () => {
    render(
      <StudioBrushEngineProgramControls
        brushId="oil--impasto-ribbon"
        programSet={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("유화 · 임파스토(소모 없음)와 같은 조합")).toBeTruthy();
    expect(screen.getByText("원하는 질감으로 고르기")).toBeTruthy();
    openOilFineTuning();
    expect(screen.getByRole("button", { name: /붓털 물리/u }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByRole("button", { name: /임파스토 릴리프/u }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByRole("button", { name: /물감 소모/u }).getAttribute("aria-pressed"))
      .toBe("false");
  });

  it("exposes all eight connected oil outcomes exactly once", () => {
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
    expect(screen.getByText("8가지")).toBeTruthy();
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
    openOilFineTuning();
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
    openOilFineTuning();
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
    expect(screen.queryByText(/같은 기본 프리셋은 없습니다/u)).toBeNull();
    openOilFineTuning();
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
    openOilFineTuning();
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
    expect(screen.getByText(/같은 기본 프리셋은 없습니다/u)).toBeTruthy();
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

  it("emits null when a detailed toggle or outcome recipe returns to the id baseline", () => {
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
    openOilFineTuning();
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

  it("shows baseline restore only for changed oil combinations", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StudioBrushEngineProgramControls
        brushId="oil--filbert-ribbon"
        programSet={null}
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("button", { name: "기본값" })).toBeNull();

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
    fireEvent.click(screen.getByRole("button", { name: "기본값" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
