// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
