// 사용 환경 안내 — 현재 브라우저 기능 진단(성장·IP 작업대와 같은 판정)과 앱 설치(PWA) 상태, 작업별 권장 환경.
import {
  ArrowRight,
  Clapperboard,
  Download,
  ExternalLink,
  Headphones,
  MonitorCheck,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { SharePageButton } from "@/shared/components/share-page-button";
import { Container } from "@/shared/components/section";
import { StudioPageIntro } from "../page-intro/StudioPageIntro";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import { describeEnvironmentCapabilities, detectEnvironmentSupport } from "./environment-capabilities";
import { CapabilityGrid, PwaStatusPanel } from "./EnvironmentStatus";
import { requestPwaInstallMessage, usePwaInstallSnapshot } from "./pwa-status";

const bi = <T,>(ko: T, en: T): T =>
  translateBilingualValueForActiveLocale("CreatorEnvironmentGuidePage", ko, en);
const CARD = "rounded-2xl border border-line bg-card p-4 sm:p-5";
const BUTTON_BASE = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BUTTON = `${BUTTON_BASE} border-line bg-card text-fg-2 hover:bg-raised hover:text-fg`;
const PRIMARY = `${BUTTON_BASE} border-accent/40 bg-accent text-on-accent hover:bg-accent-2`;

export function CreatorEnvironmentGuidePage() {
  useBilingualI18nRevision();
  useDocumentTitle(bi("사용 환경 안내", "Environment guide"));
  const support = useMemo(() => detectEnvironmentSupport(), []);
  const capabilities = describeEnvironmentCapabilities(support);
  const pwa = usePwaInstallSnapshot();
  const [notice, setNotice] = useState<string | null>(null);
  const readyCount = capabilities.filter((item) => item.supported).length;

  const install = () => {
    void requestPwaInstallMessage().then(setNotice);
  };

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <header className="relative isolate overflow-hidden rounded-3xl border border-line bg-card p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 -z-10 size-80 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--color-accent-2) 30%, transparent), transparent 70%)" }}
        />
        <p className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-accent">ENVIRONMENT · PWA · PERMISSIONS</p>
        <h1 className="mt-2 max-w-4xl text-3xl font-black tracking-tight text-fg sm:text-5xl">
          {bi("내 기기에서 어떤 기능을 쓸 수 있는지 바로 확인하세요", "See what your device can actually run")}
        </h1>
        <StudioPageIntro motif="leaf" className="mt-2" />
        <p className="mt-4 max-w-4xl text-sm leading-7 text-fg-2">
          {bi("정적인 권장 사양표 대신 현재 브라우저의 기능을 직접 확인합니다. 드로잉 입력, 저장, PWA, 웹캠·마이크, 공유, 3D, 음성 안내 상태와 해결 방법을 함께 보여 줍니다.", "Instead of a static compatibility table, this page detects browser capabilities and explains readiness for drawing input, storage, PWA, camera/microphone, sharing, 3D and voice guidance.")}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} disabled={pwa.status === "installed"} onClick={install}>
            <Download size={16} aria-hidden />{pwa.status === "installed" ? bi("앱 설치됨", "App installed") : bi("앱 설치 / 설치 안내", "Install app / help")}
          </button>
          <SharePageButton path="/studio/environment" text={bi("ToonStudio 사용 환경 안내", "ToonStudio environment guide")} description={bi("내 브라우저 기능과 PWA 설치 상태 점검", "Check browser capabilities and PWA install readiness")} label={bi("안내 공유", "Share guide")} className="min-h-11 rounded-xl" />
          <Link to="/product-tour" className={BUTTON}><Clapperboard size={16} aria-hidden />{bi("제품 영상 보기", "Watch product tour")}</Link>
        </div>
      </header>

      <p role="status" className={notice ? "mt-4 rounded-xl border border-line bg-card px-4 py-3 text-sm leading-6 text-fg-2" : "sr-only"}>{notice ?? ""}</p>

      <section className="mt-8 grid gap-4 xl:grid-cols-[1fr_22rem]" aria-labelledby="environment-summary-title">
        <div className={CARD}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-[0.72rem] font-black uppercase tracking-[0.14em] text-accent">LIVE CHECK</p><h2 id="environment-summary-title" className="mt-1 text-2xl font-black text-fg">{bi("현재 환경 진단", "Current environment")}</h2></div>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-black text-fg">{readyCount}/{capabilities.length} {bi("사용 가능", "ready")}</span>
          </div>
          <div className="mt-4">
            <CapabilityGrid capabilities={capabilities} />
          </div>
        </div>

        <aside className={CARD} aria-label={bi("앱 설치 상태", "App install status")}>
          <PwaStatusPanel pwa={pwa} onInstall={install} />
        </aside>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3" aria-label={bi("기능별 권장 사용 환경", "Recommended environment by workflow")}>
        {[
          { icon: MonitorCheck, title: bi("드로잉·3D", "Drawing & 3D"), items: bi(["최신 Safari/Chrome/Edge", "펜 입력은 Pointer Events 지원", "3D는 WebGL2 및 하드웨어 가속 권장", "긴 작업 전 로컬 저장공간 확인"], ["Current Safari/Chrome/Edge", "Pointer Events for pen input", "WebGL2 + hardware acceleration for 3D", "Check local storage before long sessions"]) },
          { icon: Headphones, title: bi("음성·화상 협업", "Voice & video collaboration"), items: bi(["HTTPS 환경", "카메라·마이크 권한은 필요한 순간에만 허용", "헤드셋 사용 시 에코 감소", "음성 대사 자동재생은 기본 꺼짐"], ["HTTPS context", "Grant camera/microphone only when needed", "Headsets reduce echo", "Voice-dialogue autoplay is off by default"]) },
          { icon: ShieldCheck, title: bi("저장·오프라인", "Storage & offline"), items: bi(["IndexedDB/Service Worker 허용", "시크릿 모드는 장기 작업에 비권장", "업데이트 전 작업 저장", "중요 원본은 별도 백업 유지"], ["Allow IndexedDB/Service Worker", "Avoid private mode for long work", "Save before applying updates", "Keep independent backups of important originals"]) },
        ].map(({ icon: Icon, title, items }) => <article key={title} className={CARD}><span aria-hidden className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={18} /></span><h2 className="mt-3 font-black text-fg">{title}</h2><ul className="mt-3 grid gap-2 text-xs leading-5 text-fg-2">{items.map((item) => <li key={item}>· {item}</li>)}</ul></article>)}
      </section>

      <section className={`${CARD} mb-12 mt-8`}>
        <h2 className="font-black text-fg">{bi("더 자세한 안내", "More guidance")}</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link to="/studio/manual" className={BUTTON}>{bi("Studio 공식 가이드", "Studio guide")}<ArrowRight size={14} aria-hidden /></Link>
          <Link to="/accessibility" className={BUTTON}>{bi("접근성 안내", "Accessibility")}<ArrowRight size={14} aria-hidden /></Link>
          <Link to="/about/technology/field-notes" className={BUTTON}>{bi("PWA·기술 심화", "PWA & technical notes")}<ArrowRight size={14} aria-hidden /></Link>
          <a href="https://developer.mozilla.org/docs/Web/Progressive_web_apps" target="_blank" rel="noopener noreferrer" className={BUTTON}>MDN PWA<ExternalLink size={14} aria-hidden /></a>
        </div>
      </section>
    </Container>
  );
}
