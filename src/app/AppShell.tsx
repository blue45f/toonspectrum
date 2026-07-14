import { type ReactNode, lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { shouldRenderAppSplash } from "./app-shell-splash";
import { AppRouter } from "./routes/AppRouter";

import { AuthSessionProvider } from "@/components/auth/session-provider";
import { CommandPaletteHost } from "@/components/command-palette-host";
import { RandomIntro } from "@/components/RandomIntro";
import { pingVisit } from "@/lib/visits-api";

// 공유 fx 키프레임/유틸(.pf-* + --ts-fx-* 토큰). 전역 1회 import(웹·토스 공유).
import "@toonspectrum/core/fx/fx.css";

const AgeGateHost = lazy(() =>
  import("@/components/age-gate-host").then((mod) => ({
    default: mod.AgeGateHost,
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

// 라우트 전환 시 스크롤을 최상단으로 되돌리고, 본문 랜드마크로 포커스를 옮긴다(a11y).
// 첫 진입(직접 연 위치)은 포커스를 가로채지 않는다. 웹·토스 공유.
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

// 방문 핑 — 앱 마운트 시 하루 1회(localStorage 디바운스). best-effort, 렌더 비차단.
function useVisitPing() {
  useEffect(() => {
    void pingVisit();
  }, []);
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

export interface AppShellProps {
  /**
   * 본문 위 상단 크롬(웹=SiteHeader, 토스=null — 토스는 자체 TDS BottomNav/SearchFab 를 chromeOverlay 로 띄운다).
   */
  header?: ReactNode;
  /** 본문 아래 푸터(웹=SiteFooter). 토스는 BottomNav 가 대신하므로 생략한다. */
  footer?: ReactNode;
  /**
   * 자동 숨김 플로팅 컨트롤 클러스터. 채널마다 노출 컨트롤이 달라(웹=테마·언어,
   * 토스=사운드 등) 호출부가 구성한 엘리먼트를 그대로 받는다.
   */
  floatingControls?: ReactNode;
  /**
   * 콘텐츠 트리 밖(셸 최상위)에 얹는 채널 전용 오버레이.
   * 웹=BackToTop·DeskCloud 마운트, 토스=BottomNav·검색 FAB.
   */
  chromeOverlay?: ReactNode;
  /** 인트로/스플래시 노출. 기본=RandomIntro(구 IntroSplash/현행 SplashScreen 랜덤, 세션 1회). 토스는 once={false} 엘리먼트를 직접 넘긴다. */
  splash?: ReactNode;
  /** 'sr-only' 스킵 링크 노출(웹 키보드 a11y). 토스 WebView 는 BottomNav 가 본문 포커스를 담당해 생략. */
  showSkipLink?: boolean;
  /** <main> 에 적용할 클래스(웹=풀 높이·반응형 패딩, 토스=하단 탭 여백 등). */
  mainClassName?: string;
}

/**
 * AppShell — 웹(/)·토스(apps/toss) **공유** 앱 본문 셸.
 *
 * 라우터 컨텍스트 안쪽(웹=BrowserRouter, 토스=HashRouter)에서 마운트되며, 양 채널이 동일한
 * 콘텐츠 트리(AuthSessionProvider → AppRouter(웹 도메인 페이지 전체) + 커맨드 팔레트 + 전역
 * 오버레이 + 스토어 동기화 + 스크롤/포커스 복원)를 공유한다. 채널 차이(상단/하단 크롬, 플로팅
 * 컨트롤, 스플래시, 스킵 링크)는 prop 으로만 주입한다 — 페이지/데이터 포크 0.
 */
export function AppShell({
  header,
  footer,
  floatingControls,
  chromeOverlay,
  splash,
  showSkipLink = true,
  mainClassName = "min-h-screen pb-20 outline-none md:pb-0",
}: AppShellProps) {
  const { pathname, search } = useLocation();
  useVisitPing();
  return (
    <AuthSessionProvider>
      {shouldRenderAppSplash(pathname, search) ? (splash ?? <RandomIntro />) : null}
      <Suspense fallback={null}>
        <StoreSync />
      </Suspense>
      <ScrollToTop />
      {showSkipLink && (
        <a
          href="#main-content"
          className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-fg focus:px-4 focus:py-2 focus:font-semibold focus:text-canvas"
        >
          본문으로 건너뛰기
        </a>
      )}
      {header}
      <main id="main-content" tabIndex={-1} className={mainClassName}>
        <AppRouter />
      </main>
      {footer}
      <CommandPaletteHost />
      <DeferredGlobalOverlays />
      {floatingControls}
      {chromeOverlay}
    </AuthSessionProvider>
  );
}

export default AppShell;
