import { useEffect, useRef } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { StoreSync } from "@/components/auth/store-sync";
import { CommandPalette } from "@/components/command-palette";
import { MotionProvider } from "@/components/motion-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AgeGateModal } from "@/components/age-gate-modal";
import { AppRouter } from "./routes/AppRouter";

// 라우트 전환 시 스크롤을 최상단으로 되돌리고, 본문 랜드마크로 포커스를 옮긴다(a11y).
// 첫 진입(직접 연 위치)은 포커스를 가로채지 않는다.
function ScrollToTop() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
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
      <AuthSessionProvider>
        <MotionProvider>
          <StoreSync />
          <ScrollToTop />
          <a
            href="#main-content"
            className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-[#1a1410]"
          >
            본문으로 건너뛰기
          </a>
          <SiteHeader />
          <main id="main-content" tabIndex={-1} className="min-h-screen pb-20 outline-none md:pb-0">
            <AppRouter />
          </main>
          <SiteFooter />
          <CommandPalette />
          <AgeGateModal />
          <LanguageSwitcher className="fixed bottom-4 left-4 z-[90] max-md:bottom-20" />
        </MotionProvider>
      </AuthSessionProvider>
    </BrowserRouter>
  );
}
