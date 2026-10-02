// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { studioVirtualCampusManifest } from "../studio-virtual-space-campus-world";
import { SpaceMinimap } from "./SpaceMinimap";

afterEach(cleanup);

const campus = studioVirtualCampusManifest(false);

describe("SpaceMinimap quick travel", () => {
  it("구역 걸어가기는 스폰으로 걷고, 번개 버튼은 바로 가기를 요청한다", () => {
    const onMoveTo = vi.fn(), onJumpTo = vi.fn();
    render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={[]}
      currentRoomId={null} variant="full" onMoveTo={onMoveTo} onJumpTo={onJumpTo} />);
    fireEvent.click(screen.getByRole("button", { name: /카페로 걸어가기/u }));
    expect(onMoveTo).toHaveBeenCalledExactlyOnceWith({ x: 2688, y: 600 });
    fireEvent.click(screen.getByRole("button", { name: /카페로 바로 가기/u }));
    expect(onJumpTo).toHaveBeenCalledExactlyOnceWith({ x: 2688, y: 600 });
    expect(onMoveTo).toHaveBeenCalledOnce();
  });

  it("게이트 칩은 바로 가기 콜백이 없으면 게이트까지 걷는다", () => {
    const onMoveTo = vi.fn();
    render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={[]}
      currentRoomId={null} variant="full" onMoveTo={onMoveTo} />);
    fireEvent.click(screen.getByRole("button", { name: /라이브러리 게이트까지 걷기/u }));
    expect(onMoveTo).toHaveBeenCalledExactlyOnceWith({ x: 132, y: 790 });
  });

  it("게이트 칩 바로 가기는 한 번 더 눌러 확인해야 장소 전환을 요청한다", () => {
    const onJumpToPlace = vi.fn(), onMoveTo = vi.fn();
    render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={[]}
      currentRoomId={null} variant="full" onMoveTo={onMoveTo} onJumpToPlace={onJumpToPlace} />);
    fireEvent.click(screen.getByRole("button", { name: /라이브러리로 바로 가기/u }));
    expect(onJumpToPlace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /라이브러리 바로 가기 확인/u }));
    expect(onJumpToPlace).toHaveBeenCalledExactlyOnceWith("tree-library");
    expect(onMoveTo).not.toHaveBeenCalled();
  });

  it("미니 변형에는 바로 가기 버튼을 그리지 않는다", () => {
    render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={[]}
      currentRoomId={null} variant="mini" onMoveTo={vi.fn()} onJumpTo={vi.fn()} onJumpToPlace={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /바로 가기/u })).toBeNull();
  });
});
