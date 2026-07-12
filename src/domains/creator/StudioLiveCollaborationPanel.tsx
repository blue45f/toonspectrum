import {
  AlertCircle,
  Check,
  Eye,
  LoaderCircle,
  MonitorUp,
  Radio,
  ScreenShareOff,
  ShieldCheck,
  UserMinus,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";

import {
  useStudioLiveCollaboration,
  type StudioLiveAvailability,
} from "./studio-live-collaboration-context";
import {
  StudioScreenShareController,
  isStudioScreenShareSupported,
  studioScreenShareErrorMessage,
  type StudioRemoteScreenShare,
  type StudioScreenShareRequest,
  type StudioScreenShareState,
  type StudioScreenShareViewer,
} from "./studio-screen-share";

import type { StudioLivePeer } from "./studio-live-collaboration-room";
import type { StudioLiveTransportMode } from "./studio-live-collaboration-transport";
import type { StudioTeamRole } from "./studio-team-client";

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
  screenState: StudioScreenShareState;
  screenSupported: boolean;
  serverAvailable: boolean;
  localFallbackAllowed: boolean;
  usingLocalFallback: boolean;
  busyAction: string | null;
  error: string | null;
  videoRef?: Ref<HTMLVideoElement>;
  onStartShare: () => void;
  onStopShare: () => void;
  onRetryServer: () => void;
  onUseLocalFallback: () => void;
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

function screenItemKey(kind: "approve" | "watch" | "item", sessionId: string, shareId: string) {
  return JSON.stringify([kind, sessionId, shareId]);
}

export function StudioLiveCollaborationPanelView({
  availability,
  mode,
  peers,
  screenState,
  screenSupported,
  serverAvailable,
  localFallbackAllowed,
  usingLocalFallback,
  busyAction,
  error,
  videoRef,
  onStartShare,
  onStopShare,
  onRetryServer,
  onUseLocalFallback,
  onApproveRequest,
  onRejectRequest,
  onStopViewer,
  onWatchShare,
  onStopWatching,
}: StudioLiveCollaborationPanelViewProps) {
  const ready = availability === "ready";
  const watching = screenState.watching;

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
          aria-live="polite"
          className={cn(
            "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[0.68rem] font-semibold",
            ready
              ? "border-good/35 bg-good/10 text-good"
              : availability === "error"
                ? "border-bad/35 bg-bad/10 text-bad"
                : "border-line bg-card text-fg-3"
          )}
          role="status"
        >
          {availability === "connecting" ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" size={12} aria-hidden="true" />
          ) : (
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", ready ? "bg-good" : "bg-fg-3")}
            />
          )}
          {statusCopy(availability, mode)}
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-fg-2">
        {mode === "server"
          ? "로그인 세션과 작품 권한을 확인한 팀 연결입니다. 화면은 보기를 직접 요청한 피어에게만 전달됩니다."
          : "현재 작품을 이 브라우저의 같은 출처 탭에서 열면 접속 상태와 화면 공유를 시험할 수 있습니다. 인터넷 팀 접속으로 표시하지 않습니다."}
      </p>

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

      {serverAvailable &&
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
            disabled={!ready || !screenSupported || busyAction != null}
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
        <div className="flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs leading-relaxed text-fg-3">
          {screenSupported ? "영상만 · 오디오는 캡처하지 않음" : "이 브라우저는 화면 공유를 지원하지 않음"}
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
                    disabled={!ready || busyAction != null}
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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);

  useEffect(() => {
    const room = live.room;
    let cancelled = false;
    setBusyAction(null);
    setScreenState(EMPTY_SCREEN_STATE);
    setScreenError(null);
    if (!room) return;

    const screenController = new StudioScreenShareController(room);
    screenControllerRef.current = screenController;

    const unsubscribeRoom = room.subscribe((event) => {
      if (cancelled || event.type !== "transport-status" || event.status.recoverable) return;
      // The room outlives this panel, but a terminal ACL revocation must still stop every capture
      // track and P2P connection immediately.
      screenController.close();
      if (screenControllerRef.current === screenController) screenControllerRef.current = null;
      setBusyAction(null);
      setScreenState(EMPTY_SCREEN_STATE);
    });
    const unsubscribeScreen = screenController.subscribe((event) => {
      if (cancelled) return;
      if (event.type === "state") setScreenState(event.state);
      else setScreenError(event.message);
    });

    return () => {
      cancelled = true;
      unsubscribeScreen();
      unsubscribeRoom();
      screenController.close();
      if (screenControllerRef.current === screenController) screenControllerRef.current = null;
    };
  }, [live.room]);

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

  function handleStopViewer(viewerState: StudioScreenShareViewer) {
    const controller = screenControllerRef.current;
    if (!controller || busyAction) return;
    setScreenError(null);
    if (!controller.stopViewer(viewerState.viewer.sessionId, viewerState.shareId)) {
      setScreenError("시청 종료 신호를 전달하지 못했습니다. 연결 상태를 확인해 주세요.");
    }
  }

  return (
    <StudioLiveCollaborationPanelView
      availability={live.availability}
      busyAction={busyAction}
      error={screenError ?? live.error}
      mode={live.mode}
      peers={live.peers}
      screenState={screenState}
      screenSupported={isStudioScreenShareSupported()}
      serverAvailable={live.serverAvailable}
      localFallbackAllowed={live.localFallbackAllowed}
      usingLocalFallback={live.usingLocalFallback}
      videoRef={videoRef}
      onApproveRequest={(request) => void handleApproveRequest(request)}
      onRejectRequest={handleRejectRequest}
      onStartShare={() => void handleStartShare()}
      onStopShare={() => screenControllerRef.current?.stopShare()}
      onRetryServer={live.retryServer}
      onUseLocalFallback={live.useLocalFallback}
      onStopViewer={handleStopViewer}
      onStopWatching={() => screenControllerRef.current?.stopWatching()}
      onWatchShare={handleWatchShare}
    />
  );
}
