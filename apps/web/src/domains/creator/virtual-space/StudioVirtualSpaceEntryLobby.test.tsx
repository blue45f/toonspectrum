// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEntryLobby } from "./StudioVirtualSpaceEntryLobby";

afterEach(cleanup);

describe("StudioVirtualSpaceEntryLobby", () => {
  it("requires a direct character choice before entering without requesting media", async () => {
    const choose = vi.fn();
    const chooseStyle = vi.fn();
    const chooseNickname = vi.fn();
    const enter = vi.fn();
    const props = {
      returning: false,
      projectName: "Project Aurora",
      onAvatarIndex: choose,
      onArtStyle: chooseStyle,
      onNickname: chooseNickname,
      onEnter: enter,
    } as const;
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={-1} nickname="" {...props} /></MemoryRouter>);

    expect(screen.getByText("마이크 꺼짐")).toBeTruthy();
    expect(screen.getByText("카메라 꺼짐")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "자동 선택" })).toBeNull();
    expect(screen.getByRole("button", { name: "선택하고 입장" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "하늘 캐릭터 선택" }));
    expect(choose).toHaveBeenCalledWith(0);
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="" {...props} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "선택하고 입장" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/공개 닉네임/u), { target: { value: "희준 작가" } });
    expect(chooseNickname).toHaveBeenCalledWith("희준 작가");
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby avatarIndex={0} nickname="희준 작가" {...props} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "선택하고 입장" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByText("아트 스타일·연결 고급 설정"));
    fireEvent.click(await screen.findByRole("button", { name: /레트로/ }));
    expect(chooseStyle).toHaveBeenCalledWith("retro");
    fireEvent.click(screen.getByRole("button", { name: "선택하고 입장" }));
    expect(enter).toHaveBeenCalledTimes(1);
  });
  it("개인 아틀리에는 고급 설정을 열기 전 미리보기를 마운트하지 않고 RTC 안내를 표시하지 않는다", async () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby personal avatarIndex={0} nickname="작가" returning
      projectName="나의 아틀리에" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByText("소규모 협업은 P2P 우선")).toBeNull();
    expect(screen.queryByRole("button", { name: /레트로/ })).toBeNull();
    expect(document.querySelector(".studio-vspace-entry-advanced-body")).toBeNull();
    fireEvent.click(screen.getByText("아트 스타일 설정"));
    expect(await screen.findByRole("button", { name: /레트로/ })).toBeTruthy();
    expect(document.querySelector(".studio-vspace-rtc-panel")).toBeNull();
  });
});
