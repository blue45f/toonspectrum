// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPanelResizeHandle } from "./StudioPanelResizeHandle";

afterEach(cleanup);

describe("StudioPanelResizeHandle", () => {
  it("passes accessible separator state and every resize input through", () => {
    const onPointerDown = vi.fn();
    const onKeyDown = vi.fn();
    const onDoubleClick = vi.fn();
    render(
      <StudioPanelResizeHandle
        dragging
        label="페이지 패널 너비 조절"
        handleProps={{
          role: "separator",
          "aria-orientation": "vertical",
          "aria-valuenow": 192,
          "aria-valuemin": 128,
          "aria-valuemax": 360,
          tabIndex: 0,
          onPointerDown,
          onKeyDown,
          onDoubleClick,
        }}
      />,
    );

    const handle = screen.getByRole("separator", { name: "페이지 패널 너비 조절" });
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe("192");
    expect(handle.getAttribute("aria-valuemin")).toBe("128");
    expect(handle.getAttribute("aria-valuemax")).toBe("360");
    expect(handle.getAttribute("tabindex")).toBe("0");
    expect(handle.classList.contains("bg-accent/25")).toBe(true);

    fireEvent.pointerDown(handle, { pointerId: 7 });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.doubleClick(handle);
    expect(onPointerDown).toHaveBeenCalledOnce();
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onDoubleClick).toHaveBeenCalledOnce();
  });
});
