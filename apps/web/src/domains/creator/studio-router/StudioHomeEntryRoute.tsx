import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Brush } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import type { ReactNode } from "react";

import { useStudioDrawingPresentation } from "../studio-drawing-presentation";
import { STUDIO_DISCOVERY_ROUTE_IDS, studioRouteRegistration } from "../studio-route-registry";

/** Identity-bearing legacy URLs must reach the canonical resolver, including invalid/empty values. */
export function StudioHomeEntryRoute({ home, legacy }: { home: ReactNode; legacy: ReactNode }) {
  const { search } = useLocation();
  const drawingPresentation = useStudioDrawingPresentation();
  const query = new URLSearchParams(search);
  if (query.has("id") || query.has("remix") || query.has("mode")) return legacy;

  if (drawingPresentation === "app") {
    return <>
      <nav
        aria-label={translateCurrentStaticSourceText("domains.creator.studio.router.StudioHomeEntryRoute", "en", "ToonStudio Draw")}
        data-studio-drawing-home-chrome="true"
        className="flex min-h-12 items-center gap-3 border-b border-line bg-panel/95 px-4 text-sm text-fg shadow-sm backdrop-blur-xl"
      >
        <span className="grid size-8 place-items-center rounded-xl bg-accent text-on-accent">
          <Brush size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-xs font-black">{translateCurrentStaticSourceText("domains.creator.studio.router.StudioHomeEntryRoute", "en", "ToonStudio Draw")}</strong>
          <span className="block truncate text-[0.68rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.studio.router.StudioHomeEntryRoute", "ko", "같은 Studio 엔진으로 프로젝트를 열고 드로잉에 집중합니다.")}</span>
        </div>
        <Link
          className="min-h-10 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg no-underline transition-colors hover:bg-raised"
          to="/studio?drawingShell=integrated"
        >
          {translateCurrentStaticSourceText("domains.creator.studio.router.StudioHomeEntryRoute", "ko", "전체 스튜디오")}</Link>
      </nav>
      {home}
    </>;
  }

  return <>
    <nav aria-label={translateCurrentStaticSourceText("domains.creator.studio.router.StudioHomeEntryRoute", "ko", "확장 창작 도구")} className="flex flex-wrap items-center justify-center gap-4 border-b border-line bg-panel px-4 py-3 text-sm text-fg">
      {STUDIO_DISCOVERY_ROUTE_IDS.map((id) => {
        const route = studioRouteRegistration(id);
        return <Link key={id} className="underline underline-offset-4" to={route.pattern}>{route.titleKo}</Link>;
      })}
      <Link className="underline underline-offset-4" to="/read/spatial">{translateCurrentStaticSourceText("domains.creator.studio.router.StudioHomeEntryRoute", "ko", "공간 웹툰 감상")}</Link>
      <span className="text-fg-2">{translateCurrentStaticSourceText("domains.creator.studio.router.StudioHomeEntryRoute", "ko", "연결이 끊기면 이 스튜디오가 자동으로 로컬 모드로 전환됩니다.")}</span>
    </nav>
    {home}
  </>;
}
