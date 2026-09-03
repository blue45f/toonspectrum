// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type StudioFloatingSurfaceLayout,
} from "./studio-floating-surface";
import { StudioFloatingSurface } from "./StudioFloatingSurface";

const DEFAULT_LAYOUT: StudioFloatingSurfaceLayout = Object.freeze({
  version: 1,
  xRatio: 1,
  yRatio: 0,
  width: 300,
  height: 400,
});

function Harness({
  onLayoutChange = () => undefined,
  onClose = () => undefined,
}: {
  onLayoutChange?: (layout: StudioFloatingSurfaceLayout) => void;
  onClose?: () => void;
}) {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  return (
    <StudioFloatingSurface
      label="테스트 팔레트"
      layout={layout}
      defaultLayout={DEFAULT_LAYOUT}
      minWidth={240}
      minHeight={200}
      maxWidth={600}
      maxHeight={700}
      insetTop={60}
      insetRight={10}
      insetBottom={10}
      insetLeft={10}
      onLayoutChange={(next) => {
        setLayout(next);
        onLayoutChange(next);
      }}
      onClose={onClose}
    >
      <button type="button">내용 버튼</button>
    </StudioFloatingSurface>
  );
}

beforeEach(() => {
  Object.defineProperty(globalThis, "innerWidth", {
    configurable: true,
    value: 1_000,
  });
  Object.defineProperty(globalThis, "innerHeight", {
    configurable: true,
    value: 800,
  });
});

afterEach(() => {
  cleanup();
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

describe("StudioFloatingSurface", () => {
  it("renders viewport-safe desktop window chrome", () => {
    render(<Harness />);
    const surface = screen.getByRole("dialog", { name: "테스트 팔레트" });

    expect(surface.style.left).toBe("690px");
    expect(surface.style.top).toBe("60px");
    expect(surface.style.width).toBe("300px");
    expect(surface.style.height).toBe("400px");
    expect(screen.getByRole("button", { name: "테스트 팔레트 이동" }))
      .toBeTruthy();
    expect(screen.getByRole("button", { name: "테스트 팔레트 크기 조절" }))
      .toBeTruthy();
  });

  it("uses an 8px activation threshold and commits a snapped pointer move once", () => {
    const onLayoutChange = vi.fn();
    render(<Harness onLayoutChange={onLayoutChange} />);
    const handle = screen.getByRole("button", { name: "테스트 팔레트 이동" });

    fireEvent.pointerDown(handle, {
      pointerId: 11,
      pointerType: "mouse",
      button: 0,
      clientX: 800,
      clientY: 80,
    });
    fireEvent.pointerMove(window, {
      pointerId: 11,
      pointerType: "mouse",
      buttons: 1,
      clientX: 795,
      clientY: 83,
    });
    fireEvent.pointerUp(window, {
      pointerId: 11,
      pointerType: "mouse",
      button: 0,
      clientX: 795,
      clientY: 83,
    });
    expect(onLayoutChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, {
      pointerId: 12,
      pointerType: "mouse",
      button: 0,
      clientX: 800,
      clientY: 80,
    });
    fireEvent.pointerMove(window, {
      pointerId: 12,
      pointerType: "mouse",
      buttons: 1,
      clientX: 760,
      clientY: 110,
    });
    fireEvent.pointerUp(window, {
      pointerId: 12,
      pointerType: "mouse",
      button: 0,
      clientX: 760,
      clientY: 110,
    });

    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(onLayoutChange.mock.calls[0]?.[0]).toMatchObject({
      version: 1,
      width: 300,
      height: 400,
    });
    expect(onLayoutChange.mock.calls[0]?.[0].xRatio).toBeLessThan(1);
    expect(onLayoutChange.mock.calls[0]?.[0].yRatio).toBeGreaterThan(0);
  });

  it("cancels an active move with Escape and restores body interaction state", () => {
    const onLayoutChange = vi.fn();
    document.body.style.cursor = "crosshair";
    document.body.style.userSelect = "text";
    render(<Harness onLayoutChange={onLayoutChange} />);
    const handle = screen.getByRole("button", { name: "테스트 팔레트 이동" });

    fireEvent.pointerDown(handle, {
      pointerId: 21,
      pointerType: "mouse",
      button: 0,
      clientX: 800,
      clientY: 80,
    });
    fireEvent.pointerMove(window, {
      pointerId: 21,
      pointerType: "mouse",
      buttons: 1,
      clientX: 760,
      clientY: 110,
    });
    expect(document.body.style.cursor).toBe("grabbing");
    expect(document.body.style.userSelect).toBe("none");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(document.body.style.cursor).toBe("crosshair");
    expect(document.body.style.userSelect).toBe("text");
    expect(screen.getByRole("dialog", { name: "테스트 팔레트" }).style.transform)
      .toBe("translate3d(0, 0, 0)");
  });

  it("resizes with pointer input and supports keyboard movement/reset", () => {
    const onLayoutChange = vi.fn();
    render(<Harness onLayoutChange={onLayoutChange} />);
    const resize = screen.getByRole("button", {
      name: "테스트 팔레트 크기 조절",
    });

    fireEvent.pointerDown(resize, {
      pointerId: 31,
      pointerType: "mouse",
      button: 0,
      clientX: 990,
      clientY: 460,
    });
    fireEvent.pointerMove(window, {
      pointerId: 31,
      pointerType: "mouse",
      buttons: 1,
      clientX: 950,
      clientY: 500,
    });
    fireEvent.pointerUp(window, {
      pointerId: 31,
      pointerType: "mouse",
      button: 0,
      clientX: 950,
      clientY: 500,
    });

    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(onLayoutChange.mock.calls[0]?.[0]).toMatchObject({
      width: 260,
      height: 440,
    });

    const move = screen.getByRole("button", { name: "테스트 팔레트 이동" });
    fireEvent.keyDown(move, { key: "ArrowLeft", altKey: true });
    expect(onLayoutChange).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(move, { key: "Home", altKey: true });
    expect(onLayoutChange).toHaveBeenCalledTimes(3);
    expect(onLayoutChange.mock.calls.at(-1)?.[0]).toEqual(DEFAULT_LAYOUT);
  });

  it("exposes explicit reset and close actions", () => {
    const onLayoutChange = vi.fn();
    const onClose = vi.fn();
    render(<Harness onLayoutChange={onLayoutChange} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", {
      name: "테스트 팔레트 위치와 크기 초기화",
    }));
    expect(onLayoutChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "테스트 팔레트 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
