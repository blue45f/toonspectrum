import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  STUDIO_LIVE_DISPLAY_NAME_MAX_LENGTH,
  createStudioLiveEnvelope,
  studioLiveDisplayName,
} from "./studio-live-collaboration-protocol";
import {
  StudioLiveCollaborationPanelView,
  type StudioLiveCollaborationPanelViewProps,
} from "./StudioLiveCollaborationPanel";

import type { StudioLivePeer } from "./studio-live-collaboration-room";
import type { StudioScreenShareState } from "./studio-screen-share";

const noop = () => undefined;

const peer: StudioLivePeer = {
  sessionId: "private-session-id",
  displayName: "민호 · 이 탭",
  role: "editor",
  visibility: "active",
  pageId: "private-page-id",
  lastSeenAt: 1_000_000,
};

function screenState(overrides: Partial<StudioScreenShareState> = {}): StudioScreenShareState {
  return {
    localSharing: false,
    shares: [],
    watching: null,
    pendingRequests: [],
    viewers: [],
    ...overrides,
  };
}

function renderView(overrides: Partial<StudioLiveCollaborationPanelViewProps> = {}) {
  const props: StudioLiveCollaborationPanelViewProps = {
    availability: "ready",
    mode: "local",
    peers: [],
    screenState: screenState(),
    screenSupported: true,
    busyAction: null,
    error: null,
    onApproveRequest: noop,
    onRejectRequest: noop,
    onStartShare: noop,
    onStopShare: noop,
    onStopViewer: noop,
    onWatchShare: noop,
    onStopWatching: noop,
    ...overrides,
  };
  return renderToStaticMarkup(<StudioLiveCollaborationPanelView {...props} />);
}

describe("StudioLiveCollaborationPanelView", () => {
  it("sanitizes the 120-character team-name contract into a valid local protocol name", () => {
    const displayName = studioLiveDisplayName(
      `${"긴이름".repeat(40)}\n\t\u0085${"🙂".repeat(20)}`,
      { suffix: "· 이 탭", fallback: "내 작업" }
    );

    expect(displayName).toHaveLength(STUDIO_LIVE_DISPLAY_NAME_MAX_LENGTH);
    expect(displayName).toMatch(/ · 이 탭$/u);
    expect(
      Array.from(displayName).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
      })
    ).toBe(false);
    expect(() =>
      createStudioLiveEnvelope({
        workId: "work-1",
        sender: { sessionId: "session-1", displayName, role: "owner" },
        sentAt: 1_000_000,
        sequence: 1,
        kind: "presence:hello",
        payload: { visibility: "active", pageId: null },
      })
    ).not.toThrow();
    expect(
      studioLiveDisplayName("\n\t\u0085", { suffix: "· 이 탭", fallback: "내 작업" })
    ).toBe("내 작업 · 이 탭");
  });

  it("truthfully labels BroadcastChannel as same-origin local tabs rather than internet presence", () => {
    const html = renderView();

    expect(html).toContain('data-studio-live-mode="local"');
    expect(html).toContain("로컬 탭 미리보기");
    expect(html).toContain("같은 출처 탭 연결");
    expect(html).toContain("이 브라우저의 같은 출처 탭");
    expect(html).toContain("인터넷 팀 접속으로 표시하지 않습니다");
  });

  it("renders an injected authenticated server transport as a separate mode", () => {
    const html = renderView({ mode: "server" });

    expect(html).toContain('data-studio-live-mode="server"');
    expect(html).toContain("서버 팀 세션");
    expect(html).toContain("팀 서버 연결");
    expect(html).toContain("로그인 세션과 작품 권한을 확인한 팀 연결");
    expect(html).not.toContain("로컬 탭 미리보기");
  });

  it("shows ephemeral tab names and roles without rendering session, page or database ids", () => {
    const html = renderView({ peers: [peer] });

    expect(html).toContain("나 포함 2개 작업 탭");
    expect(html).toContain("다른 탭 1개");
    expect(html).toContain("민호 · 이 탭");
    expect(html).toContain("편집자");
    expect(html).toContain('aria-label="활성 탭"');
    expect(html).not.toContain(peer.sessionId);
    expect(html).not.toContain(peer.pageId);
    expect(html).not.toContain("userId");
  });

  it("provides 44px capture controls, video-only disclosure and unsupported state", () => {
    const ready = renderView();
    expect(ready).toContain("화면 공유");
    expect(ready).toContain("min-h-11");
    expect(ready).toContain("영상만 · 오디오는 캡처하지 않음");

    const unsupported = renderView({
      availability: "unsupported",
      mode: null,
      screenSupported: false,
    });
    expect(unsupported).toContain("브라우저 미지원");
    expect(unsupported).toContain("이 브라우저는 화면 공유를 지원하지 않음");
    expect(unsupported).toContain("disabled");
  });

  it("renders host approval and current-viewer termination controls without leaking ids", () => {
    const request = { viewer: peer, shareId: "private-share-id" };
    const html = renderView({
      screenState: screenState({
        localSharing: true,
        pendingRequests: [request],
        viewers: [{ ...request, status: "live" }],
      }),
    });

    expect(html).toContain("시청 승인 대기");
    expect(html).toContain("승인하기 전에는 화면 트랙이나 WebRTC 연결 제안을 만들지 않습니다");
    expect(html).toContain('aria-label="민호 · 이 탭 시청 요청 승인"');
    expect(html).toContain('aria-label="민호 · 이 탭 시청 요청 거절"');
    expect(html).toContain("현재 시청자");
    expect(html).toContain('aria-label="민호 · 이 탭 시청 종료"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain(peer.sessionId);
    expect(html).not.toContain(request.shareId);
  });

  it("requires an explicit 보기 action before rendering a requested or live remote screen", () => {
    const share = {
      host: {
        sessionId: "host-session-private",
        displayName: "서윤 · 이 탭",
        role: "owner" as const,
      },
      shareId: "share-id-private",
      label: "작업 화면",
    };
    const available = renderView({ screenState: screenState({ shares: [share] }) });
    expect(available).toContain('aria-label="서윤 · 이 탭 화면 보기"');
    expect(available).toContain("보기");
    expect(available).not.toContain(share.host.sessionId);
    expect(available).not.toContain(share.shareId);

    const requesting = renderView({
      screenState: screenState({
        shares: [share],
        watching: { ...share, host: share.host, status: "requesting", stream: null },
      }),
    });
    expect(requesting).toContain("시청 요청 보내는 중");
    expect(requesting).toContain("보기 중지");

    const live = renderView({
      screenState: screenState({
        shares: [share],
        watching: { ...share, host: share.host, status: "live", stream: {} as MediaStream },
      }),
    });
    expect(live).toContain("<video");
    expect(live).toContain('aria-label="서윤 · 이 탭 공유 화면"');
    expect(live).toContain('playsInline=""');
  });

  it("discloses consent, no-audio, memory-only signaling and deterministic cleanup", () => {
    const html = renderView({ error: "화면 공유 권한이 허용되지 않았습니다." });

    expect(html).toContain('role="alert"');
    expect(html).toContain("화면 공유 권한이 허용되지 않았습니다");
    expect(html).toContain("브라우저 선택기에서 허용한 탭·창·화면만 캡처");
    expect(html).toContain("보기 요청을 화면 공유자가 개별 승인한 뒤에만 WebRTC");
    expect(html).toContain("오디오는 요청하지 않으며");
    expect(html).toContain("패널을 닫으면 로컬 트랙과 모든 피어 연결을 정리");
    expect(html).toContain("SDP·ICE 신호는 메모리에서만 전달");
  });
});
