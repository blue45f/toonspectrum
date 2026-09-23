// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEntryLobby } from "./StudioVirtualSpaceEntryLobby";

describe("StudioVirtualSpaceEntryLobby", () => {
  it("chooses a character before entering without requesting media", () => {
    const choose = vi.fn();
    const chooseStyle = vi.fn();
    const enter = vi.fn();
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby
      avatarIndex={-1}
      returning={false}
      projectName="Project Aurora"
      onAvatarIndex={choose}
      onArtStyle={chooseStyle}
      onEnter={enter}
    /></MemoryRouter>);

    expect(screen.getByText("마이크 꺼짐")).toBeTruthy();
    expect(screen.getByText("카메라 꺼짐")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "하늘 캐릭터 선택" }));
    expect(choose).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: /레트로/ }));
    expect(chooseStyle).toHaveBeenCalledWith("retro");
    fireEvent.click(screen.getByRole("button", { name: "선택하고 입장" }));
    expect(enter).toHaveBeenCalledTimes(1);
  });
});
