import { Suspense } from "react";

import { lazyRetry } from "@/lib/lazy-retry";
import { useSession } from "@/src/compat/auth-session-store";

import { StudioRouteLoading } from "../../StudioLazySurfaceFallback";
import { StudioDocumentRuntimeBoundary } from "../StudioDocumentRuntimeBoundary";
import type { StudioPublishRouteResolution } from "../studio-route-manifest";
import { useStudioDraftScope } from "../useStudioDraftScope";

const StudioUploadPublish = lazyRetry(
  () => import("../../StudioUploadPublish").then((module) => ({
    default: module.StudioUploadPublish,
  })),
  "StudioUploadPublishRoute",
);

export function StudioPublishRoute({ resolution }: {
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
