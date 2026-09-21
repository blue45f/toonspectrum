// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioColorSwatches } from "./StudioColorSwatches";

afterEach(cleanup);
const colors = ["#112233", "#445566", "#778899", "#aabbcc", "#ddeeff"];
const props = { title: "문서 사용 색", colors, value: colors[0]!, onChoose: vi.fn() };

it("has one Tab entry and separates navigation from color application", () => {
  const choose = vi.fn();
  render(<StudioColorSwatches {...props} onChoose={choose} />);
  const buttons = screen.getAllByRole("button");
  expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
  fireEvent.keyDown(buttons[0]!, { key: "ArrowRight" });
  expect(document.activeElement).toBe(buttons[1]);
  expect(choose).not.toHaveBeenCalled();
  fireEvent.keyDown(buttons[1]!, { key: "End" });
  expect(document.activeElement).toBe(buttons[4]);
  fireEvent.keyDown(buttons[4]!, { key: "ArrowRight" });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.click(buttons[0]!);
  expect(choose).toHaveBeenCalledExactlyOnceWith(colors[0]);
});

it("uses rendered row geometry for vertical navigation and handles incomplete rows", () => {
  render(<StudioColorSwatches {...props} />);
  const buttons = screen.getAllByRole("button");
  buttons.forEach((button, index) => vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ top: Math.floor(index / 3) * 44 } as DOMRect));
  fireEvent.keyDown(buttons[2]!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(buttons[4]);
  fireEvent.keyDown(buttons[4]!, { key: "ArrowUp" });
  expect(document.activeElement).toBe(buttons[1]);
});

it("retains a color's focus entry when recents reorder and recovers when it disappears", () => {
  const view = render(<StudioColorSwatches {...props} />);
  fireEvent.keyDown(screen.getAllByRole("button")[0]!, { key: "ArrowRight" });
  view.rerender(<StudioColorSwatches {...props} colors={[...colors].reverse()} />);
  expect(screen.getByRole("button", { name: "문서 사용 색 #445566 적용" }).tabIndex).toBe(0);
  view.rerender(<StudioColorSwatches {...props} colors={[colors[0]!]} />);
  expect(screen.getAllByRole("button")[0]!.tabIndex).toBe(0);
});

it("leaves composition and modified arrows untouched", () => {
  render(<StudioColorSwatches {...props} />);
  const first = screen.getAllByRole("button")[0]!;
  expect(fireEvent.keyDown(first, { key: "ArrowRight", isComposing: true })).toBe(true);
  expect(fireEvent.keyDown(first, { key: "ArrowRight", altKey: true })).toBe(true);
  expect(first.tabIndex).toBe(0);
});
