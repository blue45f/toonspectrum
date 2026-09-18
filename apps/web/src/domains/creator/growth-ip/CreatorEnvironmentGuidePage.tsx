import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Download,
  ExternalLink,
  Headphones,
  MonitorCheck,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { SharePageButton } from "@/shared/components/share-page-button";
import { Container } from "@/shared/components/section";
import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
} from "@/shared/lib/pwa-install-store";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("CreatorEnvironmentGuidePage", ko, en);
const CARD = "rounded-2xl border border-line bg-card p-4 sm:p-5";
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm font-bold text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY = `${BUTTON} border-accent/40 bg-accent text-on-accent hover:bg-accent hover:opacity-90`;

type Capability = {
  readonly id: string;
  readonly title: string;
  readonly supported: boolean;
  readonly purpose: string;
  readonly fix: string;
};

function detectCapabilities(): Capability[] {
  if (typeof window === "undefined" || typeof navigator === "undefined") return [];
  const webgl2 = (() => {
    try { return Boolean(document.createElement("canvas").getContext("webgl2")); }
    catch { return false; }
  })();
  return [
    {
      id: "secure",
      title: "HTTPS / Secure Context",
      supported: window.isSecureContext,
      purpose: bi("웹캠·마이크·클립보드·PWA 같은 민감 기능의 기본 조건", "Baseline for camera, microphone, clipboard and PWA capabilities"),
      fix: bi("https:// 주소 또는 localhost에서 다시 여세요.", "Open the app over HTTPS or localhost."),
    },
    {
      id: "service-worker",
      title: "Service Worker",
      supported: "serviceWorker" in navigator,
      purpose: bi("오프라인 캐시, 업데이트 감지, 설치형 웹앱 기반", "Foundation for offline caching, update detection and installable web apps"),
      fix: bi("최신 Safari·Chrome·Edge 계열 브라우저를 권장합니다.", "Use a current Safari, Chrome or Edge-class browser."),
    },
    {
      id: "indexed-db",
      title: "IndexedDB",
      supported: "indexedDB" in window,
      purpose: bi("큰 프로젝트·복구 데이터·로컬 작업 기록 저장", "Stores large projects, recovery data and local work history"),
      fix: bi("시크릿/제한 모드나 저장공간 차단 설정을 확인하세요.", "Check private/restricted browsing and storage-blocking settings."),
    },
    {
      id: "pointer",
      title: "Pointer Events",
      supported: "PointerEvent" in window,
      purpose: bi("펜·터치·마우스 입력 통합과 드로잉 압력 처리 기반", "Unified pen, touch and mouse input for drawing"),
      fix: bi("브라우저와 OS를 최신 버전으로 업데이트하세요.", "Update the browser and operating system."),
    },
    {
      id: "media",
      title: "Camera / Microphone",
      supported: Boolean(navigator.mediaDevices?.getUserMedia),
      purpose: bi("화상 협업·음성 입력·카메라 기능", "Video collaboration, voice input and camera workflows"),
      fix: bi("브라우저 사이트 권한에서 카메라·마이크를 허용하세요.", "Allow camera and microphone in site permissions."),
    },
    {
      id: "share",
      title: "Web Share API",
      supported: typeof navigator.share === "function",
      purpose: bi("모바일 OS 공유 시트로 SNS·메신저 앱 연결", "Connects to the mobile OS share sheet"),
      fix: bi("지원하지 않는 데스크톱 브라우저에서는 통합 공유/링크 복사를 사용하세요.", "Use the built-in share dialog or copy-link fallback on unsupported desktop browsers."),
    },
    {
      id: "webgl2",
      title: "WebGL 2",
      supported: webgl2,
      purpose: bi("3D 배경·고급 렌더링·일부 GPU 가속 기능", "3D backgrounds, advanced rendering and selected GPU acceleration"),
      fix: bi("브라우저 하드웨어 가속을 켜고 그래픽 드라이버/OS를 업데이트하세요.", "Enable browser hardware acceleration and update graphics drivers/OS."),
    },
    {
      id: "speech",
      title: "Speech Synthesis",
      supported: "speechSynthesis" in window,
      purpose: bi("페이지 음성 안내와 웹툰 대사 읽어주기 검수", "Page voice guidance and dialogue read-aloud proofing"),
      fix: bi("OS 음성 엔진이 있는 최신 브라우저를 사용하거나 음성 파일 첨부를 이용하세요.", "Use a current browser with an OS speech engine, or attach voice audio instead."),
    },
  ];
}

export function CreatorEnvironmentGuidePage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("사용 환경 안내", "Environment guide"));
  const capabilities = useMemo(() => detectCapabilities(), []);
  const pwa = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    getPwaInstallServerSnapshot,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const readyCount = capabilities.filter((item) => item.supported).length;

  const install = async () => {
    const result = await requestPwaInstall();
    if (result === "accepted" || result === "installed") {
      setNotice(bi("앱 설치 흐름을 완료했습니다.", "App installation flow completed."));
    } else if (result === "manual") {
      setNotice(bi("iPhone/iPad에서는 Safari 공유 메뉴 → ‘홈 화면에 추가’를 선택하세요.", "On iPhone/iPad, choose Share → Add to Home Screen in Safari."));
    } else if (result === "dismissed") {
      setNotice(bi("설치 요청을 닫았습니다. 필요할 때 다시 시도할 수 있습니다.", "Install request dismissed. You can retry later."));
    } else {
      setNotice(bi("자동 설치 프롬프트를 사용할 수 없습니다. 브라우저 메뉴의 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 사용하세요.", "The automatic prompt is unavailable. Use Install app or Add to Home Screen from your browser menu."));
    }
  };

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <header className="rounded-3xl border border-line bg-panel/70 p-6 sm:p-8">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-accent">ENVIRONMENT · PWA · PERMISSIONS</p>
        <h1 className="mt-2 max-w-4xl text-3xl font-black tracking-tight text-fg sm:text-5xl">
          {bi("내 기기에서 어떤 기능을 쓸 수 있는지 바로 확인하세요", "See what your device can actually run")}
        </h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-fg-2">
          {bi("정적인 권장 사양표 대신 현재 브라우저의 기능을 직접 확인합니다. 드로잉 입력, 저장, PWA, 웹캠·마이크, 공유, 3D, 음성 안내 상태와 해결 방법을 함께 보여 줍니다.", "Instead of a static compatibility table, this page detects browser capabilities and explains readiness for drawing input, storage, PWA, camera/microphone, sharing, 3D and voice guidance.")}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} disabled={pwa.status === "installed"} onClick={() => void install()}>
            <Download size={16} aria-hidden />{pwa.status === "installed" ? bi("앱 설치됨", "App installed") : bi("앱 설치 / 설치 안내", "Install app / help")}
          </button>
          <SharePageButton path="/studio/environment" text={bi("ToonStudio 사용 환경 안내", "ToonStudio environment guide")} description={bi("내 브라우저 기능과 PWA 설치 상태 점검", "Check browser capabilities and PWA install readiness")} label={bi("안내 공유", "Share guide")} className="min-h-11 rounded-xl" />
          <Link to="/product-tour" className={BUTTON}><Clapperboard size={16} aria-hidden />{bi("제품 영상 보기", "Watch product tour")}</Link>
        </div>
      </header>

      {notice ? <p role="status" className="mt-4 rounded-xl border border-line bg-card px-4 py-3 text-sm leading-6 text-fg-2">{notice}</p> : null}

      <section className="mt-8 grid gap-4 xl:grid-cols-[1fr_22rem]" aria-labelledby="environment-summary-title">
        <div className={CARD}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-accent">LIVE CHECK</p><h2 id="environment-summary-title" className="mt-1 text-2xl font-black text-fg">{bi("현재 환경 진단", "Current environment")}</h2></div>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-black text-accent">{readyCount}/{capabilities.length} READY</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {capabilities.map((item) => (
              <article key={item.id} className="rounded-xl border border-line bg-panel p-3">
                <div className="flex items-center gap-2">
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full ${item.supported ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{item.supported ? <CheckCircle2 size={15} aria-hidden /> : <TriangleAlert size={15} aria-hidden />}</span>
                  <strong className="text-sm text-fg">{item.title}</strong>
                </div>
                <p className="mt-2 text-xs leading-5 text-fg-3">{item.purpose}</p>
                {!item.supported ? <p className="mt-2 text-xs font-medium leading-5 text-warn">{item.fix}</p> : null}
              </article>
            ))}
          </div>
        </div>

        <aside className={CARD}>
          <div className="flex items-center gap-3">
            <span className={`grid size-10 place-items-center rounded-xl ${pwa.online ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>{pwa.online ? <Wifi size={18} aria-hidden /> : <WifiOff size={18} aria-hidden />}</span>
            <div><strong className="text-sm text-fg">PWA · {pwa.platform}</strong><p className="text-xs text-fg-3">{pwa.status} · SW {pwa.serviceWorkerStatus}</p></div>
          </div>
          <dl className="mt-4 grid gap-2 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-fg-3">{bi("실행 모드", "Display mode")}</dt><dd className="font-bold text-fg">{pwa.standalone ? "standalone" : "browser"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-3">{bi("네트워크", "Network")}</dt><dd className="font-bold text-fg">{pwa.online ? "online" : "offline"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-3">Service Worker</dt><dd className="font-bold text-fg">{pwa.serviceWorkerStatus}</dd></div>
          </dl>
          {pwa.serviceWorkerStatus === "update-waiting" ? <p className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-3 text-xs leading-5 text-accent">{bi("새 버전이 준비되었습니다. 진행 중 작업을 저장한 뒤 앱을 다시 열어 최신 버전을 적용하세요.", "A new version is ready. Save active work, then reopen the app to apply it safely.")}</p> : null}
          <button type="button" className={`${PRIMARY} mt-4 w-full`} disabled={pwa.status === "installed"} onClick={() => void install()}><Smartphone size={16} aria-hidden />{pwa.status === "installed" ? bi("설치 완료", "Installed") : bi("설치 상태 확인", "Check installation")}</button>
        </aside>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3" aria-label={bi("기능별 권장 사용 환경", "Recommended environment by workflow")}>
        {[
          { icon: MonitorCheck, title: bi("드로잉·3D", "Drawing & 3D"), items: bi(["최신 Safari/Chrome/Edge", "펜 입력은 Pointer Events 지원", "3D는 WebGL2 및 하드웨어 가속 권장", "긴 작업 전 로컬 저장공간 확인"], ["Current Safari/Chrome/Edge", "Pointer Events for pen input", "WebGL2 + hardware acceleration for 3D", "Check local storage before long sessions"]) },
          { icon: Headphones, title: bi("음성·화상 협업", "Voice & video collaboration"), items: bi(["HTTPS 환경", "카메라·마이크 권한은 필요한 순간에만 허용", "헤드셋 사용 시 에코 감소", "음성 대사 자동재생은 기본 꺼짐"], ["HTTPS context", "Grant camera/microphone only when needed", "Headsets reduce echo", "Voice-dialogue autoplay is off by default"]) },
          { icon: ShieldCheck, title: bi("저장·오프라인", "Storage & offline"), items: bi(["IndexedDB/Service Worker 허용", "시크릿 모드는 장기 작업에 비권장", "업데이트 전 작업 저장", "중요 원본은 별도 백업 유지"], ["Allow IndexedDB/Service Worker", "Avoid private mode for long work", "Save before applying updates", "Keep independent backups of important originals"]) },
        ].map(({ icon: Icon, title, items }) => <article key={title} className={CARD}><span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={18} aria-hidden /></span><h2 className="mt-3 font-black text-fg">{title}</h2><ul className="mt-3 grid gap-2 text-xs leading-5 text-fg-3">{items.map((item) => <li key={item}>· {item}</li>)}</ul></article>)}
      </section>

      <section className={`${CARD} mb-12 mt-8`}>
        <h2 className="font-black text-fg">{bi("더 자세한 안내", "More guidance")}</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link to="/studio/manual" className={BUTTON}>{bi("Studio 공식 가이드", "Studio guide")}<ArrowRight size={14} /></Link>
          <Link to="/accessibility" className={BUTTON}>{bi("접근성 안내", "Accessibility")}<ArrowRight size={14} /></Link>
          <Link to="/about/technology/field-notes" className={BUTTON}>{bi("PWA·기술 심화", "PWA & technical notes")}<ArrowRight size={14} /></Link>
          <a href="https://developer.mozilla.org/docs/Web/Progressive_web_apps" target="_blank" rel="noopener noreferrer" className={BUTTON}>MDN PWA<ExternalLink size={14} /></a>
        </div>
      </section>
    </Container>
  );
}
