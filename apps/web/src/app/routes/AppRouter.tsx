import { legacyStudioEditorHref, readInitialDocumentPathname } from "./studio-entry-redirect";
import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { appRoutes } from "./groups/app-routes";
import { RouteFallback } from "./route-fallback";
import { RouteStage } from "./route-stage";
import { useRouteTitle } from "./route-titles";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { useUi } from "@/shared/lib/ui-store";
import { ErrorBoundary } from "@/components/error-boundary";
import { SiteRouteExperienceBoundary } from "@/shared/components/SiteRouteExperienceBoundary";
import {
  isStudioWorkspaceLocation,
  isStudioWorkspaceRoutePathname,
} from "@/domains/creator/studio-workspace-route";

export const OPEN_COMMAND_PALETTE_EVENT = "toonspectrum:command-palette:open" as const;

/** Bridge route-level command-palette events into the shared UI store. */
function CommandPaletteEventBridge() {
  const openCommandPalette = useUi((state) => state.openCommandPalette);

  useEffect(() => {
    const open = () => openCommandPalette();
    globalThis.addEventListener(OPEN_COMMAND_PALETTE_EVENT, open);
    return () => globalThis.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, open);
  }, [openCommandPalette]);

  return null;
}

// This module lives for one browser document. Retain editor delivery mode across SPA transitions,
// but do not load cross-origin isolation for the lightweight Studio home, assets or learning pages.
const INITIAL_DOCUMENT_PATHNAME = readInitialDocumentPathname();

const StudioCrossOriginIsolationGate = lazyRetry(
  () => import("@/app/StudioCrossOriginIsolationGate").then((module) => ({
    default: module.StudioCrossOriginIsolationGate,
  })),
  "StudioCrossOriginIsolationGate",
);

/** Render the registered application routes inside their loading and error boundaries. */
function AppRouteTree({
  pathname, search, title,
}: Readonly<{ pathname: string; search: string; title: string }>) {
  return (
    <RouteStage pathname={pathname} search={search} accessibleTitle={title}>
      <ErrorBoundary resetKey={`${pathname}${search}`}>
        <CommandPaletteEventBridge />
        <Suspense fallback={<RouteFallback accessibleTitle={title} />}>
          <Routes>
            {appRoutes.map(({ element, id, path }) => (
              <Route key={id} id={id} path={path} element={element} />
            ))}
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </RouteStage>
  );
}

/** Render application routing with cross-origin isolation limited to editor workspaces. */
export function AppRouter() {
  const { pathname, search } = useLocation();
  const routeTitle = useRouteTitle(pathname, search);

  const legacyEditorHref = legacyStudioEditorHref(pathname, search);
  if (legacyEditorHref) return <Navigate replace to={legacyEditorHref} />;

  const documentWasStudioEditor = isStudioWorkspaceRoutePathname(
    INITIAL_DOCUMENT_PATHNAME ?? pathname,
  );
  const currentIsStudioEditor = isStudioWorkspaceLocation({ pathname, search });
  const routeTree = (
    <SiteRouteExperienceBoundary><AppRouteTree pathname={pathname} search={search} title={routeTitle} /></SiteRouteExperienceBoundary>
  );
  const needsIsolationGate = currentIsStudioEditor || documentWasStudioEditor
    || globalThis.crossOriginIsolated === true;

  if (!needsIsolationGate) return routeTree;

  return (
    <Suspense fallback={<RouteFallback accessibleTitle={routeTitle} />}>
      <StudioCrossOriginIsolationGate
        pathname={pathname}
        documentWasStudio={documentWasStudioEditor}
        pending={<RouteFallback accessibleTitle={routeTitle} />}
      >
        {routeTree}
      </StudioCrossOriginIsolationGate>
    </Suspense>
  );
}
