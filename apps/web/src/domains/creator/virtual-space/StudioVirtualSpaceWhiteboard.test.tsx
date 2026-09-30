// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceWhiteboard } from "./StudioVirtualSpaceWhiteboard";
import type {
  StudioP2pBoardSnapshot,
  StudioP2pBoardStroke,
} from "./studio-virtual-space-p2p-board";

function stroke(
  id: string,
  ownerSessionId: string,
  revision: number,
  points: { x: number; y: number }[] = [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.4 }],
): StudioP2pBoardStroke {
  return {
    id,
    ownerSessionId,
    ownerEpoch: "epoch",
    revision,
    color: "#ffd166",
    kind: "stroke",
    width: 5,
    points,
  };
}

const snapshot: StudioP2pBoardSnapshot = {
  entities: [
    stroke("s1", "alice", 1),
    stroke("s2", "bob", 2),
    stroke("s3", "alice", 3),
  ],
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

function mount(overrides: Partial<StudioP2pBoardSnapshot> = {}) {
  const onStroke = vi.fn(() => "stroke-9");
  const onNote = vi.fn(() => "note-9");
  const onRemove = vi.fn(() => true);
  const onClearOwn = vi.fn();
  const onToggleDock = vi.fn();
  render(<StudioVirtualSpaceWhiteboard
    snapshot={{ ...snapshot, ...overrides }}
    selfSessionId="alice"
    authorNameOf={(sessionId) => ({ alice: "앨리스", bob: "밥" }[sessionId] ?? sessionId)}
    onStroke={onStroke}
    onNote={onNote}
    onRemove={onRemove}
    onClearOwn={onClearOwn}
    onToggleDock={onToggleDock}
  />);
  return { onStroke, onNote, onRemove, onClearOwn, onToggleDock };
}

describe("StudioVirtualSpaceWhiteboard", () => {
  it("renders a name tag for strokes drawn by teammates", () => {
    mount();
    expect(screen.getByText("밥")).toBeDefined();
    expect(screen.queryByText("앨리스")).toBeNull();
  });

  it("draws with the selected pen width", () => {
    const { onStroke } = mount();
    // 펜 세부 설정은 <details> 안에 접혀 있다
    fireEvent.click(screen.getByText("펜 설정"));
    fireEvent.click(screen.getByRole("button", { name: "굵기 10" }));
    const board = screen.getByRole("img", { name: "직접 그리는 공유 보드" });
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 100, clientY: 120 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 300, clientY: 360 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 300, clientY: 360 });
    expect(onStroke).toHaveBeenCalledWith([
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.6 },
    ], "#ffd166", 10);
  });

  it("emphasizes the pen tool as the single primary action", () => {
    mount();
    expect(screen.getByRole("button", { name: "펜" }).className).toContain("is-primary");
    expect(screen.getByRole("button", { name: "지우개" }).className).not.toContain("is-primary");
    expect(screen.getByRole("button", { name: "메모" }).className).not.toContain("is-primary");
  });

  it("shows an empty-state guide with a start-drawing CTA on a blank board", () => {
    mount({ entities: [] });
    expect(screen.getByText("아직 아무것도 그려지지 않았어요.")).toBeDefined();
    expect(screen.getByText(/펜으로 첫 선을 그어보세요/)).toBeDefined();
    // 핵심 액션 CTA를 누르면 펜 도구가 선택된다
    fireEvent.click(screen.getByRole("button", { name: "지우개" }));
    fireEvent.click(screen.getByRole("button", { name: "펜으로 그리기 시작" }));
    expect(screen.getByRole("button", { name: "펜" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("explains the offline problem and how to fix it", () => {
    mount({ available: false });
    expect(screen.getByText("연결을 기다리고 있어요")).toBeDefined();
    expect(screen.getByText(/같은 프로젝트의 참가자와 P2P로 연결 중입니다/)).toBeDefined();
    expect(screen.getByText(/해결 방법/)).toBeDefined();
  });

  it("places a note where the board is tapped in note mode", () => {
    const { onNote } = mount();
    fireEvent.click(screen.getByRole("button", { name: "메모" }));
    fireEvent.change(screen.getByPlaceholderText("보드를 눌러 메모 놓기"), {
      target: { value: "회의 결정" },
    });
    const board = screen.getByRole("img", { name: "직접 그리는 공유 보드" });
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 500, clientY: 300 });
    expect(onNote).toHaveBeenCalledWith(0.5, 0.5, "회의 결정", "#ffd166");
  });

  it("undoes the latest own stroke and clears own items", () => {
    const { onRemove, onClearOwn } = mount();
    fireEvent.click(screen.getByRole("button", { name: "실행 취소 (내 마지막 항목)" }));
    expect(onRemove).toHaveBeenCalledWith("s3");
    fireEvent.click(screen.getByRole("button", { name: "내 항목 모두 지우기" }));
    expect(onClearOwn).toHaveBeenCalled();
  });

  it("disables editing tools for view-only participants", () => {
    mount({ canEdit: false });
    expect(screen.getByRole("button", { name: "실행 취소 (내 마지막 항목)" }).hasAttribute("disabled")).toBe(true);
    const board = screen.getByRole("img", { name: "직접 그리는 공유 보드" });
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 100, clientY: 120 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 200, clientY: 200 });
    expect(screen.getByText("보기 권한으로 참여 중이어서 보드를 수정할 수 없습니다.")).toBeDefined();
  });

  it("renders a minimap and toggles dock mode", () => {
    const { onToggleDock } = mount();
    expect(screen.getByLabelText("보드 미니맵")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "화이트보드 도킹" }));
    expect(onToggleDock).toHaveBeenCalled();
  });

  it("selects tools with pressed state", () => {
    mount();
    const eraser = screen.getByRole("button", { name: "지우개" });
    fireEvent.click(eraser);
    expect(eraser.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "펜" }).getAttribute("aria-pressed")).toBe("false");
  });
});
