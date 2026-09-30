import { Suspense } from "react";
import { Link, useLocation } from "react-router-dom";

import type { ReactNode } from "react";

import { ToonStudioWordmark } from "@/shared/components/toonstudio-brand";
import { ToonStudioMark } from "@/shared/components/toonstudio-mark";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { useStudioDrawingPresentation } from "../studio-drawing-presentation";
import { StudioHomeLoadingSkeleton } from "../studio-shell/StudioHomeLoadingSkeleton";
import { StudioWorkspaceLibraryShell } from "../workspace/StudioWorkspaceLibraryShell";

/**
 * The shell is part of the route module, so it paints immediately. Only the lazily loaded home
 * body suspends; the page therefore never falls back to the generic full-page route skeleton.
 */
function StudioHomeBody({ children }: { readonly children: ReactNode }) {
  return <Suspense fallback={<StudioHomeLoadingSkeleton />}>{children}</Suspense>;
}

function StudioDrawingHomeChrome() {
  const bt = useBilingual("StudioHomeEntryRoute");
  return (
    <nav
      aria-label="ToonStudio Draw"
      data-studio-drawing-home-chrome="true"
      className="flex min-h-12 items-center gap-3 border-b border-line bg-panel/95 px-4 text-sm text-fg shadow-sm backdrop-blur-xl"
    >
      <ToonStudioMark className="size-8 rounded-xl" />
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-xs font-black"><ToonStudioWordmark /> Draw</strong>
        <span className="block truncate text-[0.68rem] text-fg-3">
          {bt("같은 Studio 엔진으로 프로젝트를 열고 드로잉에 집중합니다.", "Open projects with the same Studio engine and focus on drawing.")}
        </span>
      </div>
      <Link
        className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg no-underline transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        to="/studio?drawingShell=integrated"
      >
        {bt("전체 스튜디오", "Full studio")}
      </Link>
    </nav>
  );
}

/** Identity-bearing legacy URLs must reach the canonical resolver, including invalid/empty values. */
export function StudioHomeEntryRoute({ home, legacy }: { home: ReactNode; legacy: ReactNode }) {
  const { search } = useLocation();
  const drawingPresentation = useStudioDrawingPresentation();
  const query = new URLSearchParams(search);
  if (query.has("id") || query.has("remix") || query.has("mode")) return legacy;

  if (drawingPresentation === "app") {
    return <>
      <StudioDrawingHomeChrome />
      <StudioHomeBody>{home}</StudioHomeBody>
    </>;
  }

  return <StudioWorkspaceLibraryShell><StudioHomeBody>{home}</StudioHomeBody></StudioWorkspaceLibraryShell>;
}
