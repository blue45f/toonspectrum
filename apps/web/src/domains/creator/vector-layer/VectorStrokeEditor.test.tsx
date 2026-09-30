// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createVectorLayer } from "./vector-layer-model";
import { pointsToVectorStroke } from "./vector-stroke-path";
import { VectorStrokeEditor } from "./VectorStrokeEditor";

afterEach(() => {
  cleanup();
});

function testLayer() {
  const first = pointsToVectorStroke(
    [
      { x: 0, y: 0, pressure: 1 },
      { x: 50, y: 0, pressure: 1 },
    ],
    { baseWidth: 6, color: "#ff0000", id: "s1" }
  )!;
  const second = pointsToVectorStroke(
    [
      { x: 0, y: 20, pressure: 1 },
      { x: 50, y: 20, pressure: 1 },
    ],
    { baseWidth: 4, color: "#0000ff", id: "s2" }
  )!;
  return createVectorLayer({
    id: "l1",
    name: "테스트 레이어",
    strokes: [first, second],
  });
}

function renderEditor(selectedStrokeId: string | null = null) {
  const handlers = {
    onSelectStroke: vi.fn(),
    onScaleStrokeWidths: vi.fn(),
    onReplaceBrushShape: vi.fn(),
  };
  const view = render(
    <VectorStrokeEditor
      layer={testLayer()}
      selectedStrokeId={selectedStrokeId}
      onSelectStroke={handlers.onSelectStroke}
      onScaleStrokeWidths={handlers.onScaleStrokeWidths}
      onReplaceBrushShape={handlers.onReplaceBrushShape}
    />
  );
  return { ...view, handlers };
}

describe("VectorStrokeEditor", () => {
  it("스트로크 목록과 레이어 정보를 렌더링한다", () => {
    renderEditor();
    expect(screen.getByText(/테스트 레이어/)).toBeTruthy();
    expect(screen.getByText(/2획/)).toBeTruthy();
    expect(screen.getByRole("list", { name: "스트로크 목록" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /획 \d/ })).toHaveLength(2);
  });

  it("스트로크 선택/해제를 부모에 알린다", () => {
    const { handlers } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /획 1/ }));
    expect(handlers.onSelectStroke).toHaveBeenCalledWith("s1");
  });

  it("선택된 스트로크를 다시 누르면 선택 해제된다", () => {
    const { handlers } = renderEditor("s1");
    fireEvent.click(screen.getByRole("button", { name: /획 1/ }));
    expect(handlers.onSelectStroke).toHaveBeenCalledWith(null);
  });

  it("선택이 없으면 안내 문구를 보여준다", () => {
    renderEditor();
    expect(
      screen.getByText("편집할 획을 목록에서 선택하세요.")
    ).toBeTruthy();
  });

  it("폭 슬라이더 변경이 배율 콜백을 호출한다", () => {
    const { handlers } = renderEditor("s1");
    const slider = screen.getByLabelText("선택 획 굵기 배율");
    fireEvent.change(slider, { target: { value: "2" } });
    expect(handlers.onScaleStrokeWidths).toHaveBeenCalledWith("s1", 2);
  });

  it("슬라이더 범위가 0.1~5 이다", () => {
    renderEditor("s1");
    const slider = screen.getByLabelText(
      "선택 획 굵기 배율"
    ) as HTMLInputElement;
    expect(slider.getAttribute("min")).toBe("0.1");
    expect(slider.getAttribute("max")).toBe("5");
  });

  it("브러시 모양 버튼이 교체 콜백을 호출한다", () => {
    const { handlers } = renderEditor("s2");
    fireEvent.click(screen.getByRole("button", { name: "납작 붓" }));
    expect(handlers.onReplaceBrushShape).toHaveBeenCalledWith("s2", "flat");
    fireEvent.click(screen.getByRole("button", { name: "캘리그래피" }));
    expect(handlers.onReplaceBrushShape).toHaveBeenCalledWith(
      "s2",
      "calligraphy"
    );
  });

  it("SVG 미리보기를 렌더링한다", () => {
    const { container } = renderEditor("s1");
    expect(screen.getAllByRole("img").length).toBeGreaterThanOrEqual(1);
    expect(container.innerHTML).toContain("<svg");
  });

  it("스트로크가 없으면 빈 상태를 보여준다", () => {
    const handlers = {
      onSelectStroke: vi.fn(),
      onScaleStrokeWidths: vi.fn(),
      onReplaceBrushShape: vi.fn(),
    };
    render(
      <VectorStrokeEditor
        layer={createVectorLayer({ id: "empty" })}
        selectedStrokeId={null}
        onSelectStroke={handlers.onSelectStroke}
        onScaleStrokeWidths={handlers.onScaleStrokeWidths}
        onReplaceBrushShape={handlers.onReplaceBrushShape}
      />
    );
    expect(
      screen.getByText("스트로크가 없습니다. 먼저 벡터 레이어에 선을 그리세요.")
    ).toBeTruthy();
  });
});
