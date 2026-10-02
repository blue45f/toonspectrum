import { useState } from "react";
import { ArrowRight, FileText } from "lucide-react";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { TypographicCover } from "@/shared/components/typographic-cover";
import type { StudioProjectKind, StudioProjectLibraryEntry } from "../studio-project-library-reader";

const KIND_LABELS: Record<StudioProjectKind, readonly [ko: string, en: string]> = {
  webtoon: ["웹툰", "Webtoon"],
  illustration: ["일러스트", "Illustration"],
  image: ["이미지", "Image"],
  design: ["디자인", "Design"],
  slides: ["슬라이드", "Slides"],
  storyboard: ["스토리보드", "Storyboard"],
  "three-d": ["3D", "3D"],
  animation: ["애니메이션", "Animation"],
};

/**
 * 작품 커버 — 저장된 대표 이미지(thumbnailUrl)가 있으면 실제 썸네일을,
 * 없으면 공용 타이포그래픽 커버를 보여 줘 빈칸처럼 보이지 않게 한다.
 * 이미지 로딩이 실패해도 커버로 자연스럽게 폴백한다.
 */
function WorkCover({ project, kindLabel }: {
  readonly project: StudioProjectLibraryEntry;
  readonly kindLabel: string;
}) {
  const [failed, setFailed] = useState(false);
  const thumbnailUrl = project.thumbnailUrl;
  return <span className="workspace-work-cover">
    {thumbnailUrl && !failed
      ? <img src={thumbnailUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <TypographicCover title={project.title} seed={project.id} eyebrow={kindLabel} className="workspace-work-cover-art h-full w-full" />}
  </span>;
}

export function StudioWorkspaceRecentWorks({ projects, selectedId, locale, onSelect, loading = false }: {
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly selectedId?: string;
  readonly locale: "ko" | "en";
  readonly onSelect: (id: string) => void;
  readonly loading?: boolean;
}) {
  const bt = useBilingual("StudioWorkspaceRecentWorks");
  return <section className="workspace-recent" aria-labelledby="workspace-recent-title" aria-busy={loading || undefined}>
    <header><div><p className="workspace-eyebrow">YOUR STORIES</p><h2 id="workspace-recent-title">{bt("최근 작품", "Recent work")}</h2></div>
      <Link href="/studio">{bt("작품 전체 보기", "View all works")}<ArrowRight size={16} aria-hidden="true" /></Link>
    </header>
    {loading
      ? <div className="workspace-recent-grid" aria-hidden="true">{[0, 1, 2, 3].map((index) => <div key={index} className="workspace-work-skeleton"><span className="workspace-work-skeleton-cover" /><span className="workspace-work-skeleton-body"><span className="workspace-work-skeleton-line" /><span className="workspace-work-skeleton-line workspace-work-skeleton-line-short" /></span></div>)}</div>
      : projects.length ? <div className="workspace-recent-grid">{projects.slice(0, 4).map((project) => {
        const timestamp = project.lastOpenedAt ?? project.updatedAt;
        const date = new Date(timestamp);
        const validDate = !Number.isNaN(date.valueOf());
        const selected = selectedId === project.id;
        const kindLabel = bt(...KIND_LABELS[project.kind]);
        const statusLabel = project.status === "archived"
          ? bt("보관됨", "Archived")
          : project.status === "trashed"
            ? bt("휴지통", "Trashed")
            : null;
        return <button key={project.id} type="button" onClick={() => onSelect(project.id)} aria-pressed={selected}>
          <WorkCover project={project} kindLabel={kindLabel} />
          {statusLabel ? <span className="workspace-work-status">{statusLabel}</span> : null}
          <span className="workspace-work-info">
            <strong>{project.title}</strong>
            <span className="workspace-work-meta">
              <small>{kindLabel}{validDate ? <> · <time dateTime={timestamp}>{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date)}</time></> : null}</small>
              <span className="workspace-work-continue">{selected ? bt("현재 선택한 작품", "Selected work") : <>{bt("이어서 작업하기", "Continue")}<ArrowRight size={14} aria-hidden="true" /></>}</span>
            </span>
          </span>
        </button>;
      })}</div>
      : <div className="workspace-recent-empty"><FileText size={24} aria-hidden="true" /><div><strong>{bt("아직 이 기기에 등록된 작품이 없습니다.", "No works are registered on this device yet.")}</strong><p>{bt("새 작품을 만들거나 기존 파일을 가져오면, 여기서 언제든 다시 이어갈 수 있어요.", "Create or import a work to pick up where you left off, right here.")}</p></div><Link href="/studio/new">{bt("새 작품 만들기", "Create a new work")}<ArrowRight size={16} aria-hidden="true" /></Link><Link href="/studio/import">{bt("파일 가져오기", "Import files")}<ArrowRight size={16} aria-hidden="true" /></Link></div>}
  </section>;
}
