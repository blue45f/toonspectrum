/**
 * Detached, same-origin companion for Studio. The primary owns the editable document and undo;
 * this window only receives bounded review projections/WebP previews and sends validated intents.
 */
import {
  Eye,
  EyeOff,
  Layers,
  ListChecks,
  LoaderCircle,
  Map,
  MonitorSmartphone,
  MonitorUp,
  Palette,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";

import {
  mergeStudioCompanionBrushPatches,
  planStudioCompanionExternalScreenPlacement,
  StudioCompanionNavigatorObjectUrlOwner,
  type StudioCompanionBrushPatch,
  type StudioCompanionNormalizedPoint,
  type StudioCompanionReviewControl,
  type StudioCompanionReviewProjection,
} from "./studio-companion-review-projection";
import {
  buildStudioCompanionCommand,
  buildStudioCompanionControl,
  buildStudioCompanionHello,
  buildStudioCompanionPing,
  createStudioCompanionChannel,
  createStudioCompanionCommandId,
  createStudioCompanionInstanceId,
  isStudioCompanionMessageFresh,
  isStudioToolsCompanionWindowReusable,
  openStudioCompanionSurfaceWindow,
  parseStudioCompanionMessage,
  parseStudioCompanionSessionId,
  parseStudioCompanionSurface,
  STUDIO_COMPANION_TOOL_LABELS,
  STUDIO_COMPANION_TOOL_ORDER,
  studioCompanionPrimaryUrl,
  type StudioCompanionDensity,
  type StudioCompanionMessage,
  type StudioCompanionSurface,
  type StudioCompanionToolId,
} from "./studio-tools-companion";
import { StudioCompanionNavigator } from "./StudioCompanionNavigator";
import { StudioCompanionReviewConsole } from "./StudioCompanionReviewConsole";
import { StudioCompanionWindowManager } from "./StudioCompanionWindowManager";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

const HEARTBEAT_INTERVAL_MS = 4_000;
const PRIMARY_STALE_AFTER_MS = 12_000;
const BRUSH_CONTROL_COALESCE_MS = 64;
const NAVIGATOR_CONTROL_COALESCE_MS = 32;
const SCREEN_DETAILS_TIMEOUT_MS = 2_500;
const PRESENTATION_SAFE_STORAGE_PREFIX = "toonspectrum.studio.companion.presentation-safe";

type CompanionMode = "tools" | "navigator" | "review";
type DedicatedCompanionSurface = Extract<StudioCompanionSurface, "navigator" | "review">;

type ScreenPlacementStatus = {
  kind: "requesting" | "unsupported" | "denied" | "timeout" | "no-secondary" | "failed" | "requested";
  text: string;
};

type WindowWithScreenDetails = Window & {
  getScreenDetails?: () => Promise<{ screens: readonly unknown[]; currentScreen?: unknown }>;
};

function presentationSafeStorageKey(sessionId: string): string {
  return `${PRESENTATION_SAFE_STORAGE_PREFIX}.${sessionId}`;
}

function readPresentationSafe(sessionId: string | null): boolean {
  if (!sessionId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(presentationSafeStorageKey(sessionId)) === "1";
  } catch {
    return false;
  }
}

function writePresentationSafe(sessionId: string | null, enabled: boolean): void {
  if (!sessionId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(presentationSafeStorageKey(sessionId), enabled ? "1" : "0");
  } catch {
    // Private browsing and hardened WebViews may deny localStorage; local state remains usable.
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function StudioToolsCompanionPage() {
  const location = useLocation();
  const sessionId = parseStudioCompanionSessionId(location.search);
  const surface = parseStudioCompanionSurface(location.search);
  const effectiveSurface: StudioCompanionSurface = surface ?? "workspace";
  const channelRef = useRef<ReturnType<typeof createStudioCompanionChannel>>(null);
  const companionInstanceIdRef = useRef<string | null>(null);
  const targetPrimaryInstanceIdRef = useRef<string | null>(null);
  const pendingPingNonceRef = useRef<string | null>(null);
  const commandSequenceRef = useRef(0);
  const generationRef = useRef(0);
  const projectionRevisionRef = useRef(-1);
  const projectionDocumentRevisionRef = useRef(-1);
  const navigatorSequenceRef = useRef(0);
  const navigatorRevisionRef = useRef(-1);
  const navigatorUrlOwnerRef = useRef<StudioCompanionNavigatorObjectUrlOwner | null>(null);
  navigatorUrlOwnerRef.current ??= new StudioCompanionNavigatorObjectUrlOwner();
  const pendingBrushPatchRef = useRef<StudioCompanionBrushPatch | null>(null);
  const pendingBrushTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const pendingNavigatorPointRef = useRef<StudioCompanionNormalizedPoint | null>(null);
  const pendingNavigatorTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const screenPlacementEpochRef = useRef(0);
  const navigatorDemandActiveRef = useRef(false);
  const previousDocumentTitleRef = useRef<string | null>(null);
  const dedicatedWindowRefs = useRef<Record<DedicatedCompanionSurface, Window | null>>({
    navigator: null,
    review: null,
  });
  const dedicatedWindowOwnerSessionRef = useRef<string | null>(
    surface === "workspace" ? sessionId : null
  );

  const [connected, setConnected] = useState(false);
  const [targetPrimaryInstanceId, setTargetPrimaryInstanceId] = useState<string | null>(null);
  const [primaryTitle, setPrimaryTitle] = useState("스튜디오");
  const [activeTool, setActiveTool] = useState<StudioCompanionToolId>("select");
  const [density, setDensity] = useState<StudioCompanionDensity>("full");
  const [mode, setMode] = useState<CompanionMode>("tools");
  const [projection, setProjection] = useState<StudioCompanionReviewProjection | null>(null);
  const [navigatorImage, setNavigatorImage] = useState<{
    url: string;
    width: number;
    height: number;
    revision: number;
  } | null>(null);
  const [presentationSafeState, setPresentationSafeState] = useState(() => ({
    sessionId,
    enabled: readPresentationSafe(sessionId),
  }));
  const [screenPlacementStatus, setScreenPlacementStatus] = useState<ScreenPlacementStatus | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const presentationSafe = presentationSafeState.sessionId === sessionId
    ? presentationSafeState.enabled
    : readPresentationSafe(sessionId);

  function post(msg: StudioCompanionMessage): boolean {
    try {
      const channel = channelRef.current;
      if (!channel) return false;
      channel.postMessage(msg);
      return true;
    } catch {
      setLastError("채널 전송에 실패했습니다. 기본 스튜디오 탭이 같은 출처인지 확인하세요.");
      return false;
    }
  }

  const clearPendingBrushControl = useCallback(() => {
    if (pendingBrushTimerRef.current !== null) {
      globalThis.clearTimeout(pendingBrushTimerRef.current);
      pendingBrushTimerRef.current = null;
    }
    pendingBrushPatchRef.current = null;
  }, []);

  const clearPendingNavigatorControl = useCallback(() => {
    if (pendingNavigatorTimerRef.current !== null) {
      globalThis.clearTimeout(pendingNavigatorTimerRef.current);
      pendingNavigatorTimerRef.current = null;
    }
    pendingNavigatorPointRef.current = null;
  }, []);

  const clearReviewState = useCallback(() => {
    generationRef.current = 0;
    projectionRevisionRef.current = -1;
    projectionDocumentRevisionRef.current = -1;
    navigatorSequenceRef.current = 0;
    navigatorRevisionRef.current = -1;
    navigatorUrlOwnerRef.current?.clear();
    clearPendingBrushControl();
    clearPendingNavigatorControl();
    setProjection(null);
    setNavigatorImage(null);
  }, [clearPendingBrushControl, clearPendingNavigatorControl]);

  function sendControl(control: StudioCompanionReviewControl): boolean {
    const companionInstanceId = companionInstanceIdRef.current;
    const targetPrimary = targetPrimaryInstanceIdRef.current;
    const generation = generationRef.current;
    if (!connected || !companionInstanceId || !targetPrimary || generation <= 0) return false;
    commandSequenceRef.current += 1;
    return post(buildStudioCompanionControl({
      control,
      generation,
      companionInstanceId,
      targetPrimaryInstanceId: targetPrimary,
      commandId: createStudioCompanionCommandId(),
      sequence: commandSequenceRef.current,
    }));
  }

  function flushBrushControl() {
    if (pendingBrushTimerRef.current !== null) {
      globalThis.clearTimeout(pendingBrushTimerRef.current);
      pendingBrushTimerRef.current = null;
    }
    const patch = pendingBrushPatchRef.current;
    pendingBrushPatchRef.current = null;
    if (patch) sendControl({ kind: "brush", patch });
  }

  function queueBrushControl(patch: StudioCompanionBrushPatch) {
    pendingBrushPatchRef.current = mergeStudioCompanionBrushPatches(
      pendingBrushPatchRef.current,
      patch
    );
    if (pendingBrushTimerRef.current !== null) return;
    pendingBrushTimerRef.current = globalThis.setTimeout(
      flushBrushControl,
      BRUSH_CONTROL_COALESCE_MS
    );
  }

  function flushNavigatorControl() {
    if (pendingNavigatorTimerRef.current !== null) {
      globalThis.clearTimeout(pendingNavigatorTimerRef.current);
      pendingNavigatorTimerRef.current = null;
    }
    const point = pendingNavigatorPointRef.current;
    pendingNavigatorPointRef.current = null;
    if (point) sendControl({ kind: "navigate", point });
  }

  function queueNavigatorControl(point: StudioCompanionNormalizedPoint, final = false) {
    pendingNavigatorPointRef.current = point;
    if (final) {
      flushNavigatorControl();
      return;
    }
    if (pendingNavigatorTimerRef.current !== null) return;
    pendingNavigatorTimerRef.current = globalThis.setTimeout(
      flushNavigatorControl,
      NAVIGATOR_CONTROL_COALESCE_MS
    );
  }

  function changePresentationSafe(enabled: boolean) {
    setPresentationSafeState({ sessionId, enabled });
    writePresentationSafe(sessionId, enabled);
  }

  useEffect(() => {
    previousDocumentTitleRef.current = document.title;
    return () => {
      if (previousDocumentTitleRef.current !== null) {
        document.title = previousDocumentTitleRef.current;
      }
    };
  }, []);

  useEffect(() => {
    document.title = `${effectiveSurface === "workspace"
      ? "도구 창"
      : effectiveSurface === "navigator"
        ? "캔버스 내비게이터"
        : "검수 콘솔"} · ToonSpectrum Studio`;
  }, [effectiveSurface]);

  useEffect(() => {
    const enabled = readPresentationSafe(sessionId);
    setPresentationSafeState({ sessionId, enabled });
    if (!sessionId) return;
    const key = presentationSafeStorageKey(sessionId);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      setPresentationSafeState({ sessionId, enabled: event.newValue === "1" });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [sessionId]);

  useEffect(() => {
    if (surface !== "workspace") return;
    const previousSessionId = dedicatedWindowOwnerSessionRef.current;
    if (previousSessionId === sessionId) return;
    if (previousSessionId) {
      for (const dedicatedSurface of ["navigator", "review"] as const) {
        const companionWindow = dedicatedWindowRefs.current[dedicatedSurface];
        if (!isStudioToolsCompanionWindowReusable(
          previousSessionId,
          companionWindow,
          dedicatedSurface
        )) continue;
        try {
          companionWindow.close();
        } catch {
          // A browser may deny close after ownership changes; the old handle is still released.
        } finally {
          dedicatedWindowRefs.current[dedicatedSurface] = null;
        }
      }
    }
    dedicatedWindowOwnerSessionRef.current = sessionId;
  }, [sessionId, surface]);

  useEffect(() => () => {
    screenPlacementEpochRef.current += 1;
  }, []);

  useEffect(() => {
    setConnected(false);
    setTargetPrimaryInstanceId(null);
    setPrimaryTitle("스튜디오");
    setActiveTool("select");
    setDensity("full");
    setLastError(null);
    setScreenPlacementStatus(null);
    screenPlacementEpochRef.current += 1;
    targetPrimaryInstanceIdRef.current = null;
    pendingPingNonceRef.current = null;
    commandSequenceRef.current = 0;
    channelRef.current = null;
    clearReviewState();

    if (!sessionId) {
      companionInstanceIdRef.current = null;
      setLastError("유효한 분리 세션이 없습니다. 기본 스튜디오에서 도구 창을 다시 열어 주세요.");
      return;
    }
    if (!surface) {
      companionInstanceIdRef.current = null;
      setLastError("유효한 컴패니언 보기 모드가 없습니다. 기본 스튜디오에서 창을 다시 열어 주세요.");
      return;
    }

    const companionInstanceId = createStudioCompanionInstanceId();
    companionInstanceIdRef.current = companionInstanceId;
    const channel = createStudioCompanionChannel(sessionId);
    channelRef.current = channel;
    if (!channel) {
      setLastError("이 브라우저는 BroadcastChannel을 지원하지 않습니다.");
      return;
    }

    let lastPrimaryActivityAt = 0;
    let primaryConfirmed = false;
    const releaseNavigatorDemand = () => {
      if (!navigatorDemandActiveRef.current) return;
      const targetPrimary = targetPrimaryInstanceIdRef.current;
      const generation = generationRef.current;
      if (targetPrimary && generation > 0) {
        commandSequenceRef.current += 1;
        try {
          channel.postMessage(buildStudioCompanionControl({
            control: { kind: "navigator-demand", active: false },
            generation,
            companionInstanceId,
            targetPrimaryInstanceId: targetPrimary,
            commandId: createStudioCompanionCommandId(),
            sequence: commandSequenceRef.current,
          }));
        } catch {
          // Closing the detached window may race the final demand release.
        }
      }
      navigatorDemandActiveRef.current = false;
    };
    const markPrimaryActivity = () => {
      lastPrimaryActivityAt = Date.now();
      primaryConfirmed = true;
      setConnected(true);
      setLastError(null);
    };
    const expirePrimary = () => {
      releaseNavigatorDemand();
      setConnected(false);
      setTargetPrimaryInstanceId(null);
      setPrimaryTitle("스튜디오");
      setActiveTool("select");
      setDensity("full");
      targetPrimaryInstanceIdRef.current = null;
      pendingPingNonceRef.current = null;
      primaryConfirmed = false;
      clearReviewState();
    };

    channel.onmessage = (event: MessageEvent) => {
      const msg = parseStudioCompanionMessage(event.data);
      if (!msg || !isStudioCompanionMessageFresh(msg)) return;
      if (msg.type === "hello" && msg.role === "primary") {
        if (
          msg.targetCompanionInstanceId !== null
          && msg.targetCompanionInstanceId !== companionInstanceId
        ) return;
        const currentPrimary = targetPrimaryInstanceIdRef.current;
        if (currentPrimary && currentPrimary !== msg.primaryInstanceId) return;
        const isNewCandidate = currentPrimary === null;
        targetPrimaryInstanceIdRef.current = msg.primaryInstanceId;
        setTargetPrimaryInstanceId(msg.primaryInstanceId);
        lastPrimaryActivityAt = Date.now();
        if (!primaryConfirmed) setConnected(false);
        if (isNewCandidate) {
          try {
            channel.postMessage(buildStudioCompanionHello({
              role: "companion",
              surface,
              companionInstanceId,
              targetPrimaryInstanceId: msg.primaryInstanceId,
            }));
          } catch {
            // Discovery retries on the next heartbeat.
          }
        }
        return;
      }
      if (msg.type === "primary-state") {
        if (msg.primaryInstanceId !== targetPrimaryInstanceIdRef.current) return;
        if (msg.targetCompanionInstanceId !== companionInstanceId) return;
        markPrimaryActivity();
        setActiveTool(msg.tool);
        setDensity(msg.density);
        setPrimaryTitle(msg.title || "스튜디오");
        return;
      }
      if (msg.type === "primary-review-state") {
        if (msg.primaryInstanceId !== targetPrimaryInstanceIdRef.current) return;
        if (msg.targetCompanionInstanceId !== companionInstanceId) return;
        if (msg.generation < generationRef.current) return;
        if (msg.generation > generationRef.current) {
          navigatorDemandActiveRef.current = false;
          clearPendingBrushControl();
          clearPendingNavigatorControl();
          navigatorUrlOwnerRef.current?.clear();
          setNavigatorImage(null);
          generationRef.current = msg.generation;
          projectionRevisionRef.current = -1;
          projectionDocumentRevisionRef.current = -1;
          navigatorSequenceRef.current = 0;
          navigatorRevisionRef.current = -1;
        }
        if (msg.projection.revision < projectionRevisionRef.current) return;
        if (msg.projection.documentRevision < projectionDocumentRevisionRef.current) return;
        if (
          msg.projection.documentRevision > projectionDocumentRevisionRef.current
          && navigatorRevisionRef.current !== msg.projection.documentRevision
        ) {
          navigatorUrlOwnerRef.current?.clear();
          navigatorRevisionRef.current = -1;
          setNavigatorImage(null);
        }
        projectionRevisionRef.current = msg.projection.revision;
        projectionDocumentRevisionRef.current = msg.projection.documentRevision;
        setProjection(msg.projection);
        markPrimaryActivity();
        return;
      }
      if (msg.type === "navigator-frame") {
        if (msg.primaryInstanceId !== targetPrimaryInstanceIdRef.current) return;
        if (msg.targetCompanionInstanceId !== companionInstanceId) return;
        if (msg.generation !== generationRef.current || msg.generation <= 0) return;
        if (msg.sequence <= navigatorSequenceRef.current) return;
        if (msg.revision !== projectionDocumentRevisionRef.current) return;
        navigatorSequenceRef.current = msg.sequence;
        const url = navigatorUrlOwnerRef.current?.replace(msg.blob);
        if (!url) return;
        navigatorRevisionRef.current = msg.revision;
        setNavigatorImage({ url, width: msg.width, height: msg.height, revision: msg.revision });
        markPrimaryActivity();
        return;
      }
      if (msg.type === "pong") {
        if (msg.primaryInstanceId !== targetPrimaryInstanceIdRef.current) return;
        if (msg.targetCompanionInstanceId !== companionInstanceId) return;
        if (msg.nonce !== pendingPingNonceRef.current) return;
        pendingPingNonceRef.current = null;
        markPrimaryActivity();
      }
    };

    try {
      channel.postMessage(buildStudioCompanionHello({
        role: "companion",
        surface,
        companionInstanceId,
        targetPrimaryInstanceId: null,
      }));
    } catch {
      // The status remains disconnected and heartbeat retries discovery.
    }
    const ping = globalThis.setInterval(() => {
      if (
        lastPrimaryActivityAt > 0
        && Date.now() - lastPrimaryActivityAt >= PRIMARY_STALE_AFTER_MS
      ) expirePrimary();
      const targetPrimary = targetPrimaryInstanceIdRef.current;
      if (!targetPrimary) {
        try {
          channel.postMessage(buildStudioCompanionHello({
            role: "companion",
            surface,
            companionInstanceId,
            targetPrimaryInstanceId: null,
          }));
        } catch {
          // Retry later.
        }
        return;
      }
      const nonce = createStudioCompanionCommandId();
      pendingPingNonceRef.current = nonce;
      try {
        channel.postMessage(buildStudioCompanionPing({
          companionInstanceId,
          targetPrimaryInstanceId: targetPrimary,
          nonce,
        }));
      } catch {
        // Liveness expiry handles a detached peer.
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      screenPlacementEpochRef.current += 1;
      globalThis.clearInterval(ping);
      releaseNavigatorDemand();
      channel.onmessage = null;
      try {
        channel.close();
      } catch {
        // Ignore a channel already closed by the browser.
      }
      if (channelRef.current === channel) channelRef.current = null;
      companionInstanceIdRef.current = null;
      targetPrimaryInstanceIdRef.current = null;
      pendingPingNonceRef.current = null;
      commandSequenceRef.current = 0;
      clearReviewState();
    };
  }, [clearPendingBrushControl, clearPendingNavigatorControl, clearReviewState, sessionId, surface]);

  function sendCommand(command: StudioCompanionToolId | "focus-primary" | "toggle-canvas-only") {
    const companionInstanceId = companionInstanceIdRef.current;
    const targetPrimary = targetPrimaryInstanceIdRef.current;
    if (!connected || !companionInstanceId || !targetPrimary) return;
    commandSequenceRef.current += 1;
    const sent = post(buildStudioCompanionCommand({
      command,
      companionInstanceId,
      targetPrimaryInstanceId: targetPrimary,
      commandId: createStudioCompanionCommandId(),
      sequence: commandSequenceRef.current,
    }));
    if (sent && command !== "focus-primary" && command !== "toggle-canvas-only") {
      setActiveTool(command);
    }
  }

  async function moveToAnotherScreen() {
    const placementEpoch = screenPlacementEpochRef.current + 1;
    screenPlacementEpochRef.current = placementEpoch;
    setScreenPlacementStatus({ kind: "requesting", text: "연결된 화면을 확인하고 있습니다…" });
    const screenWindow = window as WindowWithScreenDetails;
    if (typeof screenWindow.getScreenDetails !== "function") {
      setScreenPlacementStatus({
        kind: "unsupported",
        text: "이 브라우저는 자동 창 배치를 지원하지 않습니다. 창 제목 표시줄을 끌어 직접 옮겨 주세요.",
      });
      return;
    }
    try {
      const details = await withTimeout(
        screenWindow.getScreenDetails(),
        SCREEN_DETAILS_TIMEOUT_MS
      );
      if (screenPlacementEpochRef.current !== placementEpoch) return;
      const placement = planStudioCompanionExternalScreenPlacement({
        screens: details.screens,
        currentScreen: details.currentScreen,
        preferredWidth: effectiveSurface === "navigator" ? 390 : effectiveSurface === "review" ? 420 : 520,
        preferredHeight: effectiveSurface === "workspace" ? 820 : 860,
      });
      if (!placement) {
        setScreenPlacementStatus({
          kind: "no-secondary",
          text: "사용 가능한 다른 화면을 찾지 못했습니다. 화면 연결 상태를 확인해 주세요.",
        });
        return;
      }
      window.moveTo(placement.left, placement.top);
      window.resizeTo(placement.width, placement.height);
      try {
        window.focus();
      } catch {
        // A valid detached window remains usable when focus() is denied.
      }
      setScreenPlacementStatus({
        kind: "requested",
        text: "다른 화면으로 이동을 요청했습니다.",
      });
    } catch (error) {
      if (screenPlacementEpochRef.current !== placementEpoch) return;
      const errorName = error instanceof DOMException ? error.name : "";
      const timedOut = error instanceof Error && error.message === "timeout";
      setScreenPlacementStatus(
        errorName === "NotAllowedError"
          ? {
              kind: "denied",
              text: "창 관리 권한이 필요합니다. 주소창의 사이트 설정에서 권한을 허용하거나 직접 옮겨 주세요.",
            }
          : timedOut
            ? {
                kind: "timeout",
                text: "화면 정보를 받지 못했습니다. 다시 시도하거나 창 제목 표시줄을 끌어 옮겨 주세요.",
              }
            : {
                kind: "failed",
                text: "화면 이동을 요청하지 못했습니다. 창 제목 표시줄을 끌어 직접 옮겨 주세요.",
              }
      );
    }
  }

  function openDedicatedSurface(nextSurface: DedicatedCompanionSurface): boolean {
    if (!sessionId || surface !== "workspace") return false;
    // This must remain synchronous so the user activation reaches window.open before it expires.
    const companionWindow = openStudioCompanionSurfaceWindow(
      sessionId,
      nextSurface,
      dedicatedWindowRefs.current[nextSurface]
    );
    if (!companionWindow) return false;
    dedicatedWindowRefs.current[nextSurface] = companionWindow;
    return true;
  }

  const interactionReady = connected && targetPrimaryInstanceId !== null;
  const visiblePrimaryTitle = presentationSafe ? "스튜디오" : primaryTitle;
  const navigatorSurfaceActive = effectiveSurface === "navigator"
    || (effectiveSurface === "workspace" && mode === "navigator");
  const syncNavigatorDemand = useEffectEvent((active: boolean) => {
    if (navigatorDemandActiveRef.current === active) return;
    if (!active) clearPendingNavigatorControl();
    const sent = sendControl({ kind: "navigator-demand", active });
    if (sent || !active) navigatorDemandActiveRef.current = active;
  });
  useEffect(() => {
    syncNavigatorDemand(
      interactionReady && projection !== null && navigatorSurfaceActive
    );
  }, [interactionReady, navigatorSurfaceActive, projection]);
  const tabs: ReadonlyArray<{ id: CompanionMode; label: string; icon: typeof Palette }> = [
    { id: "tools", label: "도구", icon: Palette },
    { id: "navigator", label: "Navigator", icon: Map },
    { id: "review", label: "검수", icon: ListChecks },
  ];
  const shellTitle = effectiveSurface === "workspace"
    ? visiblePrimaryTitle
    : effectiveSurface === "navigator"
      ? "캔버스 내비게이터"
      : "검수 콘솔";
  const dedicatedLayout = effectiveSurface !== "workspace";
  const screenPlacementBusy = screenPlacementStatus?.kind === "requesting";

  function handleModeTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    setMode(next.id);
    globalThis.requestAnimationFrame?.(() => {
      document.getElementById(`companion-mode-tab-${next.id}`)?.focus();
    });
  }

  return (
    <div
      data-testid="studio-tools-companion-root"
      data-companion-surface={effectiveSurface}
      className="flex min-h-dvh flex-col overflow-x-hidden bg-canvas text-fg [--studio-safe-bottom:env(safe-area-inset-bottom)] [--studio-safe-left:env(safe-area-inset-left)] [--studio-safe-right:env(safe-area-inset-right)] [--studio-safe-top:env(safe-area-inset-top)]"
    >
      <header className="sticky top-0 z-20 border-b border-line bg-panel/95 pb-2 backdrop-blur-xl [padding-left:max(0.75rem,var(--studio-safe-left))] [padding-right:max(0.75rem,var(--studio-safe-right))] [padding-top:max(0.65rem,var(--studio-safe-top))]">
        <div className="flex items-start gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
            <MonitorSmartphone className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[0.9rem] font-semibold tracking-tight">{shellTitle}</h1>
            <p role="status" aria-live="polite" className="mt-0.5 truncate text-xs text-fg-2">
              {interactionReady ? (
                <span className="text-good">
                  {presentationSafe
                    ? "연결됨 · 발표 안전"
                    : effectiveSurface === "workspace"
                      ? `연결됨 · ${visiblePrimaryTitle}`
                      : "연결됨 · 기본 스튜디오"}
                </span>
              ) : (
                <span className="text-warn">연결 대기 · 기본 스튜디오를 확인하세요</span>
              )}
              <span className="text-fg-3"> · 밀도 {density}</span>
            </p>
          </div>
          <button
            type="button"
            disabled={!sessionId}
            aria-label={presentationSafe ? "발표 안전 끄기" : "발표 안전 켜기"}
            aria-pressed={presentationSafe}
            title={presentationSafe ? "발표 안전 끄기" : "발표 안전 켜기"}
            onClick={() => changePresentationSafe(!presentationSafe)}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl border outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-45",
              presentationSafe
                ? "border-good/45 bg-good/10 text-good"
                : "border-line bg-card text-fg-2 hover:bg-raised"
            )}
          >
            {presentationSafe
              ? <EyeOff className="size-4" aria-hidden />
              : <Eye className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            disabled={screenPlacementBusy}
            aria-busy={screenPlacementBusy}
            aria-label={screenPlacementBusy ? "다른 화면을 확인하는 중" : "다른 화면으로 창 이동"}
            title="다른 화면으로 창 이동"
            onClick={() => void moveToAnotherScreen()}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-2 outline-none transition-colors motion-reduce:transition-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-wait disabled:opacity-60"
          >
            {screenPlacementBusy
              ? <LoaderCircle className="size-4 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden />
              : <MonitorUp className="size-4" aria-hidden />}
          </button>
        </div>
        {effectiveSurface === "workspace" ? (
          <div
            role="tablist"
            className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-line bg-card p-1"
            aria-label="컴패니언 모드"
          >
            {tabs.map(({ id, label, icon: Icon }, index) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`companion-mode-tab-${id}`}
                aria-selected={mode === id}
                aria-controls={`companion-mode-panel-${id}`}
                tabIndex={mode === id ? 0 : -1}
                onClick={() => setMode(id)}
                onKeyDown={(event) => handleModeTabKeyDown(event, index)}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-accent/35",
                  mode === id ? "bg-raised text-fg shadow-sm" : "text-fg-3 hover:text-fg-2"
                )}
              >
                <Icon className="size-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <main className={cn(
        "mx-auto w-full max-w-xl pt-4 [padding-bottom:max(1rem,var(--studio-safe-bottom))] [padding-left:max(0.75rem,var(--studio-safe-left))] [padding-right:max(0.75rem,var(--studio-safe-right))]",
        dedicatedLayout ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4"
      )}>
        {lastError ? (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
            {lastError}
          </p>
        ) : null}
        {screenPlacementStatus ? (
          <p
            role={screenPlacementStatus.kind === "requesting" || screenPlacementStatus.kind === "requested"
              ? "status"
              : "alert"}
            aria-live={screenPlacementStatus.kind === "requesting" || screenPlacementStatus.kind === "requested"
              ? "polite"
              : undefined}
            className={cn(
              "rounded-xl border px-3 py-2 text-xs",
              screenPlacementStatus.kind === "requested"
                ? "border-good/35 bg-good/10 text-good"
                : screenPlacementStatus.kind === "requesting"
                  ? "border-line bg-card text-fg-2"
                  : "border-warn/35 bg-warn/10 text-warn"
            )}
          >
            {screenPlacementStatus.text}
          </p>
        ) : null}
        {!interactionReady && sessionId && dedicatedLayout ? (
          <a
            href={studioCompanionPrimaryUrl(
              sessionId,
              typeof window !== "undefined" ? window.location.origin : "",
              location.search
            )}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonClass({ size: "sm", variant: "solid" }), "min-h-11 justify-start gap-2 no-underline")}
          >
            <WandSparkles className="size-3.5" aria-hidden /> 스튜디오 다시 연결
          </a>
        ) : null}

        {effectiveSurface === "workspace" ? (
          <div
            role="tabpanel"
            id="companion-mode-panel-tools"
            aria-labelledby="companion-mode-tab-tools"
            hidden={mode !== "tools"}
            className="space-y-4"
          >
            <section aria-label="도구 팔레트" className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">도구</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {STUDIO_COMPANION_TOOL_ORDER.map((tool) => {
                  const active = activeTool === tool;
                  return (
                    <button
                      key={tool}
                      type="button"
                      disabled={!interactionReady}
                      aria-pressed={active}
                      onClick={() => sendCommand(tool)}
                      className={cn(
                        "min-h-11 rounded-xl border px-3 py-2.5 text-left text-[0.78rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        active
                          ? "border-accent/50 bg-accent-soft text-fg ring-1 ring-accent/25"
                          : "border-line/60 bg-card text-fg-2 hover:bg-raised"
                      )}
                    >
                      {STUDIO_COMPANION_TOOL_LABELS[tool]}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">화면</p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  disabled={!interactionReady}
                  onClick={() => sendCommand("focus-primary")}
                  className={cn(buttonClass({ size: "sm", variant: "outline" }), "min-h-11 justify-start gap-2")}
                >
                  <Sparkles className="size-3.5" aria-hidden /> 기본 탭 앞으로
                </button>
                <button
                  type="button"
                  disabled={!interactionReady}
                  onClick={() => sendCommand("toggle-canvas-only")}
                  className={cn(buttonClass({ size: "sm", variant: "quiet" }), "min-h-11 justify-start gap-2")}
                >
                  <Layers className="size-3.5" aria-hidden /> 캔버스만 토글
                </button>
                {!interactionReady && sessionId ? (
                  <a
                    href={studioCompanionPrimaryUrl(
                      sessionId,
                      typeof window !== "undefined" ? window.location.origin : "",
                      location.search
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonClass({ size: "sm", variant: "solid" }), "min-h-11 justify-start gap-2 no-underline")}
                  >
                    <WandSparkles className="size-3.5" aria-hidden /> 스튜디오 다시 연결
                  </a>
                ) : null}
              </div>
            </section>
            <StudioCompanionWindowManager
              disabled={!sessionId || surface !== "workspace"}
              onOpenSurface={openDedicatedSurface}
            />
          </div>
        ) : null}

        {effectiveSurface === "workspace" || effectiveSurface === "navigator" ? (
          <div
            role={effectiveSurface === "workspace" ? "tabpanel" : undefined}
            id="companion-mode-panel-navigator"
            aria-labelledby={effectiveSurface === "workspace" ? "companion-mode-tab-navigator" : undefined}
            aria-label={effectiveSurface === "navigator" ? "캔버스 내비게이터" : undefined}
            hidden={effectiveSurface === "workspace" && mode !== "navigator"}
            className={cn(dedicatedLayout && "flex min-h-0 flex-1 flex-col")}
          >
            <StudioCompanionNavigator
              imageUrl={navigatorImage?.url ?? null}
              imageWidth={navigatorImage?.width ?? 0}
              imageHeight={navigatorImage?.height ?? 0}
              viewport={projection?.viewport ?? { x: 0, y: 0, width: 1, height: 1 }}
              connected={interactionReady}
              captureAllowed={projection?.captureAllowed ?? false}
              layout={dedicatedLayout ? "dedicated" : "embedded"}
              onNavigate={queueNavigatorControl}
            />
          </div>
        ) : null}

        {effectiveSurface === "workspace" || effectiveSurface === "review" ? (
          <div
            role={effectiveSurface === "workspace" ? "tabpanel" : undefined}
            id="companion-mode-panel-review"
            aria-labelledby={effectiveSurface === "workspace" ? "companion-mode-tab-review" : undefined}
            aria-label={effectiveSurface === "review" ? "검수 콘솔" : undefined}
            hidden={effectiveSurface === "workspace" && mode !== "review"}
            className={cn(dedicatedLayout && "flex min-h-0 flex-1 flex-col")}
          >
            <StudioCompanionReviewConsole
              projection={projection}
              connected={interactionReady}
              presentationSafe={presentationSafe}
              layout={dedicatedLayout ? "dedicated" : "embedded"}
              onSelectLayer={(layerId) => sendControl({ kind: "select-layer", layerId })}
              onHistory={(action) => sendControl({ kind: "history", action })}
              onCommentFocus={(threadId) => sendControl({ kind: "comment-focus", threadId })}
              onBrushPatch={queueBrushControl}
            />
          </div>
        ) : null}

        <p className={cn("text-xs leading-relaxed text-fg-3", dedicatedLayout && "shrink-0")}>
          편집 문서는 기본 탭만 소유합니다. 이 창은 같은 브라우저의 BroadcastChannel로 압축 미리보기와 검수 의도만 전달하므로 별도 서버 비용이 없습니다.
        </p>
      </main>
    </div>
  );
}

export default StudioToolsCompanionPage;
