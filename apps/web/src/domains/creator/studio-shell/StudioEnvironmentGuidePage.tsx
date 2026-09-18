import { BadgeCheck, Download, MonitorSmartphone, RefreshCcw, ShieldCheck, Smartphone, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
} from "@/shared/lib/pwa-install-store";
import { cn } from "@/shared/lib/utils";

type Capability = Readonly<{
  id: string;
  labelKo: string;
  labelEn: string;
  supported: boolean;
  detailKo: string;
  detailEn: string;
}>;

function detectWebgl2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

function detectCapabilities(): readonly Capability[] {
  if (typeof window === "undefined" || typeof navigator === "undefined") return [];
  const media = Boolean(navigator.mediaDevices?.getUserMedia);
  const rtc = typeof RTCPeerConnection !== "undefined";
  const pointer = typeof PointerEvent !== "undefined";
  const touchPoints = navigator.maxTouchPoints ?? 0;
  const serviceWorker = "serviceWorker" in navigator;
  const share = typeof navigator.share === "function";
  const speech = "speechSynthesis" in window;
  const indexedDb = typeof indexedDB !== "undefined";

  return [
    { id: "secure", labelKo: "보안 연결", labelEn: "Secure context", supported: window.isSecureContext, detailKo: "카메라·마이크·PWA 등 주요 웹 기능에 필요합니다.", detailEn: "Required for camera, microphone, PWA and other powerful web APIs." },
    { id: "media", labelKo: "카메라·마이크 API", labelEn: "Camera & microphone API", supported: media, detailKo: "권한은 실제 기능을 사용할 때만 요청합니다.", detailEn: "Permission is requested only when you use a media feature." },
    { id: "rtc", labelKo: "WebRTC / P2P", labelEn: "WebRTC / P2P", supported: rtc, detailKo: "실시간 협업·통화·P2P 연결 기반입니다.", detailEn: "Foundation for live collaboration, calls and P2P connections." },
    { id: "webgl2", labelKo: "WebGL2 / 3D", labelEn: "WebGL2 / 3D", supported: detectWebgl2(), detailKo: "3D 배경·캐릭터·공간 기능 가속에 사용합니다.", detailEn: "Accelerates 3D backgrounds, characters and spatial tools." },
    { id: "pointer", labelKo: "펜·터치 포인터", labelEn: "Pen & pointer input", supported: pointer, detailKo: `Pointer Events 지원 · 감지된 터치 포인트 ${touchPoints}`, detailEn: `Pointer Events supported · ${touchPoints} touch points detected` },
    { id: "storage", labelKo: "로컬 프로젝트 저장", labelEn: "Local project storage", supported: indexedDb, detailKo: "IndexedDB 기반 로컬 캐시·복구 기능에 사용합니다.", detailEn: "Used for IndexedDB project caches and recovery." },
    { id: "sw", labelKo: "서비스워커", labelEn: "Service worker", supported: serviceWorker, detailKo: "PWA 설치·오프라인 복구·업데이트에 사용합니다.", detailEn: "Used for PWA install, offline recovery and updates." },
    { id: "share", labelKo: "시스템 공유", labelEn: "System share", supported: share, detailKo: "모바일에서 설치된 SNS 앱으로 공유할 수 있습니다.", detailEn: "Lets mobile users share to installed social apps." },
    { id: "speech", labelKo: "음성 안내", labelEn: "Voice guidance", supported: speech, detailKo: "사용자가 눌렀을 때 페이지 안내를 읽어줄 수 있습니다.", detailEn: "Can read guidance aloud after an explicit user action." },
  ];
}

export function StudioEnvironmentGuidePage() {
  const bt = useBilingual("StudioEnvironmentGuidePage");
  useDocumentTitle(bt("사용 환경 안내", "Environment guide"));
  const pwa = useSyncExternalStore(subscribePwaInstall, getPwaInstallSnapshot, getPwaInstallServerSnapshot);
  const [capabilities, setCapabilities] = useState<readonly Capability[]>([]);
  const [installResult, setInstallResult] = useState<string | null>(null);

  useEffect(() => setCapabilities(detectCapabilities()), []);
  const supportedCount = useMemo(() => capabilities.filter((item) => item.supported).length, [capabilities]);
  const install = async () => setInstallResult(await requestPwaInstall());

  return (
    <main className="min-h-screen bg-canvas py-8 sm:py-12">
      <Container size="wide">
        <section className="rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-8">
          <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent"><MonitorSmartphone size={16} /> ENVIRONMENT CHECK</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-black tracking-tight text-fg sm:text-4xl">{bt("툰스튜디오 사용 환경 진단", "ToonStudio environment check")}</h1>
              <p className="mt-3 text-sm leading-7 text-fg-2">{bt("드로잉·3D·WebRTC·P2P·카메라·마이크·PWA에 필요한 브라우저 기능을 현재 기기에서 확인합니다. 이 진단은 카메라나 마이크 권한을 요청하지 않습니다.", "Check browser capabilities required for drawing, 3D, WebRTC, P2P, camera, microphone and PWA. This diagnostic does not request camera or microphone permission.")}</p>
            </div>
            <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-4 text-sm font-black text-accent"><BadgeCheck size={17} /> {supportedCount}/{capabilities.length || "–"} {bt("지원", "supported")}</span>
          </div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)]">
          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="capability-title">
            <div className="flex items-center justify-between gap-3">
              <div><h2 id="capability-title" className="text-xl font-black text-fg">{bt("기능별 호환성", "Capability compatibility")}</h2><p className="mt-1 text-xs text-fg-3">{bt("권한 허용 여부가 아니라 API 지원 여부를 확인합니다.", "Checks API availability, not whether you granted permission.")}</p></div>
              <button type="button" onClick={() => setCapabilities(detectCapabilities())} className={buttonClass({ variant: "quiet", size: "icon" })} aria-label={bt("다시 진단", "Run diagnostics again")}><RefreshCcw size={17} /></button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {capabilities.map((item) => <article key={item.id} className={cn("rounded-2xl border p-4", item.supported ? "border-success/25 bg-success-soft/10" : "border-warning/30 bg-warning-soft/10")}>
                <div className="flex items-center gap-2">{item.supported ? <BadgeCheck className="size-5 text-success" /> : <TriangleAlert className="size-5 text-warning" />}<h3 className="text-sm font-black text-fg">{bt(item.labelKo, item.labelEn)}</h3></div>
                <p className="mt-2 text-xs leading-5 text-fg-2">{bt(item.detailKo, item.detailEn)}</p>
              </article>)}
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-3xl border border-accent/25 bg-accent-soft/10 p-5 sm:p-6" aria-labelledby="pwa-title">
              <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.15em] text-accent"><Smartphone size={15} /> PWA</p>
              <h2 id="pwa-title" className="mt-2 text-xl font-black text-fg">{bt("앱 설치·오프라인 상태", "Install and offline status")}</h2>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">{bt("플랫폼", "Platform")}</dt><dd className="mt-1 font-black text-fg">{pwa.platform}</dd></div>
                <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">{bt("설치 상태", "Install")}</dt><dd className="mt-1 font-black text-fg">{pwa.status}</dd></div>
                <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">{bt("네트워크", "Network")}</dt><dd className="mt-1 flex items-center gap-1.5 font-black text-fg">{pwa.online ? <Wifi size={14} className="text-success" /> : <WifiOff size={14} className="text-warning" />}{pwa.online ? bt("온라인", "Online") : bt("오프라인", "Offline")}</dd></div>
                <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">{bt("서비스워커", "Service worker")}</dt><dd className="mt-1 font-black text-fg">{pwa.serviceWorkerStatus}</dd></div>
              </dl>
              {pwa.platform === "ios" && !pwa.standalone ? <div className="mt-4 rounded-2xl border border-line bg-card p-4 text-xs leading-6 text-fg-2"><b className="text-fg">{bt("iPhone / iPad 설치", "Install on iPhone / iPad")}</b><ol className="mt-2 list-decimal space-y-1 pl-5"><li>{bt("Safari에서 공유 버튼을 누릅니다.", "Open the Share menu in Safari.")}</li><li>{bt("‘홈 화면에 추가’를 선택합니다.", "Choose Add to Home Screen.")}</li><li>{bt("추가 후 홈 화면 아이콘으로 실행합니다.", "Launch from the new Home Screen icon.")}</li></ol></div> : null}
              {!pwa.standalone ? <button type="button" onClick={() => void install()} className={buttonClass({ className: "mt-4 w-full gap-2" })}><Download size={16} /> {pwa.platform === "ios" ? bt("설치 방법 확인", "View install steps") : bt("앱 설치", "Install app")}</button> : <p className="mt-4 flex items-center gap-2 rounded-xl border border-success/25 bg-success-soft/10 p-3 text-xs font-bold text-success"><BadgeCheck size={16} /> {bt("설치된 앱 모드로 실행 중입니다.", "Running in installed app mode.")}</p>}
              {installResult ? <p role="status" className="mt-2 text-xs text-fg-3">{bt("설치 결과", "Install result")}: {installResult}</p> : null}
              {pwa.serviceWorkerStatus === "update-waiting" ? <p className="mt-3 rounded-xl border border-warning/25 bg-warning-soft/10 p-3 text-xs leading-5 text-fg-2">{bt("새 버전이 준비되어 있습니다. 안전하게 저장한 뒤 앱을 다시 열면 최신 버전을 사용할 수 있습니다.", "A new version is ready. Save safely, then reopen the app to use it.")}</p> : null}
            </section>

            <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
              <p className="flex items-center gap-2 text-xs font-black text-fg"><ShieldCheck size={16} className="text-accent" /> {bt("권장 사용 원칙", "Recommended setup")}</p>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-fg-2">
                <li>• {bt("최신 Safari, Chrome, Edge 등 자동 업데이트되는 브라우저를 사용하세요.", "Use a current auto-updating browser such as Safari, Chrome or Edge.")}</li>
                <li>• {bt("드로잉 중에는 절전 모드와 메모리 정리 앱이 탭을 종료하지 않도록 확인하세요.", "Prevent battery savers or memory cleaners from suspending the tab while drawing.")}</li>
                <li>• {bt("WebRTC·카메라·마이크는 HTTPS에서 사용하고, 필요한 기능을 시작할 때만 권한을 허용하세요.", "Use WebRTC, camera and microphone over HTTPS, granting permission only when starting the feature.")}</li>
              </ul>
            </section>
          </div>
        </div>
      </Container>
    </main>
  );
}
