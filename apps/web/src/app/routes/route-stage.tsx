import { AlertTriangle, Home, RefreshCw, Rows3 } from "lucide-react";
import { useEffect, useRef, useState, type AnimationEvent, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";
import { hasMeaningfulRouteContent } from "./route-stage-content";
import { useI18n } from "@/shared/lib/i18n";
import { allowStudioProgrammaticReload } from "@/shared/lib/programmatic-reload";
import { resolveStudioRoute } from "@/domains/creator/studio-router/studio-route-manifest";
import {
  isStudioRoutePathname,
  studioRouteStageKey,
} from "@/domains/creator/studio-workspace-route";

interface RouteStageProps {
  pathname: string;
  search: string;
  accessibleTitle: string;
  children: ReactNode;
}

/**
 * Route transitions own three cross-page guarantees: animation cleanup, a single fallback heading
 * when a page forgot one, and a recovery path when a successful navigation renders no usable UI.
 */
export function RouteStage({ pathname, search, accessibleTitle, children }: RouteStageProps) {
  const [settled, setSettled] = useState(false);
  const [needsHeading, setNeedsHeading] = useState(false);
  const [stalled, setStalled] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const language = useI18n((state) => state.lang);
  const korean = language.toLowerCase().split(/[-_]/u)[0] === "ko";
  const location = { pathname, search };
  const studioResolution = isStudioRoutePathname(pathname)
    ? resolveStudioRoute(location)
    : null;
  const instantEditorEntry = studioResolution?.kind === "editor"
    || studioResolution?.kind === "publish";
  const instantAdminEntry = pathname === "/admin" || pathname.startsWith("/admin/");
  const instantEntry = instantEditorEntry || instantAdminEntry;
  const stageKey = studioResolution?.lifecycleKey ?? studioRouteStageKey(location);

  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    const syncHeading = () => {
      const realHeadings = root.querySelectorAll("h1:not([data-route-semantic-heading])");
      setNeedsHeading(realHeadings.length === 0);
      if (import.meta.env.DEV && realHeadings.length > 1) {
        console.warn(`[route semantics] ${pathname} rendered ${realHeadings.length} h1 elements.`);
      }
    };
    syncHeading();
    const observer = new MutationObserver(syncHeading);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, stageKey]);

  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    setStalled(false);
    const delay = isStudioRoutePathname(pathname) ? 12_000 : 8_000;
    const inspect = () => setStalled(!hasMeaningfulRouteContent(root));
    const timeoutId = window.setTimeout(inspect, delay);
    const observer = new MutationObserver(() => {
      if (hasMeaningfulRouteContent(root)) setStalled(false);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [pathname, search, stageKey]);

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.animationName === "route-stage-in") setSettled(true);
  };
  const reload = () => {
    allowStudioProgrammaticReload();
    window.location.reload();
  };

  return (
    <div
      ref={stageRef}
      key={stageKey}
      data-route-stage-key={stageKey}
      className={cn(
        "route-stage",
        (settled || instantEntry) && "route-stage--settled",
        instantEntry && "route-stage--instant",
      )}
      onAnimationEnd={onAnimationEnd}
    >
      {needsHeading ? <h1 className="sr-only" data-route-semantic-heading="">{accessibleTitle}</h1> : null}
      {stalled ? (
        <section
          data-route-recovery=""
          role="alert"
          className="mx-auto my-6 w-[min(92%,46rem)] rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5 shadow-lg backdrop-blur-sm sm:p-6"
          aria-labelledby="route-recovery-title"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500"><AlertTriangle size={20} aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 id="route-recovery-title" className="font-display text-lg font-bold text-fg">
                {korean ? "화면 표시가 예상보다 오래 걸리고 있어요." : "This page is taking longer than expected."}
              </h2>
              <p className="mt-1 text-sm leading-6 text-fg-2">
                {korean ? "현재 주소는 유지했습니다. 계속 기다리거나 페이지를 다시 불러오고, 문제가 반복되면 전체 메뉴에서 다른 경로로 이동하세요." : "Your current address is preserved. Keep waiting, reload the page, or use the directory when the problem continues."}
              </p>
              <p className="mt-2 break-all rounded-lg bg-black/10 px-3 py-2 font-mono text-[0.7rem] text-fg-3">{pathname}{search}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setStalled(false)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2 text-sm font-bold text-fg-2 hover:text-accent">
              <RefreshCw size={16} aria-hidden="true" />{korean ? "계속 기다리기" : "Keep waiting"}
            </button>
            <button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-fg bg-fg px-4 py-2 text-sm font-bold text-canvas">
              <RefreshCw size={16} aria-hidden="true" />{korean ? "다시 불러오기" : "Reload"}
            </button>
            <a href="/sitemap" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 py-2 text-sm font-bold text-fg-2 hover:text-accent">
              <Rows3 size={16} aria-hidden="true" />{korean ? "전체 메뉴" : "Directory"}
            </a>
            <a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-fg-3 hover:text-fg">
              <Home size={16} aria-hidden="true" />{korean ? "홈" : "Home"}
            </a>
          </div>
        </section>
      ) : null}
      {children}
    </div>
  );
}
