// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceDecorationEditor } from "./StudioVirtualSpaceDecorationEditor";
import { studioVirtualDecorationPreset } from "./studio-virtual-space-customization";
import { studioVirtualDecorationStateForWorld } from "./studio-virtual-space-decoration-layout";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";

afterEach(cleanup);

describe("가구 배치 지도 선택 영역", () => {
  it("8번 데스크의 선택 영역을 사각형으로 한정하고 클릭·키보드가 같은 가구를 선택한다", () => {
    const world = studioVirtualPlaceWorldManifest("creator-cafe");
    const preset = studioVirtualDecorationStateForWorld(studioVirtualDecorationPreset("creator-garden"), world);
    const decorations = { ...preset, placements: [...preset.placements,
      { id: "added-desk", type: "drawing-desk" as const, x: 549, y: 570, rotation: 0 as const, scale: 1 },
    ] };
    const onChange = vi.fn();
    const props = { world, decorations, selfPoint: { x: 480, y: 540 }, onChange };
    const view = render(<StudioVirtualSpaceDecorationEditor {...props} artStyle="webtoon" />);
    const desk = screen.getByRole("button", { name: "8번 드로잉 데스크 선택" });
    const tree = screen.getByRole("button", { name: "2번 나무 선택" });
    expect(desk.tagName.toLowerCase()).toBe("rect");
    expect(Number(desk.getAttribute("width"))).toBeCloseTo(82, 10);
    expect(Number(desk.getAttribute("height"))).toBeCloseTo(82, 10);
    expect(desk.querySelector("svg, image")).toBeNull();
    expect(desk.getAttribute("pointer-events")).toBe("all");
    expect(desk.parentElement?.getAttribute("pointer-events")).toBe("none");
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "편집할 가구" });
    fireEvent.click(tree);
    expect(select.value).toBe("garden-tree-east");
    fireEvent.click(desk);
    expect(select.value).toBe("added-desk");
    expect(desk.getAttribute("aria-pressed")).toBe("true");
    expect(tree.getAttribute("aria-pressed")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(tree, { key: "Enter" });
    expect(select.value).toBe("garden-tree-east");
    fireEvent.keyDown(desk, { key: " " });
    expect(select.value).toBe("added-desk");
    view.rerender(<StudioVirtualSpaceDecorationEditor {...props} artStyle="pastel" />);
    expect(screen.getByRole("button", { name: "8번 드로잉 데스크 선택" }).tagName.toLowerCase()).toBe("rect");
    expect(select.value).toBe("added-desk");
  });
});

describe("가구 드래그 편집", () => {
  const world = studioVirtualPlaceWorldManifest("creator-cafe");
  const preset = studioVirtualDecorationStateForWorld(studioVirtualDecorationPreset("creator-garden"), world);
  const decorations = { ...preset, placements: [...preset.placements,
    { id: "added-desk", type: "drawing-desk" as const, x: 549, y: 570, rotation: 0 as const, scale: 1 },
  ] };
  const selfPoint = { x: 480, y: 540 };
  // jsdom은 getBoundingClientRect가 0이므로 지도의 표시 영역을 고정한다.
  const rect = { left: 0, top: 0, width: 960, height: 640 };

  beforeEach(() => {
    vi.spyOn(SVGSVGElement.prototype, "getBoundingClientRect").mockReturnValue(
      { ...rect, right: rect.width, bottom: rect.height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect,
    );
    for (const [name, value] of [["setPointerCapture", () => undefined], ["releasePointerCapture", () => undefined], ["hasPointerCapture", () => true]] as const) {
      Object.defineProperty(SVGElement.prototype, name, { configurable: true, value, writable: true });
    }
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const deskCenter = (view: { container: HTMLElement }) => {
    const desk = screen.getByRole("button", { name: "8번 드로잉 데스크 선택" });
    view.container.querySelector("svg")!.dispatchEvent(new Event("x"));
    return desk;
  };
  const pointer = (type: string, clientX: number, clientY: number, pointerId = 3) => ({
    pointerId, clientX, clientY, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true, button: 0,
  });

  it("한 번의 드래그가 검증을 한 번만 통과시키고 한 번의 되돌리기 단계로 반영된다", () => {
    const onChange = vi.fn();
    const view = render(<StudioVirtualSpaceDecorationEditor world={world} decorations={decorations} selfPoint={selfPoint} onChange={onChange} artStyle="webtoon" />);
    const desk = deskCenter(view);
    const origin = { x: 549, y: 570 };

    fireEvent.pointerDown(desk, pointer("pointerdown", 287, 356));
    expect(onChange).not.toHaveBeenCalled();
    // 드래그 중에는 화면만 미리 보고 커밋하지 않는다.
    for (const step of [1, 2, 3, 4]) {
      fireEvent.pointerMove(desk, pointer("pointermove", 287 + step * 32, 356));
      expect(onChange, `pointerMove ${step}`).not.toHaveBeenCalled();
    }
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "편집할 가구" }).value).toBe("added-desk");

    fireEvent.pointerUp(desk, pointer("pointerup", 287 + 4 * 32, 356));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ ok: true }));
    const committed = onChange.mock.calls[0]![0].state as { revision: number; placements: { id: string; x: number; y: number }[] };
    const moved = committed.placements.find((item) => item.id === "added-desk")!;
    expect(moved.x).not.toBe(origin.x);
    expect(moved.x % 16).toBe(0);
    expect(committed.revision).toBe(preset.revision + 1);
  });

  it("움직이지 않은 누른 것은 선택만 하고 배치를 바꾸지 않는다", () => {
    const onChange = vi.fn();
    const view = render(<StudioVirtualSpaceDecorationEditor world={world} decorations={decorations} selfPoint={selfPoint} onChange={onChange} artStyle="webtoon" />);
    const desk = deskCenter(view);
    fireEvent.pointerDown(desk, pointer("pointerdown", 287, 356));
    fireEvent.pointerUp(desk, pointer("pointerup", 287, 356));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "편집할 가구" }).value).toBe("added-desk");
  });

  it("잘못된 위치는 커밋하지 않고 기존 배치를 유지한다", () => {
    const onChange = vi.fn();
    const view = render(<StudioVirtualSpaceDecorationEditor world={world} decorations={decorations} selfPoint={selfPoint} onChange={onChange} artStyle="webtoon" />);
    const desk = deskCenter(view);
    fireEvent.pointerDown(desk, pointer("pointerdown", 287, 356));
    fireEvent.pointerMove(desk, pointer("pointermove", 287, 356 - 320));
    fireEvent.pointerUp(desk, pointer("pointerup", 287, 356 - 320));
    expect(onChange.mock.calls.every(([result]) => result.ok === false)).toBe(true);
  });
});
