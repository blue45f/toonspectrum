import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";

import { checkBrowserCompatibility, type BrowserCompatibilityResult } from "../compat/browser-check";
import { BrowserCompatModal } from "../components/browser-compat-modal";
import { apiPath } from "../infrastructure/api";

import { AppShell } from "./AppShell";
import { isImmersiveMobileRoute } from "./routes/immersive-mobile-route";
import { ensureSerifWebFontForRoute } from "./serif-webfont";
import { installStudioDocumentNavigationBridge } from "./studio-document-navigation";

import { FloatingControls } from "@/shared/components/FloatingControls";
import { SiteHeader } from "@/shared/components/site-header";
import { withCsrfProtection } from "@/shared/lib/csrf";
import { useUi } from "@/shared/lib/ui-store";

const BackToTop = lazy(() =>
  import("@/shared/components/back-to-top").then((mod) => ({
    default: mod.BackToTop,
  })),
);
const DeskCloudMounts = lazy(() =>
  import("@/src/components/deskcloud-native/DeskCloudMounts").then((mod) => ({
    default: mod.DeskCloudMounts,
  })),
);
const SiteFooter = lazy(() =>
  import("@/shared/components/site-footer").then((mod) => ({
    default: mod.SiteFooter,
  })),
);
const StudioBg3dRetainedOwnerHost = lazy(() =>
  import("../domains/creator/bg3d/StudioBg3dRetainedOwnerHost").then((mod) => ({
    default: mod.StudioBg3dRetainedOwnerHost,
  })),
);
const TrafficAnalyticsBridge = lazy(() =>
  import("./traffic-analytics/TrafficAnalyticsBridge").then((mod) => ({
    default: mod.TrafficAnalyticsBridge,
  })),
);

const HAS_DESKCLOUD_MOUNTS = Boolean(
  import.meta.env.VITE_SURVEYDESK_URL ||
  import.meta.env.VITE_CHANGELOGDESK_URL ||
  import.meta.env.VITE_NOTIFYDESK_URL,
);
const TRAFFIC_ANALYTICS_ENABLED =
  import.meta.env.PROD &&
  import.meta.env.VITE_TRAFFIC_ANALYTICS_ENABLED !== "false";
let kmasEntryMergeStarted = false;

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
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

function useKmasEntryMerge(enabled: boolean) {
  useEffect(() => {
    if (
      !enabled ||
      kmasEntryMergeStarted ||
      import.meta.env.VITE_CATALOG_SOURCE === "static"
    ) {
      return;
    }

    let cancelled = false;
    const run = () => {
      if (cancelled || kmasEntryMergeStarted) return;
      kmasEntryMergeStarted = true;
      fetch(
        apiPath("/api/kmas/merge-on-access"),
        withCsrfProtection({
          method: "POST",
          cache: "no-store",
          keepalive: true,
        }),
      ).catch(() => {
        kmasEntryMergeStarted = false;
      });
    };

    const idleCallbacks = window as unknown as {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (callbackHandle: number) => void;
    };

    if (typeof idleCallbacks.requestIdleCallback === "function") {
      const handle = idleCallbacks.requestIdleCallback(run, { timeout: 3000 });
      return () => {
        cancelled = true;
        idleCallbacks.cancelIdleCallback?.(handle);
      };
    }

    const timer = globalThis.setTimeout(run, 1500);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [enabled]);
}

function WebFloatingControls() {
  const { pathname } = useLocation();
  const hideOnMobile = isImmersiveMobileRoute(pathname);

  return (
    <FloatingControls
      placement="bottom-left"
      showSound={false}
      showBgm={false}
      className={hideOnMobile ? "max-md:hidden" : undefined}
    />
  );
}

function StudioRouteImmersiveBridge() {
  const { pathname } = useLocation();
  const acquireImmersiveSurface = useUi(
    (state) => state.acquireImmersiveSurface,
  );
  const releaseImmersiveSurface = useUi(
    (state) => state.releaseImmersiveSurface,
  );
  const onStudioPath = isImmersiveMobileRoute(pathname);

  useEffect(() => {
    if (!onStudioPath) return;
    acquireImmersiveSurface("studio");
    return () => {
      releaseImmersiveSurface("studio");
    };
  }, [acquireImmersiveSurface, onStudioPath, releaseImmersiveSurface]);

  return null;
}

function StudioDocumentNavigationBridge() {
  useEffect(() => installStudioDocumentNavigationBridge(), []);
  return null;
}

function SerifWebFontBridge() {
  const { pathname } = useLocation();

  useEffect(() => {
    ensureSerifWebFontForRoute(pathname);
  }, [pathname]);

  return null;
}

function AppRuntime() {
  const { pathname } = useLocation();
  const [compatResult, setCompatResult] =
    useState<BrowserCompatibilityResult | null>(null);
  const [showCompatModal, setShowCompatModal] = useState(false);
  const studioImmersive = isImmersiveMobileRoute(pathname);
  const adminChrome = isAdminPath(pathname);
  const isolatedChrome = studioImmersive || adminChrome;

  useKmasEntryMerge(!adminChrome);

  useEffect(() => {
    const result = checkBrowserCompatibility();
    setCompatResult(result);
    const dismissed = sessionStorage.getItem("toonspectrum-compat-dismissed");
    if (result.recommendUpdate && !dismissed) setShowCompatModal(true);
  }, []);

  const handleCloseCompatModal = () => {
    setShowCompatModal(false);
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  };

  return (
    <>
      {TRAFFIC_ANALYTICS_ENABLED && !adminChrome ? (
        <Suspense fallback={null}>
          <TrafficAnalyticsBridge />
        </Suspense>
      ) : null}
      <StudioDocumentNavigationBridge />
      <StudioRouteImmersiveBridge />
      <SerifWebFontBridge />
      <AppShell
        header={isolatedChrome ? null : <SiteHeader />}
        footer={isolatedChrome ? null : <DeferredFooter />}
        floatingControls={isolatedChrome ? null : <WebFloatingControls />}
        showSkipLink={!studioImmersive}
        showCommandPalette={!adminChrome}
        showGlobalOverlays={!adminChrome}
        trackVisit={!adminChrome}
        mainClassName={
          studioImmersive
            ? "min-h-0 h-[100dvh] overflow-hidden outline-none pb-0"
            : adminChrome
              ? "min-h-[100dvh] outline-none"
              : "min-h-screen pb-20 outline-none md:pb-0"
        }
        chromeOverlay={
          <>
            {studioImmersive ? (
              <Suspense fallback={null}>
                <StudioBg3dRetainedOwnerHost />
              </Suspense>
            ) : null}
            {!isolatedChrome ? (
              <>
                <DeferredBackToTop />
                <DeskCloudHost />
              </>
            ) : null}
            {!adminChrome && compatResult ? (
              <BrowserCompatModal
                isOpen={showCompatModal}
                onClose={handleCloseCompatModal}
                missingFeatures={compatResult.missingFeatures}
              />
            ) : null}
          </>
        }
      />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRuntime />
    </BrowserRouter>
  );
}
