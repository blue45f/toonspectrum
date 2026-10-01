// 사용 환경 진단 목록과 앱 설치(PWA) 상태 카드 — 성장·IP 작업대와 사용 환경 안내 페이지가 함께 쓴다.
import { CheckCircle2, Download, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

import type { PwaInstallSnapshot } from "@/shared/lib/pwa-install-store";
import { cn } from "@/shared/lib/utils";

import type { EnvironmentCapability } from "./environment-capabilities";
import { bi, biLabel, GROWTH_PRIMARY } from "./growth-ip-shared";
import { PWA_PLATFORM_LABEL, PWA_SERVICE_WORKER_LABEL, PWA_STATUS_LABEL } from "./pwa-status";

/** 기능별 준비 상태 — 색만이 아니라 아이콘·글자(사용 가능/확인 필요)로도 구분한다. */
export function CapabilityGrid({ capabilities }: { capabilities: readonly EnvironmentCapability[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {capabilities.map((item) => (
        <li key={item.id} className="rounded-xl border border-line bg-panel p-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full",
                item.supported ? "bg-good/15 text-good" : "bg-warn/15 text-warn",
              )}
            >
              {item.supported ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
            </span>
            <strong className="min-w-0 flex-1 text-sm text-fg">{item.title}</strong>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.72rem] font-bold", item.supported ? "bg-good/15 text-fg" : "bg-warn/15 text-fg")}>
              {item.supported ? bi("사용 가능", "Ready") : bi("확인 필요", "Check")}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-fg-2">{item.purpose}</p>
          {!item.supported ? (
            <p className="mt-2 rounded-lg bg-warn/10 px-2.5 py-1.5 text-xs leading-5 text-fg">
              <strong>{bi("해결 방법", "How to fix")}:</strong> {item.fix}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function StatusRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-2">{term}</dt>
      <dd className="text-right font-bold text-fg">{value}</dd>
    </div>
  );
}

/** 앱 설치 상태·네트워크·오프라인 캐시 상태와 설치 버튼. children은 버튼 아래 보조 링크·안내. */
export function PwaStatusPanel({
  pwa,
  onInstall,
  children,
}: {
  pwa: PwaInstallSnapshot;
  onInstall: () => void;
  children?: ReactNode;
}) {
  const installed = pwa.status === "installed";
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn("grid size-10 shrink-0 place-items-center rounded-xl", pwa.online ? "bg-good/15 text-good" : "bg-warn/15 text-warn")}
        >
          {pwa.online ? <Wifi size={18} /> : <WifiOff size={18} />}
        </span>
        <div className="min-w-0">
          <strong className="block text-sm text-fg">
            {bi("앱 설치(PWA)", "App install (PWA)")} · {biLabel(PWA_PLATFORM_LABEL[pwa.platform])}
          </strong>
          <p className="text-xs text-fg-2">{biLabel(PWA_STATUS_LABEL[pwa.status])}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-2 text-xs">
        <StatusRow term={bi("실행 방식", "Display mode")} value={pwa.standalone ? bi("설치한 앱", "Installed app") : bi("브라우저 탭", "Browser tab")} />
        <StatusRow term={bi("네트워크", "Network")} value={pwa.online ? bi("온라인", "Online") : bi("오프라인", "Offline")} />
        <StatusRow term={bi("오프라인 캐시", "Offline cache")} value={biLabel(PWA_SERVICE_WORKER_LABEL[pwa.serviceWorkerStatus])} />
      </dl>
      {pwa.serviceWorkerStatus === "update-waiting" ? (
        <p role="note" className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-3 text-xs leading-5 text-fg">
          {bi("새 버전이 준비되었습니다. 진행 중 작업을 저장한 뒤 앱을 다시 열어 최신 버전을 적용하세요.", "A new version is ready. Save active work, then reopen the app to apply it safely.")}
        </p>
      ) : null}
      <button type="button" className={`${GROWTH_PRIMARY} mt-4 w-full`} disabled={installed} onClick={onInstall}>
        <Download size={16} aria-hidden />
        {installed ? bi("이미 설치됨", "Already installed") : bi("앱 설치 / 설치 안내", "Install app / help")}
      </button>
      {children}
    </div>
  );
}
