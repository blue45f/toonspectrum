// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceStickyNotes } from "./StudioVirtualSpaceStickyNotes";
import { createStickyNote, toggleStickyNoteDone, type StudioStickyNote } from "./studio-virtual-space-sticky-notes";
import type { StudioP2pBoardNote } from "./studio-virtual-space-p2p-board";

function note(id: string, overrides: Partial<StudioStickyNote> = {}): StudioStickyNote {
  const created = createStickyNote({
    id,
    x: 0.2,
    y: 0.3,
    text: `메모 ${id}`,
    authorSessionId: "alice",
    authorName: "앨리스",
    nowMs: 1_700_000_000_000,
  })!;
  const { done, ...rest } = overrides;
  const withOverrides = { ...created, ...rest };
  return done ? toggleStickyNoteDone(withOverrides) : withOverrides;
}

const boardNote: StudioP2pBoardNote = {
  id: "epoch.9",
  ownerSessionId: "bob",
  ownerEpoch: "epoch",
  revision: 9,
  color: "#ffd166",
  kind: "note",
  x: 0.5,
  y: 0.5,
  text: "보드에서 온 메모",
};

beforeEach(() => {
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(Element.prototype, "hasPointerCapture", {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => ({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
      width: 1000, height: 600, toJSON: () => ({}),
    })),
  });
});
afterEach(() => cleanup());

function mount(notes: readonly StudioStickyNote[] = [note("a"), note("b", { done: true })], canEdit = true) {
  const handlers = {
    onCreate: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
    onEdit: vi.fn(),
    onToggleDone: vi.fn(),
    onRemove: vi.fn(),
    onRecolor: vi.fn(),
    onImportBoardNote: vi.fn(),
  };
  render(<StudioVirtualSpaceStickyNotes
    notes={notes}
    canEdit={canEdit}
    boardNotes={[boardNote]}
    {...handlers}
  />);
  return handlers;
}

describe("StudioVirtualSpaceStickyNotes", () => {
  it("renders sticky notes with author and text", () => {
    mount();
    expect(screen.getByText("메모 a")).toBeDefined();
    expect(screen.getAllByText(/앨리스/)[0]).toBeDefined();
  });

  it("places a new sticky note on the board in placement mode", () => {
    const { onCreate } = mount([]);
    fireEvent.click(screen.getByRole("button", { name: "포스트잇 붙이기" }));
    const board = screen.getByRole("region", { name: "포스트잇 보드 영역" });
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    expect(onCreate).toHaveBeenCalledWith({
      x: 0.4,
      y: 0.5,
      text: "새 메모",
      color: "#ffd166",
    });
  });

  it("drags a note to a new position", () => {
    const { onMove } = mount([note("a")]);
    const article = screen.getByRole("article", { name: /메모 a/ });
    fireEvent.pointerDown(article, { button: 0, pointerId: 1, clientX: 200, clientY: 180 });
    fireEvent.pointerMove(article, { pointerId: 1, clientX: 300, clientY: 240 });
    fireEvent.pointerUp(article, { pointerId: 1, clientX: 300, clientY: 240 });
    expect(onMove).toHaveBeenCalledWith("a", expect.closeTo(0.3), expect.closeTo(0.4));
  });

  it("toggles the kanban done checkbox", () => {
    const { onToggleDone } = mount([note("a")]);
    fireEvent.click(screen.getByRole("checkbox", { name: "완료 체크" }));
    expect(onToggleDone).toHaveBeenCalledWith("a");
  });

  it("filters notes by kanban status", () => {
    mount([note("a"), note("b", { done: true })]);
    fireEvent.click(screen.getByRole("button", { name: /진행 중/ }));
    expect(screen.queryByText("메모 b")).toBeNull();
    expect(screen.getByText("메모 a")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /완료/ }));
    expect(screen.queryByText("메모 a")).toBeNull();
    expect(screen.getByText("메모 b")).toBeDefined();
  });

  it("edits note text through the inline editor", () => {
    const { onEdit } = mount([note("a")]);
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    const editor = screen.getByRole("textbox", { name: "포스트잇 내용 편집" });
    fireEvent.change(editor, { target: { value: "수정된 메모" } });
    fireEvent.blur(editor);
    expect(onEdit).toHaveBeenCalledWith("a", "수정된 메모");
  });

  it("imports a P2P board note as a sticky note", () => {
    const { onImportBoardNote } = mount([]);
    // 가져오기 패널은 <details>로 접혀 있다
    fireEvent.click(screen.getByText(/보드 메모 1개 가져오기/));
    fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
    expect(onImportBoardNote).toHaveBeenCalledWith(boardNote);
  });

  it("shows an illustrated empty state with a CTA that starts placement", () => {
    mount([]);
    expect(screen.getByText("아직 포스트잇이 없어요.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "첫 포스트잇 붙이기" }));
    expect(screen.getByText("보드를 눌러 붙일 위치를 정하세요")).toBeDefined();
  });

  it("explains the read-only state and how to get edit access", () => {
    mount([], false);
    expect(screen.getByText(/읽기 전용으로 보고 있어요/)).toBeDefined();
    expect(screen.getByText(/편집 권한을 요청하세요/)).toBeDefined();
  });
});
