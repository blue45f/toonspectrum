import { useEffect, useRef } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";

import { AppRouter } from "./routes/AppRouter";

import { AgeGateModal } from "@/components/age-gate-modal";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { StoreSync } from "@/components/auth/store-sync";
import { BackToTop } from "@/components/back-to-top";
import { CommandPaletteHost } from "@/components/command-palette-host";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MotionProvider } from "@/components/motion-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ToastHost } from "@/components/toast-host";
import { AuthProvider } from "@/lib/firebaseAuth";
import { DeskCloudMounts } from "@/src/components/deskcloud-native/DeskCloudMounts";
import { AppQueryProvider } from "@/src/infrastructure/query-provider";

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

export default function App() {
  return (
    <BrowserRouter>
      <AppQueryProvider>
        <AuthSessionProvider>
          {/* 통합 로그인(Firebase Auth) — 기존 세션 로그인과 별개로 추가. 헤더의 회원 로그인 진입점이 소비. */}
          <AuthProvider>
          <MotionProvider>
            <StoreSync />
            <ScrollToTop />
            <a
              href="#main-content"
              className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-fg focus:px-4 focus:py-2 focus:font-semibold focus:text-canvas"
            >
              본문으로 건너뛰기
            </a>
            <SiteHeader />
            <main id="main-content" tabIndex={-1} className="min-h-screen pb-20 outline-none md:pb-0">
              <AppRouter />
            </main>
            <SiteFooter />
            <CommandPaletteHost />
            <AgeGateModal />
            <BackToTop />
            <ToastHost />
            <div className="fixed bottom-4 left-4 z-[90] flex items-center gap-2 max-md:bottom-20">
              <ThemeSwitcher />
              <LanguageSwitcher />
            </div>
            {/* DeskCloud 네이티브 통합(@heejun/deskcloud pk_ SDK — 각 desk env URL 게이팅, 미설정 시 비활성) */}
            <DeskCloudMounts />
          </MotionProvider>
          </AuthProvider>
        </AuthSessionProvider>
      </AppQueryProvider>
    </BrowserRouter>
  );
}
