/**
 * Tools companion window — multi-display mode without dual full editors.
 * Mirrors tool intents to the primary Studio tab via BroadcastChannel.
 */
import { Layers, MonitorSmartphone, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  buildStudioCompanionCommand,
  buildStudioCompanionHello,
  buildStudioCompanionPing,
  createStudioCompanionChannel,
  createStudioCompanionCommandId,
  createStudioCompanionInstanceId,
  isStudioCompanionMessageFresh,
  parseStudioCompanionSessionId,
  parseStudioCompanionMessage,
  STUDIO_COMPANION_TOOL_LABELS,
  STUDIO_COMPANION_TOOL_ORDER,
  studioCompanionPrimaryUrl,
  type StudioCompanionDensity,
  type StudioCompanionMessage,
  type StudioCompanionToolId,
} from "./studio-tools-companion";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

const HEARTBEAT_INTERVAL_MS = 4_000;
const PRIMARY_STALE_AFTER_MS = 12_000;

export function StudioToolsCompanionPage() {
  const location = useLocation();
  const sessionId = parseStudioCompanionSessionId(location.search);
  const channelRef = useRef<ReturnType<typeof createStudioCompanionChannel>>(null);
  const companionInstanceIdRef = useRef<string | null>(null);
  const targetPrimaryInstanceIdRef = useRef<string | null>(null);
  const pendingPingNonceRef = useRef<string | null>(null);
  const commandSequenceRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [targetPrimaryInstanceId, setTargetPrimaryInstanceId] = useState<string | null>(null);
  const [primaryTitle, setPrimaryTitle] = useState("스튜디오");
  const [activeTool, setActiveTool] = useState<StudioCompanionToolId>("select");
  const [density, setDensity] = useState<StudioCompanionDensity>("full");
  const [lastError, setLastError] = useState<string | null>(null);

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

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "도구 창 · ToonSpectrum Studio";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    setConnected(false);
    setTargetPrimaryInstanceId(null);
    setPrimaryTitle("스튜디오");
    setActiveTool("select");
    setDensity("full");
    targetPrimaryInstanceIdRef.current = null;
    pendingPingNonceRef.current = null;
    commandSequenceRef.current = 0;
    channelRef.current = null;

    if (!sessionId) {
      companionInstanceIdRef.current = null;
      setLastError("유효한 분리 세션이 없습니다. 기본 스튜디오에서 도구 창을 다시 열어 주세요.");
      return;
    }

    setLastError(null);
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
    const markPrimaryActivity = () => {
      lastPrimaryActivityAt = Date.now();
      primaryConfirmed = true;
      setConnected(true);
      setLastError(null);
    };

    channel.onmessage = (ev: MessageEvent) => {
      const msg = parseStudioCompanionMessage(ev.data);
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
              companionInstanceId,
              targetPrimaryInstanceId: msg.primaryInstanceId,
            }));
          } catch {
            // ignore
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
        companionInstanceId,
        targetPrimaryInstanceId: null,
      }));
    } catch {
      // ignore
    }
    const ping = globalThis.setInterval(() => {
      if (
        lastPrimaryActivityAt > 0
        && Date.now() - lastPrimaryActivityAt >= PRIMARY_STALE_AFTER_MS
      ) {
        setConnected(false);
        setTargetPrimaryInstanceId(null);
        setPrimaryTitle("스튜디오");
        setActiveTool("select");
        setDensity("full");
        targetPrimaryInstanceIdRef.current = null;
        pendingPingNonceRef.current = null;
        primaryConfirmed = false;
      }
      const targetPrimary = targetPrimaryInstanceIdRef.current;
      if (!targetPrimary) {
        try {
          channel.postMessage(buildStudioCompanionHello({
            role: "companion",
            companionInstanceId,
            targetPrimaryInstanceId: null,
          }));
        } catch {
          // ignore
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
        // ignore
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      globalThis.clearInterval(ping);
      channel.onmessage = null;
      try {
        channel.close();
      } catch {
        // ignore
      }
      if (channelRef.current === channel) channelRef.current = null;
      companionInstanceIdRef.current = null;
      targetPrimaryInstanceIdRef.current = null;
      pendingPingNonceRef.current = null;
      commandSequenceRef.current = 0;
    };
  }, [sessionId]);

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

  const interactionReady = connected && targetPrimaryInstanceId !== null;

  return (
    <div
      data-testid="studio-tools-companion-root"
      className="min-h-dvh overflow-x-hidden bg-canvas text-fg [--studio-safe-bottom:env(safe-area-inset-bottom)] [--studio-safe-left:env(safe-area-inset-left)] [--studio-safe-right:env(safe-area-inset-right)] [--studio-safe-top:env(safe-area-inset-top)]"
    >
      <header className="border-b border-line bg-gradient-to-br from-accent-soft/35 via-panel to-panel pb-3 [padding-left:max(1rem,var(--studio-safe-left))] [padding-right:max(1rem,var(--studio-safe-right))] [padding-top:max(0.75rem,var(--studio-safe-top))]">
        <div className="flex items-start gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent">
            <MonitorSmartphone className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[0.95rem] font-semibold tracking-tight">도구 컴패니언</p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
              캔버스는 기본 탭에 두고, 여기서 도구만 고릅니다. 문서·실행취소는 기본 탭이 소유합니다.
            </p>
            <p role="status" aria-live="polite" className="mt-1 truncate text-xs text-fg-2">
              {interactionReady ? (
                <span className="text-good">연결됨 · {primaryTitle}</span>
              ) : (
                <span className="text-warn">연결 대기 · 기본 스튜디오 탭을 열어 주세요</span>
              )}
              <span className="text-fg-3"> · 밀도 {density}</span>
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 pt-4 [padding-bottom:max(1rem,var(--studio-safe-bottom))] [padding-left:max(1rem,var(--studio-safe-left))] [padding-right:max(1rem,var(--studio-safe-right))]">
        {lastError ? (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
            {lastError}
          </p>
        ) : null}

        <section aria-label="도구 팔레트" className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-3">도구</p>
          <div className="grid grid-cols-2 gap-1.5">
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
              <Sparkles className="size-3.5" aria-hidden />
              기본 탭 앞으로
            </button>
            <button
              type="button"
              disabled={!interactionReady}
              onClick={() => sendCommand("toggle-canvas-only")}
              className={cn(buttonClass({ size: "sm", variant: "quiet" }), "min-h-11 justify-start gap-2")}
            >
              <Layers className="size-3.5" aria-hidden />
              캔버스만 토글
            </button>
            {!interactionReady && sessionId ? (
              <a
                href={studioCompanionPrimaryUrl(
                  sessionId,
                  typeof window !== "undefined" ? window.location.origin : "",
                  location.search,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonClass({ size: "sm", variant: "solid" }), "min-h-11 justify-start gap-2 no-underline")}
              >
                <WandSparkles className="size-3.5" aria-hidden />
                스튜디오 다시 연결
              </a>
            ) : null}
            <p className="text-xs leading-relaxed text-fg-3">
              브라우저가 자동 창 전환을 제한하면 기본 스튜디오 탭을 직접 선택해 주세요.
            </p>
          </div>
        </section>

        <p className="text-xs leading-relaxed text-fg-3">
          같은 브라우저·같은 사이트에서만 동작합니다. 실시간 문서 동기화(CRDT)가 아니라 도구 의도를
          전달하는 경량 모드입니다.
        </p>
      </main>
    </div>
  );
}

export default StudioToolsCompanionPage;
