import { Suspense } from "react";

import { StudioRouteLoading } from "../../StudioLazySurfaceFallback";
import { StudioDocumentRuntimeBoundary } from "../StudioDocumentRuntimeBoundary";
import { useStudioDraftScope } from "../useStudioDraftScope";

import type { StudioPublishRouteResolution } from "../studio-route-manifest";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { useSession } from "@/compat/auth-session-store";

const StudioPublishingCommandCenter = lazyRetry(
  () => import("../../StudioPublishingCommandCenter").then((module) => ({
    default: module.StudioPublishingCommandCenter,
  })),
  "StudioPublishingCommandCenterRoute",
);

export function StudioPublishRoute({ resolution }: {
  readonly resolution: StudioPublishRouteResolution;
}) {
  const { data: session } = useSession();
  const authScopeKey = session?.user?.id ?? null;
  const routeKey = resolution.workId === null
    ? "publish:new"
    : `publish:${resolution.workId}`;
  const draftScope = useStudioDraftScope(routeKey, authScopeKey);
  const publishKey = JSON.stringify([
    "publish-command-center",
    resolution.workId ?? "new",
    draftScope.epoch,
  ]);

  return (
    <StudioDocumentRuntimeBoundary documentKey={publishKey}>
      <Suspense fallback={<StudioRouteLoading label="게시 명령 센터를 안전하게 여는 중..." />}>
        <StudioPublishingCommandCenter workId={resolution.workId} />
      </Suspense>
    </StudioDocumentRuntimeBoundary>
  );
}
