// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceP2pBoard } from "./StudioVirtualSpaceP2pBoard";
import type { StudioP2pBoardSnapshot } from "./studio-virtual-space-p2p-board";

const editable: StudioP2pBoardSnapshot = {
  entities: [],
  readyPeerIds: ["bob"],
  available: true,
  canEdit: true,
};

beforeEach(() => {
  Object.defineProperty(SVGElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(SVGElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(SVGElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => ({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
      width: 1000, height: 600, toJSON: () => ({}),
    })),
  });
});
afterEach(() => cleanup());

function mount(snapshot: StudioP2pBoardSnapshot = editable) {
  const onStroke = vi.fn(() => "stroke-1");
  const onNote = vi.fn(() => "note-1");
  const onRemove = vi.fn(() => true);
  const onClearOwn = vi.fn();
  render(<StudioVirtualSpaceP2pBoard
    snapshot={snapshot}
    selfSessionId="alice"
    onStroke={onStroke}
    onNote={onNote}
    onRemove={onRemove}
    onClearOwn={onClearOwn}
  />);
  return { onStroke, onNote, onRemove, onClearOwn };
}

describe("StudioVirtualSpaceP2pBoard", () => {
  it("creates a normalized stroke and a bounded shared note", () => {
    const { onStroke, onNote } = mount();
    const board = screen.getByRole("img", { name: "직접 그리는 공유 보드" });
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 100, clientY: 120 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 300, clientY: 360 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 300, clientY: 360 });
    expect(onStroke).toHaveBeenCalledWith([
      { x: .1, y: .2 },
      { x: .3, y: .6 },
    ], "#ffd166", 5);
    fireEvent.change(screen.getByPlaceholderText("공유 메모"), {
      target: { value: "검수 결정" },
    });
    fireEvent.click(screen.getByRole("button", { name: "메모 놓기" }));
    expect(onNote).toHaveBeenCalledWith(.12, .14, "검수 결정", "#ffd166");
  });

  it("keeps view-only participants unable to draw or place notes", () => {
    const { onStroke, onNote } = mount({ ...editable, canEdit: false });
    const board = screen.getByRole("img", { name: "직접 그리는 공유 보드" });
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 200, clientY: 200 });
    expect(onStroke).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("공유 메모"), {
      target: { value: "blocked" },
    });
    expect((screen.getByRole("button", { name: "메모 놓기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onNote).not.toHaveBeenCalled();
  });
});
