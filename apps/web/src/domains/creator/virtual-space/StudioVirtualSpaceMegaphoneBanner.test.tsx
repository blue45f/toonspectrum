// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudioVirtualSpaceMegaphoneBanner } from "./StudioVirtualSpaceMegaphoneBanner";
import { MegaphoneSession } from "./studio-virtual-space-megaphone";

function broadcastingSnapshot() {
  const session = new MegaphoneSession();
  session.start({ scope: "world", broadcasterName: "김선생", shareScreen: true });
  session.pushCaption("방송을 시작합니다", "Broadcast starting");
  return session.getSnapshot();
}

describe("StudioVirtualSpaceMegaphoneBanner", () => {
  it("방송 중 배너·자막·화면공유 표시를 렌더한다", () => {
    render(<StudioVirtualSpaceMegaphoneBanner snapshot={broadcastingSnapshot()} scope="world" />);
    expect(screen.getByLabelText(/메가폰 방송/)).toBeTruthy();
    expect(screen.getByText(/메가폰 방송 중/)).toBeTruthy();
    expect(screen.getByText(/월드 전체 방송/)).toBeTruthy();
    expect(screen.getByText(/김선생/)).toBeTruthy();
    expect(screen.getByText(/화면 공유 중/)).toBeTruthy();
    const log = screen.getByRole("log");
    expect(log).toBeTruthy();
    expect(screen.getByText(/방송을 시작합니다/)).toBeTruthy();
  });

  it("room 범위를 표시한다", () => {
    const session = new MegaphoneSession();
    session.start({ scope: "room", broadcasterName: "관리자" });
    render(<StudioVirtualSpaceMegaphoneBanner snapshot={session.getSnapshot()} scope="room" />);
    expect(screen.getByText(/방 전체 방송/)).toBeTruthy();
    expect(screen.getByText(/자막이 도착하면/)).toBeTruthy();
  });

  it("방송 중이 아니면 숨긴다", () => {
    const session = new MegaphoneSession();
    const { container } = render(<StudioVirtualSpaceMegaphoneBanner snapshot={session.getSnapshot()} scope="room" />);
    expect(container.firstChild).toBeNull();
  });
});
