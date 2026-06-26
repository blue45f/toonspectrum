import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";

import { AppShell } from "./AppShell";

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

// 웹 앱 — 공유 AppShell 을 BrowserRouter(실 URL/history) 안에서 마운트하고 웹 전용 크롬을 주입한다.
// 콘텐츠 트리(라우터·페이지·커맨드 팔레트·오버레이·인증)는 토스와 단일 출처(AppShell)로 공유한다.
export default function App() {
  return (
    <BrowserRouter>
      <AppShell
        header={<SiteHeader />}
        footer={<DeferredFooter />}
        floatingControls={<FloatingControls placement="bottom-left" />}
        chromeOverlay={
          <>
            <DeferredBackToTop />
            {/* DeskCloud 네이티브 통합(@heejun/deskcloud pk_ SDK — 각 desk env URL 게이팅, 미설정 시 비활성) */}
            <DeskCloudHost />
          </>
        }
      />
    </BrowserRouter>
  );
}
