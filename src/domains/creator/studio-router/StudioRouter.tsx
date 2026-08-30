import { Suspense, useEffect, useRef } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import {
  advanceStudioDraftIdentityScope,
  createStudioDraftIdentityScope,
  studioEditorInstanceKey,
  type StudioDraftIdentityScope,
} from "../studio-editor-scope";
import { studioWorkspaceDocumentIdentity } from "../studio-workspace-route";
import { StudioRouteLoading } from "../StudioLazySurfaceFallback";

import {
  resolveStudioRoute,
  type StudioEditorRouteResolution,
  type StudioPublishRouteResolution,
} from "./studio-route-manifest";
import { StudioDocumentLayout } from "./StudioDocumentLayout";
import { StudioDocumentRuntimeBoundary } from "./StudioDocumentRuntimeBoundary";
import { StudioRouteFailure, StudioRoutePlaceholder } from "./StudioRouteFallbacks";

import { lazyRetry } from "@/lib/lazy-retry";
import { useSession } from "@/src/compat/auth-session-store";

const LegacyStudioEditorAdapter = lazyRetry(
  () => import("../studio-legacy-editor-adapter").then((module) => ({
    default: module.LegacyStudioEditorAdapter,
  })),
  "LegacyStudioEditorAdapter",
);

const StudioUploadPublish = lazyRetry(
  () => import("../StudioUploadPublish").then((module) => ({
    default: module.StudioUploadPublish,
  })),
  "StudioUploadPublishRoute",
);

const StudioLift3dPage = lazyRetry(
  () => import("../lift3d/StudioLift3dPage").then((module) => ({
    default: module.StudioLift3dPage,
  })),
  "StudioLift3dPage",
);

const StudioToolsCompanionPage = lazyRetry(
  () => import("../StudioToolsCompanionPage").then((module) => ({
    default: module.StudioToolsCompanionPage,
  })),
  "StudioToolsCompanionPage",
);

function useStudioDraftScope(
  routeKey: string,
  authScopeKey: string | null,
): StudioDraftIdentityScope {
  const scopeRef = useRef(createStudioDraftIdentityScope(routeKey, authScopeKey));
  scopeRef.current = advanceStudioDraftIdentityScope(
    scopeRef.current,
    routeKey,
    authScopeKey,
  );
  return scopeRef.current;
}

function StudioEditorRoute({ resolution }: {
  readonly resolution: StudioEditorRouteResolution;
}) {
  const { data: session } = useSession();
  const authScopeKey = session?.user?.id ?? null;
  const route = resolution.workspaceRoute;
  const identity = studioWorkspaceDocumentIdentity(route);
  const draftScope = useStudioDraftScope(identity, authScopeKey);
  const editorKey = studioEditorInstanceKey({
    authScopeKey,
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

    // The desktop inspector is always part of the first workspace, but its large chunk used to
    // begin loading only after the editor chunk had mounted. Start it beside the editor request so
    // the canvas stays the critical paint while the properties rail arrives without a waterfall.
    void import("../studio-inspector-aside-loader")
      .then(({ preloadStudioInspectorAside }) => preloadStudioInspectorAside())
      .catch(() => undefined);
  }, []);

  return (
    <StudioDocumentRuntimeBoundary documentKey={editorKey}>
      {/*
        The layout owns the document-identity-scoped runtime (live-session identity, `?room=`
        sync) and lives OUTSIDE this Suspense so that runtime survives the editor chunk load and
        every later surface switch, and tears down only with the boundary key above it.
      */}
      <StudioDocumentLayout
        draftSessionEpoch={draftScope.epoch}
        studioRoute={route}
      >
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

function StudioPublishRoute({ resolution }: {
  readonly resolution: StudioPublishRouteResolution;
}) {
  const { data: session } = useSession();
  const authScopeKey = session?.user?.id ?? null;
  const routeKey = resolution.workId === null
    ? "upload:new"
    : `upload:${resolution.workId}`;
  const draftScope = useStudioDraftScope(routeKey, authScopeKey);
  const publishKey = JSON.stringify([
    "upload",
    resolution.workId ?? "new",
    draftScope.epoch,
  ]);

  return (
    <StudioDocumentRuntimeBoundary documentKey={publishKey}>
      <Suspense fallback={<StudioRouteLoading label="게시 작업공간을 안전하게 여는 중..." />}>
        <StudioUploadPublish workId={resolution.workId} />
      </Suspense>
    </StudioDocumentRuntimeBoundary>
  );
}

export function StudioRouter() {
  const location = useLocation();
  const navigate = useNavigate();
  const resolution = resolveStudioRoute({
    hash: location.hash,
    pathname: location.pathname,
    search: location.search,
  });
  if (resolution.kind === "invalid") {
    return (
      <StudioRouteFailure
        errorCode={resolution.errorCode}
        onOpenStudio={() => navigate("/studio", { replace: true })}
      />
    );
  }

  const currentHref = `${location.pathname}${location.search}`;
  if (currentHref !== resolution.canonicalHref) {
    // Canonicalize at render time so no stale frame mounts under a legacy alias
    // URL. location.state must ride along: the studioWorkspaceReturn v1 receipt
    // and the linked-3D cloud-save recovery notice both travel through it.
    return (
      <Navigate replace state={location.state} to={resolution.canonicalHref} />
    );
  }
  if (resolution.kind === "editor") {
    return <StudioEditorRoute resolution={resolution} />;
  }
  if (resolution.kind === "publish") {
    return <StudioPublishRoute resolution={resolution} />;
  }
  if (resolution.kind === "lift3d") {
    // 편집 문서와 무관한 도구 화면이라 문서 런타임 경계 없이 곧장 띄운다.
    return (
      <Suspense fallback={<StudioRouteLoading label="2D → 3D 변환 작업대를 여는 중..." />}>
        <StudioLift3dPage initialSubject={resolution.subject} />
      </Suspense>
    );
  }
  if (resolution.kind === "companion") {
    return (
      <Suspense fallback={<StudioRouteLoading label="Studio 보조 창을 여는 중..." />}>
        <StudioToolsCompanionPage />
      </Suspense>
    );
  }
  return (
    <StudioRoutePlaceholder
      placeholderId={resolution.placeholderId}
      onOpenStudio={() => navigate("/studio")}
    />
  );
}
