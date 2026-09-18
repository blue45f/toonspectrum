import { MonitorUp, WifiOff } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { RoutePurposeScene } from "./RoutePurposeScene";
import { WorkflowTrustBadge } from "./WorkflowTrustBadge";
import { supportsRoutePurposeScene } from "./site-experience/site-experience-policy";

import {
  defineBilingualText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";
import { resolveSiteRouteExperience } from "@/shared/lib/site-route-experience";
import { resolveSiteRouteVisual } from "@/shared/lib/site-route-visual";
import { useI18n } from "@/shared/lib/i18n";

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);
  return narrow;
}

function useOnlineState() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

/**
 * Applies route UX requirements without changing page ownership. It exposes stable data attributes
 * for tests and shells, announces the route purpose, and shows only the device/recovery guidance
 * that a page cannot safely communicate by itself.
 */
export function SiteRouteExperienceBoundary({
  children,
  routeTitle,
}: {
  readonly children: ReactNode;
  readonly routeTitle: string;
}) {
  const { pathname, search } = useLocation();
  const experience = useMemo(
    () => resolveSiteRouteExperience(`${pathname}${search}`),
    [pathname, search],
  );
  const visual = useMemo(
    () => resolveSiteRouteVisual(`${pathname}${search}`),
    [pathname, search],
  );
  const narrow = useNarrowViewport();
  const online = useOnlineState();
  const routePurposeSceneSupported = supportsRoutePurposeScene(pathname);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.routeContextLevel = experience.contextLevel;
    root.dataset.routeMobilePolicy = experience.mobilePolicy;
    root.dataset.routeRecoveryPolicy = experience.recoveryPolicy;
    root.dataset.routeTerminologyScope = experience.terminologyScope;
    root.dataset.routeSaveTrust = experience.saveTrustRequired ? "required" : "optional";
    root.dataset.routeVisualKind = visual.kind;
    root.dataset.routeVisualMotion = visual.motion;
    root.dataset.routePurposeScene = routePurposeSceneSupported ? "true" : "false";
    return () => {
      delete root.dataset.routeContextLevel;
      delete root.dataset.routeMobilePolicy;
      delete root.dataset.routeRecoveryPolicy;
      delete root.dataset.routeTerminologyScope;
      delete root.dataset.routeSaveTrust;
      delete root.dataset.routeVisualKind;
      delete root.dataset.routeVisualMotion;
      delete root.dataset.routePurposeScene;
    };
  }, [experience, routePurposeSceneSupported, visual]);

  const desktopRequired = narrow && experience.mobilePolicy === "desktop-required";
  const showOfflineGuidance = !online && experience.saveTrustRequired;

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" key={experience.canonicalPath}>
        {t(experience.pagePurpose)}
      </p>

      {routePurposeSceneSupported ? (
        <RoutePurposeScene
          title={routeTitle}
          locale={locale}
          experience={experience}
          profile={visual}
        />
      ) : null}

      {desktopRequired ? (
        <aside
          className="mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-[100rem] min-w-0 flex-wrap items-start gap-3 rounded-2xl border border-warn/35 bg-warn/10 p-3 text-sm text-fg"
          role="note"
          data-route-device-guidance="desktop-required"
        >
          <MonitorUp className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <strong className="block break-words">{t(COPY.desktopTitle)}</strong>
            <p className="mt-1 break-words text-xs leading-5 text-fg-2">
              {t(COPY.desktopBody)}
            </p>
          </div>
          <Link className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-line px-3 text-xs font-semibold text-fg hover:bg-raised" to={experience.helpPath}>
            {t(COPY.viewSupport)}
          </Link>
        </aside>
      ) : null}

      {showOfflineGuidance ? (
        <aside
          className="mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-[100rem] min-w-0 flex-wrap items-start gap-3 rounded-2xl border border-warn/35 bg-panel p-3 text-sm text-fg"
          role="status"
          aria-live="polite"
          data-route-recovery-guidance="offline"
        >
          <WifiOff className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <WorkflowTrustBadge state="offline-pending" />
            <p className="mt-2 break-words text-xs leading-5 text-fg-2">
              {t(COPY.offlineBody)}
            </p>
          </div>
        </aside>
      ) : null}

      {children}
    </>
  );
}
