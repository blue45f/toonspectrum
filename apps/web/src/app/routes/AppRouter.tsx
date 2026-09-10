import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { appRoutes } from "./groups/app-routes";
import { RouteFallback } from "./route-fallback";
import { RouteStage } from "./route-stage";
import { useRouteTitle } from "./route-titles";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { useUi } from "@/shared/lib/ui-store";
import { ErrorBoundary } from "@/components/error-boundary";
import {
  STUDIO_DRAFT_CANVAS_PATHNAME,
  STUDIO_HOME_PATHNAME,
  isStudioWorkspaceLocation,
  isStudioWorkspaceRoutePathname,
} from "@/domains/creator/studio-workspace-route";

export const OPEN_COMMAND_PALETTE_EVENT = "toonspectrum:command-palette:open" as const;

const LEGACY_STUDIO_EDITOR_QUERY_KEYS = new Set([
  "id",
  "remix",
  "mode",
  "preset",
  "room",
  "page",
  "tool",
  "surface",
  "document",
  "demo",
]);

function readInitialDocumentPathname(): string | null {
  try {
    return typeof globalThis.location?.pathname === "string"
      ? globalThis.location.pathname
      : null;
  } catch {
    return null;
  }
}

function legacyStudioEditorHref(pathname: string, search: string): string | null {
  if (pathname !== STUDIO_HOME_PATHNAME || search.length === 0) return null;
  const params = new URLSearchParams(search);
  const hasLegacyEditorState = [...params.keys()].some((key) =>
    LEGACY_STUDIO_EDITOR_QUERY_KEYS.has(key)
  );
  return hasLegacyEditorState ? `${STUDIO_DRAFT_CANVAS_PATHNAME}${search}` : null;
}

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

function AppRouteTree({ pathname, search }: {
  readonly pathname: string;
  readonly search: string;
}) {
  return (
    <RouteStage pathname={pathname} search={search}>
      <ErrorBoundary resetKey={`${pathname}${search}`}>
        <CommandPaletteEventBridge />
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

  const legacyEditorHref = legacyStudioEditorHref(pathname, search);
  if (legacyEditorHref) return <Navigate replace to={legacyEditorHref} />;

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
