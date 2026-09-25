import { ArrowRight, FileText } from "lucide-react";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";

export function StudioWorkspaceRecentWorks({ projects, selectedId, locale, onSelect }: {
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly selectedId?: string;
  readonly locale: "ko" | "en";
  readonly onSelect: (id: string) => void;
}) {
  const bt = useBilingual("StudioWorkspaceRecentWorks");
  return <section className="workspace-recent" aria-labelledby="workspace-recent-title">
    <header><div><p className="workspace-eyebrow">YOUR STORIES</p><h2 id="workspace-recent-title">{bt("최근 작품", "Recent work")}</h2></div>
      <Link href="/studio">{bt("작품 전체 보기", "View all works")}<ArrowRight size={16} aria-hidden="true" /></Link>
    </header>
    {projects.length ? <div className="workspace-recent-grid">{projects.slice(0, 4).map((project) => {
      const timestamp = project.lastOpenedAt ?? project.updatedAt;
      const date = new Date(timestamp);
      const validDate = !Number.isNaN(date.valueOf());
      return <button key={project.id} type="button" onClick={() => onSelect(project.id)} aria-pressed={selectedId === project.id}>
        <span className="workspace-work-monogram" aria-hidden="true">{project.title.trim().slice(0, 1) || "T"}</span>
        <span className="workspace-work-info"><strong>{project.title}</strong><small>{selectedId === project.id ? bt("현재 선택한 작품", "Selected work") : bt("작품 선택", "Select work")}{validDate ? <> · <time dateTime={timestamp}>{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date)}</time></> : null}</small></span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>;
    })}</div> : <div className="workspace-recent-empty"><FileText size={24} aria-hidden="true" /><div><strong>{bt("아직 이 기기에 등록된 작품이 없습니다.", "No works are registered on this device yet.")}</strong><p>{bt("새 작품을 만들거나 기존 파일을 가져오면, 여기서 언제든 다시 이어갈 수 있어요.", "Create or import a work to pick up where you left off, right here.")}</p></div><Link href="/studio/import">{bt("파일 가져오기", "Import files")}<ArrowRight size={16} aria-hidden="true" /></Link></div>}
  </section>;
}
