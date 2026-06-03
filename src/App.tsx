import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import { StoreSync } from "@/components/auth/store-sync";
import { CommandPalette } from "@/components/command-palette";
import { MotionProvider } from "@/components/motion-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AppRouter } from "./routes/AppRouter";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
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
          <SiteHeader />
          <main className="min-h-screen pb-20 md:pb-0">
            <AppRouter />
          </main>
          <SiteFooter />
          <CommandPalette />
          <LanguageSwitcher className="fixed bottom-4 left-4 z-[90] max-md:bottom-20" />
        </MotionProvider>
      </AuthSessionProvider>
    </BrowserRouter>
  );
}
