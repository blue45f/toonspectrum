import { useCallback, useEffect, useRef, useState } from "react";

import {
  inspectStudioOfflineDevice,
  prepareLoadedStudioOfflineResources,
  requestStudioPersistentStorage,
  type StudioOfflineDeviceState,
} from "./studio-offline-client";
import { useStudioConnectivity } from "./use-studio-connectivity";

function dataSaverEnabled(): boolean {
  try {
    return Boolean((navigator as Navigator & {
      connection?: { readonly saveData?: boolean };
    }).connection?.saveData);
  } catch {
    return false;
  }
}

/** Resource readiness is deliberately separate from manuscript-save durability. */
export function StudioOfflinePanel() {
  const connectivity = useStudioConnectivity();
  const [device, setDevice] = useState<StudioOfflineDeviceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [message, setMessage] = useState(
    "스튜디오가 열린 뒤 현재 버전의 필수 편집 도구를 이 기기에 자동으로 준비합니다.",
  );
  const mounted = useRef(false);
  const operation = useRef(false);
  const automaticAttempt = useRef<string | null>(null);
  const previousServerAvailable = useRef(connectivity.serverAvailable);

  const refresh = useCallback(async (): Promise<StudioOfflineDeviceState | null> => {
    const value = await inspectStudioOfflineDevice();
    if (!mounted.current) return null;
    setDevice(value);
    if (value.offlineReady !== null) setPrepared(value.offlineReady);
    return value;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const invalidate = (): void => {
      automaticAttempt.current = null;
      void refresh();
    };
    window.addEventListener("online", invalidate);
    window.addEventListener("offline", invalidate);
    let workers: ServiceWorkerContainer | undefined;
    try {
      workers = navigator.serviceWorker;
      workers?.addEventListener("controllerchange", invalidate);
    } catch {
      // Restricted frames keep the editor usable without offline preparation.
    }
    return () => {
      mounted.current = false;
      window.removeEventListener("online", invalidate);
      window.removeEventListener("offline", invalidate);
      workers?.removeEventListener("controllerchange", invalidate);
    };
  }, [refresh]);

  const prepare = useCallback(async (automatic = false): Promise<void> => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setPrepared(false);
    setMessage(automatic
      ? "오프라인 전환에 필요한 편집 도구를 백그라운드에서 준비하고 있습니다. 작업은 계속할 수 있습니다."
      : "현재 버전의 편집 도구를 다시 확인하고 있습니다. 원고를 서버로 보내거나 화면을 새로고침하지 않습니다.");
    try {
      const report = await prepareLoadedStudioOfflineResources();
      if (!mounted.current) return;
      setPrepared(report.complete);
      setMessage(report.complete
        ? `오프라인 전환 준비가 완료됐습니다. 편집 리소스 ${report.cached}개를 이 기기에서 확인했습니다.`
        : `${report.checked}개 중 ${report.cached}개를 준비했습니다. 일부 도구는 연결이 필요할 수 있어 연결 상태가 바뀌면 다시 확인합니다.`);
      await refresh();
    } catch (cause) {
      if (mounted.current) {
        setMessage(cause instanceof Error
          ? cause.message
          : "오프라인 자동 준비에 실패했습니다. 연결이 복구되면 다시 시도합니다.");
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [refresh]);

  useEffect(() => {
    const recovered = !previousServerAvailable.current && connectivity.serverAvailable;
    previousServerAvailable.current = connectivity.serverAvailable;
    if (!recovered) return;
    automaticAttempt.current = null;
    void refresh();
  }, [connectivity.serverAvailable, refresh]);

  useEffect(() => {
    if (
      !device?.supported
      || !device.controlled
      || device.offlineReady === true
      || !connectivity.browserOnline
      || dataSaverEnabled()
    ) return;
    const key = device.buildId ?? "current";
    if (automaticAttempt.current === key) return;
    automaticAttempt.current = key;
    const timer = window.setTimeout(() => { void prepare(true); }, 1_200);
    return () => window.clearTimeout(timer);
  }, [connectivity.browserOnline, connectivity.serverAvailable, device, prepare]);

  const persist = async (): Promise<void> => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      const granted = await requestStudioPersistentStorage();
      if (!mounted.current) return;
      setMessage(granted === true
        ? "브라우저가 지속 저장을 허용했습니다. 사이트 데이터를 직접 지우면 원고도 삭제되므로 프로젝트 파일 백업은 함께 유지해 주세요."
        : "브라우저가 지속 저장을 허용하지 않았거나 지원하지 않습니다. 로컬 자동 저장은 계속되지만 프로젝트 파일 백업을 권장합니다.");
      await refresh();
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const storagePercent = device?.usage !== null && device?.quota
    && device.usage !== undefined
    ? Math.round(device.usage / device.quota * 100)
    : null;
  const ready = prepared || device?.offlineReady === true;
  const summary = connectivity.mode === "offline"
    ? ready ? "오프라인 모드 · 로컬 작업 중" : "오프라인 모드 · 준비된 기능만 사용"
    : connectivity.mode === "server-unavailable"
      ? "서버 장애 · 로컬 작업 중"
      : connectivity.mode === "reconnecting"
        ? "서버 연결 확인 중"
        : device?.navigationFallback
          ? "저장된 스튜디오 · 로컬 작업 중"
          : ready
            ? "오프라인 자동 준비 완료"
            : busy
              ? "오프라인 자동 준비 중"
              : "오프라인 자동 준비";

  return (
    <aside
      className="fixed bottom-24 right-3 z-40 max-w-[min(25rem,calc(100vw-1.5rem))]"
      aria-label="스튜디오 연결 및 오프라인 작업 안내"
    >
      <details
        className="rounded-xl border border-line bg-panel p-3 text-xs text-fg shadow-lg"
        data-studio-offline-panel="true"
        data-studio-local-only={connectivity.localOnly ? "true" : "false"}
      >
        <summary className="min-h-9 cursor-pointer content-center font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          {summary}
        </summary>
        <div className="mt-2 max-h-[60dvh] space-y-3 overflow-y-auto overscroll-contain leading-relaxed">
          <p>
            {connectivity.localOnly
              ? "드로잉·레이어 편집·로컬 자동 저장·파일 내보내기는 이 화면에서 계속 사용할 수 있습니다. 서버 원고 불러오기·클라우드 저장·협업·게시·서버 AI는 연결 복구 전 일시 중지됩니다."
              : "스튜디오 전체 기능을 사용 중입니다. 연결이 끊기거나 서버가 응답하지 않으면 같은 화면에서 로컬 저장 가능한 기능만 자동으로 유지합니다."}
          </p>
          {device?.navigationFallback ? (
            <p>서버 응답 대신 이 기기에 저장된 스튜디오 화면으로 열었습니다. 원고의 로컬 저장 완료 여부는 저장센터에서 확인해 주세요.</p>
          ) : null}
          <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
          <p className="text-fg-2">
            {device?.persisted === true ? "지속 저장 허용" : "프로젝트 파일 백업 권장"}
            {storagePercent !== null ? ` · 저장 공간 약 ${storagePercent}% 사용` : ""}
          </p>
          {storagePercent !== null && storagePercent >= 90 ? (
            <p role="alert">저장 공간이 부족합니다. 원고를 파일로 백업하고 저장센터 상태를 확인해 주세요.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { automaticAttempt.current = null; void prepare(false); }}
              disabled={busy || !device?.controlled || !device.supported || !connectivity.browserOnline}
              className="min-h-11 rounded-lg border border-line px-3 font-semibold disabled:opacity-50"
              aria-busy={busy}
            >
              {busy ? "확인 중…" : ready ? "오프라인 준비 다시 확인" : "오프라인 준비 다시 시도"}
            </button>
            <button
              type="button"
              onClick={() => { void persist(); }}
              disabled={busy || !device?.supported}
              className="min-h-11 rounded-lg border border-line px-3 disabled:opacity-50"
            >
              지속 저장 요청
            </button>
          </div>
          {dataSaverEnabled() && !ready ? (
            <p>데이터 절약 모드가 켜져 있어 대용량 자동 준비를 건너뛰었습니다. 필요할 때 위 버튼으로 직접 준비할 수 있습니다.</p>
          ) : null}
          {device && !device.controlled ? (
            <p>온라인에서 스튜디오를 한 번 연 뒤 서비스 워커가 활성화되면 자동 준비를 시작합니다. 편집과 로컬 저장은 지원 범위에서 계속 사용할 수 있습니다.</p>
          ) : null}
          <p className="text-fg-2">
            오프라인 리소스 캐시는 원고 저장과 별개입니다. 원고는 OPFS·SQLite 로컬 저장소에 보관되고, 서버 반영 여부는 저장센터에서 확인합니다.
          </p>
        </div>
      </details>
    </aside>
  );
}
