// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceRoomCatalog } from "./StudioVirtualSpaceRoomCatalog";

afterEach(() => cleanup());

function mount(projectAvailable: boolean) {
  const onPanel = vi.fn();
  const onZone = vi.fn();
  render(<MemoryRouter><StudioVirtualSpaceRoomCatalog
    projectAvailable={projectAvailable}
    onPanel={onPanel}
    onZone={onZone}
  /></MemoryRouter>);
  return { onPanel, onZone };
}

describe("StudioVirtualSpaceRoomCatalog", () => {
  it("opens project P2P modules through the existing panel contract", () => {
    const { onPanel } = mount(true);
    fireEvent.click(screen.getByRole("button", { name: /P2P 화이트보드/u }));
    expect(onPanel).toHaveBeenCalledWith("board");
  });
  it("does not advertise project-only rooms in a personal space", () => {
    mount(false);
    expect(screen.queryByRole("button", { name: /빠른 P2P 허들/u })).toBeNull();
    expect(screen.queryByText(/프로젝트 공간에서 사용할 수 있어요/u)).toBeNull();
  });

  it("links interview waiting to the existing hiring room authority", () => {
    mount(false);
    const link = screen.getByRole("link", { name: /면접·협업 대기실/u });
    expect(link.getAttribute("href")).toBe("/team/recruiting?panel=rooms");
  });

  it("walks to the authored lounge rather than changing presence authority", () => {
    const { onZone } = mount(false);
    fireEvent.click(screen.getByRole("button", { name: /조용한 휴게 라운지/u }));
    expect(onZone).toHaveBeenCalledWith("lounge");
  });
});
