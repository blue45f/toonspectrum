// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioInspectorOrderAlignSection } from "./StudioInspectorOrderAlignSection";

import type { El } from "./studio-element-model";

describe("StudioInspectorOrderAlignSection", () => {
  afterEach(() => {
    cleanup();
  });

  const dummyEl: El = {
    id: "el-1",
    type: "image",
    src: "data:image/png;base64,abc",
    x: 10,
    y: 20,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
  };

  it("renders alignment and distribution buttons", () => {
    const alignSelected = vi.fn();

    render(
      <StudioInspectorOrderAlignSection
        selected={dummyEl}
        selectedBg3dEditSource={null}
        patchEl={vi.fn()}
        reorder={vi.fn()}
        alignSelected={alignSelected}
        duplicateSelected={vi.fn()}
        removeSelected={vi.fn()}
        setPoserInitialDataUrl={vi.fn()}
        setPoserInitialElementId={vi.fn()}
        setPoserVrmOpen={vi.fn()}
        setBg3dInitialScene={vi.fn()}
        setBg3dInitialDataUrl={vi.fn()}
        setBg3dInitialElementId={vi.fn()}
        setBg3dOpen={vi.fn()}
      />,
    );

    // Open the collapsible inspector section
    const accordionBtn = screen.getByText("정렬·순서");
    fireEvent.click(accordionBtn);

    const leftBtn = screen.getByTitle("왼쪽 정렬");
    expect(leftBtn).toBeDefined();
    fireEvent.click(leftBtn);
    expect(alignSelected).toHaveBeenCalledWith("left");

    const distHBtn = screen.getByTitle("가로 등간격 분포 (CSP 2.0)");
    expect(distHBtn).toBeDefined();
    fireEvent.click(distHBtn);
    expect(alignSelected).toHaveBeenCalledWith("distributeH");

    const distVBtn = screen.getByTitle("세로 등간격 분포 (CSP 2.0)");
    expect(distVBtn).toBeDefined();
    fireEvent.click(distVBtn);
    expect(alignSelected).toHaveBeenCalledWith("distributeV");
  });
});
