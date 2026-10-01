import { type ReactNode, lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { RouteScrollRestoration } from "./RouteScrollRestoration";
import { AppRouter } from "./routes/AppRouter";
import { SpatialCampusFrame } from "./spatial-campus/SpatialCampusFrame";
import {
  campusTaskRoute,
  resolveCampusLocation,
} from "./spatial-campus/campus-route-adapter";

import { ErrorBoundary } from "@/app/errors/error-boundary";
import { AccountNudgeHost } from "@/domains/auth/components/account-required-nudge";
import { AuthMenuShell } from "@/domains/auth/components/auth-menu-shell";
import { GuestMigrationBridge } from "@/domains/auth/components/guest-migration-bridge";
import { AuthSessionProvider } from "@/domains/auth/components/session-provider";
import {
  activeProjectIdFromLocation,
  writeActiveProjectContext,
} from "@/domains/creator/studio-shell/active-project-context";
import { isStudioWorkspaceRoutePathname } from "@/domains/creator/studio-workspace-route";
import { isAmbientRouteAllowed } from "@/shared/ambient/ambient-routes";
import { CommandPaletteHost } from "@/shared/components/command-palette-host";
import { PwaInstallNudgeHost as PwaInstallNudge } from "@/shared/components/pwa-install-nudge-host";
import { isPublicCreativeRoute, supportsPublicSiteOnwardJourney } from "@/shared/components/site-public-routes";
import { SiteConnectionNotice } from "@/shared/components/site-experience/SiteConnectionNotice";
import { SiteExperienceFrame } from "@/shared/components/site-experience/SiteExperienceFrame";
import { supportsSiteExperience } from "@/shared/components/site-experience/site-experience-policy";
import { WorkspaceAccountContext } from "@/shared/components/workspace/workspace-account-context";
import { workspaceTaskRoute } from "@/shared/components/workspace/workspace-task-route";
import { recordCreatorDestination } from "@/shared/lib/creator-continuity";
import { recordSiteRouteVisit } from "@/shared/lib/site-route-history";

import "@toonstudio/core/fx/fx.css";

const AccessibleTooltipLayer = lazy(() =>
  import("@/shared/components/AccessibleTooltipLayer").then((mod) => ({
    default: mod.AccessibleTooltipLayer,
  })),
);
const SiteCreationCompass = lazy(() =>
  import("@/shared/components/site-experience/SiteCreationCompass").then((mod) => ({
    default: mod.SiteCreationCompass,
  })),
);
const PublicSiteWayfinder = lazy(() =>
  import("@/shared/components/public-site-wayfinder").then((mod) => ({
    default: mod.PublicSiteWayfinder,
  })),
);
const SiteNextSteps = lazy(() =>
  import("@/shared/components/site-experience/SiteNextSteps").then((mod) => ({
    default: mod.SiteNextSteps,
  })),
);
const PublicSiteNextSteps = lazy(() =>
  import("@/shared/components/public-site-next-steps").then((mod) => ({
    default: mod.PublicSiteAtelierJourney,
  })),
);
const AgeGateHost = lazy(() =>
  import("@/shared/components/age-gate-host").then((mod) => ({
    default: mod.AgeGateHost,
  })),
);
const StoreSync = lazy(() =>
  import("@/domains/auth/components/store-sync").then((mod) => ({
    default: mod.StoreSync,
  })),
);
const CreatorAdaptiveOnboardingGate = lazy(() =>
  import("@/domains/creator/onboarding/CreatorAdaptiveOnboardingGate").then((mod) => ({
    default: mod.CreatorAdaptiveOnboardingGate,
  })),
);
const ActiveProjectContextBridge = lazy(() =>
  import("@/domains/creator/studio-shell/ActiveProjectContextBridge").then((mod) => ({
    default: mod.ActiveProjectContextBridge,
  })),
);
const ToastHost = lazy(() =>
  import("@/shared/components/toast-host").then((mod) => ({
    default: mod.ToastHost,
  })),
);
const ServiceCapabilityRuntime = lazy(() =>
  import("@/app/service-state/ServiceCapabilityRuntime").then((mod) => ({
    default: mod.ServiceCapabilityRuntime,
  })),
);
const ServiceDegradedBanner = lazy(() =>
  import("@/app/service-state/ServiceDegradedBanner").then((mod) => ({
    default: mod.ServiceDegradedBanner,
  })),
);
const AmbientExperienceHost = lazy(() =>
  import("@/shared/ambient/AmbientExperienceHost").then((mod) => ({
    default: mod.AmbientExperienceHost,
  })),
);
const PwaInstallShowcaseHost = lazy(() =>
  import("@/shared/pwa/PwaInstallShowcaseHost").then((mod) => ({
    default: mod.PwaInstallShowcaseHost,
  })),
);
const PwaConnectionPulse = lazy(() =>
  import("@/shared/pwa/PwaConnectionPulse").then((mod) => ({
    default: mod.PwaConnectionPulse,
  })),
);

function CreatorContinuityTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const binding = resolveCampusLocation(pathname, search);
    if (binding?.surface === "protected" || binding?.districtId === "observatory") {
      return;
    }
    recordCreatorDestination(pathname, search);
    recordSiteRouteVisit(pathname);
    const projectId = activeProjectIdFromLocation(pathname, search);
    if (projectId && typeof window !== "undefined") {
      writeActiveProjectContext(window.sessionStorage, projectId);
    }
  }, [pathname, search]);
  return null;
}

function useDeferredByInput(timeoutMs = 4_500) {
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
  return (
    <Suspense fallback={null}>
      <AgeGateHost />
      <ToastHost />
    </Suspense>
  );
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
  const campus = publicCreativeRoute
    ? null
    : resolveCampusLocation(pathname, search);
  const protectedCampus = campus?.surface === "protected";
  const taskRoute = publicCreativeRoute || protectedCampus
    ? null
    : workspaceTaskRoute(pathname, search) ?? campusTaskRoute(campus);
  const normalizedPath = pathname.replace(/\/+$/u, "") || "/";
  const immersiveTeamExperience =
    normalizedPath === "/team" || normalizedPath.startsWith("/team/");
  const immersiveVirtualHome =
    immersiveTeamExperience
    || [
      "/home",
      "/hub",
      "/studio",
      "/studio/space",
      "/onboarding/character",
    ].includes(normalizedPath);
  const immersiveVirtualProject = /^\/studio\/p\/[^/]+\/space\/?$/u.test(pathname);
  const immersiveVirtualExperience =
    immersiveVirtualHome
    || immersiveVirtualProject
    || taskRoute !== null
    || protectedCampus;
  const enhancedSite =
    Boolean(header)
    && supportsSiteExperience(pathname)
    && !immersiveVirtualExperience;
  // 날씨·계절 배경: 몰입형 작업 화면과 작업 집중 경로(편집기·3D·제작 보드·발표·영상·관리자)에서는 끈다.
  const ambientBackdrop = !immersiveVirtualExperience && isAmbientRouteAllowed(pathname);
  const resolvedMainClassName = immersiveVirtualHome || taskRoute !== null
    ? "min-h-[100dvh] bg-canvas outline-none"
    : immersiveVirtualProject
      ? "min-h-[100dvh] bg-canvas outline-none"
      : mainClassName;

  return (
    <AuthSessionProvider>
      <Suspense fallback={null}>
        <ServiceCapabilityRuntime />
      </Suspense>
      <Suspense fallback={null}><AccessibleTooltipLayer /></Suspense>
      <Suspense fallback={null}><StoreSync /></Suspense>
      <GuestMigrationBridge />
      <AccountNudgeHost />
      <Suspense fallback={null}><PwaInstallShowcaseHost /></Suspense>
      <Suspense fallback={null}><PwaConnectionPulse /></Suspense>
      {showGlobalOverlays && !immersiveVirtualExperience ? (
        <Suspense fallback={null}><CreatorAdaptiveOnboardingGate /></Suspense>
      ) : null}
      <RouteScrollRestoration />
      <CreatorContinuityTracker />
      <SiteExperienceFrame enabled={enhancedSite}>
        {/* main의 형제로 두어 콘텐츠 뒤(음수 z-index) 배경에만 그린다. */}
        {ambientBackdrop ? (
          <Suspense fallback={null}><AmbientExperienceHost /></Suspense>
        ) : null}
        {showSkipLink ? (
          <a href="#main-content" className="sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:flex focus:min-h-11 focus:items-center focus:rounded-xl focus:border focus:border-line-strong focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-canvas focus:shadow-2xl focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent">
            본문으로 건너뛰기
          </a>
        ) : null}
        {immersiveVirtualExperience ? null : header}
        <Suspense fallback={null}>
          <ServiceDegradedBanner immersive={
            isStudioWorkspaceRoutePathname(pathname)
            || (immersiveVirtualExperience && normalizedPath !== "/home")
          } />
        </Suspense>
        {enhancedSite ? <SiteConnectionNotice /> : null}
        {immersiveVirtualExperience ? null : <PwaInstallNudge />}
        <main
          id="main-content"
          tabIndex={-1}
          className={resolvedMainClassName}
          data-public-experience={
            publicCreativeRoute ? "atelier" : publicExperience || undefined
          }
        >
          {enhancedSite ? (
            <Suspense fallback={null}><SiteCreationCompass /></Suspense>
          ) : null}
          {publicCreativeRoute ? (
            <Suspense fallback={null}><ActiveProjectContextBridge /></Suspense>
          ) : null}
          <WorkspaceAccountContext.Provider value={<AuthMenuShell />}>
            <SpatialCampusFrame binding={campus} route={taskRoute}>
              <AppRouter />
            </SpatialCampusFrame>
          </WorkspaceAccountContext.Provider>
          {publicCreativeRoute && !immersiveVirtualExperience && supportsPublicSiteOnwardJourney(pathname) ? (
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
