import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { resolveStudioProductionScope } from "./studio-production-scope";
import {
  StudioProductionHubPage as StudioProductionHubPageV2,
  type StudioProductionSurface,
} from "./StudioProductionHubPageV2";

import { PreserveLinkQueryParams } from "@/src/compat/router-link";

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
  const preserveDemo = useMemo(() => {
    const resolution = resolveStudioProductionScope(location);
    const params = new URLSearchParams(location.search);
    const demoValues = params.getAll("demo");
    return (
      resolution.valid
      && resolution.scope.key === "draft"
      && demoValues.length === 1
      && demoValues[0] === "1"
    );
  }, [location]);

  useEffect(() => {
    if (!preserveDemo) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.isComposing
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
  }, [navigate, preserveDemo]);

  return (
    <PreserveLinkQueryParams params={preserveDemo ? { demo: "1" } : {}}>
      <StudioProductionHubPageV2 {...props} />
    </PreserveLinkQueryParams>
  );
}

export type { StudioProductionSurface };
