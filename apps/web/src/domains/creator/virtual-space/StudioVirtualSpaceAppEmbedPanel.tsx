import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, X } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_APP_BRIDGE_REQUEST,
  createStudioAppBridgeResponse,
  parseStudioAppBridgeMessage,
  resolveStudioAppEmbedSandbox,
  resolveStudioAppEmbedTarget,
  shouldHandleStudioAppBridgeMessage,
  studioAppEmbedPanelTitle,
  studioAppEmbedTargetOrigin,
  type StudioAppEmbedTarget,
} from "./studio-virtual-space-app-embed";
import {
  STUDIO_APP_TIMER_PRESET_MINUTES,
  createStudioAppTimer,
  formatStudioAppTimerClock,
  pauseStudioAppTimer,
  resetStudioAppTimer,
  startStudioAppTimer,
  studioAppTimerProgress,
  tickStudioAppTimer,
  type StudioAppTimerState,
} from "./studio-virtual-space-app-timer";
import type { StudioTileEffectOf } from "./studio-virtual-space-tile-effects";

type Bilingual = (ko: string, en: string) => string;

/** 내장 예시 앱: 집중 타이머. app-timer 상태 머신을 interval로 굴린다. */
function BuiltinTimerBody({ bt }: { readonly bt: Bilingual }) {
  const [timer, setTimer] = useState<StudioAppTimerState>(() => createStudioAppTimer(25));

  useEffect(() => {
    if (!timer.running) return;
    const handle = setInterval(() => {
      setTimer((current) => tickStudioAppTimer(current, Date.now()));
    }, 250);
    return () => clearInterval(handle);
  }, [timer.running]);

  const progress = studioAppTimerProgress(timer);
  return (
    <div>
      <p className="text-center text-4xl font-bold tabular-nums" role="timer" aria-live="off">
        {formatStudioAppTimerClock(timer.remainingMs)}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {timer.finished
        ? <p className="mt-3 text-center text-xs font-semibold" role="status">{bt("⏰ 시간 끝! 잠시 쉬어가세요.", "⏰ Time's up! Take a short break.")}</p>
        : null}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {STUDIO_APP_TIMER_PRESET_MINUTES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className="min-h-11 rounded-lg border border-line px-3 text-xs disabled:opacity-50"
            onClick={() => setTimer(createStudioAppTimer(minutes))}
          >
            {bt(`${minutes}분`, `${minutes} min`)}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {timer.running
          ? (
            <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs" onClick={() => setTimer((current) => pauseStudioAppTimer(current, Date.now()))}>
              <Pause size={14} aria-hidden /> {bt("일시정지", "Pause")}
            </button>
          )
          : (
            <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs disabled:opacity-50" disabled={timer.finished} onClick={() => setTimer((current) => startStudioAppTimer(current, Date.now()))}>
              <Play size={14} aria-hidden /> {timer.remainingMs < timer.durationMs ? bt("계속", "Resume") : bt("시작", "Start")}
            </button>
          )}
        <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs" onClick={() => setTimer((current) => resetStudioAppTimer(current))}>
          <RotateCcw size={14} aria-hidden /> {bt("리셋", "Reset")}
        </button>
      </div>
    </div>
  );
}

interface StudioVirtualSpaceAppEmbedPanelProps {
  /** 열 app 이펙트 (createTileEffect로 살균된 정의). */
  readonly effect: StudioTileEffectOf<"app">;
  /** postMessage 브리지 컨텍스트에 실을 월드 id. */
  readonly worldId: string;
  /** 브리지 응답·문구 로캘. */
  readonly locale?: "ko" | "en";
  readonly onClose: () => void;
}

/**
 * T4-lite 인월드 앱 패널. app 타일에 근접하면 페이지가 이 패널을 연다.
 * - http(s) 대상: sandbox="allow-scripts" iframe. allowApi일 때만 postMessage 브리지 응답.
 * - 내장 앱(toonstudio://timer): 패널 안에서 네이티브로 렌더한다.
 */
export function StudioVirtualSpaceAppEmbedPanel({ effect, worldId, locale = "ko", onClose }: StudioVirtualSpaceAppEmbedPanelProps) {
  const bt = useBilingual("StudioVirtualSpaceAppEmbedPanel");
  const target: StudioAppEmbedTarget | null = resolveStudioAppEmbedTarget(effect);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!target || target.type !== "iframe") return;
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || !shouldHandleStudioAppBridgeMessage(effect.allowApi, event.source, frame.contentWindow)) return;
      const message = parseStudioAppBridgeMessage(event.data);
      if (!message || message.type !== STUDIO_APP_BRIDGE_REQUEST) return;
      const origin = studioAppEmbedTargetOrigin(target.src);
      if (!origin) return;
      // getContext는 읽기 전용 컨텍스트만 돌려준다.
      frame.contentWindow?.postMessage(
        createStudioAppBridgeResponse(message.requestId, { app: "toonstudio-virtual-space", locale, worldId }),
        origin,
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [effect.allowApi, locale, target, worldId]);

  if (!target) return null;
  const title = studioAppEmbedPanelTitle(bt, effect.title, target);

  return (
    <section className="vs2-panel studio-vspace-app-embed-panel" aria-label={title} data-space-interactive="true" data-app-embed="true">
      <header className="flex items-start justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs" onClick={onClose} aria-label={bt("앱 닫기", "Close app")}>
          <X size={14} aria-hidden />
        </button>
      </header>
      {target.type === "iframe"
        ? (
          <>
            <iframe
              ref={iframeRef}
              className="mt-3 h-72 w-full rounded-xl border border-line bg-white/5"
              sandbox={resolveStudioAppEmbedSandbox(target.allowApi)}
              src={target.src}
              title={title}
            />
            <p className="mt-2 text-xs text-fg-2">
              {target.allowApi
                ? bt("이 앱은 스페이스 정보를 읽을 수 있어요 (postMessage 브리지).", "This app can read space info via the postMessage bridge.")
                : bt("이 앱은 샌드박스 안에서만 열려요. 스페이스 정보에는 접근할 수 없어요.", "This app runs in a sandbox and cannot access space info.")}
            </p>
          </>
        )
        : <div className="mt-3"><BuiltinTimerBody bt={bt} /></div>}
    </section>
  );
}
