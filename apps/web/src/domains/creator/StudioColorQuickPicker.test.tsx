// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioColorQuickPicker } from "./StudioColorQuickPicker";

afterEach(cleanup);

describe("StudioColorQuickPicker", () => {
  it("previews and commits one keyboard color adjustment", () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    render(
      <StudioColorQuickPicker
        value="#ff0000"
        onPreview={onPreview}
        onCommit={onCommit}
      />,
    );

    fireEvent.keyDown(screen.getByRole("slider", { name: "채도와 명도" }), {
      key: "ArrowLeft",
    });

    expect(onPreview).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(onPreview.mock.calls[0]?.[0]);
  });

  it("exposes the hue control and numeric HSV readout", () => {
    render(
      <StudioColorQuickPicker value="#00ff00" onPreview={vi.fn()} />,
    );

    expect(
      (screen.getByRole("slider", { name: "빠른 색조" }) as HTMLInputElement).value,
    ).toBe("120");
    expect(screen.getByText(/H 120°/)).toBeTruthy();
  });

  it("preserves the authored hue when saturation or brightness reaches zero", () => {
    const view = render(
      <StudioColorQuickPicker value="#0000ff" onPreview={vi.fn()} />,
    );
    const hue = screen.getByRole("slider", { name: "빠른 색조" }) as HTMLInputElement;
    expect(hue.value).toBe("240");

    view.rerender(
      <StudioColorQuickPicker value="#000000" onPreview={vi.fn()} />,
    );
    expect(hue.value).toBe("240");
  });

});
