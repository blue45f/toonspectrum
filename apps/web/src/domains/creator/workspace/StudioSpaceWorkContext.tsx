import { useMemo, type MouseEvent } from "react";
import Link from "@/compat/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n";
import { useStudioProjectLibrary } from "../studio-shell/useStudioProjectLibrary";
import { useStudioWorkspaceResume } from "./useStudioWorkspaceResume";
import { readWorkspaceResume } from "./studio-workspace-resume";
import { readStudioProjectLibrary } from "../studio-project-library-reader";

/** Exact current-work projection. Merely displaying this bar never changes project selection. */
export function StudioSpaceWorkContext({ workId }: { readonly workId: string }) {
  const bt = useBilingual("StudioSpaceWorkContext");
  const locale = useI18n((state) => state.lang.startsWith("ko") ? "ko" as const : "en" as const);
  const library = useStudioProjectLibrary(locale, "active");
  const project = useMemo(() => library.error ? null : library.projects.find((item) => item.id === workId) ?? null,
    [library.error, library.projects, workId]);
  const resume = useStudioWorkspaceResume(project, locale);
  const listHref = `/studio/p/${encodeURIComponent(workId)}/production?view=documents`;
  const target = project && resume.status === "ready" && resume.target?.exact ? resume.target : null;
  const href = target?.href ?? listHref;
  const verify = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!target || event.defaultPrevented) return;
    try {
      const latest = readStudioProjectLibrary(window.localStorage).projects.find((item) => item.id === workId && item.status === "active");
      const next = readWorkspaceResume(() => window.localStorage, latest ?? null, locale);
      if (next.status !== "ready" || !next.target?.exact || next.target.href !== href) {
        event.preventDefault(); library.reload(); resume.refresh();
      }
    } catch { event.preventDefault(); library.reload(); resume.refresh(); }
  };
  return <div className="studio-space-work-context">
    <div><strong>{project?.title ?? bt("현재 작품", "Current work")}</strong>
      <span>{target?.summary ?? bt("선택한 작품 안에서 작업합니다", "Working within the selected work")}</span></div>
    <Link href={href} onClick={verify} onAuxClick={verify} data-space-exact-resume={Boolean(target)}>
      {target ? bt("원고 이어하기", "Resume manuscript") : bt("원고 목록", "Manuscript list")}
    </Link>
  </div>;
}
