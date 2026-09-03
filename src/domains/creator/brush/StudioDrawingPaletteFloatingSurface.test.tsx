// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetStudioFloatingSurfaceStackForTest } from "../studio-floating-surface-stack";
import {
  DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
  type StudioDrawingPaletteLayout,
} from "./studio-drawing-palettes";
import {
  studioDrawingPaletteFloatingLayoutKey,
} from "./studio-drawing-palette-floating-layout";
import { StudioDrawingPaletteStack } from "./StudioDrawingPaletteStack";

function Harness() {
  const [layout, setLayout] = useState<StudioDrawingPaletteLayout>(
    DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
  );
  return (
    <StudioDrawingPaletteStack
      layout={layout}
      defaultPresentation="icon-popup"
      subTools={<button type="button">G펜 선택</button>}
      toolProperties={<button type="button">필압 설정</button>}
      onLayoutChange={setLayout}
    />
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  Object.defineProperty(globalThis, "innerWidth", {
    configurable: true,
    value: 1_024,
  });
  Object.defineProperty(globalThis, "innerHeight", {
    configurable: true,
    value: 768,
  });
});

afterEach(() => {
  cleanup();
  resetStudioFloatingSurfaceStackForTest();
});

describe("Studio drawing palette floating windows", () => {
  it("moves, persists, closes, and restores a detached palette in the same tab", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", {
      name: "서브 도구 팝업 열기",
    });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "서브 도구 팝업" });
    expect(dialog.dataset.studioFloatingSurface).toBe("true");
    expect(dialog.dataset.studioDrawingPaletteOverlay).toBe("palette");
    expect(dialog.dataset.dock).toBe("left");

    fireEvent.keyDown(screen.getByRole("button", {
      name: "서브 도구 팝업 이동",
    }), {
      key: "ArrowRight",
      altKey: true,
      shiftKey: true,
    });

    const key = studioDrawingPaletteFloatingLayoutKey("sub-tools");
    const encoded = window.sessionStorage.getItem(key);
    expect(encoded).not.toBeNull();
    const parsed = JSON.parse(encoded!) as {
      readonly dock: string;
      readonly xRatio: number;
    };
    expect(parsed.dock).toBe("free");
    expect(parsed.xRatio).toBeGreaterThan(0);
    const movedLeft = dialog.style.left;

    fireEvent.click(screen.getByRole("button", {
      name: "서브 도구 팝업 닫기",
    }));
    expect(screen.queryByRole("dialog", { name: "서브 도구 팝업" }))
      .toBeNull();
    fireEvent.click(screen.getByRole("button", {
      name: "서브 도구 팝업 열기",
    }));
    expect(screen.getByRole("dialog", { name: "서브 도구 팝업" }).style.left)
      .toBe(movedLeft);
  });

  it("resizes a detached palette from an explicit edge and commits once", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", {
      name: "서브 도구 팝업 열기",
    }));
    const east = screen.getByRole("button", {
      name: "서브 도구 팝업 오른쪽 크기 조절",
    });

    fireEvent.pointerDown(east, {
      pointerId: 91,
      pointerType: "mouse",
      button: 0,
      clientX: 332,
      clientY: 300,
    });
    fireEvent.pointerMove(window, {
      pointerId: 91,
      pointerType: "mouse",
      buttons: 1,
      clientX: 372,
      clientY: 300,
    });
    fireEvent.pointerUp(window, {
      pointerId: 91,
      pointerType: "mouse",
      button: 0,
      clientX: 372,
      clientY: 300,
    });

    const dialog = screen.getByRole("dialog", { name: "서브 도구 팝업" });
    expect(dialog.style.width).toBe("360px");
    const encoded = window.sessionStorage.getItem(
      studioDrawingPaletteFloatingLayoutKey("sub-tools"),
    );
    expect(JSON.parse(encoded!)).toMatchObject({ width: 360, dock: "left" });
  });

  it("lets an active window drag consume Escape before the popup dismissal boundary", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", {
      name: "서브 도구 팝업 열기",
    }));
    const move = screen.getByRole("button", {
      name: "서브 도구 팝업 이동",
    });

    fireEvent.pointerDown(move, {
      pointerId: 92,
      pointerType: "mouse",
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 92,
      pointerType: "mouse",
      buttons: 1,
      clientX: 140,
      clientY: 130,
    });
    expect(screen.getByRole("dialog", {
      name: "서브 도구 팝업",
    }).dataset.dragging).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });

    const dialog = screen.getByRole("dialog", { name: "서브 도구 팝업" });
    expect(dialog).toBeTruthy();
    expect(dialog.dataset.dragging).toBe("false");
    expect(window.sessionStorage.getItem(
      studioDrawingPaletteFloatingLayoutKey("sub-tools"),
    )).toBeNull();
  });
});
