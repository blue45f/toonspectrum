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


function pointer(target: HTMLElement, type: string, pointerId = 1, x = 60, y = 60, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  fireEvent(target, event);
}

function renderPointerPicker() {
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  render(<StudioColorQuickPicker value="#ff0000" onPreview={onPreview} onCommit={onCommit} />);
  const sv = screen.getByRole("slider", { name: "채도와 명도" });
  vi.spyOn(sv, "getBoundingClientRect").mockReturnValue({ left: 10, top: 10, width: 100, height: 100 } as DOMRect);
  return { sv, onPreview, onCommit };
}

it.each(["pointercancel", "lostpointercapture"])("rolls back %s without choosing cancellation coordinates or committing", (type) => {
  const { sv, onPreview, onCommit } = renderPointerPicker();
  pointer(sv, "pointerdown");
  pointer(sv, "pointermove", 1, 80, 90);
  expect(onPreview).toHaveBeenCalled();
  pointer(sv, type, 1, 0, 0);
  expect(onPreview).toHaveBeenLastCalledWith("#ff0000");
  expect(onCommit).not.toHaveBeenCalled();
  pointer(sv, "pointerup");
  expect(onCommit).not.toHaveBeenCalled();
});

it("ignores right-clicks and foreign pointers, and commits exactly once on release", () => {
  const { sv, onPreview, onCommit } = renderPointerPicker();
  pointer(sv, "pointerdown", 1, 60, 60, 2);
  expect(onPreview).not.toHaveBeenCalled();
  pointer(sv, "pointerdown");
  const previewCount = onPreview.mock.calls.length;
  pointer(sv, "pointermove", 2, 90, 90);
  pointer(sv, "pointerup", 2, 90, 90);
  expect(onPreview).toHaveBeenCalledTimes(previewCount);
  expect(onCommit).not.toHaveBeenCalled();
  pointer(sv, "pointerup");
  pointer(sv, "lostpointercapture");
  expect(onCommit).toHaveBeenCalledOnce();
});

it("commits a hue keyboard adjustment once rather than again on blur", () => {
  const { onCommit } = renderPointerPicker();
  const hue = screen.getByRole("slider", { name: "빠른 색조" });
  fireEvent.change(hue, { target: { value: "120" } });
  fireEvent.keyUp(hue, { key: "ArrowRight" });
  fireEvent.blur(hue);
  expect(onCommit).toHaveBeenCalledExactlyOnceWith("#00ff00");
});

it("rolls a cancelled hue drag back without committing on blur", () => {
  const { onPreview, onCommit } = renderPointerPicker();
  const hue = screen.getByRole("slider", { name: "빠른 색조" });
  pointer(hue, "pointerdown");
  fireEvent.change(hue, { target: { value: "240" } });
  pointer(hue, "pointercancel");
  fireEvent.blur(hue);
  expect(onPreview).toHaveBeenLastCalledWith("#ff0000");
  expect(onCommit).not.toHaveBeenCalled();
});
