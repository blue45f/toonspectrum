import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { StudioExternalReviewPanel } from "./StudioExternalReviewPanel";
import { resolveStudioExternalReviewEntry } from "./studio-external-review-entry";
import { resolveStudioProductionScope } from "./studio-production-scope";
import {
  StudioProductionHubPage as StudioProductionHubPageV2,
  type StudioProductionSurface,
} from "./StudioProductionHubPageV2";

import { PreserveLinkQueryParams } from "@/shared/navigation/router-link";

const DEMO_SURFACES = [
  "projects",
  "review",
  "versions",
  "present",
  "share",
  "join",
] as const satisfies readonly StudioProductionSurface[];

function demoSurfaceHref(surface: StudioProductionSurface): string {
  return `/studio/${surface}?demo=1`;
}

/**
 * Stable route-facing seam for the Studio production surfaces.
 *
 * The implementation lives in `StudioProductionHubPageV2` so the route import
 * remains unchanged while local/demo/server authority modes evolve behind one
 * explicit boundary. This seam also preserves the opt-in `demo=1` capability
 * across links and keyboard navigation; real Work/Remix scopes never inherit it.
 */
export function StudioProductionHubPage(props: {
  readonly surface: StudioProductionSurface;
  readonly onOpenStudio: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const externalReviewEntry = useMemo(
    () => props.surface === "review"
      ? resolveStudioExternalReviewEntry(location.search)
      : { kind: "none" } as const,
    [location.search, props.surface],
  );
  const preserveDemo = useMemo(() => {
    if (externalReviewEntry.kind !== "none") return false;
    const resolution = resolveStudioProductionScope(location);
    const params = new URLSearchParams(location.search);
    const demoValues = params.getAll("demo");
    return (
      resolution.valid
      && resolution.scope.key === "draft"
      && demoValues.length === 1
      && demoValues[0] === "1"
    );
  }, [externalReviewEntry.kind, location]);

  useEffect(() => {
    if (externalReviewEntry.kind !== "none" || !preserveDemo) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.isComposing
        || event.keyCode === 229
        || event.repeat
        || !event.altKey
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element
        && target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
      ) {
        return;
      }
      const surface = DEMO_SURFACES[Number(event.key) - 1];
      if (!surface) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void navigate(demoSurfaceHref(surface));
    };
    globalThis.addEventListener("keydown", handler, { capture: true });
    return () => globalThis.removeEventListener("keydown", handler, { capture: true });
  }, [externalReviewEntry.kind, navigate, preserveDemo]);

  if (externalReviewEntry.kind === "invalid") {
    return (
      <div className="mx-auto min-h-dvh max-w-5xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6" role="alert">
          <h1 className="text-lg font-black">검토 링크를 확인할 수 없습니다</h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            토큰이 없거나 중복됐거나 작품 범위 파라미터와 충돌합니다. 원고와 권한은 변경하지 않았습니다.
          </p>
        </section>
      </div>
    );
  }

  if (externalReviewEntry.kind === "valid") {
    return (
      <div className="min-h-dvh bg-bg px-3 py-4 text-fg sm:px-5 sm:py-6">
        <div className="mx-auto max-w-[1920px]">
          <StudioExternalReviewPanel token={externalReviewEntry.token} />
        </div>
      </div>
    );
  }

  return (
    <PreserveLinkQueryParams params={preserveDemo ? { demo: "1" } : {}}>
      {props.surface === "review" ? (
        <h1 className="sr-only">검토 및 승인</h1>
      ) : null}
      <StudioProductionHubPageV2 {...props} />
    </PreserveLinkQueryParams>
  );
}

export type { StudioProductionSurface };
