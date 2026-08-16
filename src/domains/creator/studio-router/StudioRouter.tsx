import { Suspense, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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

  return (
    <StudioDocumentRuntimeBoundary documentKey={editorKey}>
      <Suspense fallback={<StudioRouteLoading label="Studio 편집기를 여는 중..." />}>
        <LegacyStudioEditorAdapter
          remixId={route.remixSourceWorkId}
          studioRoute={route}
        />
      </Suspense>
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
  const canonicalHref = resolution.kind === "invalid"
    ? null
    : resolution.canonicalHref;

  useEffect(() => {
    if (canonicalHref === null) return;
    const currentHref = `${location.pathname}${location.search}`;
    if (currentHref === canonicalHref) return;
    navigate(canonicalHref, { replace: true, state: location.state });
  }, [
    canonicalHref,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ]);

  if (resolution.kind === "invalid") {
    return (
      <StudioRouteFailure
        errorCode={resolution.errorCode}
        onOpenStudio={() => navigate("/studio", { replace: true })}
      />
    );
  }
  if (resolution.kind === "editor") {
    return <StudioEditorRoute resolution={resolution} />;
  }
  if (resolution.kind === "publish") {
    return <StudioPublishRoute resolution={resolution} />;
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
