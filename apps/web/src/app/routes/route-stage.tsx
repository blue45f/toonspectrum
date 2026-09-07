import { useState, type AnimationEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";
import { resolveStudioRoute } from "@/src/domains/creator/studio-router/studio-route-manifest";
import {
  isStudioRoutePathname,
  studioRouteStageKey,
} from "@/src/domains/creator/studio-workspace-route";

interface RouteStageProps {
  pathname: string;
  search: string;
  children: ReactNode;
}

/**
 * route-stage-in 애니메이션이 끝나면 transform/filter를 완전히 끊는다. Studio 편집기와
 * 관리자 콘솔은 fixed overlay와 sticky chrome을 직접 소유하므로 처음부터 settled 상태로 둔다.
 */
export function RouteStage({
  pathname,
  search,
  children,
}: RouteStageProps) {
  const [settled, setSettled] = useState(false);
  const location = { pathname, search };
  const studioResolution = isStudioRoutePathname(pathname)
    ? resolveStudioRoute(location)
    : null;
  const instantEditorEntry = studioResolution?.kind === "editor"
    || studioResolution?.kind === "publish";
  const instantAdminEntry = pathname === "/admin" || pathname.startsWith("/admin/");
  const instantEntry = instantEditorEntry || instantAdminEntry;
  const stageKey = studioResolution?.lifecycleKey ?? studioRouteStageKey(location);
  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.animationName === "route-stage-in") setSettled(true);
  };
  return (
    <div
      key={stageKey}
      data-route-stage-key={stageKey}
      className={cn(
        "route-stage",
        (settled || instantEntry) && "route-stage--settled",
        instantEntry && "route-stage--instant",
      )}
      onAnimationEnd={onAnimationEnd}
    >
      {children}
    </div>
  );
}
