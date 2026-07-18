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
  type StudioLiveRecoveryState,
} from "./studio-live-collaboration-context";
import { studioLiveDisplayName, type StudioLiveParticipant } from "./studio-live-collaboration-protocol";
import {
  StudioLiveRoom,
  type StudioLiveChatMessage,
  type StudioLiveLock,
  type StudioLivePeer,
} from "./studio-live-collaboration-room";
import {
  isStudioLocalLiveTransportSupported,
  type StudioLiveTransportFactory,
  type StudioLiveTransportMode,
} from "./studio-live-collaboration-transport";
import {
  projectStudioLiveSyncSnapshot,
  type StudioCrdtSyncTelemetry,
  type StudioLivePersistenceDurability,
} from "./studio-live-sync-safety";
import {
  createEmptyStudioVoiceCallState,
  isStudioVoiceCallSupported,
  studioVoiceCallErrorMessage,
  type StudioVoiceCallEvent,
  type StudioVoiceCallState,
} from "./studio-voice-call-model";

import type { StudioCrdtDocument } from "./studio-crdt-document";
import type { StudioCrdtRecoveryVaultEntry } from "./studio-crdt-recovery-vault";
import type {
  StudioCrdtAuthoritativeAckBarrierResult,
  StudioCrdtBindingStatus,
  StudioCrdtRoomBinding,
} from "./studio-crdt-room-binding";
import type { StudioVoiceCallController } from "./studio-voice-call";
import type {
  StudioVoiceIcePolicyLease,
} from "./studio-voice-ice-policy";
import type { StudioVoiceIcePolicyMode } from "@/lib/studio-voice-ice-policy-contract";

export type StudioCrdtAuthoritativeSaveBarrier = (
  timeoutMs?: number
) => Promise<StudioCrdtAuthoritativeAckBarrierResult>;

export interface StudioCrdtSceneGraphRuntime {
  publish: typeof import("./studio-crdt-scene-publisher").publishStudioCrdtSceneGraphDiff;
  reconcileHistory: typeof import("./studio-crdt-history").reconcileStudioCrdtSceneGraphHistory;
  reconcilePages: typeof import("./studio-crdt-page-bridge").reconcileStudioCrdtSceneGraphPages;
  nextRasterLogicalClock: typeof import("./studio-crdt-raster-ui-bridge").nextStudioRasterLogicalClock;
  planRasterDrawPromotion: typeof import("./studio-crdt-raster-ui-bridge").planStudioRasterDrawPromotion;
  rasterDrawPromotionSourceMatches: typeof import("./studio-crdt-raster-ui-bridge").studioRasterDrawPromotionSourceMatches;
  publishRasterHistoryTransition: typeof import("./studio-crdt-raster-ui-bridge").publishStudioRasterHistoryTransition;
  sha256RasterSemanticParameters: typeof import("./studio-crdt-raster-ui-bridge").sha256StudioRasterSemanticParameters;
}

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
  onCrdtDocumentChange?: (
    document: StudioCrdtDocument | null,
    runtime: StudioCrdtSceneGraphRuntime | null
  ) => void;
  /** Reports whether a new collaborative edit has at least one durable sink right now. */
  onEditSafetyChange?: (editsDurablyProtected: boolean) => void;
  /** Exposes a same-generation CRDT drain/ACK fence for REST save and publish operations. */
  onAuthoritativeSaveBarrierChange?: (
    barrier: StudioCrdtAuthoritativeSaveBarrier | null
  ) => void;
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

type StudioCrdtBindingStatusTelemetry = StudioCrdtBindingStatus &
  Partial<Pick<
    StudioCrdtSyncTelemetry,
    | "pendingCount"
    | "persistenceDurability"
    | "transportReady"
    | "lastAckAt"
    | "lastAckServerSequence"
  >>;

interface StudioLiveRecoveryBoundaryLatch {
  scopeKey: string;
  rejectedUpdateId: string | null;
  recovery: StudioLiveRecoveryState;
}

interface StudioLiveRevocationBoundaryLatch {
  scopeKey: string;
  mode: StudioLiveTransportMode;
  message: string;
}

interface StudioVoiceErrorScope {
  code: Extract<StudioVoiceCallEvent, { type: "error" }>["code"] | "action";
  participantSessionId: string | null;
}

interface StudioVoiceControllerScope {
  generation: number;
  room: StudioLiveRoom;
}

interface StudioVoiceControllerBinding {
  scope: StudioVoiceControllerScope;
  controller: StudioVoiceCallController;
  icePolicyLease: StudioVoiceIcePolicyLease | null;
  unsubscribeIcePolicy: () => void;
  unsubscribe: () => void;
}

interface StudioVoiceControllerLoad {
  scope: StudioVoiceControllerScope;
  promise: Promise<StudioVoiceCallController | null>;
  cancel: () => void;
}

const RECOVERY_VAULT_REHYDRATION_INITIAL_DELAY_MS = 50;
const RECOVERY_VAULT_REHYDRATION_MAX_DELAY_MS = 5_000;

function closeStudioVoiceControllerBinding(
  binding: StudioVoiceControllerBinding | null | undefined
): void {
  if (!binding) return;
  binding.unsubscribe();
  binding.unsubscribeIcePolicy();
  binding.controller.close();
  binding.icePolicyLease?.close();
}

function findStudioLiveRecoveryBoundaryEntry(
  entries: readonly StudioCrdtRecoveryVaultEntry[],
  boundary: StudioLiveRecoveryBoundaryLatch
): StudioCrdtRecoveryVaultEntry | null {
  const { vaultId } = boundary.recovery;
  if (vaultId) {
    const exactVault = entries.find((entry) => entry.vaultId === vaultId);
    if (exactVault) return exactVault;
  }
  const rejectedUpdateId = boundary.rejectedUpdateId;
  if (!rejectedUpdateId) return null;
  return entries.find((entry) =>
    entry.rejectedUpdateId === rejectedUpdateId ||
    entry.updates.some((update) => update.updateId === rejectedUpdateId)
  ) ?? null;
}

function canParticipantEdit(role: StudioLiveParticipant["role"] | null): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

function bindingTelemetryState(state: string): StudioCrdtSyncTelemetry["state"] {
  if (
    state === "idle" ||
    state === "syncing" ||
    state === "ready" ||
    state === "retrying" ||
    state === "repairing"
  ) {
    return state;
  }
  if (state === "recovery-required") return "recovery-required";
  return "error";
}

function mergeBindingTelemetry(options: {
  previous: StudioCrdtSyncTelemetry | null;
  status: StudioCrdtBindingStatus;
  transportReady: boolean;
  outboxConfigured: boolean;
}): StudioCrdtSyncTelemetry {
  const { previous, status, transportReady, outboxConfigured } = options;
  const measured = status as StudioCrdtBindingStatusTelemetry;
  const persistenceDurability: StudioLivePersistenceDurability =
    measured.persistenceDurability ??
    previous?.persistenceDurability ??
    (outboxConfigured ? "checking" : "unavailable");
  return {
    state: bindingTelemetryState(status.state),
    message: status.message,
    pendingCount: measured.pendingCount ?? previous?.pendingCount ?? 0,
    persistenceDurability,
    transportReady: measured.transportReady ?? transportReady,
    lastAckAt: measured.lastAckAt ?? previous?.lastAckAt ?? null,
    lastAckServerSequence:
      measured.lastAckServerSequence ?? previous?.lastAckServerSequence ?? null,
    ...(status.state === "error" && status.durabilityAtRisk
      ? { durabilityAtRisk: true }
      : {}),
  };
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
  onEditSafetyChange,
  onAuthoritativeSaveBarrierChange,
}: StudioLiveCollaborationProviderProps) {
  const [room, setRoom] = useState<StudioLiveRoom | null>(null);
  const [availability, setAvailability] = useState<StudioLiveAvailability>("idle");
  const [mode, setMode] = useState<StudioLiveTransportMode | null>(null);
  const [peers, setPeers] = useState<StudioLivePeer[]>([]);
  const [locks, setLocks] = useState<StudioLiveLock[]>([]);
  const [chatMessages, setChatMessages] = useState<StudioLiveChatMessage[]>([]);
  const [voiceState, setVoiceState] = useState<StudioVoiceCallState>(() =>
    createEmptyStudioVoiceCallState()
  );
  const [voiceNetworkMode, setVoiceNetworkMode] =
    useState<StudioVoiceIcePolicyMode | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceErrorScopeRef = useRef<StudioVoiceErrorScope | null>(null);
  const voiceControllerBindingRef = useRef<StudioVoiceControllerBinding | null>(null);
  const voiceControllerLoadRef = useRef<StudioVoiceControllerLoad | null>(null);
  const voiceControllerScopeRef = useRef<StudioVoiceControllerScope | null>(null);
  const voiceControllerGenerationRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [localFallbackAllowed, setLocalFallbackAllowed] = useState(true);
  const [transportPreference, setTransportPreference] = useState<"server" | "local">(
    serverRequired || transportFactory ? "server" : "local"
  );
  const [transportRetryKey, setTransportRetryKey] = useState(0);
  const [syncTelemetry, setSyncTelemetry] = useState<StudioCrdtSyncTelemetry | null>(null);
  const [operationSyncReady, setOperationSyncReady] = useState(false);
  const [terminalTransportState, setTerminalTransportState] = useState<
    "revoked" | "recovery-required" | null
  >(null);
  const [recovery, setRecovery] = useState<StudioLiveRecoveryState | null>(null);
  // This latch deliberately survives room/effect generations. Exporting a rejected frontier does
  // not make the optimistic React history authoritative; only a full document reload may discard
  // that history and reopen the exported vault entry against the server document.
  const recoveryBoundaryRef = useRef<StudioLiveRecoveryBoundaryLatch | null>(null);
  // A permanent authorization failure is also terminal for this mounted document generation.
  // Token/factory rotation and retry controls must not silently reopen the same work after the
  // server has explicitly revoked it. Navigating to another work/user scope clears the boundary.
  const revocationBoundaryRef = useRef<StudioLiveRevocationBoundaryLatch | null>(null);
  const observedTransportPolicyRef = useRef({ transportFactory, serverRequired });
  const previousPageIdRef = useRef(currentPageId);
  const participantName = participant?.displayName ?? null;
  const participantRole = participant?.role ?? null;
  const participantCanEdit = canParticipantEdit(participantRole);
  const participantCanVoice = participantRole !== null && participantRole !== "viewer";
  const voiceSupported = isStudioVoiceCallSupported();
  const recoveryBoundaryScopeKey = workId
    ? JSON.stringify([outboxScope || null, workId])
    : null;

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
    if (
      recoveryBoundaryRef.current &&
      recoveryBoundaryRef.current.scopeKey !== recoveryBoundaryScopeKey
    ) {
      // A different work/signed-user scope owns a different editor history generation.
      recoveryBoundaryRef.current = null;
    }
    if (
      revocationBoundaryRef.current &&
      revocationBoundaryRef.current.scopeKey !== recoveryBoundaryScopeKey
    ) {
      revocationBoundaryRef.current = null;
    }
    const latchedRecoveryBoundary =
      recoveryBoundaryRef.current?.scopeKey === recoveryBoundaryScopeKey
        ? recoveryBoundaryRef.current
        : null;
    const latchedRecovery = latchedRecoveryBoundary?.recovery ?? null;
    const latchedRevocation =
      revocationBoundaryRef.current?.scopeKey === recoveryBoundaryScopeKey
        ? revocationBoundaryRef.current
        : null;
    setRoom(null);
    setPeers([]);
    setLocks([]);
    setChatMessages([]);
    setError(null);
    setLocalFallbackAllowed(true);
    setSyncTelemetry(null);
    setOperationSyncReady(false);
    onAuthoritativeSaveBarrierChange?.(null);
    // Presence/transport는 동적 CRDT 모듈과 초기 frontier보다 먼저 준비될 수 있다. effect가
    // 새 room 세대로 진입하는 순간 이전 pair를 먼저 폐기해 부모 편집기가 즉시 잠기게 한다.
    onCrdtDocumentChange?.(null, null);

    if (latchedRecovery) {
      setAvailability("error");
      setMode(transportPreference);
      setError(latchedRecovery.message);
      setTerminalTransportState("recovery-required");
      setRecovery(latchedRecovery);
      setLocalFallbackAllowed(false);
      onRoomChange?.(null);
      if (
        latchedRecovery.exportAvailable ||
        !latchedRecoveryBoundary ||
        !outboxScope ||
        !workId
      ) return;

      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      const rehydrateRecoveryBoundary = async (retryDelayMs: number): Promise<void> => {
        try {
          const recoveryModule = await import("./studio-crdt-recovery-vault");
          if (cancelled) return;
          const entries = await recoveryModule
            .createStudioCrdtRecoveryVault()
            .list(outboxScope, workId);
          if (cancelled) return;
          const matchingEntry = findStudioLiveRecoveryBoundaryEntry(
            entries,
            latchedRecoveryBoundary
          );
          if (matchingEntry) {
            const currentBoundary = recoveryBoundaryRef.current;
            if (
              currentBoundary?.scopeKey !== recoveryBoundaryScopeKey ||
              currentBoundary.rejectedUpdateId !== latchedRecoveryBoundary.rejectedUpdateId
            ) return;
            const hydratedRecovery: StudioLiveRecoveryState = {
              ...currentBoundary.recovery,
              vaultId: matchingEntry.vaultId,
              updateCount: Math.max(
                currentBoundary.recovery.updateCount,
                matchingEntry.updates.length
              ),
              exportAvailable: true,
              exported:
                currentBoundary.recovery.exported ||
                entries.every((entry) => entry.status === "exported"),
            };
            recoveryBoundaryRef.current = {
              ...currentBoundary,
              recovery: hydratedRecovery,
            };
            setRecovery(hydratedRecovery);
            return;
          }
        } catch {
          // The binding may still be committing the manifest, or IndexedDB may be transiently
          // unavailable. Keep the editor locked; the same recovery boundary must remain capable
          // of observing a late durable commit even on a slow mobile storage device.
        }
        if (cancelled) return;
        const nextDelayMs = Math.min(
          RECOVERY_VAULT_REHYDRATION_MAX_DELAY_MS,
          retryDelayMs * 2
        );
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void rehydrateRecoveryBoundary(nextDelayMs);
        }, retryDelayMs);
      };
      void rehydrateRecoveryBoundary(RECOVERY_VAULT_REHYDRATION_INITIAL_DELAY_MS);
      return () => {
        cancelled = true;
        if (retryTimer !== null) clearTimeout(retryTimer);
      };
    }

    if (latchedRevocation) {
      setAvailability("error");
      setMode(latchedRevocation.mode);
      setError(latchedRevocation.message);
      setTerminalTransportState("revoked");
      setRecovery(null);
      setLocalFallbackAllowed(false);
      onRoomChange?.(null);
      return;
    }

    setError(null);
    setTerminalTransportState(null);
    setRecovery(null);
    setLocalFallbackAllowed(true);

    if (!workId || !participantName || !participantRole) {
      setAvailability("idle");
      setMode(null);
      onRoomChange?.(null);
      return;
    }
    if (transportPreference === "server" && !transportFactory) {
      setAvailability("error");
      setMode("server");
      setError("인증된 팀 연결 정보가 없어 로컬 모드로 자동 전환하지 않았습니다. 다시 로그인해 주세요.");
      onRoomChange?.(null);
      return;
    }
    if (transportPreference === "local" && !isStudioLocalLiveTransportSupported()) {
      setAvailability("unsupported");
      setMode(null);
      onRoomChange?.(null);
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
    let crdtDurabilityWarning: string | null = null;
    const exposeReadyRoom = (nextError?: string | null) => {
      if (crdtDurabilityWarning) {
        setAvailability("error");
        setError(crdtDurabilityWarning);
        return;
      }
      setAvailability("ready");
      if (nextError !== undefined) setError(nextError);
    };
    const unsubscribe = nextRoom.subscribe((event) => {
      if (cancelled) return;
      if (event.type === "presence") {
        setPeers(event.peers);
        if (nextRoom.ready) exposeReadyRoom();
        return;
      }
      if (event.type === "locks") {
        setLocks(event.locks);
        return;
      }
      if (event.type === "chat") {
        // The room already bounds its own history; mirror it so late panel mounts see context.
        setChatMessages(nextRoom.getChatMessages());
        return;
      }
      if (event.type === "transport-error") {
        setError(event.message);
        return;
      }
      if (event.type !== "transport-status") return;

      setMode(nextRoom.mode);
      if (event.status.state === "ready") {
        setSyncTelemetry((previous) => previous
          ? { ...previous, transportReady: true }
          : {
              state: "syncing",
              message: "팀 원고의 권위 상태를 확인하는 중입니다.",
              pendingCount: 0,
              persistenceDurability:
                participantCanEdit && outboxScope ? "checking" : participantCanEdit ? "unavailable" : "not-applicable",
              transportReady: true,
              lastAckAt: null,
              lastAckServerSequence: null,
            });
        exposeReadyRoom(null);
      } else if (event.status.state === "connecting" || event.status.state === "disconnected") {
        setSyncTelemetry((previous) => previous
          ? { ...previous, state: "retrying", transportReady: false, message: event.status.message }
          : previous);
        setAvailability("connecting");
        setError(event.status.message);
      } else if (event.status.state === "error" && nextRoom.ready) {
        // Operation-level denial (for example a lease conflict) does not destroy the live room.
        exposeReadyRoom(event.status.message);
      } else {
        setAvailability("error");
        setError(event.status.message);
      }

      if (!event.status.recoverable) {
        if (recoveryBoundaryScopeKey) {
          revocationBoundaryRef.current = {
            scopeKey: recoveryBoundaryScopeKey,
            mode: nextRoom.mode ?? transportPreference,
            message: event.status.message,
          };
        }
        setTerminalTransportState("revoked");
        setOperationSyncReady(false);
        onAuthoritativeSaveBarrierChange?.(null);
        onCrdtDocumentChange?.(null, null);
        setPeers([]);
        setLocks([]);
        setChatMessages([]);
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
        const [
          documentModule,
          bindingModule,
          scenePublisherModule,
          sceneHistoryModule,
          scenePageBridgeModule,
          rasterUiBridgeModule,
        ] = await Promise.all([
          import("./studio-crdt-document"),
          import("./studio-crdt-room-binding"),
          import("./studio-crdt-scene-publisher"),
          import("./studio-crdt-history"),
          import("./studio-crdt-page-bridge"),
          import("./studio-crdt-raster-ui-bridge"),
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
            setSyncTelemetry((previous) => mergeBindingTelemetry({
              previous,
              status,
              transportReady: nextRoom.ready,
              outboxConfigured: participantCanEdit && Boolean(outboxScope),
            }));
            if ((status as { state: string }).state === "recovery-required") {
              const previousBoundary =
                recoveryBoundaryRef.current?.scopeKey === recoveryBoundaryScopeKey
                  ? recoveryBoundaryRef.current
                  : null;
              const previousRecovery = previousBoundary?.recovery ?? null;
              const nextRecovery: StudioLiveRecoveryState = {
                vaultId:
                  "recoveryVaultId" in status &&
                  typeof status.recoveryVaultId === "string"
                    ? status.recoveryVaultId
                    : previousRecovery?.vaultId ?? null,
                updateCount:
                  "recoveryUpdateCount" in status
                    ? status.recoveryUpdateCount
                    : previousRecovery?.updateCount ?? 0,
                exportAvailable:
                  "recoveryExportAvailable" in status
                    ? status.recoveryExportAvailable
                    : previousRecovery?.exportAvailable ?? false,
                exported: previousRecovery?.exported ?? false,
                message: status.message,
              };
              if (recoveryBoundaryScopeKey) {
                recoveryBoundaryRef.current = {
                  scopeKey: recoveryBoundaryScopeKey,
                  rejectedUpdateId:
                    "updateId" in status && typeof status.updateId === "string"
                      ? status.updateId
                      : previousBoundary?.rejectedUpdateId ?? null,
                  recovery: nextRecovery,
                };
              }
              setTerminalTransportState("recovery-required");
              setRecovery(nextRecovery);
              setOperationSyncReady(false);
              onAuthoritativeSaveBarrierChange?.(null);
              onCrdtDocumentChange?.(null, null);
              setAvailability("error");
              setError(status.message);
              setLocalFallbackAllowed(false);
              return;
            }
            if (status.state === "error") {
              if (status.durabilityAtRisk) crdtDurabilityWarning = status.message;
              setError(status.message);
              if (status.durabilityAtRisk) setAvailability("error");
            }
            if (status.state === "ready" && nextRoom.ready) {
              crdtDurabilityWarning = null;
              exposeReadyRoom(null);
            }
          },
        });
        await crdtBinding.start();
        if (cancelled) return;
        if (crdtBinding.recoveryRequired) {
          // A restored optimistic update can be permanently rejected during the initial drain.
          // Never re-expose that divergent Y.Doc after the terminal status callback locked Studio.
          onCrdtDocumentChange?.(null, null);
          setOperationSyncReady(false);
          return;
        }
        const readyBinding = crdtBinding;
        onAuthoritativeSaveBarrierChange?.((timeoutMs) =>
          readyBinding.flushAndWaitForAuthoritativeAck(timeoutMs)
        );
        onCrdtDocumentChange?.(
          crdtDocument,
          {
            publish: scenePublisherModule.publishStudioCrdtSceneGraphDiff,
            reconcileHistory: sceneHistoryModule.reconcileStudioCrdtSceneGraphHistory,
            reconcilePages: scenePageBridgeModule.reconcileStudioCrdtSceneGraphPages,
            nextRasterLogicalClock: rasterUiBridgeModule.nextStudioRasterLogicalClock,
            planRasterDrawPromotion: rasterUiBridgeModule.planStudioRasterDrawPromotion,
            rasterDrawPromotionSourceMatches:
              rasterUiBridgeModule.studioRasterDrawPromotionSourceMatches,
            publishRasterHistoryTransition:
              rasterUiBridgeModule.publishStudioRasterHistoryTransition,
            sha256RasterSemanticParameters:
              rasterUiBridgeModule.sha256StudioRasterSemanticParameters,
          }
        );
        setOperationSyncReady(true);
        setMode(nextRoom.mode);
        setPeers(nextRoom.getPeers());
        setLocks(nextRoom.getLocks());
        exposeReadyRoom(null);
      } catch (cause: unknown) {
        if (cancelled) return;
        const failedBinding = crdtBinding;
        const failedDocument = crdtDocument;
        crdtBinding = null;
        crdtDocument = null;
        setOperationSyncReady(false);
        onAuthoritativeSaveBarrierChange?.(null);
        failedBinding?.close();
        failedDocument?.destroy();
        stopVisibilityListener();
        stopRoomSubscription();
        closeRoom();
        clearExposedRoom();
        onCrdtDocumentChange?.(null, null);
        setRoom(null);
        setPeers([]);
        setLocks([]);
        setChatMessages([]);
        setAvailability("error");
        setError(messageFrom(cause, "공동작업 채널에 연결하지 못했습니다."));
      }
    })();

    return () => {
      cancelled = true;
      stopVisibilityListener();
      stopRoomSubscription();
      onCrdtDocumentChange?.(null, null);
      setOperationSyncReady(false);
      onAuthoritativeSaveBarrierChange?.(null);
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
    participantCanEdit,
    onCrdtDocumentChange,
    onAuthoritativeSaveBarrierChange,
    onRoomChange,
    outboxScope,
    transportFactory,
    transportPreference,
    transportRetryKey,
    workId,
    recoveryBoundaryScopeKey,
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

  // Voice belongs to the authenticated room lifecycle, not to the team panel lifecycle. The heavy
  // WebRTC controller is intentionally not imported here: the first explicit join action is its
  // only load boundary. Work navigation, unsupported runtimes and ACL changes invalidate that
  // boundary before any late import can construct a controller or request the microphone.
  useEffect(() => {
    const generation = ++voiceControllerGenerationRef.current;
    const scope = room && participantCanVoice && voiceSupported
      ? { generation, room }
      : null;
    voiceControllerScopeRef.current = scope;
    const previousLoad = voiceControllerLoadRef.current;
    voiceControllerLoadRef.current = null;
    previousLoad?.cancel();
    const previous = voiceControllerBindingRef.current;
    voiceControllerBindingRef.current = null;
    closeStudioVoiceControllerBinding(previous);
    setVoiceState(createEmptyStudioVoiceCallState());
    setVoiceNetworkMode(null);
    setVoiceError(null);
    voiceErrorScopeRef.current = null;

    return () => {
      if (voiceControllerScopeRef.current === scope) {
        voiceControllerScopeRef.current = null;
      }
      if (voiceControllerLoadRef.current?.scope === scope) {
        voiceControllerLoadRef.current.cancel();
        voiceControllerLoadRef.current = null;
      }
      const current = voiceControllerBindingRef.current;
      if (current?.scope === scope) {
        voiceControllerBindingRef.current = null;
        closeStudioVoiceControllerBinding(current);
      }
    };
  }, [participantCanVoice, room, voiceSupported]);

  const ensureVoiceController = (
    scope: StudioVoiceControllerScope
  ): Promise<StudioVoiceCallController | null> => {
    const current = voiceControllerBindingRef.current;
    if (current?.scope === scope) return Promise.resolve(current.controller);
    const loading = voiceControllerLoadRef.current;
    if (loading?.scope === scope) return loading.promise;

    const abortController = new AbortController();
    const promise = Promise.all([
      import("./studio-voice-call"),
      scope.room.mode === "server"
        ? import("./studio-voice-ice-policy")
        : Promise.resolve(null),
    ])
      .then(async ([{ StudioVoiceCallController: VoiceController }, icePolicyModule]) => {
        if (voiceControllerScopeRef.current !== scope) return null;
        const icePolicyLease = icePolicyModule
          ? await icePolicyModule.acquireStudioVoiceIcePolicyLease(
              scope.room.workId,
              { signal: abortController.signal }
            )
          : null;
        if (voiceControllerScopeRef.current !== scope) {
          icePolicyLease?.close();
          return null;
        }
        let controller: StudioVoiceCallController;
        try {
          controller = new VoiceController(
            scope.room,
            icePolicyLease
              ? { createPeerConnection: icePolicyLease.createPeerConnection }
              : undefined
          );
        } catch (error) {
          icePolicyLease?.close();
          throw error;
        }
        if (voiceControllerScopeRef.current !== scope) {
          controller.close();
          icePolicyLease?.close();
          return null;
        }
        const binding: StudioVoiceControllerBinding = {
          scope,
          controller,
          icePolicyLease,
          unsubscribeIcePolicy: () => undefined,
          unsubscribe: () => undefined,
        };
        binding.unsubscribeIcePolicy =
          icePolicyLease?.subscribeConfigurationChange(() => {
            if (voiceControllerBindingRef.current !== binding) return;
            setVoiceNetworkMode(icePolicyLease.mode);
            controller.refreshNetworkPolicy();
          }) ?? (() => undefined);
        binding.unsubscribe = controller.subscribe((event) => {
          if (voiceControllerBindingRef.current !== binding) return;
          if (event.type === "state") {
            setVoiceState(event.state);
            const issue = voiceErrorScopeRef.current;
            if (issue?.participantSessionId) {
              const remote = event.state.participants.find(
                ({ participant: remoteParticipant }) =>
                  remoteParticipant.sessionId === issue.participantSessionId
              );
              const resolved =
                !remote ||
                (issue.code === "autoplay" && remote.autoplay !== "blocked") ||
                (issue.code === "connection" && remote.connection === "live");
              if (resolved) {
                voiceErrorScopeRef.current = null;
                setVoiceError(null);
              }
            }
            return;
          }
          voiceErrorScopeRef.current = {
            code: event.code,
            participantSessionId: event.participant?.sessionId ?? null,
          };
          if (event.code === "media" && controller.getState().phase === "idle") {
            voiceControllerBindingRef.current = null;
            closeStudioVoiceControllerBinding(binding);
            setVoiceNetworkMode(null);
            setVoiceState(createEmptyStudioVoiceCallState());
          }
          setVoiceError(event.message);
        });
        voiceControllerBindingRef.current = binding;
        setVoiceNetworkMode(icePolicyLease?.mode ?? "direct");
        return controller;
      })
      .finally(() => {
        if (voiceControllerLoadRef.current?.scope === scope) {
          voiceControllerLoadRef.current = null;
        }
      });
    voiceControllerLoadRef.current = {
      scope,
      promise,
      cancel: () => abortController.abort(),
    };
    return promise;
  };

  // State updates from the previous room can survive for one render while React tears that room
  // down. Never project those guarantees onto a different work id.
  const scopedOperationSyncReady = Boolean(
    room && room.workId === workId && operationSyncReady
  );
  const syncSnapshot = projectStudioLiveSyncSnapshot({
    availability,
    mode,
    canEdit: participantCanEdit,
    telemetry: syncTelemetry,
    operationSyncReady: scopedOperationSyncReady,
    terminalTransportState,
    transportMessage: error,
  });

  useEffect(() => {
    onEditSafetyChange?.(syncSnapshot.editsDurablyProtected);
  }, [onEditSafetyChange, syncSnapshot.editsDurablyProtected]);

  const exportRecovery = async () => {
    if (
      terminalTransportState !== "recovery-required" ||
      !recovery ||
      !outboxScope ||
      !workId
    ) {
      throw new Error("내보낼 수 있는 공동 편집 복구 frontier가 없습니다.");
    }
    const recoveryModule = await import("./studio-crdt-recovery-vault");
    const currentBoundary =
      recoveryBoundaryRef.current?.scopeKey === recoveryBoundaryScopeKey
        ? recoveryBoundaryRef.current
        : null;
    if (!currentBoundary) {
      throw new Error("현재 공동 편집 복구 경계를 확인할 수 없습니다.");
    }
    const vault = recoveryModule.createStudioCrdtRecoveryVault();
    const entries = await vault.list(outboxScope, workId);
    const matchingEntry = findStudioLiveRecoveryBoundaryEntry(entries, currentBoundary);
    if (!matchingEntry) {
      throw new Error("거부된 변경을 복구 저장소에 보존하는 중입니다. 잠시 뒤 다시 시도해 주세요.");
    }
    await recoveryModule.downloadStudioCrdtRecoveryBundle({
      vault,
      scope: outboxScope,
      workId,
    });
    const exportedRecovery: StudioLiveRecoveryState = {
      ...recovery,
      vaultId: matchingEntry.vaultId,
      updateCount: Math.max(recovery.updateCount, matchingEntry.updates.length),
      exportAvailable: true,
      exported: true,
    };
    if (recoveryBoundaryScopeKey) {
      recoveryBoundaryRef.current = {
        ...currentBoundary,
        recovery: exportedRecovery,
      };
    }
    setRecovery(exportedRecovery);
  };

  const reloadAuthoritative = () => {
    const latchedRecovery =
      recoveryBoundaryRef.current?.scopeKey === recoveryBoundaryScopeKey
        ? recoveryBoundaryRef.current.recovery
        : recovery;
    if (
      terminalTransportState !== "recovery-required" ||
      !latchedRecovery?.exported ||
      typeof globalThis.location?.reload !== "function"
    ) return;
    globalThis.location.reload();
  };

  const value: StudioLiveCollaborationContextValue = {
    room,
    availability,
    mode,
    peers,
    locks,
    chatMessages,
    canChat: participantRole !== null && participantRole !== "viewer",
    error,
    serverAvailable: transportFactory !== undefined,
    localFallbackAllowed,
    usingLocalFallback: transportFactory !== undefined && transportPreference === "local",
    sendChatMessage: (text: string) => {
      if (!room || participantRole === null || participantRole === "viewer") return false;
      try {
        return room.sendChatMessage(text) !== null;
      } catch (cause) {
        setError(messageFrom(cause, "채팅 메시지를 보내지 못했습니다."));
        return false;
      }
    },
    voice: {
      supported: voiceSupported,
      ready: Boolean(room && participantCanVoice && voiceSupported),
      allowed: participantCanVoice,
      state: voiceState,
      networkMode: voiceNetworkMode,
      error: voiceError,
      join: async (options) => {
        const scope = voiceControllerScopeRef.current;
        if (!participantCanVoice || !voiceSupported || !room || scope?.room !== room) {
          voiceErrorScopeRef.current = { code: "action", participantSessionId: null };
          setVoiceError(
            !participantCanVoice
              ? "열람자 권한에서는 음성 작업실에 참여할 수 없습니다."
              : !voiceSupported
                ? "이 브라우저는 마이크 WebRTC 음성 작업실을 지원하지 않습니다."
                : "팀 작업실 연결이 준비되지 않았습니다."
          );
          return false;
        }
        voiceErrorScopeRef.current = null;
        setVoiceError(null);
        setVoiceState((previous) =>
          previous.phase === "idle" ? { ...previous, phase: "joining" } : previous
        );
        try {
          const controller = await ensureVoiceController(scope);
          if (!controller || voiceControllerScopeRef.current !== scope) return false;
          await controller.join(options);
          return voiceControllerBindingRef.current?.controller === controller;
        } catch (cause) {
          if (voiceControllerScopeRef.current === scope) {
            const current = voiceControllerBindingRef.current;
            if (current?.scope === scope) {
              voiceControllerBindingRef.current = null;
              closeStudioVoiceControllerBinding(current);
            }
            setVoiceNetworkMode(null);
            setVoiceState(createEmptyStudioVoiceCallState());
            voiceErrorScopeRef.current = { code: "action", participantSessionId: null };
            setVoiceError(studioVoiceCallErrorMessage(cause));
          }
          return false;
        }
      },
      leave: () => {
        voiceErrorScopeRef.current = null;
        setVoiceError(null);
        const current = voiceControllerBindingRef.current;
        voiceControllerBindingRef.current = null;
        current?.controller.leave();
        closeStudioVoiceControllerBinding(current);
        setVoiceNetworkMode(null);
        setVoiceState(createEmptyStudioVoiceCallState());
      },
      setMuted: (muted) => {
        const changed = voiceControllerBindingRef.current?.controller.setMuted(muted) ?? false;
        if (changed) {
          voiceErrorScopeRef.current = null;
          setVoiceError(null);
        }
        return changed;
      },
      setPushToTalk: (enabled) => {
        const changed =
          voiceControllerBindingRef.current?.controller.setPushToTalk(enabled) ?? false;
        if (changed) {
          voiceErrorScopeRef.current = null;
          setVoiceError(null);
        }
        return changed;
      },
      setPushToTalkPressed: (pressed) =>
        voiceControllerBindingRef.current?.controller.setPushToTalkPressed(pressed) ?? false,
      retryRemoteAudio: async (sessionId) => {
        const controller = voiceControllerBindingRef.current?.controller;
        if (!controller) return false;
        voiceErrorScopeRef.current = null;
        setVoiceError(null);
        try {
          return await controller.retryRemoteAudio(sessionId);
        } catch (cause) {
          if (voiceControllerBindingRef.current?.controller === controller) {
            voiceErrorScopeRef.current = { code: "action", participantSessionId: sessionId };
            setVoiceError(studioVoiceCallErrorMessage(cause));
          }
          return false;
        }
      },
    },
    sync: syncSnapshot,
    recovery,
    exportRecovery,
    reloadAuthoritative,
    retryServer: () => {
      if (!transportFactory || terminalTransportState !== null) return;
      setError(null);
      setTransportPreference("server");
      setTransportRetryKey((value) => value + 1);
    },
    useLocalFallback: () => {
      if (
        !transportFactory ||
        !localFallbackAllowed ||
        terminalTransportState !== null
      ) return;
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
