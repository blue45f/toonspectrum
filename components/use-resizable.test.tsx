// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useResizable, type ResizableOptions } from "./use-resizable";

function Harness(props: ResizableOptions) {
  const resize = useResizable(props);
  return (
    <div>
      <button type="button" aria-label="패널 너비" {...resize.handleProps} />
      <output data-testid="width">{resize.width}</output>
      <output data-testid="dragging">{String(resize.dragging)}</output>
    </div>
  );
}

afterEach(cleanup);

describe("useResizable", () => {
  it("coalesces pointer input and cleans a cancelled drag before later moves", () => {
    render(<Harness initial={200} min={120} max={360} edge="right" />);
    const handle = screen.getByRole("separator", { name: "패널 너비" });

    fireEvent.pointerDown(handle, { pointerId: 7, clientX: 100 });
    expect(screen.getByTestId("dragging").textContent).toBe("true");
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 150 });
    fireEvent.pointerCancel(window, { pointerId: 7, clientX: 150 });
    expect(screen.getByTestId("dragging").textContent).toBe("false");
    expect(screen.getByTestId("width").textContent).toBe("250");
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 240 });
    expect(screen.getByTestId("width").textContent).toBe("250");
  });

  it("uses the panel edge for keyboard direction and exposes pixel value text", () => {
    render(<Harness initial={240} min={200} max={300} edge="left" step={20} />);
    const handle = screen.getByRole("separator", { name: "패널 너비" });

    expect(handle.getAttribute("aria-valuetext")).toBe("240픽셀");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(screen.getByTestId("width").textContent).toBe("260");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(screen.getByTestId("width").textContent).toBe("200");
    fireEvent.keyDown(handle, { key: "End" });
    expect(screen.getByTestId("width").textContent).toBe("300");
    fireEvent.doubleClick(handle);
    expect(screen.getByTestId("width").textContent).toBe("240");
  });
});
