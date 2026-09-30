import { describe, expect, it } from "vitest";

import {
  STUDIO_P2P_BOARD_COLORS,
  type StudioP2pBoardNote,
} from "./studio-virtual-space-p2p-board";
import {
  boardNoteToStickyNote,
  createStickyNote,
  editStickyNoteText,
  moveStickyNote,
  recolorStickyNote,
  removeStickyNote,
  resizeStickyNote,
  sortStickyNotesKanban,
  stickyNoteToBoardNoteInput,
  toggleStickyNoteDone,
} from "./studio-virtual-space-sticky-notes";

const base = {
  x: 0.2,
  y: 0.3,
  text: "오늘 할 일",
  authorSessionId: "alice",
  authorName: "앨리스",
};

function boardNote(overrides: Partial<StudioP2pBoardNote> = {}): StudioP2pBoardNote {
  return {
    id: "epoch.3",
    ownerSessionId: "bob",
    ownerEpoch: "epoch",
    revision: 3,
    color: STUDIO_P2P_BOARD_COLORS[0],
    kind: "note",
    x: 0.4,
    y: 0.5,
    text: "보드 메모",
    ...overrides,
  };
}

describe("studio-virtual-space-sticky-notes", () => {
  it("creates a sticky note with defaults", () => {
    const note = createStickyNote({ ...base, id: "n1", nowMs: 1_700_000_000_000 });
    expect(note).not.toBeNull();
    expect(note?.id).toBe("n1");
    expect(note?.color).toBe("#ffd166");
    expect(note?.done).toBe(false);
    expect(note?.createdAt).toBe(1_700_000_000_000);
    expect(note?.width).toBeGreaterThan(0);
    expect(Object.isFrozen(note)).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(createStickyNote({ ...base, text: "   " })).toBeNull();
    expect(createStickyNote({ ...base, text: "x".repeat(161) })).toBeNull();
    expect(createStickyNote({ ...base, x: 1.5 })).toBeNull();
    expect(createStickyNote({ ...base, color: "#000000" as never })).toBeNull();
    expect(createStickyNote({ ...base, authorSessionId: "" })).toBeNull();
  });

  it("clamps drag movement inside the board", () => {
    const note = createStickyNote({ ...base, id: "n2" })!;
    const moved = moveStickyNote(note, 0.99, 0.99, 42);
    expect(moved.x + moved.width).toBeLessThanOrEqual(1);
    expect(moved.y + moved.height).toBeLessThanOrEqual(1);
    expect(moved.updatedAt).toBe(42);
    expect(note.x).toBe(0.2);
  });

  it("clamps resize to the allowed range", () => {
    const note = createStickyNote({ ...base, id: "n3" })!;
    const resized = resizeStickyNote(note, 0.9, 0.9);
    expect(resized.width).toBeLessThanOrEqual(0.46);
    expect(resized.height).toBeLessThanOrEqual(0.5);
    const tiny = resizeStickyNote(note, 0.01, 0.01);
    expect(tiny.width).toBeGreaterThanOrEqual(0.08);
    expect(tiny.height).toBeGreaterThanOrEqual(0.06);
  });

  it("edits text and toggles the kanban done flag", () => {
    const note = createStickyNote({ ...base, id: "n4" })!;
    const edited = editStickyNoteText(note, "  수정된 내용  ");
    expect(edited.text).toBe("수정된 내용");
    expect(editStickyNoteText(note, "")).toBe(note);
    expect(editStickyNoteText(note, "x".repeat(200))).toBe(note);
    const done = toggleStickyNoteDone(edited);
    expect(done.done).toBe(true);
    expect(toggleStickyNoteDone(done).done).toBe(false);
  });

  it("sorts kanban with undone notes first by recency", () => {
    const a = createStickyNote({ ...base, id: "a", nowMs: 100 })!;
    const b = toggleStickyNoteDone(createStickyNote({ ...base, id: "b", nowMs: 300 })!, 400);
    const c = createStickyNote({ ...base, id: "c", nowMs: 200 })!;
    const sorted = sortStickyNotesKanban([a, b, c]).map((note) => note.id);
    expect(sorted).toEqual(["c", "a", "b"]);
  });

  it("removes a note by id and ignores recoloring outside the palette", () => {
    const a = createStickyNote({ ...base, id: "a" })!;
    const b = createStickyNote({ ...base, id: "b" })!;
    expect(removeStickyNote([a, b], "a")).toHaveLength(1);
    expect(recolorStickyNote(a, "#000000" as never)).toBe(a);
    expect(recolorStickyNote(a, "#ffb3c7")?.color).toBe("#ffb3c7");
  });

  it("converts a sticky note to a P2P board note input", () => {
    const note = createStickyNote({ ...base, id: "n5", color: "#a8d8ff", x: 0.2, y: 0.3, width: 0.2, height: 0.2 })!;
    const input = stickyNoteToBoardNoteInput(note);
    expect(input.x).toBeCloseTo(0.3);
    expect(input.y).toBeCloseTo(0.4);
    expect(input.text).toBe("오늘 할 일");
    expect(STUDIO_P2P_BOARD_COLORS).toContain(input.color);
  });

  it("converts a P2P board note entity to a sticky note", () => {
    const sticky = boardNoteToStickyNote(boardNote(), "밥", 1_700_000_000_000);
    expect(sticky?.text).toBe("보드 메모");
    expect(sticky?.authorSessionId).toBe("bob");
    expect(sticky?.authorName).toBe("밥");
    expect(sticky?.done).toBe(false);
    expect(sticky?.id).toBe("imported-epoch.3");
    expect(boardNoteToStickyNote({ ...boardNote(), color: "#000000" as never }, "밥")).toBeNull();
  });
});
