// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultSubToolParams } from "./subtool-params";
import { createSubTool, type SubTool } from "./subtool-store";
import { SubToolDetailPanel } from "./SubToolDetailPanel";

afterEach(cleanup);

function sampleSubTool(): SubTool {
  return createSubTool("테스트 서브툴", "core-ink-pen");
}

function renderPanel(subTool: SubTool = sampleSubTool()) {
  const onSubToolChange = vi.fn();
  const utils = render(
    <SubToolDetailPanel subTool={subTool} onSubToolChange={onSubToolChange} />,
  );
  return { ...utils, onSubToolChange };
}

describe("SubToolDetailPanel 렌더", () => {
  it("6개 파라미터 그룹 섹션을 모두 표시한다", () => {
    renderPanel();
    expect(screen.getByTestId("subtool-section-tip")).toBeTruthy();
    expect(screen.getByTestId("subtool-section-spacing")).toBeTruthy();
    expect(screen.getByTestId("subtool-section-texture")).toBeTruthy();
    expect(screen.getByTestId("subtool-section-dual-brush")).toBeTruthy();
    expect(screen.getByTestId("subtool-section-color-jitter")).toBeTruthy();
    expect(screen.getByTestId("subtool-section-blending")).toBeTruthy();

    for (const title of [
      "팁 모양",
      "스트로크 간격",
      "질감 오버레이",
      "듀얼 브러시",
      "색상 지터",
      "혼합 모드",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it("서브툴 이름과 기준 브러시 id, 미리보기 canvas를 표시한다", () => {
    renderPanel();
    const nameInput = screen.getByTestId("subtool-name-input") as HTMLInputElement;
    expect(nameInput.value).toBe("테스트 서브툴");
    expect(screen.getByText("core-ink-pen")).toBeTruthy();
    expect(screen.getByTestId("subtool-stroke-preview")).toBeTruthy();
  });

  it("프리셋에는 프리셋 배지가 표시된다", () => {
    const preset: SubTool = { ...sampleSubTool(), isPreset: true };
    renderPanel(preset);
    expect(screen.getByText("프리셋")).toBeTruthy();
  });

  it("정적 마크업 스냅샷에 주요 라벨이 포함된다", () => {
    const html = renderToStaticMarkup(
      <SubToolDetailPanel subTool={sampleSubTool()} onSubToolChange={vi.fn()} />,
    );
    for (const label of [
      "팁 모양",
      "팁 크기",
      "팁 각도",
      "팁 둥글기",
      "스트로크 간격",
      "간격 지터",
      "질감 오버레이",
      "질감 강도",
      "질감 스케일",
      "듀얼 브러시",
      "듀얼 크기 비율",
      "색상 지터",
      "색조 지터",
      "채도 지터",
      "명도 지터",
      "불투명도 지터",
      "혼합 모드",
      "불투명도",
    ]) {
      expect(html).toContain(label);
    }
  });
});

describe("SubToolDetailPanel 상호작용", () => {
  it("팁 크기 슬라이더를 움직이면 onSubToolChange가 정규화된 값으로 호출된다", () => {
    const { onSubToolChange } = renderPanel();
    fireEvent.change(screen.getByTestId("subtool-tip-size"), {
      target: { value: "48" },
    });
    expect(onSubToolChange).toHaveBeenCalledTimes(1);
    const next = onSubToolChange.mock.calls[0]?.[0] as SubTool;
    expect(next.params.tip.size).toBe(48);
    expect(next.params.tip.shape).toBe("round");
  });

  it("팁 모양 라디오를 선택하면 모양이 바뀐다", () => {
    const { onSubToolChange } = renderPanel();
    fireEvent.click(screen.getByRole("radio", { name: "네온" }));
    expect(onSubToolChange).toHaveBeenCalledTimes(1);
    const next = onSubToolChange.mock.calls[0]?.[0] as SubTool;
    expect(next.params.tip.shape).toBe("neon");
  });

  it("듀얼 브러시 스위치를 켜면 enabled가 true가 된다", () => {
    const { onSubToolChange } = renderPanel();
    fireEvent.click(screen.getByTestId("subtool-dual-enabled"));
    expect(onSubToolChange).toHaveBeenCalledTimes(1);
    const next = onSubToolChange.mock.calls[0]?.[0] as SubTool;
    expect(next.params.dualBrush.enabled).toBe(true);
  });

  it("색조 지터 슬라이더가 0-180 범위로 동작한다", () => {
    const { onSubToolChange } = renderPanel();
    const slider = screen.getByTestId("subtool-jitter-hue") as HTMLInputElement;
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("180");
    fireEvent.change(slider, { target: { value: "90" } });
    const next = onSubToolChange.mock.calls[0]?.[0] as SubTool;
    expect(next.params.colorJitter.hue).toBe(90);
  });

  it("혼합 모드를 선택하면 blending.mode이 바뀐다", () => {
    const { onSubToolChange } = renderPanel();
    const blendingSection = screen.getByTestId("subtool-section-blending");
    const multiply = blendingSection.querySelector(
      '[role="radio"][aria-label="곱하기"]',
    );
    expect(multiply).toBeTruthy();
    fireEvent.click(multiply!);
    const next = onSubToolChange.mock.calls[0]?.[0] as SubTool;
    expect(next.params.blending.mode).toBe("multiply");
  });

  it("이름을 바꾸고 blur하면 이름 변경이 반영된다", () => {
    const tool = sampleSubTool();
    const { onSubToolChange } = renderPanel(tool);
    const nameInput = screen.getByTestId("subtool-name-input");
    fireEvent.change(nameInput, { target: { value: "새 서브툴 이름" } });
    fireEvent.blur(nameInput);
    expect(onSubToolChange).toHaveBeenCalledTimes(1);
    const next = onSubToolChange.mock.calls[0]?.[0] as SubTool;
    expect(next.name).toBe("새 서브툴 이름");
    expect(next.id).toBe(tool.id);
    expect(next.baseBrushId).toBe(tool.baseBrushId);
  });

  it("빈 이름으로 blur하면 변경이 무시된다", () => {
    const tool = sampleSubTool();
    const { onSubToolChange } = renderPanel(tool);
    const nameInput = screen.getByTestId("subtool-name-input");
    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.blur(nameInput);
    expect(onSubToolChange).not.toHaveBeenCalled();
  });

  it("텍스처 강도 슬라이더 변경이 미리보기 파라미터에 반영된다", () => {
    const tool: SubTool = {
      ...sampleSubTool(),
      params: {
        ...createDefaultSubToolParams(),
        texture: { strength: 0.5, scale: 2, mode: "overlay" },
      },
    };
    renderPanel(tool);
    const slider = screen.getByTestId("subtool-texture-strength") as HTMLInputElement;
    expect(slider.value).toBe("0.5");
    const preview = screen.getByTestId("subtool-stroke-preview");
    expect(preview.getAttribute("aria-label")).toContain("팁 24px");
  });
});
