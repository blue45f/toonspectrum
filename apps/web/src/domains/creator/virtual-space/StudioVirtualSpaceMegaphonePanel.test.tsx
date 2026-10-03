// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceMegaphonePanel } from "./StudioVirtualSpaceMegaphonePanel";
import type { MegaphoneSessionSnapshot } from "./studio-virtual-space-megaphone";
import type { StudioVirtualSpaceMegaphoneBinding } from "./use-studio-virtual-space-megaphone";

const IDLE: MegaphoneSessionSnapshot = {
  status: "idle",
  scope: "room",
  broadcasterName: "",
  sharingScreen: false,
  captions: [],
  error: null,
};

function binding(overrides: Partial<StudioVirtualSpaceMegaphoneBinding> = {}): StudioVirtualSpaceMegaphoneBinding {
  return {
    snapshot: IDLE,
    canBroadcast: true,
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    pushCaption: vi.fn(),
    ...overrides,
  };
}

describe("StudioVirtualSpaceMegaphonePanel", () => {
  it("로컬 시뮬레이션 범위와 방송 시작 동선을 보여준다", () => {
    const fake = binding();
    render(<StudioVirtualSpaceMegaphonePanel binding={fake} />);
    expect(screen.getByText(/로컬 시뮬레이션/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "공간 전체" }));
    fireEvent.click(screen.getByRole("button", { name: /방송 시작/ }));
    expect(fake.start).toHaveBeenCalledWith("world", { shareScreen: false });
  });

  it("권한이 없으면 시작 동선 대신 권한 안내를 보여준다", () => {
    render(<StudioVirtualSpaceMegaphonePanel binding={binding({ canBroadcast: false })} />);
    expect(screen.getByText(/소유자·관리자만 시작할 수 있어요/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /방송 시작/ })).toBeNull();
  });

  it("방송 중에는 자막 전송과 종료 동선을 보여준다", () => {
    const fake = binding({
      snapshot: { ...IDLE, status: "broadcasting", broadcasterName: "희준", scope: "world" },
    });
    render(<StudioVirtualSpaceMegaphonePanel binding={fake} />);
    const input = screen.getByPlaceholderText(/한 줄 자막/);
    fireEvent.change(input, { target: { value: "잠시 후 회의를 시작해요" } });
    fireEvent.click(screen.getByRole("button", { name: /자막 전송/ }));
    expect(fake.pushCaption).toHaveBeenCalledWith("잠시 후 회의를 시작해요");
    fireEvent.click(screen.getByRole("button", { name: /방송 종료/ }));
    expect(fake.stop).toHaveBeenCalled();
  });
});
