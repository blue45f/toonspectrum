import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import Link from "@/shared/navigation/router-link";
import {
  STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT,
  readStudioProjectDocuments,
} from "../studio-project-document-reader";
import { manuscriptCompletion, type ManuscriptCompletion } from "./studio-workspace-hero-model";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import type { StudioProjectResumeTarget } from "../studio-project-resume-target";

function useManuscriptCompletion(projectId: string | null): ManuscriptCompletion | null {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, refresh);
  }, [projectId]);
  return useMemo(() => {
    // `revision` bumps whenever the project documents update event fires.
    void revision;
    if (!projectId || typeof window === "undefined") return null;
    try {
      return manuscriptCompletion(readStudioProjectDocuments(window.localStorage, projectId).documents);
    } catch {
      return null;
    }
  }, [projectId, revision]);
}

export function StudioWorkspaceHero({
  project,
  resume,
  resumeActionLabel,
  canResume,
  resumeHref,
  allWorksHref,
  t,
}: {
  readonly project: StudioProjectLibraryEntry | null;
  readonly resume: StudioProjectResumeTarget | null;
  readonly resumeActionLabel: string | null;
  readonly canResume: boolean;
  readonly resumeHref: string;
  readonly allWorksHref: string;
  readonly t: (ko: string, en: string) => string;
}) {
  const reducedMotion = useReducedMotion();
  const completion = useManuscriptCompletion(project?.id ?? null);
  const percent = completion ? Math.round(completion.ratio * 100) : 0;

  return (
    <motion.section
      className="workspace-current-work workspace-current-work--hero workspace-hero-cinematic"
      aria-labelledby="workspace-continue-title"
      initial={reducedMotion ? false : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    >
      {project?.thumbnailUrl ? (
        <div className="workspace-hero-thumbnail" aria-hidden="true">
          <img
            src={project.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
        </div>
      ) : null}
      <div className="workspace-hero-mesh" aria-hidden="true" />
      <p className="workspace-eyebrow">{t("이어서 만들기", "Continue creating")}</p>
      <h2 id="workspace-continue-title">{project?.title ?? t("첫 이야기를 시작해 보세요", "Start your first story")}</h2>
      <p>{resume?.summary ?? t("원고와 팀의 작업을 한곳에서 이어갑니다.", "Keep your artwork and team workflow together.")}</p>
      {completion ? (
        <div className="workspace-hero-progress">
          <div
            className="workspace-hero-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t("원고 완성도", "Manuscript completion")}
          >
            <motion.div
              className="workspace-hero-progress-fill"
              initial={reducedMotion ? false : { width: "0%" }}
              animate={{ width: `${percent}%` }}
              transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 52, damping: 19 }}
            />
          </div>
          <p className="workspace-hero-progress-label">
            <span>{t("원고", "Manuscripts")}</span>
            <strong>{completion.done} / {completion.total} {t("완성", "done")}</strong>
          </p>
        </div>
      ) : null}
      <div className="workspace-current-actions">
        <Link
          className="workspace-primary workspace-hero-cta"
          data-tour-target="continue"
          data-workspace-resume={project ? "true" : undefined}
          href={canResume ? resumeHref : "/studio/new"}
        >{canResume
          ? resumeActionLabel ?? (resume?.summary ? t("원고 이어하기", "Resume artwork") : t("작품 열기", "Open work"))
          : t("새 작품 만들기", "Create a work")}<ArrowRight size={18} aria-hidden="true" /></Link>
        <Link className="workspace-secondary-action" href={allWorksHref}>{t("내 작품 전체", "All my works")}</Link>
      </div>
    </motion.section>
  );
}
