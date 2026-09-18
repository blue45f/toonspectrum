// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioShadingAssistPanel } from "./StudioShadingAssistPanel";

describe("StudioShadingAssistPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders with header, compass presets, and action button", () => {
    render(<StudioShadingAssistPanel />);

    expect(
      screen.getByText("자동 명암"),
    ).toBeDefined();
    expect(screen.queryByText(/CSP/i)).toBeNull();
    expect(screen.getByText("좌상단")).toBeDefined();
    expect(screen.getByText("새벽 햇살")).toBeDefined();
  });

  it("triggers onGenerateShadingLayer with computed shading parameters", () => {
    const onGenerateShadingLayer = vi.fn();
    render(
      <StudioShadingAssistPanel
        onGenerateShadingLayer={onGenerateShadingLayer}
      />,
    );

    // Click '우상단' preset
    fireEvent.click(screen.getByText("우상단"));

    // Click generate button
    fireEvent.click(screen.getByText("명암 레이어 만들기"));

    expect(onGenerateShadingLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        lightVector: expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
        }),
        shadowOffsetPx: expect.objectContaining({
          dx: expect.any(Number),
          dy: expect.any(Number),
        }),
        shadow1ColorHex: expect.any(String),
        shadow2ColorHex: expect.any(String),
      }),
    );
  });
});
