import { Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { appRoutes } from "./groups/app-routes";
import { RouteFallback } from "./route-fallback";
import { RouteStage } from "./route-stage";
import { useRouteTitle } from "./route-titles";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { ErrorBoundary } from "@/components/error-boundary";
import {
  isStudioWorkspaceLocation,
  isStudioWorkspaceRoutePathname,
} from "@/domains/creator/studio-workspace-route";

function readInitialDocumentPathname(): string | null {
  try {
    return typeof globalThis.location?.pathname === "string"
      ? globalThis.location.pathname
      : null;
  } catch {
    return null;
  }
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

function AppRouteTree({ pathname, search }: {
  readonly pathname: string;
  readonly search: string;
}) {
  return (
    <RouteStage pathname={pathname} search={search}>
      <ErrorBoundary resetKey={`${pathname}${search}`}>
        <Suspense fallback={<RouteFallback />}>
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

export function AppRouter() {
  const { pathname, search } = useLocation();
  useRouteTitle(pathname, search);

  const documentWasStudioEditor = isStudioWorkspaceRoutePathname(
    INITIAL_DOCUMENT_PATHNAME ?? pathname,
  );
  const currentIsStudioEditor = isStudioWorkspaceLocation({ pathname, search });
  const routeTree = <AppRouteTree pathname={pathname} search={search} />;
  const needsIsolationGate =
    currentIsStudioEditor
    || documentWasStudioEditor
    || globalThis.crossOriginIsolated === true;

  if (!needsIsolationGate) return routeTree;

  return (
    <Suspense fallback={<RouteFallback />}>
      <StudioCrossOriginIsolationGate
        pathname={pathname}
        documentWasStudio={documentWasStudioEditor}
        pending={<RouteFallback />}
      >
        {routeTree}
      </StudioCrossOriginIsolationGate>
    </Suspense>
  );
}
