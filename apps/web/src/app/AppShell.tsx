import { type ReactNode, lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { RouteScrollRestoration } from "./RouteScrollRestoration";
import { AppRouter } from "./routes/AppRouter";

import { ErrorBoundary } from "@/components/error-boundary";
import { AuthSessionProvider } from "@/domains/auth/components/session-provider";
import { CommandPaletteHost } from "@/shared/components/command-palette-host";
import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";
import { PwaInstallNudge } from "@/shared/components/pwa-install-nudge";
import { SiteConnectionNotice } from "@/shared/components/site-experience/SiteConnectionNotice";
import { SiteExperienceFrame } from "@/shared/components/site-experience/SiteExperienceFrame";
import { supportsSiteExperience } from "@/shared/components/site-experience/site-experience-policy";
import { recordCreatorDestination } from "@/shared/lib/creator-continuity";
import { pingVisit } from "@/shared/lib/visits-api";

import "@toonspectrum/core/fx/fx.css";

const PublicSiteWayfinder = lazy(() =>
  import("@/shared/components/public-site-wayfinder").then((mod) => ({ default: mod.PublicSiteWayfinder })),
);
const SiteNextSteps = lazy(() =>
  import("@/shared/components/site-experience/SiteNextSteps").then((mod) => ({ default: mod.SiteNextSteps })),
);
const PublicSiteNextSteps = lazy(() =>
  import("@/shared/components/public-site-next-steps").then((mod) => ({
    default: mod.PublicSiteAtelierJourney,
  })),
);
const AgeGateHost = lazy(() =>
  import("@/shared/components/age-gate-host").then((mod) => ({ default: mod.AgeGateHost })),
);
const StoreSync = lazy(() =>
  import("@/domains/auth/components/store-sync").then((mod) => ({ default: mod.StoreSync })),
);
const ToastHost = lazy(() =>
  import("@/shared/components/toast-host").then((mod) => ({ default: mod.ToastHost })),
);

/** Records allow-listed creator destinations, never artwork or arbitrary query parameters. */
function CreatorContinuityTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => { recordCreatorDestination(pathname, search); }, [pathname, search]);
  return null;
}

function useDeferredByInput(timeoutMs = 4500) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const activate = () => setReady(true);
    const options = { passive: true } as const;
    const timeoutId = window.setTimeout(activate, timeoutMs);
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

function useVisitPing(enabled: boolean) {
  useEffect(() => { if (enabled) void pingVisit(); }, [enabled]);
}

function DeferredGlobalOverlays() {
  const ready = useDeferredByInput();
  if (!ready) return null;
  return <Suspense fallback={null}><AgeGateHost /><ToastHost /></Suspense>;
}

export interface AppShellProps {
  header?: ReactNode;
  footer?: ReactNode;
  floatingControls?: ReactNode;
  chromeOverlay?: ReactNode;
  showSkipLink?: boolean;
  showCommandPalette?: boolean;
  showGlobalOverlays?: boolean;
  trackVisit?: boolean;
  mainClassName?: string;
  publicExperience?: boolean;
}

export function AppShell({
  header,
  footer,
  floatingControls,
  chromeOverlay,
  showSkipLink = true,
  showCommandPalette = true,
  showGlobalOverlays = true,
  trackVisit = true,
  publicExperience = false,
  mainClassName = "min-h-screen pb-20 outline-none md:pb-0",
}: AppShellProps) {
  const { pathname } = useLocation();
  const publicCreativeRoute = isPublicCreativeRoute(pathname);
  useVisitPing(trackVisit);
  const enhancedSite = Boolean(header) && supportsSiteExperience(pathname);
  return (
    <AuthSessionProvider>
      <Suspense fallback={null}><StoreSync /></Suspense>
      <RouteScrollRestoration />
      <CreatorContinuityTracker />
      <SiteExperienceFrame enabled={enhancedSite}>
        {showSkipLink ? (
          <a href="#main-content" className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-fg focus:px-4 focus:py-2 focus:font-semibold focus:text-canvas">
            본문으로 건너뛰기
          </a>
        ) : null}
        {header}
        {enhancedSite ? <SiteConnectionNotice /> : null}
        <PwaInstallNudge />
        <main id="main-content" tabIndex={-1} className={mainClassName} data-public-experience={publicCreativeRoute ? "atelier" : publicExperience || undefined}>
          <AppRouter />
          {publicCreativeRoute && pathname !== "/" ? (
            <ErrorBoundary resetKey={pathname}>
              <Suspense fallback={<Suspense fallback={null}><PublicSiteWayfinder /></Suspense>}>
                <PublicSiteNextSteps pathname={pathname} />
              </Suspense>
            </ErrorBoundary>
          ) : null}
        </main>
        {enhancedSite && !publicCreativeRoute ? (
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={null}><SiteNextSteps /></Suspense>
          </ErrorBoundary>
        ) : null}
        {footer}
        {showCommandPalette ? <CommandPaletteHost /> : null}
        {showGlobalOverlays ? <DeferredGlobalOverlays /> : null}
        {floatingControls}
        {chromeOverlay}
      </SiteExperienceFrame>
    </AuthSessionProvider>
  );
}

export default AppShell;
