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

    // Open typography-advanced collapsible section
    const accordionBtn = screen.getByText("고급 조판");
    fireEvent.click(accordionBtn);

    const titleEl = await screen.findByText("원형 텍스트 (Circular Text)", {}, { timeout: 5000 });
    expect(titleEl).toBeDefined();

    const toggleBtn = await screen.findByText("원형 배치 Off", {}, { timeout: 5000 });
    expect(toggleBtn).toBeDefined();

    fireEvent.click(toggleBtn);
    expect(patchEl).toHaveBeenCalledWith("txt-1", {
      textPath: { shape: "circleUp", curve: 50 },
    });
  });
});
