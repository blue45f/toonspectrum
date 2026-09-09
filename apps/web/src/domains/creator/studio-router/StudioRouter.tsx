import { Suspense } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { StudioRouteLoading } from "../StudioLazySurfaceFallback";

import { StudioEditorRoute } from "./routes/StudioEditorRoute";
import { StudioProductionRoute } from "./routes/StudioProductionRoute";
import { StudioPublishRoute } from "./routes/StudioPublishRoute";
import { StudioStoryworldRoute } from "./routes/StudioStoryworldRoute";
import { resolveStudioRoute } from "./studio-route-manifest";
import { StudioRouteFailure, StudioRoutePlaceholder } from "./StudioRouteFallbacks";
import { useStudioI18nPriorityLoading } from "./useStudioI18nPriorityLoading";

import { lazyRetry } from "@/shared/lib/lazy-retry";

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

const StudioAiComicDirectorRoute = lazyRetry(
  () => import("./routes/StudioAiComicDirectorRoute").then((module) => ({
    default: module.StudioAiComicDirectorRoute,
  })),
  "StudioAiComicDirectorRoute",
);

export function StudioRouter() {
  useStudioI18nPriorityLoading();
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
    return <Navigate replace state={location.state} to={resolution.canonicalHref} />;
  }

  switch (resolution.kind) {
    case "editor":
      return <StudioEditorRoute resolution={resolution} />;
    case "composition":
      return (
        <Suspense fallback={<StudioRouteLoading label="AI 코믹 디렉터 세션을 여는 중..." />}>
          <StudioAiComicDirectorRoute
            key={resolution.lifecycleKey}
            resolution={resolution}
          />
        </Suspense>
      );
    case "publish":
      return <StudioPublishRoute resolution={resolution} />;
    case "lift3d":
      return (
        <Suspense fallback={<StudioRouteLoading label="2D → 3D 변환 작업대를 여는 중..." />}>
          <StudioLift3dPage initialSubject={resolution.subject} />
        </Suspense>
      );
    case "companion":
      return (
        <Suspense fallback={<StudioRouteLoading label="Studio 보조 창을 여는 중..." />}>
          <StudioToolsCompanionPage />
        </Suspense>
      );
    case "production":
      return (
        <StudioProductionRoute
          surface={resolution.surface}
          onOpenStudio={() => navigate(resolution.editorHref)}
        />
      );
    case "storyworld":
      return (
        <StudioStoryworldRoute
          key={resolution.lifecycleKey}
          remixSourceWorkId={resolution.remixSourceWorkId}
          workId={resolution.workId}
        />
      );
    case "placeholder":
      return (
        <StudioRoutePlaceholder
          placeholderId={resolution.placeholderId}
          onOpenStudio={() => navigate("/studio")}
        />
      );
  }
}
