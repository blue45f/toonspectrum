// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioInspectorTypographySection } from "./StudioInspectorTypographySection";

import type { TextEl } from "./studio-element-model";

describe("StudioInspectorTypographySection", () => {
  afterEach(() => {
    cleanup();
  });

  const dummyTextEl: TextEl = {
    id: "txt-1",
    type: "text",
    text: "콰아아아",
    x: 50,
    y: 50,
    width: 120,
    fontSize: 28,
    fill: "#000000",
    rotation: 0,
  };

  it("renders circular text panel and toggles circle textPath", async () => {
    const patchEl = vi.fn();

    render(
      <StudioInspectorTypographySection
        selected={dummyTextEl}
        patchEl={patchEl}
      />,
    );

    // 원형 텍스트는 고급 조판 섹션이 소유한다(UX 감사 2026-09-02: 타이포그래피를 글꼴 / 외형 /
    // 고급 조판 세 섹션으로 나눴다). 기본 접힘이므로 그 섹션을 열어야 패널이 마운트된다.
    const accordionBtn = screen.getByText("고급 조판");
    fireEvent.click(accordionBtn);

    const titleEl = await screen.findByText("원형 글자 배치", {}, { timeout: 5000 });
    expect(titleEl).toBeDefined();

    const toggleBtn = await screen.findByText("사용 안 함", {}, { timeout: 5000 });
    expect(toggleBtn).toBeDefined();

    fireEvent.click(toggleBtn);
    expect(patchEl).toHaveBeenCalledWith("txt-1", {
      textPath: { shape: "circleUp", curve: 50 },
    });
  });

  it("restores the last authored outline and shadow settings when re-enabled", () => {
    const patchEl = vi.fn();
    const styled: TextEl = {
      ...dummyTextEl,
      stroke: "#123456",
      strokeWidth: 7,
      shadowColor: "#654321",
      shadowBlur: 9,
      shadowOffsetX: -4,
      shadowOffsetY: 6,
      shadowOpacity: 0.35,
    };
    const view = render(
      <StudioInspectorTypographySection selected={styled} patchEl={patchEl} />,
    );

    if (!screen.queryByLabelText("글자 외곽선 사용")) {
      fireEvent.click(screen.getByText("외형"));
    }

    fireEvent.click(screen.getByLabelText("글자 외곽선 사용"));
    expect(patchEl).toHaveBeenLastCalledWith("txt-1", {
      stroke: undefined,
      strokeWidth: 0,
    });

    view.rerender(
      <StudioInspectorTypographySection
        selected={{ ...styled, stroke: undefined, strokeWidth: 0 }}
        patchEl={patchEl}
      />,
    );
    fireEvent.click(screen.getByLabelText("글자 외곽선 사용"));
    expect(patchEl).toHaveBeenLastCalledWith("txt-1", {
      stroke: "#123456",
      strokeWidth: 7,
    });

    fireEvent.click(screen.getByLabelText("글자 그림자 사용"));
    expect(patchEl).toHaveBeenLastCalledWith("txt-1", {
      shadowColor: undefined,
      shadowBlur: undefined,
      shadowOffsetX: undefined,
      shadowOffsetY: undefined,
      shadowOpacity: undefined,
    });

    view.rerender(
      <StudioInspectorTypographySection
        selected={{
          ...styled,
          shadowColor: undefined,
          shadowBlur: undefined,
          shadowOffsetX: undefined,
          shadowOffsetY: undefined,
          shadowOpacity: undefined,
        }}
        patchEl={patchEl}
      />,
    );
    fireEvent.click(screen.getByLabelText("글자 그림자 사용"));
    expect(patchEl).toHaveBeenLastCalledWith("txt-1", {
      shadowColor: "#654321",
      shadowBlur: 9,
      shadowOffsetX: -4,
      shadowOffsetY: 6,
      shadowOpacity: 0.35,
    });
  });

});
