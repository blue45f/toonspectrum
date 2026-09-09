import { type ReactNode, lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { AppRouter } from "./routes/AppRouter";

import { AuthSessionProvider } from "@/domains/auth/components/session-provider";
import { CommandPaletteHost } from "@/shared/components/command-palette-host";
import { PwaInstallNudge } from "@/shared/components/pwa-install-nudge";
import { recordCreatorDestination } from "@/shared/lib/creator-continuity";
import { pingVisit } from "@/shared/lib/visits-api";
import {
  isStudioRoutePathname,
  shouldPreserveStudioRouteLifecycle,
} from "@/domains/creator/studio-workspace-route";

import "@toonspectrum/core/fx/fx.css";

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
const ToastHost = lazy(() =>
  import("@/shared/components/toast-host").then((mod) => ({ default: mod.ToastHost })),
);

function ScrollToTop() {
  const { pathname, search } = useLocation();
  const previousLocationRef = useRef<{ pathname: string; search: string } | null>(null);

  useEffect(() => {
    const previousLocation = previousLocationRef.current;
    const currentLocation = { pathname, search };
    previousLocationRef.current = currentLocation;
    if (
      previousLocation?.pathname === pathname
      && !isStudioRoutePathname(pathname)
    ) return;
    if (
      previousLocation !== null
      && shouldPreserveStudioRouteLifecycle(previousLocation, currentLocation)
    ) {
      return;
    }
    globalThis.scrollTo({ top: 0, left: 0 });
    if (previousLocation === null) return;
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [pathname, search]);

  return null;
}

/**
 * Remembers only an allow-listed destination and a safe launch preset. Artwork,
 * work IDs and arbitrary query parameters never cross this boundary.
 */
function CreatorContinuityTracker() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    recordCreatorDestination(pathname, search);
  }, [pathname, search]);

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

function useVisitPing(enabled: boolean) {
  useEffect(() => {
    if (enabled) void pingVisit();
  }, [enabled]);
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
  trackVisit?: boolean;
  mainClassName?: string;
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
  mainClassName = "min-h-screen pb-20 outline-none md:pb-0",
}: AppShellProps) {
  useVisitPing(trackVisit);
  return (
    <AuthSessionProvider>
      <Suspense fallback={null}>
        <StoreSync />
      </Suspense>
      <ScrollToTop />
      <CreatorContinuityTracker />
      {showSkipLink ? (
        <a
          href="#main-content"
          className="sr-only rounded-md focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-fg focus:px-4 focus:py-2 focus:font-semibold focus:text-canvas"
        >
          본문으로 건너뛰기
        </a>
      ) : null}
      {header}
      <PwaInstallNudge />
      <main id="main-content" tabIndex={-1} className={mainClassName}>
        <AppRouter />
      </main>
      {footer}
      {showCommandPalette ? <CommandPaletteHost /> : null}
      {showGlobalOverlays ? <DeferredGlobalOverlays /> : null}
      {floatingControls}
      {chromeOverlay}
    </AuthSessionProvider>
  );
}

export default AppShell;
