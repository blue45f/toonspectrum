import {
  AlertCircle,
  Headphones,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import { useEffect, type KeyboardEvent, type PointerEvent } from "react";

import type {
  StudioVoiceCallState,
  StudioVoiceRemoteState,
} from "./studio-voice-call-model";
import type { StudioVoiceIcePolicyMode } from "@/lib/studio-voice-ice-policy-contract";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StudioVoiceCallControlsProps {
  ready: boolean;
  supported: boolean;
  allowed: boolean;
  networkMode: StudioVoiceIcePolicyMode | null;
  state: StudioVoiceCallState;
  error: string | null;
  onJoin: (options?: { muted?: boolean }) => Promise<boolean>;
  onLeave: () => void;
  onMutedChange: (muted: boolean) => boolean;
  onPushToTalkChange: (enabled: boolean) => boolean;
  onPushToTalkPressedChange: (pressed: boolean) => boolean;
  onRetryRemoteAudio: (sessionId: string) => Promise<boolean>;
}

export interface StudioVoiceCallMiniDockProps
  extends Pick<
    StudioVoiceCallControlsProps,
    | "ready"
    | "supported"
    | "allowed"
    | "state"
    | "error"
    | "onJoin"
    | "onLeave"
    | "onMutedChange"
  > {
  onOpenDetails: () => void;
}

function voiceParticipantInitial(displayName: string): string {
  return Array.from(displayName.trim())[0]?.toLocaleUpperCase("ko-KR") ?? "?";
}

function voiceConnectionLabel(
  participant: StudioVoiceRemoteState,
  joined: boolean
): string {
  if (participant.autoplay === "blocked") return "재생 대기";
  if (participant.connection === "live") return participant.muted ? "음소거" : "연결됨";
  if (participant.connection === "connecting") return "연결 중";
  if (participant.connection === "capacity") return "인원 제한";
  if (participant.connection === "failed") return "연결 실패";
  return joined ? "연결 대기" : "허들 참여 중";
}

function voiceUnavailableCopy({
  ready,
  supported,
  allowed,
  terminalReason,
}: {
  ready: boolean;
  supported: boolean;
  allowed: boolean;
  terminalReason: StudioVoiceCallState["terminalReason"];
}): string | null {
  if (!supported) return "이 브라우저는 마이크 WebRTC를 지원하지 않습니다.";
  if (!allowed) return "열람자는 음성 작업실에 참여할 수 없습니다.";
  if (terminalReason === "revoked") return "작품 권한이 회수되어 음성 작업실이 종료되었습니다.";
  if (terminalReason === "error") return "연결 오류로 음성 작업실이 종료되었습니다.";
  if (terminalReason === "closed") return "현재 협업 세션이 종료되었습니다.";
  if (!ready) return "팀 작업실 연결이 준비되면 참여할 수 있습니다.";
  return null;
}

function voiceNetworkSummary(mode: StudioVoiceIcePolicyMode | null): string {
  if (mode === "turn") return "보호된 중계 연결 준비";
  if (mode === "stun") return "네트워크 경로 탐색 지원";
  if (mode === "direct") return "브라우저 직접 연결";
  return "참가 시 배포 연결 정책 확인";
}

function voiceNetworkPrivacyCopy(mode: StudioVoiceIcePolicyMode | null): string {
  if (mode === "turn") {
    return "직접 연결이 어려운 네트워크에서는 배포 환경이 소유한 중계 서버를 사용하며, 새 팀원 연결에 쓸 단기 자격 증명은 메모리에서 미리 갱신됩니다.";
  }
  if (mode === "stun") {
    return "네트워크 경로 탐색 서버는 사용하지만 중계 서버는 사용하지 않아 일부 제한된 회사망·통신사망에서는 연결되지 않을 수 있습니다.";
  }
  if (mode === "direct") {
    return "외부 중계 서버를 사용하지 않는 직접 연결 모드라 네트워크 환경에 따라 연결이 제한될 수 있습니다.";
  }
  return "참가할 때 현재 배포 환경의 직접·탐색·중계 연결 정책을 인증된 경로로 확인합니다.";
}

export function StudioVoiceCallMiniDock({
  ready,
  supported,
  allowed,
  state,
  error,
  onJoin,
  onLeave,
  onMutedChange,
  onOpenDetails,
}: StudioVoiceCallMiniDockProps) {
  if (!allowed) return null;
  const joined = state.phase === "joined";
  const joining = state.phase === "joining";
  const participantCount = state.participants.length + (joined ? 1 : 0);

  if (!joined) {
    return (
      <button
        type="button"
        data-studio-voice-mini="true"
        aria-label={joining ? "음성 작업실 참여 중" : "음성 작업실 참가"}
        aria-busy={joining}
        disabled={!ready || !supported || joining || state.phase === "ended"}
        className={cn(
          "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-[0.7rem] font-bold",
          "border-accent/40 bg-accent-soft text-accent transition-colors hover:border-accent/65 hover:bg-accent-soft/80",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:cursor-not-allowed disabled:border-line disabled:bg-card disabled:text-fg-3 disabled:opacity-60"
        )}
        onClick={() => {
          void onJoin().then((joinedCall) => {
            if (!joinedCall) onOpenDetails();
          });
        }}
      >
        {joining ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" size={14} aria-hidden />
        ) : (
          <Mic size={14} aria-hidden />
        )}
        <span className="hidden sm:inline">{joining ? "연결 중" : "음성 참가"}</span>
        {state.participants.length > 0 ? (
          <span className="tabular-nums">{state.participants.length}</span>
        ) : null}
        {error ? <AlertCircle size={13} aria-hidden /> : null}
      </button>
    );
  }

  return (
    <div
      data-studio-voice-mini="true"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-good/35 bg-good/10 p-0.5"
      role="group"
      aria-label={`음성 작업실 ${participantCount}명 참여 중${error ? ", 연결 경고 있음" : ""}`}
    >
      <button
        type="button"
        aria-label="수동 마이크 음소거"
        aria-pressed={state.manualMuted}
        title={state.pushToTalkEnabled && !state.manualMuted ? "눌러 말하기 대기 중" : undefined}
        className={cn(
          "grid size-11 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          state.localMuted ? "bg-warn/15 text-warn" : "bg-good/15 text-good"
        )}
        onClick={() => onMutedChange(!state.manualMuted)}
      >
        {state.localMuted ? <MicOff size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
      </button>
      <button
        type="button"
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-[0.68rem] font-bold hover:bg-raised",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          error ? "text-bad" : "text-fg-2"
        )}
        onClick={onOpenDetails}
        aria-label={`음성 작업실 세부 정보 열기, ${participantCount}명 참여 중${
          error ? `, 경고: ${error}` : ""
        }`}
        title={error ?? undefined}
      >
        {error ? <AlertCircle size={14} aria-hidden /> : <Headphones size={14} aria-hidden />}
        <span className="tabular-nums">{participantCount}</span>
      </button>
      <button
        type="button"
        aria-label="음성 작업실 나가기"
        className="grid size-11 place-items-center rounded-full text-bad transition-colors hover:bg-bad/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-bad"
        onClick={onLeave}
      >
        <PhoneOff size={15} aria-hidden />
      </button>
    </div>
  );
}

export function StudioVoiceCallPanelSection({
  ready,
  supported,
  allowed,
  networkMode,
  state,
  error,
  onJoin,
  onLeave,
  onMutedChange,
  onPushToTalkChange,
  onPushToTalkPressedChange,
  onRetryRemoteAudio,
}: StudioVoiceCallControlsProps) {
  const joined = state.phase === "joined";
  const joining = state.phase === "joining";
  const unavailable = voiceUnavailableCopy({
    ready,
    supported,
    allowed,
    terminalReason: state.phase === "ended" ? state.terminalReason ?? "closed" : null,
  });
  const participantCount = state.participants.length + (joined ? 1 : 0);
  const pushToTalkTransmitting =
    state.pushToTalkPressed && !state.manualMuted && !state.localMuted;

  useEffect(() => {
    if (!joined || !state.pushToTalkEnabled) return;
    const release = () => onPushToTalkPressedChange(false);
    const releaseWhenHidden = () => {
      if (document.visibilityState === "hidden") release();
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", releaseWhenHidden);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", releaseWhenHidden);
      release();
    };
  }, [joined, onPushToTalkPressedChange, state.pushToTalkEnabled]);

  function setPushToTalkPressed(pressed: boolean) {
    if (!state.pushToTalkEnabled) return;
    onPushToTalkPressedChange(pressed);
  }

  function handlePushToTalkKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    if (event.repeat) return;
    event.preventDefault();
    setPushToTalkPressed(true);
  }

  function handlePushToTalkKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    setPushToTalkPressed(false);
  }

  function releasePushToTalk(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPushToTalkPressed(false);
  }

  return (
    <section
      aria-labelledby="studio-voice-call-title"
      className="mt-3 rounded-xl border border-accent/30 bg-card/55 p-3"
      data-studio-voice-call="true"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl",
            joined ? "bg-good/15 text-good" : "bg-accent-soft text-accent"
          )}
        >
          {joined ? <Radio size={17} aria-hidden /> : <Headphones size={17} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-xs font-bold text-fg" id="studio-voice-call-title">
              음성 작업실
            </h3>
            <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.62rem] font-semibold tabular-nums text-fg-3">
              {participantCount}/6명
            </span>
          </div>
          <span className="mt-0.5 block text-[0.7rem] leading-relaxed text-fg-3">
            오디오 전용 P2P · {voiceNetworkSummary(networkMode)} · 녹음·문서·DB·로컬 저장소에 보존하지 않음
          </span>
        </div>
      </div>

      {!joined ? (
        <div className="mt-3">
          <Button
            aria-busy={joining}
            className="min-h-11 w-full"
            disabled={unavailable !== null || joining}
            type="button"
            onClick={() => void onJoin()}
          >
            {joining ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" size={15} aria-hidden />
            ) : (
              <Mic size={15} aria-hidden />
            )}
            {joining ? "마이크 연결 중" : "음성 참가"}
          </Button>
          {unavailable ? (
            <p className="mt-2 text-xs leading-relaxed text-fg-3">{unavailable}</p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-fg-3">
              버튼을 누른 뒤에만 브라우저가 마이크 권한을 요청합니다.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button
              aria-label="수동 마이크 음소거"
              aria-pressed={state.manualMuted}
              className="min-h-11"
              type="button"
              variant={state.manualMuted ? "outline" : "quiet"}
              onClick={() => onMutedChange(!state.manualMuted)}
            >
              {state.localMuted ? <MicOff size={15} aria-hidden /> : <Mic size={15} aria-hidden />}
              {state.manualMuted ? "마이크 켜기" : "음소거"}
            </Button>
            <Button
              aria-pressed={state.pushToTalkEnabled}
              className="min-h-11"
              type="button"
              variant={state.pushToTalkEnabled ? "outline" : "quiet"}
              onClick={() => onPushToTalkChange(!state.pushToTalkEnabled)}
            >
              <Radio size={15} aria-hidden /> 눌러 말하기
            </Button>
            <Button
              className="col-span-2 min-h-11 text-bad sm:col-span-1"
              type="button"
              variant="quiet"
              onClick={onLeave}
            >
              <PhoneOff size={15} aria-hidden /> 나가기
            </Button>
          </div>

          {state.pushToTalkEnabled ? (
            <>
              <button
                type="button"
                aria-describedby={state.manualMuted ? "studio-voice-ptt-hint" : undefined}
                aria-label={
                  state.manualMuted
                    ? "마이크를 켠 뒤 누르고 있는 동안 말하기"
                    : "누르고 있는 동안 말하기"
                }
                aria-pressed={pushToTalkTransmitting}
                disabled={state.manualMuted}
                className={cn(
                  "mt-2 inline-flex min-h-12 w-full touch-none select-none items-center justify-center gap-2 rounded-xl border text-xs font-bold",
                  "transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60",
                  pushToTalkTransmitting
                    ? "border-good/50 bg-good/15 text-good"
                    : "border-accent/35 bg-accent-soft/45 text-accent"
                )}
                onPointerDown={(event) => {
                  if (!event.isPrimary || event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setPushToTalkPressed(true);
                }}
                onPointerUp={releasePushToTalk}
                onPointerCancel={releasePushToTalk}
                onLostPointerCapture={() => setPushToTalkPressed(false)}
                onKeyDown={handlePushToTalkKeyDown}
                onKeyUp={handlePushToTalkKeyUp}
                onBlur={() => setPushToTalkPressed(false)}
              >
                {pushToTalkTransmitting ? (
                  <Volume2 size={16} aria-hidden />
                ) : (
                  <MicOff size={16} aria-hidden />
                )}
                {state.manualMuted
                  ? "먼저 마이크를 켜 주세요"
                  : pushToTalkTransmitting
                    ? "말하는 중"
                    : "누르고 있는 동안 말하기"}
              </button>
              {state.manualMuted ? (
                <p
                  className="mt-1.5 text-[0.68rem] leading-relaxed text-fg-3"
                  id="studio-voice-ptt-hint"
                >
                  위의 마이크 버튼을 켜도 누르고 있는 동안에만 송출됩니다.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}

      {state.participants.length > 0 ? (
        <ul aria-label="음성 작업실 참여자" className="mt-3 space-y-1.5">
          {state.participants.map((remote) => (
            <li
              key={remote.participant.sessionId}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel/75 px-2.5 py-1.5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-black text-accent">
                {voiceParticipantInitial(remote.participant.displayName)}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs font-semibold text-fg">
                  {remote.participant.displayName}
                </strong>
                <span className="text-[0.66rem] text-fg-3">
                  {voiceConnectionLabel(remote, joined)}
                </span>
              </span>
              {remote.muted ? <MicOff size={14} className="shrink-0 text-fg-3" aria-label="음소거" /> : null}
              {remote.autoplay === "blocked" ? (
                <Button
                  className="min-h-11 shrink-0"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void onRetryRemoteAudio(remote.participant.sessionId)}
                >
                  <Volume2 size={14} aria-hidden /> 재생
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : joined ? (
        <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-fg-3">
          다른 팀원이 참여하면 여기에 연결 상태가 표시됩니다.
        </p>
      ) : null}

      {error ? (
        <p
          aria-live="polite"
          className="mt-2 flex items-start gap-1.5 rounded-lg border border-bad/35 bg-bad/10 px-2.5 py-2 text-xs leading-relaxed text-bad"
          role="status"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={14} aria-hidden />
          {error}
        </p>
      ) : null}

      <details className="group mt-2 rounded-lg border border-line bg-panel/55 px-2.5 py-1.5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="text-accent" size={14} aria-hidden /> 음성 개인정보와 연결 범위
        </summary>
        <ul className="space-y-1 border-t border-line pt-2 text-xs leading-relaxed text-fg-3">
          <li>명시적으로 참가할 때만 마이크를 요청하며 영상 권한은 요청하지 않습니다.</li>
          <li>최대 6명이 브라우저 간 P2P mesh로 연결되며 원시 오디오를 기록하지 않습니다.</li>
          <li>직접 연결을 위해 같은 음성실 팀원끼리 기기의 공개·로컬 네트워크 주소 정보를 교환할 수 있습니다.</li>
          <li>{voiceNetworkPrivacyCopy(networkMode)}</li>
          <li>나가기·작품 이동·권한 회수·연결 종료 시 모든 트랙과 피어를 즉시 정리합니다.</li>
          <li>연결 설정과 네트워크 주소 정보는 메모리에서만 전달하고 작품 데이터나 활동 기록에 남기지 않습니다.</li>
        </ul>
      </details>
    </section>
  );
}
