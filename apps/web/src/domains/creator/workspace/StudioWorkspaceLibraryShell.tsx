import { ArrowLeft, Search } from "lucide-react";
import type { ReactNode } from "react";
import Link from "@/compat/router-link";
import { OpenSearchButton } from "@/shared/components/open-search-button";
import { WorkspaceAccountAction, WorkspaceBrand, WorkspaceSidebar } from "@/shared/components/workspace/WorkspaceChrome";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { STUDIO_DISCOVERY_ROUTE_IDS, studioRouteRegistration } from "../studio-route-registry";
import "@/shared/components/workspace/workspace.css";
import "@/shared/components/workspace/workspace-redesign.css";
import "@/shared/components/workspace/workspace-visual-v3.css";

/** Navigation only: the existing library still owns selection, save, restore and deletion. */
export function StudioWorkspaceLibraryShell({ children }: { readonly children: ReactNode }) {
  const bt = useBilingual("StudioWorkspaceLibraryShell");
  return <div className="workspace-shell workspace-library-shell" data-workspace-surface="works">
    <header className="workspace-topbar">
      <WorkspaceBrand />
      <span className="workspace-library-label">{bt("작품 라이브러리", "Work library")}</span>
      <div className="workspace-utilities">
        <OpenSearchButton className="workspace-search-trigger" aria-label={bt("작품·도구·메뉴 검색", "Search works, tools, menus")}><Search size={17} aria-hidden="true" /><span>{bt("작품·도구·메뉴 검색", "Search works, tools, menus")}</span><kbd aria-hidden="true">⌘ K</kbd></OpenSearchButton>
        <WorkspaceAccountAction />
      </div>
    </header>
    <WorkspaceSidebar activeId="studio" />
    <section className="workspace-main" aria-label={bt("작품 관리", "Work management")}>
      {children}
      <details className="workspace-library-tools">
        <summary>{bt("전문 도구와 확장 작업공간", "Specialist tools and extended workspaces")}</summary>
        <nav aria-label={bt("확장 창작 도구", "Extended creation tools")}>
          {STUDIO_DISCOVERY_ROUTE_IDS.map((id) => {
            const route = studioRouteRegistration(id);
            return <Link key={id} href={route.pattern}>{bt(route.titleKo, route.titleEn)}</Link>;
          })}
          <Link href="/read/spatial">{bt("공간 웹툰 감상", "Read spatial webtoons")}</Link>
        </nav>
      </details>
    </section>
    <footer className="workspace-statusbar">
      <div><strong>{bt("작품 라이브러리", "Work library")}</strong><small>{bt("보관·복구·저장은 각 작품의 실제 상태를 기준으로 확인합니다.", "Archive, recovery and saving reflect the actual state of each work.")}</small></div>
      <Link href="/home" className="workspace-icon-button"><ArrowLeft size={16} aria-hidden="true" />{bt("내 스튜디오", "My studio")}</Link>
    </footer>
  </div>;
}
