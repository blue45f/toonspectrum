import {
  AlertCircle,
  Check,
  Download,
  Eye,
  LoaderCircle,
  MessageCircle,
  MonitorUp,
  Radio,
  RefreshCw,
  ScreenShareOff,
  SendHorizontal,
  ShieldCheck,
  UserMinus,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";

import {
  useStudioLiveCollaboration,
  type StudioLiveAvailability,
  type StudioLiveRecoveryState,
} from "./studio-live-collaboration-context";
import { STUDIO_LIVE_CHAT_TEXT_MAX_LENGTH } from "./studio-live-collaboration-protocol";
import {
  formatStudioLiveLastAck,
  presentStudioLiveSyncSnapshot,
  type StudioLiveSyncSnapshot,
} from "./studio-live-sync-safety";
import {
  StudioScreenShareController,
  isStudioScreenShareSupported,
  studioScreenShareErrorMessage,
  type StudioRemoteScreenShare,
  type StudioScreenShareRequest,
  type StudioScreenShareState,
  type StudioScreenShareViewer,
} from "./studio-screen-share";

import type {
  StudioLiveChatMessage,
  StudioLivePeer,
} from "./studio-live-collaboration-room";
import type { StudioLiveTransportMode } from "./studio-live-collaboration-transport";
import type { StudioScreenIcePolicyMode } from "./studio-screen-ice-policy";
import type { StudioTeamRole } from "./studio-team-client";
import type { StudioVoiceIcePolicyLease } from "./studio-voice-ice-policy";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<StudioTeamRole, string> = {
  owner: "소유자",
  admin: "관리자",
  editor: "편집자",
  commenter: "검토자",
  viewer: "열람자",
};

const EMPTY_SCREEN_STATE: StudioScreenShareState = {
  localSharing: false,
  shares: [],
  watching: null,
  pendingRequests: [],
  viewers: [],
};

export interface StudioLiveCollaborationPanelViewProps {
  availability: StudioLiveAvailability;
  mode: StudioLiveTransportMode | null;
  peers: StudioLivePeer[];
  chatMessages: StudioLiveChatMessage[];
  canChat: boolean;
  chatDraft: string;
  chatNotice: string | null;
  screenState: StudioScreenShareState;
  screenSupported: boolean;
  screenReady: boolean;
  screenNetworkMode: StudioScreenIcePolicyMode | null;
  serverAvailable: boolean;
  localFallbackAllowed: boolean;
  usingLocalFallback: boolean;
  busyAction: string | null;
  error: string | null;
  syncSnapshot?: StudioLiveSyncSnapshot;
  recovery?: StudioLiveRecoveryState | null;
  videoRef?: Ref<HTMLVideoElement>;
  onChatDraftChange: (value: string) => void;
  onChatSubmit: () => void;
  onStartShare: () => void;
  onStopShare: () => void;
  onRetryServer: () => void;
  onUseLocalFallback: () => void;
  onExportRecovery: () => void;
  onReloadAuthoritative: () => void;
  onApproveRequest: (request: StudioScreenShareRequest) => void;
  onRejectRequest: (request: StudioScreenShareRequest) => void;
  onStopViewer: (viewer: StudioScreenShareViewer) => void;
  onWatchShare: (share: StudioRemoteScreenShare) => void;
  onStopWatching: () => void;
}

function tabInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase("ko-KR") ?? "?";
}

function statusCopy(availability: StudioLiveAvailability, mode: StudioLiveTransportMode | null) {
  if (availability === "idle") return "연결 대기";
  if (availability === "connecting") return "연결 준비 중";
  if (availability === "unsupported") return "브라우저 미지원";
  if (availability === "error") return "연결 오류";
  return mode === "server" ? "팀 서버 연결" : "같은 출처 탭 연결";
}

function syncStatusToneClass(
  tone: ReturnType<typeof presentStudioLiveSyncSnapshot>["tone"] | null,
  ready: boolean,
  availability: StudioLiveAvailability
): string {
  if (tone === "good") return "border-good/35 bg-good/10 text-good";
  if (tone === "bad") return "border-bad/40 bg-bad/10 text-bad";
  if (tone === "warn") return "border-warn/40 bg-warn/10 text-warn";
  if (tone === "cool") return "border-cool/35 bg-cool/10 text-cool";
  if (ready) return "border-good/35 bg-good/10 text-good";
  if (availability === "error") return "border-bad/35 bg-bad/10 text-bad";
  return "border-line bg-card text-fg-3";
}

function screenItemKey(kind: "approve" | "watch" | "item", sessionId: string, shareId: string) {
  return JSON.stringify([kind, sessionId, shareId]);
}

function chatTimeLabel(sentAt: number): string {
  const time = new Date(sentAt);
  if (!Number.isFinite(time.getTime())) return "";
  return time.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function screenNetworkSummary(
  supported: boolean,
  ready: boolean,
  mode: StudioScreenIcePolicyMode | null
): string {
  if (!supported) return "이 브라우저는 화면 공유를 지원하지 않음";
  if (!ready) return "보안 화면 중계 준비 중";
  if (mode === "turn") return "TURN 중계 · 원격 지원 · 영상만 · 오디오는 캡처하지 않음";
  if (mode === "stun") return "STUN 연결 · 영상만 · 오디오는 캡처하지 않음";
  return "직접 연결 · 영상만 · 오디오는 캡처하지 않음";
}

export function StudioLiveCollaborationPanelView({
  availability,
  mode,
  peers,
  chatMessages,
  canChat,
  chatDraft,
  chatNotice,
  screenState,
  screenSupported,
  screenReady,
  screenNetworkMode,
  serverAvailable,
  localFallbackAllowed,
  usingLocalFallback,
  busyAction,
  error,
  syncSnapshot,
  recovery,
  videoRef,
  onChatDraftChange,
  onChatSubmit,
  onStartShare,
  onStopShare,
  onRetryServer,
  onUseLocalFallback,
  onExportRecovery,
  onReloadAuthoritative,
  onApproveRequest,
  onRejectRequest,
  onStopViewer,
  onWatchShare,
  onStopWatching,
}: StudioLiveCollaborationPanelViewProps) {
  const ready = availability === "ready";
  const watching = screenState.watching;
  const chatLogRef = useRef<HTMLUListElement>(null);
  const chatDraftReady = chatDraft.trim().length > 0;
  const syncPresentation = syncSnapshot
    ? presentStudioLiveSyncSnapshot(syncSnapshot)
    : null;
  const syncStatusCopy = syncPresentation?.shortLabel ?? statusCopy(availability, mode);

  useEffect(() => {
    const log = chatLogRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
  }, [chatMessages]);

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onChatSubmit();
  }

  return (
    <section
      aria-labelledby="studio-live-collaboration-title"
      className="mx-4 mt-4 rounded-2xl border border-accent/30 bg-accent-soft/25 p-3.5 sm:mx-5"
      data-studio-live-mode={mode ?? "unavailable"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Radio size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-fg" id="studio-live-collaboration-title">
                같이 보기
              </h3>
              <p className="mt-0.5 text-xs text-fg-3">
                {mode === "server" ? "서버 팀 세션" : "로컬 탭 미리보기"}
              </p>
            </div>
          </div>
        </div>
        <span
          aria-atomic="true"
          aria-live={syncPresentation?.assertive ? "assertive" : "polite"}
          className={cn(
            "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[0.68rem] font-semibold",
            syncStatusToneClass(syncPresentation?.tone ?? null, ready, availability)
          )}
          role={syncPresentation?.assertive ? "alert" : "status"}
        >
          {availability === "connecting" ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" size={12} aria-hidden="true" />
          ) : (
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", ready ? "bg-good" : "bg-fg-3")}
            />
          )}
          {syncStatusCopy}
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-fg-2">
        {mode === "server"
          ? "로그인 세션과 작품 권한을 확인한 팀 연결입니다. 화면은 보기를 직접 요청한 피어에게만 전달됩니다."
          : "현재 작품을 이 브라우저의 같은 출처 탭에서 열면 접속 상태와 화면 공유를 시험할 수 있습니다. 인터넷 팀 접속으로 표시하지 않습니다."}
      </p>

      {syncSnapshot && syncPresentation ? (
        <div
          className="mt-3 border-y border-line/80 py-3"
          data-studio-sync-safety-detail={syncSnapshot.phase}
        >
          <div className="flex items-start gap-2">
            {syncPresentation.tone === "bad" ? (
              <AlertCircle className="mt-0.5 shrink-0 text-bad" size={15} aria-hidden />
            ) : (
              <ShieldCheck
                className={cn(
                  "mt-0.5 shrink-0",
                  syncPresentation.tone === "good" ? "text-good" : "text-accent"
                )}
                size={15}
                aria-hidden
              />
            )}
            <p className="text-xs leading-relaxed text-fg-2">{syncPresentation.detail}</p>
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[0.7rem] sm:grid-cols-3">
            <div className="flex min-w-0 items-center justify-between gap-2 sm:block">
              <dt className="text-fg-3">서버 경로</dt>
              <dd className="truncate font-semibold text-fg-2">
                {syncSnapshot.transportReady ? "연결됨" : "연결 대기"}
              </dd>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-2 sm:block">
              <dt className="text-fg-3">기기 복구 저장소</dt>
              <dd className="truncate font-semibold text-fg-2">
                {syncSnapshot.persistenceDurability === "durable"
                  ? "보호됨"
                  : syncSnapshot.persistenceDurability === "not-applicable"
                    ? "열람 전용"
                    : syncSnapshot.persistenceDurability === "checking"
                      ? "확인 중"
                      : "보호 안 됨"}
              </dd>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-2 sm:block">
              <dt className="text-fg-3">서버 승인</dt>
              <dd className="truncate font-semibold text-fg-2">
                {formatStudioLiveLastAck(syncSnapshot.lastAckAt)}
              </dd>
            </div>
          </dl>
          {syncSnapshot.pendingCount > 0 ? (
            <p className="mt-2 text-[0.7rem] font-semibold text-warn">
              아직 서버 승인을 기다리는 변경 {syncSnapshot.pendingCount.toLocaleString("ko-KR")}개
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div
          aria-live="assertive"
          className="mt-3 flex items-start gap-2 rounded-xl border border-bad/35 bg-bad/10 px-3 py-2.5 text-xs leading-relaxed text-fg"
          role="alert"
        >
          <AlertCircle className="mt-0.5 shrink-0 text-bad" size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {syncSnapshot?.phase === "recovery-required" && recovery ? (
        <div
          className="mt-3 rounded-xl border border-bad/40 bg-bad/10 p-3"
          data-studio-crdt-recovery-boundary="true"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 shrink-0 text-bad" size={16} aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg">거부된 로컬 변경을 먼저 보존해 주세요</p>
              <p className="mt-1 text-[0.72rem] leading-relaxed text-fg-2">
                서버 원고와 다른 변경 {recovery.updateCount.toLocaleString("ko-KR")}개를
                재전송 큐와 분리했습니다. 복구 JSON은 지원팀 또는 검증된 복구 도구가 분석할 수
                있는 원본 frontier를 포함하며, 현재 원고에 자동으로 다시 적용되지는 않습니다.
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              className="min-h-11"
              disabled={
                busyAction === "export-recovery" ||
                !recovery.exportAvailable
              }
              type="button"
              variant="outline"
              onClick={onExportRecovery}
            >
              {busyAction === "export-recovery" ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" size={15} aria-hidden />
              ) : (
                <Download size={15} aria-hidden />
              )}
              {recovery.exported ? "복구 파일 다시 내보내기" : "복구 파일 내보내기"}
            </Button>
            <Button
              className="min-h-11"
              disabled={!recovery.exported}
              title={
                recovery.exported
                  ? "현재 낙관적 화면을 버리고 서버 권위 원고를 새로 엽니다."
                  : "복구 파일을 먼저 내보내야 서버 원고를 다시 열 수 있습니다."
              }
              type="button"
              variant="quiet"
              onClick={onReloadAuthoritative}
            >
              <RefreshCw size={15} aria-hidden /> 서버 원고 다시 열기
            </Button>
          </div>
        </div>
      ) : null}

      {serverAvailable &&
      syncSnapshot?.phase !== "recovery-required" &&
      syncSnapshot?.phase !== "revoked" &&
      (usingLocalFallback || (availability === "error" && error && mode === "server")) ? (
        <div className="mt-3 rounded-xl border border-line bg-card/55 p-3">
          <p className="text-xs leading-relaxed text-fg-2">
            {usingLocalFallback
              ? "현재 같은 출처 로컬 탭 모드입니다. 서버가 복구되면 팀 세션을 다시 확인할 수 있습니다."
              : "서버 연결을 다시 시도하거나, 이 기기의 같은 출처 탭끼리만 사용하는 로컬 모드로 전환할 수 있습니다."}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button className="min-h-11" type="button" variant="outline" onClick={onRetryServer}>
              <Radio size={15} aria-hidden="true" /> 팀 서버 다시 연결
            </Button>
            {!usingLocalFallback ? (
              <Button
                className="min-h-11"
                disabled={!localFallbackAllowed}
                title={
                  localFallbackAllowed
                    ? undefined
                    : "권한 회수 또는 인증 실패 뒤에는 로컬 모드로 우회할 수 없습니다."
                }
                type="button"
                variant="quiet"
                onClick={onUseLocalFallback}
              >
                <UsersRound size={15} aria-hidden="true" /> 로컬 탭 모드
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-line bg-card/55 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <UsersRound className="shrink-0 text-accent" size={16} aria-hidden="true" />
            <p className="truncate text-xs font-semibold text-fg">
              {ready ? `나 포함 ${peers.length + 1}개 작업 탭` : "작업 탭 확인 대기"}
            </p>
          </div>
          {ready ? (
            <span className="text-[0.68rem] text-fg-3" aria-live="polite">
              다른 탭 {peers.length}개
            </span>
          ) : null}
        </div>
        {peers.length > 0 ? (
          <ul aria-label="연결된 다른 작업 탭" className="mt-2 flex flex-wrap gap-2">
            {peers.slice(0, 8).map((peer) => (
              <li
                className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-line bg-panel px-2 text-xs text-fg-2"
                key={peer.sessionId}
              >
                <span
                  aria-hidden="true"
                  className="grid size-5 shrink-0 place-items-center rounded-full bg-raised text-[0.62rem] font-bold"
                >
                  {tabInitial(peer.displayName)}
                </span>
                <span className="max-w-28 truncate">{peer.displayName}</span>
                <span className="text-fg-3">· {ROLE_LABEL[peer.role]}</span>
                <span
                  aria-label={peer.visibility === "active" ? "활성 탭" : "백그라운드 탭"}
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    peer.visibility === "active" ? "bg-good" : "bg-fg-3"
                  )}
                />
              </li>
            ))}
          </ul>
        ) : ready ? (
          <p className="mt-2 text-xs leading-relaxed text-fg-3">
            같은 작품을 다른 탭에서 열고 팀 패널의 같이 보기를 켜 보세요.
          </p>
        ) : null}
      </div>

      <div
        aria-labelledby="studio-live-chat-title"
        className="mt-3 rounded-xl border border-line bg-card/55 p-3"
        data-studio-live-chat
        role="group"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <MessageCircle className="shrink-0 text-accent" size={16} aria-hidden="true" />
            <h4 className="text-xs font-semibold text-fg" id="studio-live-chat-title">
              세션 채팅
            </h4>
          </div>
          <span className="text-[0.68rem] text-fg-3">기록에 저장되지 않음</span>
        </div>
        {chatMessages.length > 0 ? (
          <ul
            aria-label="세션 채팅 메시지"
            className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1"
            ref={chatLogRef}
            role="log"
          >
            {chatMessages.map((message) => (
              <li
                className={cn(
                  "rounded-lg border border-line px-2.5 py-1.5 text-xs leading-relaxed",
                  message.self ? "bg-accent-soft/40" : "bg-panel"
                )}
                key={message.id}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <strong className="min-w-0 truncate font-semibold text-fg">
                    {message.self ? "나" : message.participant.displayName}
                  </strong>
                  <time className="shrink-0 text-[0.62rem] text-fg-3">
                    {chatTimeLabel(message.sentAt)}
                  </time>
                </span>
                <span className="mt-0.5 block whitespace-pre-wrap break-words text-fg-2">
                  {message.text}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-fg-3">
            {ready
              ? "함께 작업 중인 팀에게 첫 메시지를 보내 보세요."
              : "연결이 준비되면 채팅을 시작할 수 있습니다."}
          </p>
        )}
        <form className="mt-2 flex items-center gap-2" onSubmit={handleChatSubmit}>
          <label className="sr-only" htmlFor="studio-live-chat-input">
            채팅 메시지
          </label>
          <input
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-xs text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            disabled={!ready || !canChat}
            id="studio-live-chat-input"
            maxLength={STUDIO_LIVE_CHAT_TEXT_MAX_LENGTH}
            placeholder={canChat ? "메시지 입력" : "열람자 권한은 채팅을 보낼 수 없습니다"}
            type="text"
            value={chatDraft}
            onChange={(event) => onChatDraftChange(event.target.value)}
          />
          <Button
            aria-label="채팅 메시지 보내기"
            className="min-h-11 shrink-0"
            disabled={!ready || !canChat || !chatDraftReady}
            size="sm"
            type="submit"
            variant="outline"
          >
            <SendHorizontal size={14} aria-hidden="true" /> 보내기
          </Button>
        </form>
        {chatNotice ? (
          <p aria-live="polite" className="mt-1.5 text-[0.68rem] text-bad" role="status">
            {chatNotice}
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {screenState.localSharing ? (
          <Button
            className="min-h-11"
            type="button"
            variant="outline"
            onClick={onStopShare}
          >
            <ScreenShareOff size={15} aria-hidden="true" /> 공유 중지
          </Button>
        ) : (
          <Button
            aria-busy={busyAction === "start-share"}
            className="min-h-11"
            disabled={!ready || !screenReady || !screenSupported || busyAction != null}
            type="button"
            onClick={onStartShare}
          >
            {busyAction === "start-share" ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" size={15} aria-hidden="true" />
            ) : (
              <MonitorUp size={15} aria-hidden="true" />
            )}
            화면 공유
          </Button>
        )}
        <div
          className="flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs leading-relaxed text-fg-3"
          data-studio-screen-network-mode={screenNetworkMode ?? "preparing"}
        >
          {screenNetworkSummary(screenSupported, screenReady, screenNetworkMode)}
        </div>
      </div>

      {screenState.pendingRequests.length > 0 ? (
        <div
          aria-labelledby="studio-screen-request-title"
          className="mt-3 rounded-xl border border-warn/35 bg-warn/10 p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold text-fg" id="studio-screen-request-title">
              시청 승인 대기
            </h4>
            <span
              aria-atomic="true"
              aria-live="polite"
              className="text-[0.68rem] font-semibold text-warn"
              role="status"
            >
              {screenState.pendingRequests.length}건
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            승인하기 전에는 화면 트랙이나 WebRTC 연결 제안을 만들지 않습니다.
          </p>
          <ul className="mt-2 space-y-2">
            {screenState.pendingRequests.map((request) => {
              const approveKey = screenItemKey(
                "approve",
                request.viewer.sessionId,
                request.shareId
              );
              return (
                <li
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2"
                  key={screenItemKey("item", request.viewer.sessionId, request.shareId)}
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
                    {request.viewer.displayName}
                  </span>
                  <Button
                    aria-label={`${request.viewer.displayName} 시청 요청 거절`}
                    className="min-h-11 shrink-0"
                    disabled={busyAction != null}
                    size="sm"
                    type="button"
                    variant="quiet"
                    onClick={() => onRejectRequest(request)}
                  >
                    <X size={14} aria-hidden="true" /> 거절
                  </Button>
                  <Button
                    aria-busy={busyAction === approveKey}
                    aria-label={`${request.viewer.displayName} 시청 요청 승인`}
                    className="min-h-11 shrink-0"
                    disabled={busyAction != null}
                    size="sm"
                    type="button"
                    onClick={() => onApproveRequest(request)}
                  >
                    {busyAction === approveKey ? (
                      <LoaderCircle
                        className="animate-spin motion-reduce:animate-none"
                        size={14}
                        aria-hidden="true"
                      />
                    ) : (
                      <Check size={14} aria-hidden="true" />
                    )}
                    승인
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {screenState.viewers.length > 0 ? (
        <div className="mt-3 rounded-xl border border-line bg-card/55 p-3">
          <h4 className="text-xs font-semibold text-fg">현재 시청자</h4>
          <ul aria-label="현재 화면 시청자" className="mt-2 space-y-2">
            {screenState.viewers.map((viewer) => (
              <li
                className="flex min-h-12 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2"
                key={screenItemKey("item", viewer.viewer.sessionId, viewer.shareId)}
              >
                <Eye className="shrink-0 text-accent" size={15} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs text-fg-2">
                  <strong className="font-semibold text-fg">{viewer.viewer.displayName}</strong>
                  {viewer.status === "live" ? " · 시청 중" : " · 연결 중"}
                </span>
                <Button
                  aria-label={`${viewer.viewer.displayName} 시청 종료`}
                  className="min-h-11 shrink-0"
                  disabled={busyAction != null}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => onStopViewer(viewer)}
                >
                  <UserMinus size={14} aria-hidden="true" /> 종료
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {screenState.shares.length > 0 ? (
        <div className="mt-3 space-y-2" aria-label="시청 가능한 공유 화면">
          {screenState.shares.map((share) => {
            const selected =
              watching?.host.sessionId === share.host.sessionId && watching.shareId === share.shareId;
            const actionKey = screenItemKey("watch", share.host.sessionId, share.shareId);
            return (
              <div
                className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-card px-2.5 py-2"
                key={screenItemKey("item", share.host.sessionId, share.shareId)}
              >
                <Eye className="shrink-0 text-accent" size={16} aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate text-xs text-fg-2">
                  <strong className="font-semibold text-fg">{share.host.displayName}</strong>
                  {` · ${share.label}`}
                </p>
                {selected ? (
                  <Button className="min-h-11 shrink-0" size="sm" type="button" variant="quiet" onClick={onStopWatching}>
                    보기 중지
                  </Button>
                ) : (
                  <Button
                    aria-label={`${share.host.displayName} 화면 보기`}
                    className="min-h-11 shrink-0"
                    disabled={!ready || !screenReady || busyAction != null}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => onWatchShare(share)}
                  >
                    {busyAction === actionKey ? (
                      <LoaderCircle className="animate-spin motion-reduce:animate-none" size={14} aria-hidden="true" />
                    ) : (
                      <Eye size={14} aria-hidden="true" />
                    )}
                    보기
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {watching ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-black/80">
          {watching.status === "live" && watching.stream ? (
            <video
              ref={videoRef}
              aria-label={`${watching.host.displayName} 공유 화면`}
              autoPlay
              className="aspect-video w-full bg-black object-contain"
              muted
              playsInline
            />
          ) : (
            <div
              aria-busy="true"
              aria-live="polite"
              className="grid aspect-video place-items-center text-center text-xs text-white/75"
              role="status"
            >
              <span>
                <LoaderCircle className="mx-auto mb-2 animate-spin motion-reduce:animate-none" size={20} aria-hidden="true" />
                {watching.status === "requesting" ? "시청 요청 보내는 중" : "P2P 영상 연결 중"}
              </span>
            </div>
          )}
        </div>
      ) : null}

      <details className="group mt-3 rounded-xl border border-line bg-card/45 px-3 py-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 [&::-webkit-details-marker]:hidden">
          <ShieldCheck className="text-accent" size={15} aria-hidden="true" />
          화면 공유 보안과 범위
        </summary>
        <ul className="space-y-1.5 border-t border-line pt-2 text-xs leading-relaxed text-fg-3">
          <li>공유 버튼을 누른 뒤 브라우저 선택기에서 허용한 탭·창·화면만 캡처합니다.</li>
          <li>상대의 보기 요청을 화면 공유자가 개별 승인한 뒤에만 WebRTC로 연결합니다.</li>
          <li>서버 팀 세션은 로그인 권한으로 단기 ICE 설정을 받고, TURN은 운영자가 명시한 경우에만 사용하며 브라우저에 영구 저장하지 않습니다.</li>
          <li>오디오는 요청하지 않으며, 패널을 닫으면 로컬 트랙과 모든 피어 연결을 정리합니다.</li>
          <li>SDP·ICE 신호는 메모리에서만 전달하고 문서·localStorage·활동 기록에 저장하지 않습니다.</li>
        </ul>
      </details>
    </section>
  );
}

export function StudioLiveCollaborationPanel() {
  const live = useStudioLiveCollaboration();
  const screenControllerRef = useRef<StudioScreenShareController | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [screenState, setScreenState] = useState<StudioScreenShareState>(EMPTY_SCREEN_STATE);
  const [screenReady, setScreenReady] = useState(false);
  const [screenNetworkMode, setScreenNetworkMode] =
    useState<StudioScreenIcePolicyMode | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatNotice, setChatNotice] = useState<string | null>(null);

  useEffect(() => {
    const room = live.room;
    let cancelled = false;
    let screenController: StudioScreenShareController | null = null;
    let icePolicyLease: StudioVoiceIcePolicyLease | null = null;
    let unsubscribeRoom: () => void = () => undefined;
    let unsubscribeScreen: () => void = () => undefined;
    let unsubscribeIcePolicy: () => void = () => undefined;
    const abortController = new AbortController();
    setBusyAction(null);
    setScreenState(EMPTY_SCREEN_STATE);
    setScreenReady(false);
    setScreenNetworkMode(null);
    setScreenError(null);
    setChatDraft("");
    setChatNotice(null);
    if (!room) return;

    const attachController = (
      lease: StudioVoiceIcePolicyLease | null
    ): StudioScreenShareController => {
      const controller = new StudioScreenShareController(
        room,
        lease ? { createPeerConnection: lease.createPeerConnection } : undefined
      );
      screenController = controller;
      screenControllerRef.current = controller;
      unsubscribeRoom = room.subscribe((event) => {
        if (cancelled || event.type !== "transport-status" || event.status.recoverable) return;
        // The room outlives this panel, but a terminal ACL revocation must still stop every capture
        // track and P2P connection immediately.
        controller.close();
        if (screenControllerRef.current === controller) screenControllerRef.current = null;
        setBusyAction(null);
        setScreenReady(false);
        setScreenState(EMPTY_SCREEN_STATE);
      });
      unsubscribeScreen = controller.subscribe((event) => {
        if (cancelled) return;
        if (event.type === "state") setScreenState(event.state);
        else setScreenError(event.message);
      });
      // The room can receive the server's active-share snapshot before this panel mounts. Hydrate
      // immediately after subscribing so the first paint cannot miss that retained announcement.
      setScreenState(controller.getState());
      setScreenNetworkMode(lease?.mode ?? "direct");
      setScreenReady(true);
      return controller;
    };

    if (live.mode !== "server") {
      attachController(null);
    } else {
      void import("./studio-screen-ice-policy")
        .then(({ acquireStudioScreenIcePolicyLease }) =>
          acquireStudioScreenIcePolicyLease(room.workId, {
            signal: abortController.signal,
            onRefreshError: (error, expired) => {
              if (cancelled) return;
              setScreenError(
                expired
                  ? "화면 공유 중계 자격이 만료되었습니다. 팀 세션을 다시 연결해 주세요."
                  : studioScreenShareErrorMessage(error)
              );
            },
          })
        )
        .then((lease) => {
          if (cancelled) {
            lease.close();
            return;
          }
          icePolicyLease = lease;
          attachController(lease);
          unsubscribeIcePolicy = lease.subscribeConfigurationChange(() => {
            if (cancelled) return;
            setScreenNetworkMode(lease.mode);
          });
        })
        .catch((error: unknown) => {
          if (cancelled || (error instanceof Error && error.name === "AbortError")) return;
          setScreenReady(false);
          setScreenError(studioScreenShareErrorMessage(error));
        });
    }

    return () => {
      cancelled = true;
      abortController.abort();
      unsubscribeIcePolicy();
      unsubscribeScreen();
      unsubscribeRoom();
      screenController?.close();
      icePolicyLease?.close();
      if (screenControllerRef.current === screenController) screenControllerRef.current = null;
    };
  }, [live.mode, live.room]);

  const remoteStream = screenState.watching?.stream ?? null;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = remoteStream;
    if (remoteStream) void video.play().catch(() => undefined);
    return () => {
      if (video.srcObject === remoteStream) video.srcObject = null;
    };
  }, [remoteStream]);

  async function handleStartShare() {
    const controller = screenControllerRef.current;
    if (!controller || busyAction) return;
    setBusyAction("start-share");
    setScreenError(null);
    try {
      await controller.startShare();
    } catch (shareError) {
      if (screenControllerRef.current === controller) {
        setScreenError(studioScreenShareErrorMessage(shareError));
      }
    } finally {
      if (screenControllerRef.current === controller) setBusyAction(null);
    }
  }

  function handleWatchShare(share: StudioRemoteScreenShare) {
    const controller = screenControllerRef.current;
    if (!controller || busyAction) return;
    const actionKey = screenItemKey("watch", share.host.sessionId, share.shareId);
    setBusyAction(actionKey);
    setScreenError(null);
    try {
      controller.watchShare(share.host.sessionId, share.shareId);
    } catch (watchError) {
      setScreenError(studioScreenShareErrorMessage(watchError));
    } finally {
      if (screenControllerRef.current === controller) setBusyAction(null);
    }
  }

  async function handleApproveRequest(request: StudioScreenShareRequest) {
    const controller = screenControllerRef.current;
    if (!controller || busyAction) return;
    const actionKey = screenItemKey("approve", request.viewer.sessionId, request.shareId);
    setBusyAction(actionKey);
    setScreenError(null);
    try {
      await controller.approveScreenRequest(request.viewer.sessionId, request.shareId);
    } catch (approvalError) {
      if (screenControllerRef.current === controller) {
        setScreenError(studioScreenShareErrorMessage(approvalError));
      }
    } finally {
      if (screenControllerRef.current === controller) setBusyAction(null);
    }
  }

  function handleRejectRequest(request: StudioScreenShareRequest) {
    const controller = screenControllerRef.current;
    if (!controller || busyAction) return;
    setScreenError(null);
    if (!controller.rejectScreenRequest(request.viewer.sessionId, request.shareId)) {
      setScreenError("시청 요청 거절을 전달하지 못했습니다. 연결 상태를 확인해 주세요.");
    }
  }

  function handleChatSubmit() {
    const text = chatDraft.trim();
    if (!text) return;
    if (live.sendChatMessage(text)) {
      setChatDraft("");
      setChatNotice(null);
      return;
    }
    setChatNotice("채팅 메시지를 보내지 못했습니다. 연결 상태를 확인해 주세요.");
  }

  function handleStopViewer(viewerState: StudioScreenShareViewer) {
    const controller = screenControllerRef.current;
    if (!controller || busyAction) return;
    setScreenError(null);
    if (!controller.stopViewer(viewerState.viewer.sessionId, viewerState.shareId)) {
      setScreenError("시청 종료 신호를 전달하지 못했습니다. 연결 상태를 확인해 주세요.");
    }
  }

  async function handleExportRecovery() {
    if (busyAction) return;
    setBusyAction("export-recovery");
    setScreenError(null);
    try {
      await live.exportRecovery();
    } catch (recoveryError) {
      setScreenError(
        recoveryError instanceof Error
          ? recoveryError.message
          : "공동 편집 복구 파일을 내보내지 못했습니다."
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <StudioLiveCollaborationPanelView
      availability={live.availability}
      busyAction={busyAction}
      canChat={live.canChat}
      chatDraft={chatDraft}
      chatMessages={live.chatMessages}
      chatNotice={chatNotice}
      error={screenError ?? live.error}
      syncSnapshot={live.sync}
      recovery={live.recovery}
      mode={live.mode}
      peers={live.peers}
      screenState={screenState}
      screenSupported={isStudioScreenShareSupported()}
      screenReady={screenReady}
      screenNetworkMode={screenNetworkMode}
      serverAvailable={live.serverAvailable}
      localFallbackAllowed={live.localFallbackAllowed}
      usingLocalFallback={live.usingLocalFallback}
      videoRef={videoRef}
      onApproveRequest={(request) => void handleApproveRequest(request)}
      onChatDraftChange={(value) => {
        setChatDraft(value);
        if (chatNotice) setChatNotice(null);
      }}
      onChatSubmit={handleChatSubmit}
      onRejectRequest={handleRejectRequest}
      onStartShare={() => void handleStartShare()}
      onStopShare={() => screenControllerRef.current?.stopShare()}
      onRetryServer={live.retryServer}
      onUseLocalFallback={live.useLocalFallback}
      onExportRecovery={() => void handleExportRecovery()}
      onReloadAuthoritative={live.reloadAuthoritative}
      onStopViewer={handleStopViewer}
      onStopWatching={() => screenControllerRef.current?.stopWatching()}
      onWatchShare={handleWatchShare}
    />
  );
}
