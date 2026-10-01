// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpacePlaceModeBanner } from "./StudioVirtualSpacePlaceModeBanner";
import type { PlaceModeEvent, PlaceModeSessionSnapshot } from "./studio-virtual-space-place-mode-director";
import type { PlaceMediaSnapshot } from "./studio-virtual-space-place-media";
import type { PlaceModeBanner } from "./use-studio-virtual-space-place-modes";

const IDLE_MEDIA: PlaceMediaSnapshot = {
  active: false, kind: null, localStream: null, microphone: true, camera: true,
  speaking: false, screenSharing: false, screenStream: null, peers: [],
  spotlightSessionId: null, error: null,
};

const PROMPT: PlaceModeEvent = {
  kind: "join-prompt", mode: "conference", zoneId: "zone-meeting",
  zoneLabelKo: "회의실", zoneLabelEn: "Meeting Room",
  autoStatus: null, restoreStatus: null,
  textKo: "회의실에 들어왔어요 🎥 — 화상 회의에 참여할까요?",
  textEn: "You entered Meeting Room 🎥 — Join the video meeting?",
  at: 1,
};

const SESSION: PlaceModeSessionSnapshot = {
  mode: "conference", zoneId: "zone-meeting",
  zoneLabelKo: "회의실", zoneLabelEn: "Meeting Room",
  stage: "engaged", engagedAt: 1,
};

function handlers() {
  return {
    onConfirmJoin: vi.fn(), onDeclineJoin: vi.fn(), onLeaveSession: vi.fn(),
    onDismissBanner: vi.fn(), onOpenWhiteboard: vi.fn(), onDismissWhiteboardOffer: vi.fn(),
    onToggleMicrophone: vi.fn(), onToggleCamera: vi.fn(), onStartScreenShare: vi.fn(),
  };
}

function renderBanner(patch: Partial<Parameters<typeof StudioVirtualSpacePlaceModeBanner>[0]> = {}) {
  const props = {
    prompt: null, banner: null, session: null, media: IDLE_MEDIA, whiteboardOffer: null,
    ...handlers(), ...patch,
  };
  return { ...render(<StudioVirtualSpacePlaceModeBanner {...props} />), props };
}

afterEach(cleanup);

describe("참여 확인 다이얼로그", () => {
  it("프롬프트가 뜨면 참여하기·나중에 버튼이 보인다", () => {
    renderBanner({ prompt: PROMPT });
    expect(screen.getByTestId("place-mode-join-prompt")).toBeDefined();
    expect(screen.getByRole("button", { name: "참여하기" })).toBeDefined();
    expect(screen.getByRole("button", { name: "나중에" })).toBeDefined();
  });

  it("참여하기를 누르면 onConfirmJoin이 호출된다", () => {
    const { props } = renderBanner({ prompt: PROMPT });
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
    expect(props.onConfirmJoin).toHaveBeenCalledOnce();
  });

  it("나중에를 누르면 onDeclineJoin이 호출된다", () => {
    const { props } = renderBanner({ prompt: PROMPT });
    fireEvent.click(screen.getByRole("button", { name: "나중에" }));
    expect(props.onDeclineJoin).toHaveBeenCalledOnce();
  });

  it("Esc를 누르면 거절된다", () => {
    const { props } = renderBanner({ prompt: PROMPT });
    fireEvent.keyDown(screen.getByTestId("place-mode-join-prompt"), { key: "Escape" });
    expect(props.onDeclineJoin).toHaveBeenCalledOnce();
  });

  it("미디어 에러가 있으면 안내가 보인다", () => {
    const media: PlaceMediaSnapshot = {
      ...IDLE_MEDIA,
      error: { kind: "permission-denied", messageKo: "권한이 거부됐어요", messageEn: "Permission denied" },
    };
    renderBanner({ prompt: PROMPT, media });
    expect(screen.getByTestId("place-mode-media-error")).toBeDefined();
  });
});

describe("토스트 배너", () => {
  it("진입·이탈 알림이 role=status로 보인다", () => {
    const banner: PlaceModeBanner = {
      key: "enter:1", mode: "focus-desk", kind: "enter",
      textKo: "집중존 · 집중 모드 🎯", textEn: "Focus Zone · Focus mode 🎯",
    };
    renderBanner({ banner });
    const toast = screen.getByTestId("place-mode-toast");
    expect(toast.getAttribute("role")).toBe("status");
    expect(toast.textContent).toContain("집중 모드");
  });
});

describe("세션 칩", () => {
  it("engaged 세션이면 칩과 나가기 버튼이 보인다", () => {
    const { props } = renderBanner({ session: SESSION });
    expect(screen.getByTestId("place-mode-session-chip")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "세션 나가기" }));
    expect(props.onLeaveSession).toHaveBeenCalledOnce();
  });

  it("회의 중에는 마이크·카메라 토글이 보인다", () => {
    const media: PlaceMediaSnapshot = { ...IDLE_MEDIA, active: true, kind: "conference" };
    const { props } = renderBanner({ session: SESSION, media });
    fireEvent.click(screen.getByRole("button", { name: "마이크 켜기/끄기" }));
    expect(props.onToggleMicrophone).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "카메라 켜기/끄기" }));
    expect(props.onToggleCamera).toHaveBeenCalledOnce();
  });

  it("책상 모드에서는 화면 공유 버튼이 보인다", () => {
    const focusSession: PlaceModeSessionSnapshot = { ...SESSION, mode: "focus-desk" };
    const { props } = renderBanner({ session: focusSession });
    fireEvent.click(screen.getByRole("button", { name: "화면 공유 시작" }));
    expect(props.onStartScreenShare).toHaveBeenCalledOnce();
  });
});

describe("화이트보드 제안", () => {
  it("CTA 배너가 뜨고 열기를 누르면 포트가 호출된다", () => {
    const offer: PlaceModeEvent = { ...PROMPT, kind: "whiteboard-suggestion" };
    const { props } = renderBanner({ whiteboardOffer: offer });
    expect(screen.getByTestId("place-mode-whiteboard-offer")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "화이트보드 열기" }));
    expect(props.onOpenWhiteboard).toHaveBeenCalledOnce();
  });
});
