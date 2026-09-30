// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceScreenShareRequest } from "./StudioVirtualSpaceScreenShareRequest";

afterEach(() => {
  cleanup();
});

const screens = [
  { id: "screen:hall", labelKo: "대형 스크린", labelEn: "Large screen", occupied: false },
  { id: "screen:lounge", labelKo: "라운지 스크린", labelEn: "Lounge screen", occupied: true, occupiedByLabel: "준 작가" },
];

function baseProps(overrides = {}) {
  return {
    screens,
    phase: "idle" as const,
    pendingScreenId: null,
    incomingRequest: null,
    activeShare: null,
    denial: null,
    onOpenSelect: vi.fn(),
    onCancelSelect: vi.fn(),
    onRequest: vi.fn(),
    onCancelRequest: vi.fn(),
    onAcceptIncoming: vi.fn(),
    onDeclineIncoming: vi.fn(),
    onStopShare: vi.fn(),
    onDismissDenial: vi.fn(),
    ...overrides,
  };
}

describe("StudioVirtualSpaceScreenShareRequest", () => {
  it("idle에서는 요청하기 버튼만 보인다", () => {
    render(<StudioVirtualSpaceScreenShareRequest {...baseProps()} />);
    expect(screen.getByRole("button", { name: /화면 공유 요청하기/ })).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("요청하기를 누르면 스크린 선택 목록이 열린다", () => {
    const props = baseProps();
    render(<StudioVirtualSpaceScreenShareRequest {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /화면 공유 요청하기/ }));
    expect(props.onOpenSelect).toHaveBeenCalledTimes(1);
  });

  it("selecting에서는 사용 중인 스크린을 선택할 수 없고 요청은 선택 후에만 가능하다", () => {
    const props = baseProps({ phase: "selecting" as const });
    render(<StudioVirtualSpaceScreenShareRequest {...props} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect((radios[1] as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/사용 중/)).toBeTruthy();

    const sendButton = screen.getByRole("button", { name: /요청 보내기/ });
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(radios[0] as HTMLInputElement);
    expect((sendButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sendButton);
    expect(props.onRequest).toHaveBeenCalledWith("screen:hall");
  });

  it("pending에서는 대기 안내와 요청 취소 버튼을 보여준다", () => {
    const props = baseProps({ phase: "pending" as const, pendingScreenId: "screen:hall" });
    render(<StudioVirtualSpaceScreenShareRequest {...props} />);
    expect(screen.getByText(/응답을 기다리는 중/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /요청 취소/ }));
    expect(props.onCancelRequest).toHaveBeenCalledTimes(1);
  });

  it("진행 중인 공유가 있으면 누가 공유 중인지 배너를 보여준다", () => {
    const props = baseProps({
      activeShare: { sharerLabel: "준 작가", screenLabel: "대형 스크린", isSelf: false },
    });
    render(<StudioVirtualSpaceScreenShareRequest {...props} />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("준 작가");
    expect(banner.textContent).toContain("대형 스크린");
    expect(screen.queryByRole("button", { name: /공유 중지/ })).toBeNull();
  });

  it("내가 공유 중이면 중지 버튼을 보여준다", () => {
    const props = baseProps({
      activeShare: { sharerLabel: "나", screenLabel: "대형 스크린", isSelf: true },
    });
    render(<StudioVirtualSpaceScreenShareRequest {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /공유 중지/ }));
    expect(props.onStopShare).toHaveBeenCalledTimes(1);
  });

  it("들어온 요청은 수락/거절 패널로 보여준다", () => {
    const props = baseProps({
      incomingRequest: { requesterLabel: "미아", screenLabel: "대형 스크린" },
    });
    render(<StudioVirtualSpaceScreenShareRequest {...props} />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("미아");
    fireEvent.click(screen.getByRole("button", { name: /수락/ }));
    expect(props.onAcceptIncoming).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /거절/ }));
    expect(props.onDeclineIncoming).toHaveBeenCalledTimes(1);
  });

  it("거절 알림을 보여주고 닫을 수 있다", () => {
    const props = baseProps({
      denial: { screenLabel: "대형 스크린", byLabel: "준 작가" },
    });
    render(<StudioVirtualSpaceScreenShareRequest {...props} />);
    expect(screen.getByRole("alert").textContent).toContain("거절");
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(props.onDismissDenial).toHaveBeenCalledTimes(1);
  });

  it("로컬 미리보기 중이면 안내 문구를 보여준다", () => {
    render(<StudioVirtualSpaceScreenShareRequest {...baseProps({ localPreviewStatus: "previewing" as const })} />);
    expect(screen.getByText(/로컬 미리보기가 켜져 있어요/)).toBeTruthy();
  });

  it("idle에서는 요청 순서를 안내한다", () => {
    render(<StudioVirtualSpaceScreenShareRequest {...baseProps()} />);
    expect(screen.getByText(/스크린 선택/)).toBeTruthy();
    expect(screen.getByText(/요청 보내기/)).toBeTruthy();
    expect(screen.getByText(/상대방 수락/)).toBeTruthy();
  });

  it("selecting에서 스크린이 없으면 일러스트와 다음 행동 가이드를 보여준다", () => {
    render(<StudioVirtualSpaceScreenShareRequest {...baseProps({ phase: "selecting" as const, screens: [] })} />);
    expect(screen.getByText(/선택할 수 있는 스크린이 없어요/)).toBeTruthy();
    expect(screen.getByText(/맵 편집에서 대형 스크린 오브젝트를 추가하면/)).toBeTruthy();
  });

  it.each([
    ["unsupported", /지원하지 않아요/, /Chrome이나 Edge/],
    ["denied", /권한이 거부됐어요/, /자물쇠 아이콘/],
    ["failed", /시작하지 못했어요/, /다시 시도해 보세요/],
  ] as const)("에러 상태에서는 문제와 해결 방법을 함께 보여준다 (%s)", (code, problem, fix) => {
    const props = baseProps({
      error: { code, screenLabel: "대형 스크린" },
      onRetryError: vi.fn(),
      onDismissError: vi.fn(),
    });
    render(<StudioVirtualSpaceScreenShareRequest {...props} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(problem);
    expect(alert.textContent).toContain("대형 스크린");
    expect(alert.textContent).toMatch(fix);
    fireEvent.click(screen.getByRole("button", { name: /다시 시도/ }));
    expect(props.onRetryError).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(props.onDismissError).toHaveBeenCalledTimes(1);
  });
});
