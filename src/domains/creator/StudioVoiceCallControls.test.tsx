import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createEmptyStudioVoiceCallState } from "./studio-voice-call-model";
import {
  StudioVoiceCallMiniDock,
  StudioVoiceCallPanelSection,
} from "./StudioVoiceCallControls";

const baseActions = {
  onJoin: vi.fn(async () => true),
  onLeave: vi.fn(),
  onMutedChange: vi.fn(() => true),
  onPushToTalkChange: vi.fn(() => true),
  onPushToTalkPressedChange: vi.fn(() => true),
  onRetryRemoteAudio: vi.fn(async () => true),
};

const controlsSource = readFileSync(
  new URL("./StudioVoiceCallControls.tsx", import.meta.url),
  "utf8"
);

describe("StudioVoiceCallControls", () => {
  it("asks for an explicit user action before describing microphone capture", () => {
    const html = renderToStaticMarkup(
      <StudioVoiceCallPanelSection
        ready
        supported
        allowed
        state={createEmptyStudioVoiceCallState()}
        error={null}
        {...baseActions}
      />
    );

    expect(html).toContain('data-studio-voice-call="true"');
    expect(html).toContain("음성 참가");
    expect(html).toContain("버튼을 누른 뒤에만 브라우저가 마이크 권한을 요청");
    expect(html).toContain("녹음·문서·DB·로컬 저장소에 보존하지 않음");
    expect(html).toContain("min-h-11");
  });

  it("renders joined mute, push-to-talk, leave and blocked-autoplay recovery without leaking ids", () => {
    const privateSessionId = "private-voice-session-never-render";
    const privateCallId = "private-huddle-id-never-render";
    const state = {
      ...createEmptyStudioVoiceCallState(),
      phase: "joined" as const,
      callId: privateCallId,
      localMuted: true,
      manualMuted: true,
      pushToTalkEnabled: true,
      pushToTalkPressed: true,
      participants: [
        {
          participant: {
            sessionId: privateSessionId,
            displayName: "서윤 · 이 탭",
            role: "editor" as const,
          },
          callId: privateCallId,
          muted: false,
          connection: "live" as const,
          autoplay: "blocked" as const,
          stream: {} as MediaStream,
        },
      ],
    };
    const html = renderToStaticMarkup(
      <StudioVoiceCallPanelSection
        ready
        supported
        allowed
        state={state}
        error="브라우저가 원격 오디오 자동 재생을 막았습니다."
        {...baseActions}
      />
    );

    expect(html).toContain("마이크 켜기");
    expect(html).toContain("눌러 말하기");
    expect(html).toContain("누르고 있는 동안 말하기");
    expect(html).toContain("나가기");
    expect(html).toContain("서윤 · 이 탭");
    expect(html).toContain("재생 대기");
    expect(html).toMatch(/>\s*재생<\/button>/);
    expect(html).toContain("마이크를 켠 뒤 누르고 있는 동안 말하기");
    expect(html).toContain("먼저 마이크를 켜 주세요");
    expect(html).not.toContain(">말하는 중<");
    expect(html).toContain("최대 6명이 브라우저 간 P2P mesh");
    expect(html).toContain("공개·로컬 네트워크 주소 정보");
    expect(html).not.toContain("ICE 네트워크 후보");
    expect(html).not.toContain(privateSessionId);
    expect(html).not.toContain(privateCallId);
  });

  it("fails closed for unsupported and viewer contexts", () => {
    const unsupported = renderToStaticMarkup(
      <StudioVoiceCallPanelSection
        ready
        supported={false}
        allowed
        state={createEmptyStudioVoiceCallState()}
        error={null}
        {...baseActions}
      />
    );
    expect(unsupported).toContain("이 브라우저는 마이크 WebRTC를 지원하지 않습니다");
    expect(unsupported).toContain("disabled");

    const viewer = renderToStaticMarkup(
      <StudioVoiceCallPanelSection
        ready
        supported
        allowed={false}
        state={createEmptyStudioVoiceCallState()}
        error={null}
        {...baseActions}
      />
    );
    expect(viewer).toContain("열람자는 음성 작업실에 참여할 수 없습니다");
    expect(viewer).toContain("disabled");
  });

  it("keeps an accessible compact call surface in the always-on presence dock", () => {
    const idle = renderToStaticMarkup(
      <StudioVoiceCallMiniDock
        ready
        supported
        allowed
        state={{ ...createEmptyStudioVoiceCallState(), participants: [] }}
        error={null}
        onJoin={baseActions.onJoin}
        onLeave={baseActions.onLeave}
        onMutedChange={baseActions.onMutedChange}
        onOpenDetails={vi.fn()}
      />
    );
    expect(idle).toContain('data-studio-voice-mini="true"');
    expect(idle).toContain('aria-label="음성 작업실 참가"');
    expect(idle).toContain("min-h-11");
    expect(idle).toContain("min-w-11");

    const joined = renderToStaticMarkup(
      <StudioVoiceCallMiniDock
        ready
        supported
        allowed
        state={{ ...createEmptyStudioVoiceCallState(), phase: "joined", callId: "private-mini-call-id" }}
        error="원격 오디오 연결을 확인해 주세요."
        onJoin={baseActions.onJoin}
        onLeave={baseActions.onLeave}
        onMutedChange={baseActions.onMutedChange}
        onOpenDetails={vi.fn()}
      />
    );
    expect(joined).toContain("음성 작업실 1명 참여 중, 연결 경고 있음");
    expect(joined).toContain("음성 작업실 세부 정보 열기, 1명 참여 중, 경고:");
    expect(joined).toContain("원격 오디오 연결을 확인해 주세요.");
    expect(joined).toContain('aria-label="음성 작업실 나가기"');
    expect(joined).toContain("min-w-11");
    expect(joined).not.toContain("private-mini-call-id");
  });

  it("fails push-to-talk closed when the pointer, window, tab, or panel lifecycle is lost", () => {
    expect(controlsSource).toContain('window.addEventListener("blur", release)');
    expect(controlsSource).toContain(
      'document.addEventListener("visibilitychange", releaseWhenHidden)'
    );
    expect(controlsSource).toContain("onLostPointerCapture={() => setPushToTalkPressed(false)}");
    expect(controlsSource).toContain("if (!event.isPrimary || event.button !== 0) return");
    expect(controlsSource).toMatch(/return \(\) => \{[\s\S]*?release\(\);[\s\S]*?\};/u);
  });
});
