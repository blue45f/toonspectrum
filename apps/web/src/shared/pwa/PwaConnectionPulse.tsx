import { CheckCircle2, Loader2, WifiOff } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import {
  dispatchPwaOutboxSyncEvent,
  getBrowserPwaOfflineOutbox,
  PWA_OUTBOX_SYNC_EVENT,
  type PwaOutboxSyncReport,
} from "./pwa-offline-outbox";

import { currentPwaOutboxSyncHandler } from "./pwa-outbox-sync-handler";

import "./pwa-connection-pulse.css";

const ConflictPanel = lazy(() =>
  import("./PwaOutboxConflictPanel").then((module) => ({
    default: module.PwaOutboxConflictPanel,
  })),
);

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("pwa-connection-pulse", ko, en);

type PulseState =
  | { kind: "online-hidden" }
  | { kind: "offline" }
  | { kind: "syncing"; done: number; total: number }
  | { kind: "synced-toast"; report: PwaOutboxSyncReport };

const SYNCED_TOAST_MS = 4_500;

/**
 * 화면 우하단의 연결 상태 펄스.
 * - 오프라인: 계속 보이는 상태 pill
 * - 온라인 복귀: 쌓인 아웃박스를 자동 동기화하고 결과를 토스트로 알림
 * - 동기화 중: 진행률 표시
 */
export function PwaConnectionPulse() {
  useBilingualI18nRevision();
  const [state, setState] = useState<PulseState>({ kind: "online-hidden" });
  const [conflictOpen, setConflictOpen] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const clearToastTimer = useCallback(() => {
    if (toastTimer.current !== undefined) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = undefined;
    }
  }, []);

  const runSync = useCallback(async () => {
    const outbox = getBrowserPwaOfflineOutbox();
    if (outbox.pending().length === 0) return;
    dispatchPwaOutboxSyncEvent("started");
    const report = await outbox.syncAll(currentPwaOutboxSyncHandler(), (done, total) => {
      setState({ kind: "syncing", done, total });
      dispatchPwaOutboxSyncEvent("progress", { done, total });
    });
    dispatchPwaOutboxSyncEvent("finished", { report });
    clearToastTimer();
    setState({ kind: "synced-toast", report });
    toastTimer.current = window.setTimeout(() => {
      setState({ kind: "online-hidden" });
      toastTimer.current = undefined;
    }, SYNCED_TOAST_MS);
  }, [clearToastTimer]);

  useEffect(() => {
    const onOnline = () => {
      clearToastTimer();
      void runSync();
      setState((previous) =>
        previous.kind === "syncing" ? previous : { kind: "online-hidden" },
      );
    };
    const onOffline = () => {
      clearToastTimer();
      setState({ kind: "offline" });
    };
    const onSyncEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { phase?: string }
        | undefined;
      if (detail?.phase === "started") {
        setState({ kind: "syncing", done: 0, total: 0 });
      }
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setState({ kind: "offline" });
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(PWA_OUTBOX_SYNC_EVENT, onSyncEvent);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(PWA_OUTBOX_SYNC_EVENT, onSyncEvent);
      clearToastTimer();
    };
  }, [clearToastTimer, runSync]);

  if (state.kind === "online-hidden") return null;

  if (state.kind === "offline") {
    return (
      <div className="pwa-pulse" data-state="offline" role="status" aria-live="polite">
        <WifiOff size={16} aria-hidden="true" />
        <span>{bi("오프라인 — 작업은 기기에 저장돼요", "Offline — work saves on-device")}</span>
      </div>
    );
  }

  if (state.kind === "syncing") {
    return (
      <div className="pwa-pulse" data-state="syncing" role="status" aria-live="polite">
        <Loader2 size={16} aria-hidden="true" className="pwa-pulse__spin" />
        <span>
          {state.total > 0
            ? bi(`동기화 중… ${state.done}/${state.total}`, `Syncing… ${state.done}/${state.total}`)
            : bi("동기화 중…", "Syncing…")}
        </span>
      </div>
    );
  }

  const { report } = state;
  const hasConflicts = report.conflicted > 0;
  return (
    <>
      <div className="pwa-pulse" data-state="synced" role="status" aria-live="polite">
        <CheckCircle2 size={16} aria-hidden="true" />
        <span>
          {hasConflicts
            ? bi(
                `연결됐어요 · ${report.synced}건 동기화, ${report.conflicted}건 확인 필요`,
                `Back online · ${report.synced} synced, ${report.conflicted} need review`,
              )
            : bi(`연결됐어요 · ${report.synced}건 동기화됨`, `Back online · ${report.synced} synced`)}
        </span>
        {hasConflicts && (
          <button
            type="button"
            className="pwa-pulse__conflict-button"
            onClick={() => setConflictOpen(true)}
          >
            {bi("확인하기", "Review")}
          </button>
        )}
      </div>
      {hasConflicts && (
        <Suspense fallback={null}>
          <ConflictPanel open={conflictOpen} onClose={() => setConflictOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
