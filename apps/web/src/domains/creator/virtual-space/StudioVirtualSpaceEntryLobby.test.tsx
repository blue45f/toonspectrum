// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(screen.getByRole("heading", { name: "함께 작업할 스튜디오에 입장하세요" })).toBeTruthy();
    expect(screen.getByText(/오늘 할 원고 작업을 고르고/u)).toBeTruthy();
    expect(screen.getByText("동료가 수락하면 함께 작업")).toBeTruthy();
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
    fireEvent.click(within(await screen.findByRole("group", { name: "아트 스타일" })).getByRole("button", { name: /픽셀 아틀리에/ }));
    expect(chooseStyle).toHaveBeenCalledWith("retro");
    fireEvent.click(screen.getByRole("button", { name: "선택하고 입장" }));
    expect(enter).toHaveBeenCalledTimes(1);
  });
  it("개인 아틀리에는 고급 설정을 열기 전 미리보기를 마운트하지 않고 RTC 안내를 표시하지 않는다", async () => {
    render(<MemoryRouter><StudioVirtualSpaceEntryLobby personal avatarIndex={0} nickname="작가" returning
      projectName="나의 아틀리에" onAvatarIndex={vi.fn()} onNickname={vi.fn()} onEnter={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByText("소규모 협업은 P2P 우선")).toBeNull();
    expect(screen.queryByRole("group", { name: "아트 스타일" })).toBeNull();
    expect(document.querySelector(".space-lobby__advanced-body")).toBeNull();
    fireEvent.click(screen.getByText("아트 스타일 설정"));
    expect(within(await screen.findByRole("group", { name: "아트 스타일" })).getByRole("button", { name: /픽셀 아틀리에/ })).toBeTruthy();
    expect(document.querySelector(".studio-vspace-rtc-panel")).toBeNull();
    expect(screen.getByText(/내 작품을 열거나 새 작품을 만들고/u)).toBeTruthy();
    expect(screen.queryByText("동료가 수락하면 함께 작업")).toBeNull();
  });
  it("게스트 모드는 닉네임만으로 입장하고 캐릭터 선택을 숨긴다", () => {
    const enter = vi.fn();
    const chooseNickname = vi.fn();
    const props = {
      guestMode: true, avatarIndex: 0, returning: false, projectName: "Project Aurora",
      onAvatarIndex: vi.fn(), onNickname: chooseNickname, onEnter: enter,
    } as const;
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby nickname="" {...props} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "초대받은 공간에 입장하세요" })).toBeTruthy();
    expect(screen.getByText(/초대 링크로 입장하는 게스트예요/u)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "내 캐릭터" })).toBeNull();
    expect(screen.queryByText("아트 스타일·연결 고급 설정")).toBeNull();
    expect(screen.getByRole("button", { name: "게스트로 입장" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/공개 닉네임/u), { target: { value: "초대 게스트" } });
    expect(chooseNickname).toHaveBeenCalledWith("초대 게스트");
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby nickname="초대 게스트" {...props} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "게스트로 입장" });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(enter).toHaveBeenCalledTimes(1);
    expect(screen.getByText("게스트 세션은 24시간 동안 유효해요.")).toBeTruthy();
  });
  it("왼쪽 무대에 고른 캐릭터와 공개 이름표를 크게 보여 주고, 개인 작업실은 혼자 쓰는 공간임을 알린다", () => {
    const props = { returning: false, projectName: "나의 아틀리에", onAvatarIndex: vi.fn(), onNickname: vi.fn(), onEnter: vi.fn() } as const;
    const view = render(<MemoryRouter><StudioVirtualSpaceEntryLobby personal avatarIndex={-1} nickname="" {...props} /></MemoryRouter>);
    const stage = screen.getByRole("region", { name: "입장 미리보기" });
    expect(within(stage).getByText("캐릭터를 골라 주세요")).toBeTruthy();
    expect(within(stage).getByText("닉네임을 입력하세요")).toBeTruthy();
    expect(within(stage).getByText("나만 입장하는 개인 작업실")).toBeTruthy();
    expect(within(stage).queryByText("마이크 꺼짐")).toBeNull();
    view.rerender(<MemoryRouter><StudioVirtualSpaceEntryLobby personal avatarIndex={0} nickname="희준 작가" {...props} /></MemoryRouter>);
    expect(within(stage).getByText("희준 작가")).toBeTruthy();
    expect(stage.querySelector(".space-lobby__character")).not.toBeNull();
    expect(screen.getByRole("button", { name: "하늘 캐릭터 선택" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 1 }).id).toBe("studio-vspace-entry-title");
  });
});
