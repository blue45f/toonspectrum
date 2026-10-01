/**
 * 장소 기반 업무 모드 React 바인딩 (Track 6).
 *
 * PlaceModeDirector(순수 상태머신)를 React에 묶는다.
 * - position이 바뀔 때마다 + 250ms 폴링으로 director.update()를 펌프한다
 *   (가만히 서 있어도 진입·이탈 디바운스가 진행되도록).
 * - session-started: presence 자동 상태 반영 + 미디어 세션 참여.
 * - session-ended: 이전 상태 복원 + 미디어 정리 (마이크 off).
 * - join-prompt / 배너 / 화이트보드 제안을 UI 상태로 노출한다.
 * - presence 스냅샷의 peers에서 "발표 중"인 피어를 골라 청중 시점용으로 노출한다.
 *
 * Phaser 씬 연동은 호출 측(상위 컴포넌트)이 position을 넣어주면 된다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudioVirtualSpacePeer, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioOfficeZone } from "./studio-virtual-space-office-zones";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import {
  createPlaceModeDirector,
  type PlaceCollaborationPorts,
  type PlaceModeEvent,
  type PlaceModeSessionSnapshot,
} from "./studio-virtual-space-place-mode-director";
import {
  PlaceMediaSession,
  type PlaceMediaKind,
  type PlaceMediaSessionDependencies,
  type PlaceMediaSnapshot,
} from "./studio-virtual-space-place-media";
import { placeWorkModeMeta } from "./studio-virtual-space-place-modes";

/** presence 연동 포트. 없으면 자동 상태 전환을 건너뛴다. */
export interface PlaceModePresencePort {
  readonly getUserStatus: () => StudioUserStatus | null;
  readonly setUserStatus: (status: StudioUserStatus) => void;
}

export interface UsePlaceModeDirectorInput {
  readonly zones: readonly StudioOfficeZone[];
  /** 아바타 위치. null이면 펌프를 멈춘다. */
  readonly position: StudioVirtualSpacePoint | null;
  readonly enabled?: boolean;
  readonly locale?: "ko" | "en";
  readonly ports?: PlaceCollaborationPorts;
  readonly presence?: PlaceModePresencePort;
  /** presence 스냅샷의 peers — 청중 시점 발표자 탐색용. */
  readonly peers?: readonly StudioVirtualSpacePeer[];
  readonly mediaDependencies?: PlaceMediaSessionDependencies;
  readonly onEvent?: (event: PlaceModeEvent) => void;
  /** 테스트·스토리북용 시각 주입. 기본값은 Date.now. */
  readonly now?: () => number;
}

export interface PlaceModeBanner {
  readonly key: string;
  readonly mode: PlaceModeEvent["mode"];
  readonly kind: "enter" | "exit";
  readonly textKo: string;
  readonly textEn: string;
}

/** 배너 자동 닫힘 시간 (ms). */
export const PLACE_MODE_BANNER_TTL_MS = 4_500;
/** 디렉터 펌프 주기 (ms). */
export const PLACE_MODE_PUMP_MS = 250;

function mediaKindForMode(mode: PlaceModeEvent["mode"]): PlaceMediaKind | null {
  switch (mode) {
    case "conference": return "conference";
    case "stage": return "stage";
    case "lounge": return "lounge";
    case "focus-desk":
    case "none":
      return null;
  }
}

export function useStudioVirtualSpacePlaceModes(input: UsePlaceModeDirectorInput): {
  readonly session: PlaceModeSessionSnapshot | null;
  readonly prompt: PlaceModeEvent | null;
  readonly banner: PlaceModeBanner | null;
  readonly whiteboardOffer: PlaceModeEvent | null;
  readonly media: PlaceMediaSnapshot;
  /** 청중 시점: "발표 중"인 피어의 세션 id 목록. */
  readonly spotlightPeerIds: readonly string[];
  confirmJoin: () => void;
  declineJoin: () => void;
  leaveSession: () => void;
  dismissBanner: () => void;
  dismissWhiteboardOffer: () => void;
  openWhiteboard: () => void;
  startScreenShare: () => Promise<void>;
} {
  const {
    zones, position, enabled = true, locale = "ko",
    ports, presence, peers = [], mediaDependencies, onEvent, now,
  } = input;

  const directorRef = useRef<ReturnType<typeof createPlaceModeDirector> | null>(null);
  const mediaRef = useRef<PlaceMediaSession | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;
  const presenceRef = useRef(presence);
  presenceRef.current = presence;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const portsRef = useRef(ports);
  portsRef.current = ports;
  const mediaDependenciesRef = useRef(mediaDependencies);
  mediaDependenciesRef.current = mediaDependencies;
  const nowRef = useRef(now);
  nowRef.current = now;

  const [session, setSession] = useState<PlaceModeSessionSnapshot | null>(null);
  const [prompt, setPrompt] = useState<PlaceModeEvent | null>(null);
  const [banner, setBanner] = useState<PlaceModeBanner | null>(null);
  const [whiteboardOffer, setWhiteboardOffer] = useState<PlaceModeEvent | null>(null);
  const [media, setMedia] = useState<PlaceMediaSnapshot>(() => ({
    active: false, kind: null, localStream: null, microphone: true, camera: true,
    speaking: false, screenSharing: false, screenStream: null, peers: [],
    spotlightSessionId: null, error: null,
  }));
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((next: PlaceModeBanner) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner(next);
    bannerTimer.current = setTimeout(() => setBanner(null), PLACE_MODE_BANNER_TTL_MS);
  }, []);

  // 디렉터·미디어 세션 생성 (zones/locale이 바뀌면 재생성).
  useEffect(() => {
    const director = createPlaceModeDirector({
      zones,
      locale,
      now: nowRef.current,
      ports: portsRef.current,
      readCurrentStatus: () => presenceRef.current?.getUserStatus() ?? null,
    });
    directorRef.current = director;
    const mediaSession = new PlaceMediaSession({
      ...mediaDependenciesRef.current,
      onSnapshot: (snapshot) => {
        setMedia(snapshot);
        mediaDependenciesRef.current?.onSnapshot?.(snapshot);
      },
    });
    mediaRef.current = mediaSession;
    setSession(null);
    setPrompt(null);
    setWhiteboardOffer(null);
    return () => {
      mediaSession.leave();
      directorRef.current = null;
      mediaRef.current = null;
    };
  }, [zones, locale]);

  const handleEvent = useCallback((event: PlaceModeEvent) => {
    onEventRef.current?.(event);
    const mediaSession = mediaRef.current;
    switch (event.kind) {
      case "join-prompt":
        setPrompt(event);
        break;
      case "session-started": {
        setPrompt(null);
        setSession(directorRef.current?.snapshot() ?? null);
        if (event.autoStatus) presenceRef.current?.setUserStatus(event.autoStatus);
        const mediaKind = mediaKindForMode(event.mode);
        if (mediaSession && mediaKind) {
          // 스테이지는 발표자 본인이므로 카메라를 켠다. 청중(다른 사용자)은
          // presence의 presenting 상태로 스포트라이트를 본다.
          const joinOptions = event.mode === "stage"
            ? { microphone: true, camera: true }
            : event.mode === "lounge"
              ? { microphone: true, camera: false }
              : { microphone: true, camera: true };
          void mediaSession.join(mediaKind, joinOptions);
        }
        showBanner({ key: `enter:${event.zoneId}:${event.at}`, mode: event.mode, kind: "enter", textKo: event.textKo, textEn: event.textEn });
        break;
      }
      case "whiteboard-suggestion":
        setWhiteboardOffer(event);
        break;
      case "session-ended": {
        setPrompt(null);
        setWhiteboardOffer(null);
        setSession(null);
        if (event.restoreStatus) presenceRef.current?.setUserStatus(event.restoreStatus);
        mediaSession?.leave();
        break;
      }
      case "mode-entered":
        // prompt가 따로 뜨는 모드는 배너를 생략한다 (다이얼로그가 대신 알린다).
        break;
      case "mode-exited":
        showBanner({ key: `exit:${event.zoneId}:${event.at}`, mode: event.mode, kind: "exit", textKo: event.textKo, textEn: event.textEn });
        break;
    }
  }, [showBanner]);

  // 펌프: position 변경 + 250ms 폴링.
  useEffect(() => {
    if (!enabled) return;
    const pump = (): void => {
      const director = directorRef.current;
      const point = positionRef.current;
      if (!director || !point) return;
      director.update(point);
      const drained = director.consumeEvents();
      for (const event of drained) handleEvent(event);
      const next = director.snapshot();
      setSession((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    pump();
    const timer = setInterval(pump, PLACE_MODE_PUMP_MS);
    return () => clearInterval(timer);
  }, [enabled, handleEvent, position]);

  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  const confirmJoin = useCallback(() => {
    directorRef.current?.confirmJoin();
    const director = directorRef.current;
    if (director) {
      for (const event of director.consumeEvents()) handleEvent(event);
      setSession(director.snapshot());
    }
  }, [handleEvent]);

  const declineJoin = useCallback(() => {
    directorRef.current?.declineJoin();
    setPrompt(null);
    const director = directorRef.current;
    if (director) setSession(director.snapshot());
  }, []);

  const leaveSession = useCallback(() => {
    const director = directorRef.current;
    if (!director) return;
    director.leaveSession();
    for (const event of director.consumeEvents()) handleEvent(event);
    setSession(director.snapshot());
  }, [handleEvent]);

  const dismissBanner = useCallback(() => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner(null);
  }, []);

  const dismissWhiteboardOffer = useCallback(() => setWhiteboardOffer(null), []);

  const openWhiteboard = useCallback(() => {
    const offer = whiteboardOffer;
    setWhiteboardOffer(null);
    if (offer) portsRef.current?.whiteboard?.open(offer.zoneId);
  }, [whiteboardOffer]);

  const startScreenShare = useCallback(async () => {
    const mediaSession = mediaRef.current;
    if (!mediaSession) return;
    if (!mediaSession.snapshot().active) {
      await mediaSession.join("conference", { microphone: false, camera: false });
    }
    await mediaSession.startScreenShare();
  }, []);

  const spotlightPeerIds = useMemo(
    () => Object.freeze(peers
      .filter((peer) => peer.state.userStatus === "presenting")
      .map((peer) => peer.participant.sessionId)),
    [peers],
  );

  return {
    session, prompt, banner, whiteboardOffer, media, spotlightPeerIds,
    confirmJoin, declineJoin, leaveSession, dismissBanner, dismissWhiteboardOffer,
    openWhiteboard, startScreenShare,
  };
}

/** 세션 칩에 표시할 모드 라벨 (훅 외부에서도 재사용). */
export function placeModeSessionLabel(
  session: Pick<PlaceModeSessionSnapshot, "mode" | "zoneLabelKo" | "zoneLabelEn">,
  locale: "ko" | "en" = "ko",
): string {
  const meta = placeWorkModeMeta(session.mode);
  const zoneLabel = locale === "ko" ? session.zoneLabelKo : session.zoneLabelEn;
  const modeLabel = locale === "ko" ? meta.labelKo : meta.labelEn;
  return `${meta.icon} ${zoneLabel} · ${modeLabel}`;
}
