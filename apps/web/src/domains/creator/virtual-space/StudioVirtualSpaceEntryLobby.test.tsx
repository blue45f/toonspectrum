// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEntryLobby } from "./StudioVirtualSpaceEntryLobby";

describe("StudioVirtualSpaceEntryLobby", () => {
  it("requires a direct character choice before entering without requesting media", () => {
    const choose = vi.fn();
    const chooseStyle = vi.fn();
    const enter = vi.fn();
    const props = {
      returning: false,
      projectName: "Project Aurora",
      onAvatarIndex: choose,
      onArtStyle: chooseStyle,
      onEnter: enter,
    } as const;
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={-1} {...props} /></MemoryRouter>);

    expect(screen.getByText("마이크 꺼짐")).toBeTruthy();
    expect(screen.getByText("카메라 꺼짐")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "자동 선택" })).toBeNull();
    expect(screen.getByRole("button", { name: "선택하고 입장" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "하늘 캐릭터 선택" }));
    expect(choose).toHaveBeenCalledWith(0);
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} {...props} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "선택하고 입장" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /레트로/ }));
    expect(chooseStyle).toHaveBeenCalledWith("retro");
    fireEvent.click(screen.getByRole("button", { name: "선택하고 입장" }));
    expect(enter).toHaveBeenCalledTimes(1);
  });
});
