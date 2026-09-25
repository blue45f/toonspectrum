import { ArrowRight, FolderOpen, Link2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import {
  activeProjectIdFromLocation,
  contextualProjectHref,
  readActiveProjectContext,
  supportsActiveProjectBridge,
  writeActiveProjectContext,
} from "./active-project-context";
import { useStudioProjectLibrary } from "./useStudioProjectLibrary";

const DISMISS_KEY_PREFIX = "toonstudio:active-project-bridge:dismissed:";

function dismissKey(pathname: string, projectId: string): string {
  const area = pathname.split("/").filter(Boolean)[0] ?? "home";
  return `${DISMISS_KEY_PREFIX}${area}:${projectId}`;
}

export function ActiveProjectContextBridge() {
  const { pathname, search } = useLocation();
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const locale = korean ? "ko" : "en";
  const library = useStudioProjectLibrary(locale, "active");
  const [dismissed, setDismissed] = useState(false);

  const explicitProjectId = useMemo(
    () => activeProjectIdFromLocation(pathname, search),
    [pathname, search],
  );
  const storedProjectId = typeof window === "undefined"
    ? null
    : readActiveProjectContext(window.sessionStorage);
  const recentProject = useMemo(() => [...library.projects]
    .sort((left, right) => Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt))[0] ?? null, [library.projects]);
  const selectedProject = library.projects.find((project) => project.id === explicitProjectId)
    ?? library.projects.find((project) => project.id === storedProjectId)
    ?? recentProject;

  useEffect(() => {
    if (!selectedProject || typeof window === "undefined") return;
    writeActiveProjectContext(window.sessionStorage, selectedProject.id);
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject || typeof window === "undefined") {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(window.sessionStorage.getItem(dismissKey(pathname, selectedProject.id)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [pathname, selectedProject]);

  if (!supportsActiveProjectBridge(pathname) || !selectedProject || dismissed) return null;

  const contextual = contextualProjectHref(pathname, selectedProject.id);
  const projectHref = `/studio/p/${encodeURIComponent(selectedProject.id)}/overview`;
  const close = () => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(dismissKey(pathname, selectedProject.id), "1");
      } catch {
        // Dismiss in memory when storage is unavailable.
      }
    }
    setDismissed(true);
  };

  return (
    <aside
      data-active-project-context="true"
      aria-label={korean ? "현재 작품 연결" : "Current work connection"}
      className="relative z-30 mx-auto mt-3 flex w-[min(100%-1.5rem,88rem)] flex-col gap-3 overflow-hidden rounded-2xl border border-accent/30 bg-panel/95 px-4 py-3 text-fg shadow-lg backdrop-blur-xl sm:flex-row sm:items-center sm:px-5"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-accent via-accent-2 to-good" />
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-accent">
        <Link2 size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.62rem] font-black uppercase tracking-[0.15em] text-accent">
          {korean ? "CURRENT WORK" : "CURRENT WORK"}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="truncate text-sm font-black text-fg">{selectedProject.title}</strong>
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.62rem] font-bold text-fg-3">
            {korean ? "작품 문맥 연결됨" : "Work context connected"}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-fg-2">
          {korean
            ? "이 화면에서 고른 자료와 다음 행동을 현재 작품으로 이어갈 수 있습니다."
            : "Selections and next actions on this page can continue into the current work."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link
          href={projectHref}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 transition hover:border-line-strong hover:text-fg"
        >
          <FolderOpen size={15} aria-hidden="true" />
          {korean ? "프로젝트" : "Project"}
        </Link>
        <Link
          href={contextual.href}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-black text-on-accent shadow-sm transition hover:bg-accent-2"
        >
          {korean ? contextual.labelKo : contextual.labelEn}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={close}
          aria-label={korean ? "현재 작품 연결 숨기기" : "Hide current work connection"}
          className="grid size-11 place-items-center rounded-xl text-fg-3 transition hover:bg-raised hover:text-fg"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

export default ActiveProjectContextBridge;
