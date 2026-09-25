import { type ReactNode, lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { RouteScrollRestoration } from "./RouteScrollRestoration";
import { AppRouter } from "./routes/AppRouter";
import { SpatialCampusFrame } from "./spatial-campus/SpatialCampusFrame";
import { campusTaskRoute, resolveCampusLocation } from "./spatial-campus/campus-route-adapter";
import { workspaceTaskRoute } from "@/shared/components/workspace/workspace-task-route";

import { ErrorBoundary } from "@/app/errors/error-boundary";
import { AuthMenuShell } from "@/domains/auth/components/auth-menu-shell";
import { WorkspaceAccountContext } from "@/shared/components/workspace/workspace-account-context";
import { AuthSessionProvider } from "@/domains/auth/components/session-provider";
import { CommandPaletteHost } from "@/shared/components/command-palette-host";
import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";
import { PwaInstallNudgeHost as PwaInstallNudge } from "@/shared/components/pwa-install-nudge-host";
import { SiteConnectionNotice } from "@/shared/components/site-experience/SiteConnectionNotice";
import { SiteExperienceFrame } from "@/shared/components/site-experience/SiteExperienceFrame";
import { supportsSiteExperience } from "@/shared/components/site-experience/site-experience-policy";
import { recordCreatorDestination } from "@/shared/lib/creator-continuity";
import { recordSiteRouteVisit } from "@/shared/lib/site-route-history";

import "@toonspectrum/core/fx/fx.css";

const AccessibleTooltipLayer = lazy(() =>
  import("@/shared/components/AccessibleTooltipLayer").then((mod) => ({ default: mod.AccessibleTooltipLayer })),
);
const SiteCreationCompass = lazy(() =>
  import("@/shared/components/site-experience/SiteCreationCompass").then((mod) => ({ default: mod.SiteCreationCompass })),
);
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
const CreatorAdaptiveOnboardingGate = lazy(() =>
  import("@/shared/components/CreatorAdaptiveOnboardingGate").then((mod) => ({
    default: mod.CreatorAdaptiveOnboardingGate,
  })),
);
const ToastHost = lazy(() =>
  import("@/shared/components/toast-host").then((mod) => ({ default: mod.ToastHost })),
);

/** Records allow-listed creator destinations, never artwork or arbitrary query parameters. */
function CreatorContinuityTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const binding = resolveCampusLocation(pathname, search);
    if (binding?.surface === "protected" || binding?.districtId === "observatory") return;
    recordCreatorDestination(pathname, search);
    recordSiteRouteVisit(pathname);
  }, [pathname, search]);
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
  publicExperience = false,
  mainClassName = "min-h-screen pb-20 outline-none md:pb-0",
}: AppShellProps) {
  const { pathname, search } = useLocation();
  const publicCreativeRoute = isPublicCreativeRoute(pathname);
  // Public discovery, community, learning and marketplace pages keep one predictable public
  // shell. Spatial/workspace chrome is reserved for signed-in work management and authoring.
  const campus = publicCreativeRoute ? null : resolveCampusLocation(pathname, search);
  const protectedCampus = campus?.surface === "protected";
  const taskRoute = publicCreativeRoute || protectedCampus
    ? null
    : workspaceTaskRoute(pathname, search) ?? campusTaskRoute(campus);
  const immersiveVirtualHome = ["/home", "/team", "/hub", "/studio", "/studio/space", "/onboarding/character"].includes(pathname.replace(/\/+$/u, "") || "/");
  const immersiveVirtualProject = /^\/studio\/p\/[^/]+\/space\/?$/.test(pathname);
  const immersiveVirtualExperience = immersiveVirtualHome || immersiveVirtualProject || taskRoute !== null || protectedCampus;
  const enhancedSite = Boolean(header) && supportsSiteExperience(pathname) && !immersiveVirtualExperience;
  const resolvedMainClassName = immersiveVirtualHome || taskRoute !== null
    ? "min-h-[100dvh] bg-canvas outline-none"
    : immersiveVirtualProject
      ? "min-h-[100dvh] bg-canvas outline-none"
      : mainClassName;
  return (
    <AuthSessionProvider>
      <Suspense fallback={null}><AccessibleTooltipLayer /></Suspense>
      <Suspense fallback={null}><StoreSync /></Suspense>
      {showGlobalOverlays && !immersiveVirtualExperience ? (
        <Suspense fallback={null}><CreatorAdaptiveOnboardingGate /></Suspense>
      ) : null}
      <RouteScrollRestoration />
      <CreatorContinuityTracker />
      <SiteExperienceFrame enabled={enhancedSite}>
        {showSkipLink ? (
          <a href="#main-content" className="sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:flex focus:min-h-11 focus:items-center focus:rounded-xl focus:border focus:border-line-strong focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-canvas focus:shadow-2xl focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent">
            본문으로 건너뛰기
          </a>
        ) : null}
        {immersiveVirtualExperience ? null : header}
        {enhancedSite ? <SiteConnectionNotice /> : null}
        {immersiveVirtualExperience ? null : <PwaInstallNudge />}
        <main id="main-content" tabIndex={-1} className={resolvedMainClassName} data-public-experience={publicCreativeRoute ? "atelier" : publicExperience || undefined}>
          {enhancedSite ? <Suspense fallback={null}><SiteCreationCompass /></Suspense> : null}
          <WorkspaceAccountContext.Provider value={<AuthMenuShell />}>
            <SpatialCampusFrame binding={campus} route={taskRoute}><AppRouter /></SpatialCampusFrame>
          </WorkspaceAccountContext.Provider>
          {publicCreativeRoute && !immersiveVirtualExperience ? (
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
        {immersiveVirtualExperience ? null : footer}
        {showCommandPalette && !protectedCampus ? <CommandPaletteHost /> : null}
        {showGlobalOverlays && !protectedCampus ? <DeferredGlobalOverlays /> : null}
        {immersiveVirtualExperience ? null : floatingControls}
        {immersiveVirtualExperience ? null : chromeOverlay}
      </SiteExperienceFrame>
    </AuthSessionProvider>
  );
}

export default AppShell;
