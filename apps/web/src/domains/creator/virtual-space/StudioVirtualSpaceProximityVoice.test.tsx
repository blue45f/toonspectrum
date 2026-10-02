// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceProximityVoice } from "./StudioVirtualSpaceProximityVoice";
import { STUDIO_PROXIMITY_CHAT_RADIUS } from "./studio-virtual-space-proximity";

afterEach(() => {
  cleanup();
});

const peers = [
  { sessionId: "peer:near", displayName: "가까운 동료", distance: 50 },
  { sessionId: "peer:far", displayName: "먼 동료", distance: STUDIO_PROXIMITY_CHAT_RADIUS + 100 },
];

function baseProps(overrides = {}) {
  return {
    peers,
    levels: [],
    now: 10_000,
    muted: false,
    onToggleMute: vi.fn(),
    ...overrides,
  };
}

describe("StudioVirtualSpaceProximityVoice", () => {
  it("거리 기준으로 연결됨/범위 밖 상태를 표시한다", () => {
    render(<StudioVirtualSpaceProximityVoice {...baseProps()} />);
    const near = screen.getByTestId("proximity-voice-peer-peer:near");
    const far = screen.getByTestId("proximity-voice-peer-peer:far");
    expect(near.textContent).toContain("연결됨");
    expect(far.textContent).toContain("범위 밖");
  });

  it("음소거 토글 버튼이 콜백을 호출하고 aria-pressed를 반영한다", () => {
    const props = baseProps();
    const { rerender } = render(<StudioVirtualSpaceProximityVoice {...props} />);
    const button = screen.getByRole("button", { name: /음소거/ });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(props.onToggleMute).toHaveBeenCalledTimes(1);

    rerender(<StudioVirtualSpaceProximityVoice {...baseProps({ muted: true })} />);
    const mutedButton = screen.getByRole("button", { name: /음소거 해제/ });
    expect(mutedButton.getAttribute("aria-pressed")).toBe("true");
    expect(mutedButton.textContent).toContain("음소거 중");
  });

  it("발화자 링 로직과 연동해 말하는 사람을 하이라이트한다", () => {
    render(
      <StudioVirtualSpaceProximityVoice
        {...baseProps({
          levels: [
            { sessionId: "peer:near", level: 0.8, at: 9_900 },
            { sessionId: "peer:far", level: 0.9, at: 9_900 },
          ],
        })}
      />,
    );
    const near = screen.getByTestId("proximity-voice-peer-peer:near");
    expect(near.textContent).toContain("말하는 중");
    // 범위 밖 피어는 말해도 하이라이트하지 않는다
    const far = screen.getByTestId("proximity-voice-peer-peer:far");
    expect(far.textContent).not.toContain("말하는 중");
  });

  it("오래된 오디오 레벨은 무시한다", () => {
    render(
      <StudioVirtualSpaceProximityVoice
        {...baseProps({ levels: [{ sessionId: "peer:near", level: 0.9, at: 1_000 }] })}
      />,
    );
    expect(screen.getByTestId("proximity-voice-peer-peer:near").textContent).not.toContain("말하는 중");
  });

  it("주변에 아무도 없으면 안내 문구를 보여준다", () => {
    render(<StudioVirtualSpaceProximityVoice {...baseProps({ peers: [] })} />);
    expect(screen.getByRole("status").textContent).toContain("주변에 아무도 없어요");
  });

  it("말하는 피어의 입 모양이 오디오 레벨에 따라 넓게 열린다 (립싱크)", () => {
    const loud = render(
      <StudioVirtualSpaceProximityVoice
        {...baseProps({ levels: [{ sessionId: "peer:near", level: 0.95, at: 10_000 }] })}
      />,
    );
    expect(loud.getByTestId("proximity-voice-peer-peer:near").querySelector('[data-lipsync-mouth="wide"]')).not.toBeNull();
    // 범위 밖 피어에게는 입 모양을 표시하지 않는다
    expect(loud.getByTestId("proximity-voice-peer-peer:far").querySelector("[data-lipsync-mouth]")).toBeNull();
    loud.unmount();
    // 조용한 피어는 입을 닫은 상태로 표시한다
    const quiet = render(<StudioVirtualSpaceProximityVoice {...baseProps()} />);
    expect(quiet.getByTestId("proximity-voice-peer-peer:near").querySelector('[data-lipsync-mouth="closed"]')).not.toBeNull();
  });

  it("영역 레이블로 접근 가능하다", () => {
    render(<StudioVirtualSpaceProximityVoice {...baseProps()} />);
    expect(screen.getByRole("region", { name: /근접 음성 채팅/ })).toBeTruthy();
  });
});
