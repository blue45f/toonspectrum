// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceGalleryViewer } from "./StudioVirtualSpaceGalleryViewer";
import type { StudioGalleryFrame } from "./studio-virtual-space-gallery";

function frame(overrides: Partial<StudioGalleryFrame> = {}): StudioGalleryFrame {
  return {
    id: "frame-a",
    titleKo: "첫 장면", titleEn: "First scene",
    artistNoteKo: "비가 오는 장면이에요.", artistNoteEn: "A rainy scene.",
    imageUrl: "https://example.com/art/frame-a@2x.png",
    position: { x: 400, y: 300 },
    ...overrides,
  };
}

const FRAMES = [
  frame(),
  frame({ id: "frame-b", titleKo: "둘째 장면", titleEn: "Second scene", position: { x: 900, y: 300 } }),
  frame({ id: "frame-c", titleKo: "셋째 장면", titleEn: "Third scene", position: { x: 1400, y: 300 } }),
];
const NEAR_A = { x: 410, y: 300 };
const FAR = { x: 0, y: 900 };

describe("StudioVirtualSpaceGalleryViewer", () => {
  it("다가가면 고해상도 작품과 작가 노트, 조회수를 보여준다", () => {
    render(<StudioVirtualSpaceGalleryViewer frames={FRAMES} position={NEAR_A} userId="user-1" />);
    expect(screen.getByAltText("첫 장면")).toBeTruthy();
    expect(screen.getByText(/비가 오는 장면이에요/)).toBeTruthy();
    expect(screen.getByText(/조회 1/)).toBeTruthy();
  });

  it("좋아요를 누르면 집계가 오르고 상태가 반영된다", () => {
    render(<StudioVirtualSpaceGalleryViewer frames={FRAMES} position={NEAR_A} userId="user-1" />);
    const likeButton = screen.getByRole("button", { name: /좋아요/ });
    fireEvent.click(likeButton);
    expect(screen.getByText(/좋아요 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /좋아요 취소/ })).toBeTruthy();
  });

  it("게스트가 좋아요를 누르면 로그인 안내가 뜨고 집계는 그대로다", () => {
    const onRequireLogin = vi.fn();
    render(<StudioVirtualSpaceGalleryViewer frames={FRAMES} position={NEAR_A} userId={null} onRequireLogin={onRequireLogin} />);
    // 게스트도 관람은 된다.
    expect(screen.getByAltText("첫 장면")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
    expect(screen.getByText(/좋아요를 남기려면 로그인/)).toBeTruthy();
    expect(onRequireLogin).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/좋아요 0/)).toBeTruthy();
  });

  it("멀리 있으면 안내가 보이고, 목록에서 고르면 고정해서 보여준다", () => {
    render(<StudioVirtualSpaceGalleryViewer frames={FRAMES} position={FAR} userId="user-1" />);
    expect(screen.getByText(/아직 가까이 있는 작품이 없어요/)).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "셋째 장면" });
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(screen.getByAltText("셋째 장면")).toBeTruthy();
  });

  it("도슨트 투어를 시작하면 순서대로 작품이 바뀌고 진행 상황이 보인다", () => {
    render(<StudioVirtualSpaceGalleryViewer frames={FRAMES} position={NEAR_A} userId="user-1" />);
    fireEvent.click(screen.getByRole("button", { name: /도슨트 투어 시작/ }));
    expect(screen.getByText(/도슨트 투어 1 \/ 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음 작품" }));
    expect(screen.getByText(/도슨트 투어 2 \/ 3/)).toBeTruthy();
    expect(screen.getByAltText("둘째 장면")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "투어 종료" }));
    expect(screen.queryByText(/도슨트 투어 \d+ \/ 3/)).toBeNull();
    expect(screen.getByRole("button", { name: /도슨트 투어 시작/ })).toBeTruthy();
  });

  it("닫기를 누르면 작품이 숨겨진다", () => {
    render(<StudioVirtualSpaceGalleryViewer frames={FRAMES} position={NEAR_A} userId="user-1" />);
    expect(screen.getByAltText("첫 장면")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(screen.queryByAltText("첫 장면")).toBeNull();
    expect(screen.getByText(/아직 가까이 있는 작품이 없어요/)).toBeTruthy();
  });
});
