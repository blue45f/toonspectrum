import { lazy, Suspense, useEffect, useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { StudioOfflinePanelBoundary } from "../../offline/StudioOfflinePanelBoundary";
import { resolveStudioLocalDocumentSource } from "../../studio-local-document-source";
import { studioEditorInstanceKey } from "../../studio-editor-scope";
import { studioWorkspaceDocumentIdentity } from "../../studio-workspace-route";
import { StudioRouteLoading } from "../../StudioLazySurfaceFallback";
import { StudioDocumentLayout } from "../StudioDocumentLayout";
import { StudioDocumentRuntimeBoundary } from "../StudioDocumentRuntimeBoundary";
import { useStudioDraftScope } from "../useStudioDraftScope";

import type { StudioEditorRouteResolution } from "../studio-route-manifest";

import { useSession } from "@/compat/auth-session-store";
import { lazyRetry } from "@/shared/lib/lazy-retry";

const LegacyStudioEditorAdapter = lazyRetry(
  () => import("../../studio-legacy-editor-adapter").then((module) => ({
    default: module.LegacyStudioEditorAdapter,
  })),
  "LegacyStudioEditorAdapter",
);

// Optional offline guidance must not trigger the global chunk-reload recovery.
const StudioOfflinePanel = lazy(
  () => import("../../offline/StudioOfflinePanel").then((module) => ({ default: module.StudioOfflinePanel })),
);

export function StudioEditorRoute({ resolution }: {
  readonly resolution: StudioEditorRouteResolution;
}) {
  const { data: session } = useSession();
  const authScopeKey = session?.user?.id ?? null;
  const location = useLocation();
  const source = useMemo(() => {
    let storage: Storage | null = null;
    try {
      if (typeof window !== "undefined") storage = window.localStorage;
    } catch {
      // Keep unknown sources locked when browser storage cannot be inspected.
    }
    return resolveStudioLocalDocumentSource(resolution.workspaceRoute, storage, location.search);
  }, [location.search, resolution.workspaceRoute]);
  const route = source.route;
  const identity = studioWorkspaceDocumentIdentity(route);
  const draftScope = useStudioDraftScope(identity, authScopeKey);
  const editorKey = studioEditorInstanceKey({
    authScopeKey,
    canonicalDocumentIdentity: route.projectId && route.documentId ? identity : null,
    draftSessionEpoch: draftScope.epoch,
    remixId: route.remixSourceWorkId,
    workId: route.workId,
  });

  useEffect(() => {
    if (
      typeof window === "undefined"
      || typeof window.matchMedia !== "function"
      || window.matchMedia("(max-width: 1023px)").matches
    ) {
      return;
    }

    // Start the inspector request beside the editor chunk so the canvas remains the critical paint
    // without introducing a second waterfall for the desktop properties rail.
    void import("../../studio-inspector-aside-loader")
      .then(({ preloadStudioInspectorAside }) => preloadStudioInspectorAside())
      .catch(() => undefined);
  }, []);

  if (source.redirectHref) {
    return <Navigate replace state={location.state} to={`${source.redirectHref}${location.hash}`} />;
  }

  return (
    <StudioDocumentRuntimeBoundary documentKey={editorKey}>
      <StudioDocumentLayout
        draftSessionEpoch={draftScope.epoch}
        studioRoute={route}
      >
        <StudioOfflinePanelBoundary>
          <Suspense fallback={null}><StudioOfflinePanel /></Suspense>
        </StudioOfflinePanelBoundary>
        <Suspense fallback={<StudioRouteLoading label="Studio 편집기를 여는 중..." />}>
          <LegacyStudioEditorAdapter
            remixId={route.remixSourceWorkId}
            studioRoute={route}
          />
        </Suspense>
      </StudioDocumentLayout>
    </StudioDocumentRuntimeBoundary>
  );
}
