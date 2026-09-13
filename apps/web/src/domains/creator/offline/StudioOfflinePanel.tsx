import { useEffect, useRef, useState } from "react";

import {
  inspectStudioOfflineDevice,
  prepareLoadedStudioOfflineResources,
  requestStudioPersistentStorage,
  type StudioOfflineDeviceState,
} from "./studio-offline-client";

/** Resource readiness is deliberately separate from manuscript-save durability. */
export function StudioOfflinePanel() {
  const [device, setDevice] = useState<StudioOfflineDeviceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("기본 드로잉 도구를 사용한 뒤 준비해 주세요. 원고 저장 여부는 저장센터에서 별도로 확인합니다.");
  const [prepared, setPrepared] = useState(false);
  const mounted = useRef(false);
  const operation = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const refresh = (): void => {
      void inspectStudioOfflineDevice().then((value) => { if (mounted.current) setDevice(value); });
    };
    const invalidate = (): void => { setPrepared(false); refresh(); };
    refresh();
    window.addEventListener("online", invalidate);
    window.addEventListener("offline", invalidate);
    let workers: ServiceWorkerContainer | undefined;
    try { workers = navigator.serviceWorker; workers?.addEventListener("controllerchange", invalidate); } catch { /* Restricted frame. */ }
    return () => {
      mounted.current = false;
      window.removeEventListener("online", invalidate);
      window.removeEventListener("offline", invalidate);
      workers?.removeEventListener("controllerchange", invalidate);
    };
  }, []);

  const prepare = async (): Promise<void> => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setPrepared(false);
    setMessage("현재 불러온 편집기 리소스를 확인하고 있습니다. 원고를 서버로 보내거나 화면을 새로고침하지 않습니다.");
    try {
      const report = await prepareLoadedStudioOfflineResources();
      if (!mounted.current) return;
      setPrepared(report.complete);
      setMessage(report.complete
        ? `현재 불러온 리소스 ${report.cached}개를 확인했습니다. 새 도구를 열면 다시 준비해 주세요. 원고·외부 이미지·3D 모델 전체의 저장을 보장하는 결과는 아닙니다.`
        : `${report.checked}개 중 ${report.cached}개를 확인했습니다. 준비되지 않은 리소스가 있어 오프라인 재실행을 보장할 수 없습니다. 연결과 저장 공간을 확인해 주세요.`);
      const state = await inspectStudioOfflineDevice();
      if (mounted.current) setDevice(state);
    } catch (cause) {
      if (mounted.current) setMessage(cause instanceof Error ? cause.message : "오프라인 준비에 실패했습니다.");
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const persist = async (): Promise<void> => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      const granted = await requestStudioPersistentStorage();
      if (!mounted.current) return;
      setMessage(granted === true
        ? "브라우저가 지속 저장을 허용했습니다. 사용자가 사이트 데이터를 지우면 원고도 삭제되므로 프로젝트 파일을 함께 백업해 주세요."
        : "브라우저가 지속 저장을 허용하지 않았거나 지원하지 않습니다. 프로젝트 파일을 기기에 백업해 주세요.");
      const state = await inspectStudioOfflineDevice();
      if (mounted.current) setDevice(state);
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const storagePercent = device?.usage !== null && device?.quota && device?.usage !== undefined
    ? Math.round(device.usage / device.quota * 100) : null;

  return (
    <aside className="fixed bottom-24 right-3 z-40 max-w-[min(24rem,calc(100vw-1.5rem))]" aria-label="오프라인 작업 안내">
      <details className="rounded-xl border border-line bg-panel p-3 text-xs text-fg shadow-lg" data-studio-offline-panel="true">
        <summary className="min-h-9 cursor-pointer content-center font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          {device?.online === false ? "오프라인 · 작업 안내" : device?.navigationFallback ? "저장된 화면 · 로컬 작업 안내" : "오프라인 사용 준비"}
        </summary>
        <div className="mt-2 max-h-[60dvh] space-y-3 overflow-y-auto overscroll-contain leading-relaxed">
          <p>준비된 도구는 연결 없이 편집할 수 있습니다. 서버 원고 불러오기·클라우드 저장·협업·게시·서버 AI는 연결이 필요합니다.</p>
          {device?.navigationFallback ? <p>서버 응답 대신 기기에 저장된 화면으로 열었습니다. 인터넷 연결 표시와 서버 상태는 다를 수 있습니다. 원고의 로컬 저장 완료 여부를 저장센터에서 확인해 주세요.</p> : null}
          <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
          <p className="text-fg-2">{device?.persisted === true ? "지속 저장 허용" : "프로젝트 파일 백업 권장"}{storagePercent !== null ? ` · 저장 공간 약 ${storagePercent}% 사용` : ""}</p>
          {storagePercent !== null && storagePercent >= 90 ? <p role="alert">저장 공간이 부족합니다. 원고를 파일로 백업하고 저장센터 상태를 확인해 주세요.</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { void prepare(); }} disabled={busy || !device?.controlled || !device.supported}
              className="min-h-11 rounded-lg border border-line px-3 font-semibold disabled:opacity-50" aria-busy={busy}>
              {busy ? "확인 중…" : prepared ? "리소스 다시 확인" : "오프라인 리소스 준비"}
            </button>
            <button type="button" onClick={() => { void persist(); }} disabled={busy || !device?.supported}
              className="min-h-11 rounded-lg border border-line px-3 disabled:opacity-50">지속 저장 요청</button>
          </div>
          {device && !device.controlled ? <p>온라인에서 스튜디오를 열어 실행 모듈이 준비된 뒤 다시 확인해 주세요. 이 브라우저에서는 준비 기능이 제한될 수 있습니다.</p> : null}
          <p className="text-fg-2">리소스 준비는 원고 저장이 아닙니다. 로컬 저장 완료와 서버 반영 여부는 저장센터에서 확인해 주세요. 탭을 닫기 전 원고를 백업해 주세요.</p>
        </div>
      </details>
    </aside>
  );
}
