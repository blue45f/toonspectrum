import { Brush } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import type { ReactNode } from "react";

import { useStudioDrawingPresentation } from "../studio-drawing-presentation";
import { StudioWorkspaceLibraryShell } from "../workspace/StudioWorkspaceLibraryShell";

/** Identity-bearing legacy URLs must reach the canonical resolver, including invalid/empty values. */
export function StudioHomeEntryRoute({ home, legacy }: { home: ReactNode; legacy: ReactNode }) {
  const { search } = useLocation();
  const drawingPresentation = useStudioDrawingPresentation();
  const query = new URLSearchParams(search);
  if (query.has("id") || query.has("remix") || query.has("mode")) return legacy;

  if (drawingPresentation === "app") {
    return <>
      <nav
        aria-label="ToonStudio Draw"
        data-studio-drawing-home-chrome="true"
        className="flex min-h-12 items-center gap-3 border-b border-line bg-panel/95 px-4 text-sm text-fg shadow-sm backdrop-blur-xl"
      >
        <span className="grid size-8 place-items-center rounded-xl bg-accent text-on-accent">
          <Brush size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-xs font-black">ToonStudio Draw</strong>
          <span className="block truncate text-[0.68rem] text-fg-3">같은 Studio 엔진으로 프로젝트를 열고 드로잉에 집중합니다.</span>
        </div>
        <Link
          className="min-h-10 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg no-underline transition-colors hover:bg-raised"
          to="/studio?drawingShell=integrated"
        >
          전체 스튜디오
        </Link>
      </nav>
      {home}
    </>;
  }

  return <StudioWorkspaceLibraryShell>{home}</StudioWorkspaceLibraryShell>;
}
