import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";

import { checkBrowserCompatibility, type BrowserCompatibilityResult } from "../compat/browser-check";
import { BrowserCompatModal } from "../components/browser-compat-modal";
import { apiPath } from "../infrastructure/api";

import { AppShell } from "./AppShell";
import { isImmersiveMobileRoute } from "./routes/immersive-mobile-route";

import { FloatingControls } from "@/components/FloatingControls";
import { SiteHeader } from "@/components/site-header";

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
let kmasEntryMergeStarted = false;

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

function DeferredBackToTop() {
  const ready = useDeferredByScroll();
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <BackToTop />
    </Suspense>
  );
}

function useKmasEntryMerge() {
  useEffect(() => {
    if (kmasEntryMergeStarted || import.meta.env.VITE_CATALOG_SOURCE === "static") return;
    kmasEntryMergeStarted = true;
    fetch(apiPath("/api/kmas/merge-on-access"), {
      method: "POST",
      cache: "no-store",
      keepalive: true,
    }).catch(() => {
      kmasEntryMergeStarted = false;
    });
  }, []);
}

/**
 * Studio 모바일은 2단 하단 도크와 선택 컨텍스트 바를 직접 소유한다. 그 위에 전역 설정
 * 버튼을 다시 띄우면 375px 화면에서 핵심 도구를 가리므로 모바일에서만 숨긴다. 데스크톱은
 * 작업 영역과 충돌하지 않아 전역 사운드·테마·언어 접근을 그대로 유지한다.
 */
function WebFloatingControls() {
  const { pathname } = useLocation();
  const hideOnMobile = isImmersiveMobileRoute(pathname);

  return (
    <FloatingControls
      placement="bottom-left"
      className={hideOnMobile ? "max-md:hidden" : undefined}
    />
  );
}

// 웹 앱 — 공유 AppShell 을 BrowserRouter(실 URL/history) 안에서 마운트하고 웹 전용 크롬을 주입한다.
export default function App() {
  const [compatResult, setCompatResult] = useState<BrowserCompatibilityResult | null>(null);
  const [showCompatModal, setShowCompatModal] = useState(false);

  useKmasEntryMerge();

  useEffect(() => {
    const res = checkBrowserCompatibility();
    setCompatResult(res);
    // 추천 업데이트 대상이고, 세션 내에서 사용자가 아직 닫지 않았을 때 팝업 표시
    const dismissed = sessionStorage.getItem("toonspectrum-compat-dismissed");
    if (res.recommendUpdate && !dismissed) {
      setShowCompatModal(true);
    }
  }, []);

  const handleCloseCompatModal = () => {
    setShowCompatModal(false);
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  };

  return (
    <BrowserRouter>
      <AppShell
        header={<SiteHeader />}
        footer={<DeferredFooter />}
        floatingControls={<WebFloatingControls />}
        chromeOverlay={
          <>
            <DeferredBackToTop />
            <DeskCloudHost />
            {compatResult && (
              <BrowserCompatModal
                isOpen={showCompatModal}
                onClose={handleCloseCompatModal}
                missingFeatures={compatResult.missingFeatures}
              />
            )}
          </>
        }
      />
    </BrowserRouter>
  );
}
