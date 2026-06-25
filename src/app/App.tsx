import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";

import { AppRouter } from "./routes/AppRouter";

import { AuthSessionProvider } from "@/components/auth/session-provider";
import { CommandPaletteHost } from "@/components/command-palette-host";
import { IntroSplash } from "@/components/IntroSplash";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SiteHeader } from "@/components/site-header";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { pingVisit } from "@/lib/visits-api";

const AgeGateHost = lazy(() =>
  import("@/components/age-gate-host").then((mod) => ({
    default: mod.AgeGateHost,
  })),
);
const BackToTop = lazy(() =>
  import("@/components/back-to-top").then((mod) => ({
    default: mod.BackToTop,
  })),
);
const DeskCloudMounts = lazy(() =>
  import("@/src/components/deskcloud-native/DeskCloudMounts").then((mod) => ({
    default: mod.DeskCloudMounts,
  })),
);
const StoreSync = lazy(() =>
  import("@/components/auth/store-sync").then((mod) => ({
    default: mod.StoreSync,
  })),
);
const ToastHost = lazy(() =>
  import("@/components/toast-host").then((mod) => ({ default: mod.ToastHost })),
);
const SiteFooter = lazy(() =>
  import("@/components/site-footer").then((mod) => ({
    default: mod.SiteFooter,
  })),
);

const HAS_DESKCLOUD_MOUNTS = Boolean(
  import.meta.env.VITE_SURVEYDESK_URL ||
  import.meta.env.VITE_CHANGELOGDESK_URL ||
  import.meta.env.VITE_NOTIFYDESK_URL,
);

// 라우트 전환 시 스크롤을 최상단으로 되돌리고, 본문 랜드마크로 포커스를 옮긴다(a11y).
// 첫 진입(직접 연 위치)은 포커스를 가로채지 않는다.
function ScrollToTop() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    globalThis.scrollTo({ top: 0, left: 0 });
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}

function useDeferredByInput(timeoutMs = 4500) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    let timeoutId = 0;
    const activate = () => setReady(true);
    const options = { passive: true } as const;

    timeoutId = window.setTimeout(activate, timeoutMs);
    window.addEventListener("pointerdown", activate, options);
    window.addEventListener("keydown", activate);
    window.addEventListener("scroll", activate, options);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("pointerdown", activate);
      window.removeEventListener("keydown", activate);
      window.removeEventListener("scroll", activate);
    };
  }, [ready, timeoutMs]);

  return ready;
}

function useDeferredByScroll(timeoutMs = 6500) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    let timeoutId = 0;
    const activate = () => setReady(true);
    const options = { passive: true } as const;

    timeoutId = window.setTimeout(activate, timeoutMs);
    window.addEventListener("scroll", activate, options);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("scroll", activate);
    };
  }, [ready, timeoutMs]);

  return ready;
}

// 방문 핑 — 앱 마운트 시 하루 1회(localStorage 디바운스). best-effort, 렌더 비차단.
function useVisitPing() {
  useEffect(() => {
    void pingVisit();
  }, []);
}

function DeskCloudHost() {
  if (!HAS_DESKCLOUD_MOUNTS) return null;
  return (
    <Suspense fallback={null}>
      <DeskCloudMounts />
    </Suspense>
  );
}

function DeferredFooter() {
  const ready = useDeferredByScroll();
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <SiteFooter />
    </Suspense>
  );
}

function DeferredGlobalOverlays() {
  const ready = useDeferredByInput();
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <AgeGateHost />
      <ToastHost />
    </Suspense>
  );
}

function DeferredBackToTop() {
  const ready = useDeferredByScroll();
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <BackToTop />
    </Suspense>
  );
}

export default function App() {
  useVisitPing();
  return (
    <BrowserRouter>
      <AuthSessionProvider>
        <IntroSplash />
        <Suspense fallback={null}>
          <StoreSync />
        </Suspense>
        <ScrollToTop />
        <a
          href="#main-content"
          className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-fg focus:px-4 focus:py-2 focus:font-semibold focus:text-canvas"
        >
          본문으로 건너뛰기
        </a>
        <SiteHeader />
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-screen pb-20 outline-none md:pb-0"
        >
          <AppRouter />
        </main>
        <DeferredFooter />
        <CommandPaletteHost />
        <DeferredGlobalOverlays />
        <DeferredBackToTop />
        <div className="fixed bottom-4 left-4 z-[90] flex items-center gap-2 max-md:bottom-20 max-md:left-auto max-md:right-4">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
        {/* DeskCloud 네이티브 통합(@heejun/deskcloud pk_ SDK — 각 desk env URL 게이팅, 미설정 시 비활성) */}
        <DeskCloudHost />
      </AuthSessionProvider>
    </BrowserRouter>
  );
}
