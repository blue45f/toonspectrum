import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, HardDrive, RefreshCw, ShieldCheck } from "lucide-react";

import { boundedStorageRead, creatorServiceWorker, inspectCreatorOfflineReadiness, type CreatorOfflineSnapshot } from "./creator-offline-readiness";
import Link from "@/compat/router-link";

const COPY = {
  ko: {
    tag: "KEEP YOUR WORK YOURS", title: "연결보다 오래 남는 작업.",
    body: "오프라인 작업 전에, 이 브라우저의 준비 상태와 기기 저장소를 확인하세요.",
    check: "준비 상태 다시 확인", checking: "이 브라우저의 저장 환경을 확인하고 있어요.",
    network: "브라우저 연결", online: "온라인", offline: "오프라인", secure: "보안 연결",
    worker: "앱 제어 연결", shell: "격리된 편집기 화면 캐시", persistence: "기기 저장 보호",
    yes: "확인됨", no: "아직 확인되지 않음", unknown: "확인할 수 없음",
    protected: "자동 정리 방지 허용", unprotected: "브라우저 판단에 따라 정리될 수 있음",
    protect: "기기 저장 보호 요청", protecting: "저장 보호 요청 중…", granted: "브라우저가 저장 보호를 허용했어요.",
    denied: "저장 보호가 허용되지 않았어요. 프로젝트 파일을 별도로 백업하세요.",
    unsupported: "이 환경에서는 저장 보호를 요청할 수 없어요. 프로젝트 파일 백업을 이용하세요.",
    used: "이 사이트의 사용량", of: "/", open: "심플 모드로 프로젝트 열기",
    caveat: "이 점검은 프로젝트 저장 완료나 전체 오프라인 실행을 보장하지 않습니다. 사용할 프로젝트를 온라인에서 먼저 열고, 로컬 저장과 프로젝트 파일 백업을 확인하세요. 클라우드 AI·새 자료 검색·협업에는 인터넷이 필요합니다.",
    clear: "저장 보호를 허용해도 직접 사이트 데이터를 지우면 작업이 삭제될 수 있습니다.",
  },
  en: {
    tag: "KEEP YOUR WORK YOURS", title: "Your work, beyond the connection.",
    body: "Check this browser and its storage before taking a project offline.",
    check: "Check readiness again", checking: "Checking this browser’s storage environment.",
    network: "Browser connection", online: "Online", offline: "Offline", secure: "Secure connection",
    worker: "App controller", shell: "Isolated editor shell cache", persistence: "Device storage protection",
    yes: "Confirmed", no: "Not yet confirmed", unknown: "Unavailable",
    protected: "Automatic eviction protection granted", unprotected: "The browser may reclaim this storage",
    protect: "Request storage protection", protecting: "Requesting protection…", granted: "Storage protection was granted.",
    denied: "Protection was not granted. Keep a separate project-file backup.",
    unsupported: "Protection is unavailable here. Keep a separate project-file backup.",
    used: "Storage used by this site", of: "/", open: "Open a project in Simple Mode",
    caveat: "These checks do not prove that a project is saved or fully available offline. Open the project online first, confirm its local save, and export a project backup. Cloud AI, new searches and collaboration need a connection.",
    clear: "Clearing site data can delete work even when storage protection is granted.",
  },
} as const;

export function CreatorWorkspaceReadiness({ locale }: { locale: "ko" | "en" }) {
  const copy = COPY[locale];
  const [snapshot, setSnapshot] = useState<CreatorOfflineSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [protecting, setProtecting] = useState(false);
  const [notice, setNotice] = useState<"granted" | "denied" | "unsupported" | null>(null);
  const request = useRef(0);
  const lifetime = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    setBusy(true);
    try {
      const next = await inspectCreatorOfflineReadiness();
      if (id === request.current) setSnapshot(next);
    } finally {
      if (id === request.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    lifetime.current++;
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const serviceWorker = creatorServiceWorker();
    serviceWorker?.addEventListener("controllerchange", update);
    return () => {
      request.current++;
      lifetime.current++;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      serviceWorker?.removeEventListener("controllerchange", update);
    };
  }, [refresh]);

  const protect = async () => {
    if (protecting) return;
    const currentLifetime = lifetime.current;
    setProtecting(true);
    try {
      const result = await boundedStorageRead<boolean | null>(
        Promise.resolve().then(() => window.isSecureContext ? navigator.storage?.persist?.() ?? null : null), null,
      );
      if (currentLifetime !== lifetime.current) return;
      setNotice(result === true ? "granted" : result === false ? "denied" : "unsupported");
      await refresh();
    } finally {
      if (currentLifetime === lifetime.current) setProtecting(false);
    }
  };
  const label = (value: boolean | null | undefined) => value == null ? copy.unknown : value ? copy.yes : copy.no;
  const formatBytes = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024 / 1024) + " MB";
  return (
    <section className="cf-readiness" aria-labelledby="creator-offline-title" data-testid="creator-offline-readiness">
      <div>
        <p className="cf-kicker"><HardDrive size={16} aria-hidden="true" />{copy.tag}</p>
        <h2 id="creator-offline-title" tabIndex={-1}>{copy.title}</h2>
        <p>{copy.body}</p>
        <Link className="cf-link" href="/studio?uiMode=simple">{copy.open}<ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
      <div className="cf-storage-card" aria-busy={busy}>
        {!snapshot && <p role="status">{copy.checking}</p>}
        {snapshot && <>
          <dl className="cf-check-list">
            <div><dt>{copy.network}</dt><dd>{snapshot.online ? copy.online : copy.offline}</dd></div>
            <div><dt>{copy.secure}</dt><dd>{label(snapshot.secure)}</dd></div>
            <div><dt>{copy.worker}</dt><dd>{label(snapshot.controlled)}</dd></div>
            <div><dt>{copy.shell}</dt><dd>{label(snapshot.shellCached)}</dd></div>
            <div><dt>{copy.persistence}</dt><dd>{snapshot.persisted == null ? copy.unknown : snapshot.persisted ? copy.protected : copy.unprotected}</dd></div>
          </dl>
          {snapshot.usage !== null && snapshot.quota !== null && snapshot.quota > 0 && <div className="cf-storage-usage">
            <label htmlFor="creator-storage-meter">{copy.used}<span>{formatBytes(snapshot.usage)} {copy.of} {formatBytes(snapshot.quota)}</span></label>
            <meter id="creator-storage-meter" min={0} max={snapshot.quota} value={Math.min(snapshot.usage, snapshot.quota)} />
          </div>}
        </>}
        <div className="cf-storage-actions">
          <button type="button" onClick={() => { void protect(); }} disabled={protecting || snapshot?.persisted === true}><ShieldCheck size={16} aria-hidden="true" />{protecting ? copy.protecting : copy.protect}</button>
          <button type="button" onClick={() => { void refresh(); }} disabled={busy}><RefreshCw size={16} aria-hidden="true" />{copy.check}</button>
        </div>
        <p role="status">{notice ? copy[notice] : ""}</p>
        <p className="cf-storage-note">{copy.caveat}</p><p className="cf-storage-note">{copy.clear}</p>
      </div>
    </section>
  );
}
