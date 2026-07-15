/**
 * Tools companion window — multi-display mode without dual full editors.
 * Mirrors tool intents to the primary Studio tab via BroadcastChannel.
 */
import { Layers, MonitorSmartphone, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  buildStudioCompanionCommand,
  buildStudioCompanionHello,
  createStudioCompanionChannel,
  parseStudioCompanionMessage,
  STUDIO_COMPANION_TOOL_LABELS,
  STUDIO_COMPANION_TOOL_ORDER,
  type StudioCompanionMessage,
  type StudioCompanionToolId,
} from "./studio-tools-companion";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

export function StudioToolsCompanionPage() {
  const channelRef = useRef<ReturnType<typeof createStudioCompanionChannel>>(null);
  const [connected, setConnected] = useState(false);
  const [primaryTitle, setPrimaryTitle] = useState("스튜디오");
  const [activeTool, setActiveTool] = useState<StudioCompanionToolId>("select");
  const [density, setDensity] = useState("full");
  const [lastError, setLastError] = useState<string | null>(null);

  function post(msg: StudioCompanionMessage) {
    try {
      channelRef.current?.postMessage(msg);
    } catch {
      setLastError("채널 전송에 실패했습니다. 기본 스튜디오 탭이 같은 출처인지 확인하세요.");
    }
  }

  useEffect(() => {
    document.title = "도구 창 · ToonSpectrum Studio";
    const channel = createStudioCompanionChannel();
    channelRef.current = channel;
    if (!channel) {
      setLastError("이 브라우저는 BroadcastChannel을 지원하지 않습니다.");
      return;
    }

    channel.onmessage = (ev: MessageEvent) => {
      const msg = parseStudioCompanionMessage(ev.data);
      if (!msg) return;
      if (msg.type === "hello" && msg.role === "primary") {
        setConnected(true);
        try {
          channel.postMessage(buildStudioCompanionHello("companion"));
        } catch {
          // ignore
        }
      }
      if (msg.type === "primary-state") {
        setConnected(true);
        setActiveTool(msg.tool);
        setDensity(msg.density);
        setPrimaryTitle(msg.title || "스튜디오");
      }
      if (msg.type === "pong" || msg.type === "ping") {
        setConnected(true);
      }
    };

    try {
      channel.postMessage(buildStudioCompanionHello("companion"));
    } catch {
      // ignore
    }
    const ping = globalThis.setInterval(() => {
      try {
        channel.postMessage({ v: 1, type: "ping", at: Date.now() });
      } catch {
        // ignore
      }
    }, 4000);

    return () => {
      globalThis.clearInterval(ping);
      try {
        channel.close();
      } catch {
        // ignore
      }
      channelRef.current = null;
    };
  }, []);

  function sendCommand(command: StudioCompanionToolId | "focus-primary" | "toggle-canvas-only") {
    post(buildStudioCompanionCommand(command));
    if (command !== "focus-primary" && command !== "toggle-canvas-only") {
      setActiveTool(command);
    }
  }

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className="border-b border-line bg-gradient-to-br from-accent-soft/35 via-panel to-panel px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent">
            <MonitorSmartphone className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[0.95rem] font-semibold tracking-tight">도구 컴패니언</p>
            <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
              캔버스는 기본 탭에 두고, 여기서 도구만 고릅니다. 문서·실행취소는 기본 탭이 소유합니다.
            </p>
            <p className="mt-1 truncate text-[0.65rem] text-fg-2">
              {connected ? (
                <span className="text-good">연결됨 · {primaryTitle}</span>
              ) : (
                <span className="text-warn">기본 스튜디오 탭을 열어 두면 연결됩니다</span>
              )}
              <span className="text-fg-3"> · 밀도 {density}</span>
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 p-4">
        {lastError ? (
          <p className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-[0.72rem] text-bad">{lastError}</p>
        ) : null}

        <section aria-label="도구 팔레트" className="space-y-2">
          <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">도구</p>
          <div className="grid grid-cols-2 gap-1.5">
            {STUDIO_COMPANION_TOOL_ORDER.map((tool) => {
              const active = activeTool === tool;
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => sendCommand(tool)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-[0.78rem] font-semibold transition-colors",
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
          <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">화면</p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => sendCommand("focus-primary")}
              className={cn(buttonClass({ size: "sm", variant: "outline" }), "justify-start gap-2")}
            >
              <Sparkles className="size-3.5" aria-hidden />
              기본 탭 앞으로
            </button>
            <button
              type="button"
              onClick={() => sendCommand("toggle-canvas-only")}
              className={cn(buttonClass({ size: "sm", variant: "quiet" }), "justify-start gap-2")}
            >
              <Layers className="size-3.5" aria-hidden />
              캔버스만 토글
            </button>
            <a
              href="/studio"
              className={cn(buttonClass({ size: "sm", variant: "solid" }), "justify-start gap-2 no-underline")}
            >
              <WandSparkles className="size-3.5" aria-hidden />
              스튜디오 다시 열기
            </a>
          </div>
        </section>

        <p className="text-[0.62rem] leading-relaxed text-fg-3">
          같은 브라우저·같은 사이트에서만 동작합니다. 실시간 문서 동기화(CRDT)가 아니라 도구 의도를
          전달하는 경량 모드입니다.
        </p>
      </main>
    </div>
  );
}

export default StudioToolsCompanionPage;
