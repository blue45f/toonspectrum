import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  StudioLiveCollaborationContext,
  type StudioLiveAvailability,
  type StudioLiveCollaborationContextValue,
} from "./studio-live-collaboration-context";
import { studioLiveDisplayName, type StudioLiveParticipant } from "./studio-live-collaboration-protocol";
import {
  StudioLiveRoom,
  type StudioLiveLock,
  type StudioLivePeer,
} from "./studio-live-collaboration-room";
import {
  isStudioLocalLiveTransportSupported,
  type StudioLiveTransportFactory,
  type StudioLiveTransportMode,
} from "./studio-live-collaboration-transport";

import type { StudioCrdtDocument } from "./studio-crdt-document";
import type { StudioCrdtRoomBinding } from "./studio-crdt-room-binding";

export interface StudioLiveCollaborationProviderProps {
  children: ReactNode;
  workId: string | null;
  participant: Omit<StudioLiveParticipant, "sessionId"> | null;
  currentPageId: string | null;
  currentTool: string | null;
  /** Stable authenticated user id used to isolate the durable CRDT outbox on this device. */
  outboxScope?: string | null;
  transportFactory?: StudioLiveTransportFactory;
  /** Prevent an authenticated work from silently becoming an unauthenticated local-tab room. */
  serverRequired?: boolean;
  onRoomChange?: (room: StudioLiveRoom | null) => void;
  onCrdtDocumentChange?: (document: StudioCrdtDocument | null) => void;
}

function localSessionId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("안전한 공동작업 세션 식별자를 만들 수 없습니다.");
  }
  return crypto.randomUUID();
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Always-mounted live-room owner. Team management and screen sharing may open as panels, but
 * presence, cursors and authoritative edit leases survive those presentation-layer lifecycles.
 */
export function StudioLiveCollaborationProvider({
  children,
  workId,
  participant,
  currentPageId,
  currentTool,
  outboxScope = null,
  transportFactory,
  serverRequired = false,
  onRoomChange,
  onCrdtDocumentChange,
}: StudioLiveCollaborationProviderProps) {
  const [room, setRoom] = useState<StudioLiveRoom | null>(null);
  const [availability, setAvailability] = useState<StudioLiveAvailability>("idle");
  const [mode, setMode] = useState<StudioLiveTransportMode | null>(null);
  const [peers, setPeers] = useState<StudioLivePeer[]>([]);
  const [locks, setLocks] = useState<StudioLiveLock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [localFallbackAllowed, setLocalFallbackAllowed] = useState(true);
  const [transportPreference, setTransportPreference] = useState<"server" | "local">(
    serverRequired || transportFactory ? "server" : "local"
  );
  const [transportRetryKey, setTransportRetryKey] = useState(0);
  const observedTransportPolicyRef = useRef({ transportFactory, serverRequired });
  const previousPageIdRef = useRef(currentPageId);
  const participantName = participant?.displayName ?? null;
  const participantRole = participant?.role ?? null;

  useEffect(() => {
    const observed = observedTransportPolicyRef.current;
    if (
      observed.transportFactory === transportFactory &&
      observed.serverRequired === serverRequired
    ) return;
    observedTransportPolicyRef.current = { transportFactory, serverRequired };
    setTransportPreference(serverRequired || transportFactory ? "server" : "local");
  }, [serverRequired, transportFactory]);

  useEffect(() => {
    let cancelled = false;
    setRoom(null);
    setPeers([]);
    setLocks([]);
    setError(null);
    setLocalFallbackAllowed(true);

    if (!workId || !participantName || !participantRole) {
      setAvailability("idle");
      setMode(null);
      onRoomChange?.(null);
      onCrdtDocumentChange?.(null);
      return;
    }
    if (transportPreference === "server" && !transportFactory) {
      setAvailability("error");
      setMode("server");
      setError("인증된 팀 연결 정보가 없어 로컬 모드로 자동 전환하지 않았습니다. 다시 로그인해 주세요.");
      onRoomChange?.(null);
      onCrdtDocumentChange?.(null);
      return;
    }
    if (transportPreference === "local" && !isStudioLocalLiveTransportSupported()) {
      setAvailability("unsupported");
      setMode(null);
      onRoomChange?.(null);
      onCrdtDocumentChange?.(null);
      return;
    }

    setAvailability("connecting");
    setMode(transportPreference);
    let nextRoom: StudioLiveRoom;
    try {
      nextRoom = new StudioLiveRoom({
        workId,
        participant: {
          sessionId: localSessionId(),
          displayName: studioLiveDisplayName(participantName, {
            suffix: "· 이 탭",
            fallback: "내 작업",
          }),
          role: participantRole,
        },
        ...(transportPreference === "server" && transportFactory
          ? { dependencies: { transportFactory } }
          : {}),
      });
    } catch (cause) {
      setAvailability("error");
      setError(messageFrom(cause, "공동작업 세션을 만들지 못했습니다."));
      onRoomChange?.(null);
      onCrdtDocumentChange?.(null);
      return;
    }

    setRoom(nextRoom);
    onRoomChange?.(nextRoom);
    let roomClosed = false;
    let roomExposed = true;
    const closeRoom = () => {
      if (roomClosed) return;
      roomClosed = true;
      nextRoom.close();
    };
    const clearExposedRoom = () => {
      if (!roomExposed) return;
      roomExposed = false;
      onRoomChange?.(null);
    };
    let crdtDocument: StudioCrdtDocument | null = null;
    let crdtBinding: StudioCrdtRoomBinding | null = null;
    const unsubscribe = nextRoom.subscribe((event) => {
      if (cancelled) return;
      if (event.type === "presence") {
        setPeers(event.peers);
        if (nextRoom.ready) setAvailability("ready");
        return;
      }
      if (event.type === "locks") {
        setLocks(event.locks);
        return;
      }
      if (event.type === "transport-error") {
        setError(event.message);
        return;
      }
      if (event.type !== "transport-status") return;

      setMode(nextRoom.mode);
      if (event.status.state === "ready") {
        setAvailability("ready");
        setError(null);
      } else if (event.status.state === "connecting" || event.status.state === "disconnected") {
        setAvailability("connecting");
        setError(event.status.message);
      } else if (event.status.state === "error" && nextRoom.ready) {
        // Operation-level denial (for example a lease conflict) does not destroy the live room.
        setAvailability("ready");
        setError(event.status.message);
      } else {
        setAvailability("error");
        setError(event.status.message);
      }

      if (!event.status.recoverable) {
        setPeers([]);
        setLocks([]);
        setLocalFallbackAllowed(false);
      }
    });
    let roomSubscriptionActive = true;
    const stopRoomSubscription = () => {
      if (!roomSubscriptionActive) return;
      roomSubscriptionActive = false;
      unsubscribe();
    };

    const onVisibilityChange = () => {
      try {
        if (document.hidden) nextRoom.clearCursor();
        nextRoom.updatePresence({ visibility: document.hidden ? "idle" : "active" });
      } catch (cause) {
        if (!cancelled) setError(messageFrom(cause, "작업 상태를 팀에 알리지 못했습니다."));
      }
    };
    let visibilityListenerActive = false;
    if (typeof document !== "undefined") {
      nextRoom.updatePresence({ visibility: document.hidden ? "idle" : "active" });
      document.addEventListener("visibilitychange", onVisibilityChange);
      visibilityListenerActive = true;
    }
    const stopVisibilityListener = () => {
      if (!visibilityListenerActive || typeof document === "undefined") return;
      visibilityListenerActive = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };

    void (async () => {
      try {
        await nextRoom.start();
        if (cancelled) return;
        const [documentModule, bindingModule] = await Promise.all([
          import("./studio-crdt-document"),
          import("./studio-crdt-room-binding"),
        ]);
        if (cancelled) return;
        crdtDocument = new documentModule.StudioCrdtDocument();
        crdtBinding = new bindingModule.StudioCrdtRoomBinding({
          document: crdtDocument,
          room: nextRoom,
          canEdit: participantRole === "owner" || participantRole === "admin" || participantRole === "editor",
          outboxScope,
          onStatus: (status) => {
            if (cancelled) return;
            if (status.state === "error") {
              setError(status.message);
              if (status.durabilityAtRisk) setAvailability("error");
            }
            if (status.state === "ready" && nextRoom.ready) {
              setAvailability("ready");
              setError(null);
            }
          },
        });
        await crdtBinding.start();
        if (cancelled) return;
        onCrdtDocumentChange?.(crdtDocument);
        setMode(nextRoom.mode);
        setPeers(nextRoom.getPeers());
        setLocks(nextRoom.getLocks());
        setAvailability("ready");
      } catch (cause: unknown) {
        if (cancelled) return;
        const failedBinding = crdtBinding;
        const failedDocument = crdtDocument;
        crdtBinding = null;
        crdtDocument = null;
        failedBinding?.close();
        failedDocument?.destroy();
        stopVisibilityListener();
        stopRoomSubscription();
        closeRoom();
        clearExposedRoom();
        onCrdtDocumentChange?.(null);
        setRoom(null);
        setPeers([]);
        setLocks([]);
        setAvailability("error");
        setError(messageFrom(cause, "공동작업 채널에 연결하지 못했습니다."));
      }
    })();

    return () => {
      cancelled = true;
      stopVisibilityListener();
      stopRoomSubscription();
      onCrdtDocumentChange?.(null);
      const closingBinding = crdtBinding;
      const closingDocument = crdtDocument;
      crdtBinding = null;
      crdtDocument = null;
      if (closingBinding && closingDocument) {
        void closingBinding.closeGracefully()
          .finally(() => {
            closingDocument.destroy();
            closeRoom();
          })
          .catch(() => undefined);
      } else {
        closingBinding?.close();
        closingDocument?.destroy();
        closeRoom();
      }
      clearExposedRoom();
    };
  }, [
    participantName,
    participantRole,
    onCrdtDocumentChange,
    onRoomChange,
    outboxScope,
    transportFactory,
    transportPreference,
    transportRetryKey,
    workId,
  ]);

  useEffect(() => {
    if (!room) return;
    try {
      if (previousPageIdRef.current !== currentPageId) room.clearCursor();
      previousPageIdRef.current = currentPageId;
      room.updatePresence({ pageId: currentPageId, tool: currentTool });
    } catch (cause) {
      setError(messageFrom(cause, "현재 작업 페이지를 팀에 알리지 못했습니다."));
    }
  }, [currentPageId, currentTool, room]);

  const value: StudioLiveCollaborationContextValue = {
    room,
    availability,
    mode,
    peers,
    locks,
    error,
    serverAvailable: transportFactory !== undefined,
    localFallbackAllowed,
    usingLocalFallback: transportFactory !== undefined && transportPreference === "local",
    retryServer: () => {
      if (!transportFactory) return;
      setError(null);
      setTransportPreference("server");
      setTransportRetryKey((value) => value + 1);
    },
    useLocalFallback: () => {
      if (!transportFactory || !localFallbackAllowed) return;
      setError(null);
      setTransportPreference("local");
      setTransportRetryKey((value) => value + 1);
    },
  };

  return (
    <StudioLiveCollaborationContext.Provider value={value}>
      {children}
    </StudioLiveCollaborationContext.Provider>
  );
}
