import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Link from "@/compat/router-link";
import { OpenSearchButton } from "@/shared/components/open-search-button";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { WorkspaceAccountAction, WorkspaceBrand, WorkspaceSidebar } from "./WorkspaceChrome";
import { workspaceNavigationContext, workspaceNavigationHref } from "./workspace-navigation-model";
import type { WorkspaceTaskRoute } from "./workspace-task-route";
import "./workspace.css";
import "./workspace-redesign.css";
import "./workspace-task-frame.css";

/** Stable child ancestry keeps AppRouter and editor lifetime independent of chrome changes. */
export function WorkspaceTaskFrame({ route, children }: {
  readonly route: WorkspaceTaskRoute | null;
  readonly children: ReactNode;
}) {
  const bt = useBilingual("WorkspaceTaskFrame");
  const { pathname, search } = useLocation();
  const context = workspaceNavigationContext(pathname, search);
  const homeHref = workspaceNavigationHref("/home", context);
  return <div className={route ? "workspace-shell workspace-task-shell" : "workspace-task-passthrough"}
    data-workspace-surface={route ? "task" : undefined}>
    {route ? <header className="workspace-topbar" key="header">
      <WorkspaceBrand href={homeHref} />
      <nav className="workspace-task-breadcrumb" aria-label={bt("현재 위치", "Current location")}>
        <Link href={route.section === "explore" ? "/hub" : route.section === "support" ? homeHref : "/studio"}>{route.section === "explore" ? bt("둘러보기", "Explore") : route.section === "support" ? bt("스튜디오", "Studio") : bt("작품", "Works")}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page">{bt(route.titleKo, route.titleEn)}</span>
      </nav>
      <div className="workspace-utilities">
        <OpenSearchButton className="workspace-search-trigger"><Search size={18} aria-hidden="true" />
          <span>{bt("작품·도구·메뉴 검색", "Search works, tools, menus")}</span><kbd aria-hidden="true">⌘ K</kbd>
        </OpenSearchButton>
        <div id="workspace-audio-dock" className="relative flex shrink-0 items-center" />
        <WorkspaceAccountAction />
      </div>
    </header> : null}
    {route ? <WorkspaceSidebar context={context} key="navigation" /> : null}
    <div key="content" className={route ? "workspace-main workspace-task-content" : "workspace-task-passthrough"}>
      {route ? <div className="workspace-task-purpose" key="purpose">
        <p>{bt(route.hintKo, route.hintEn)}</p>
        <Link href={homeHref}><ArrowLeft size={16} aria-hidden="true" />{bt("가상 스튜디오", "Virtual studio")}</Link>
      </div> : null}
      <div key="route" className="workspace-task-route-content">{children}</div>
    </div>
  </div>;
}
