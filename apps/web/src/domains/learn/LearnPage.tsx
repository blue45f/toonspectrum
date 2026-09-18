import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Link, useLocation } from "react-router-dom";

import { EducationDirectoryPage } from "./EducationDirectoryPage";
import { LearnPage as LearnContent } from "./LearnContent";
import { LearningHome, LearningPathPage } from "./LearningHome";
import { LearningClassroomPage } from "./LearningClassroomPage";
import { LearningResourceHub } from "./LearningResourceHub";
import { LearningRecordsPage } from "./LearningRecordsPage";
import { WebtoonCareerPage } from "./WebtoonCareerPage";
import { WebtoonProcessPage } from "./WebtoonProcessPage";

import "./learning-enhancements.css";

const REFERENCE_LINKS = [
  { path: "/learn/process", label: "웹툰 제작 과정" },
  { path: "/learn/careers", label: "진로·직무 안내" },
  { path: "/learn/education", label: "교육기관 찾기" },
  { path: "/learn/resources", label: "교육 자료 허브" },
  { path: "/learn/classroom", label: "교육기관 활용" },
] as const;

function LearningReferenceNavigation({ pathname }: { readonly pathname: string }) {
  return (
    <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pt-4 sm:px-6" lang="ko" aria-label={translateCurrentStaticSourceText("domains.learn.LearnPage", "ko", "웹툰 제작·진로·교육 안내")}>
      <span className="mr-1 text-xs font-bold tracking-[.12em] text-fg-2">{translateCurrentStaticSourceText("domains.learn.LearnPage", "ko", "제작·진로 안내")}</span>
      {REFERENCE_LINKS.map((item) => (
        <Link
          key={item.path}
          className={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearnPage", "en", "inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm font-semibold transition-colors {v0}"), { v0: String(pathname === item.path ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg hover:bg-raised") })}
          to={item.path}
          aria-current={pathname === item.path ? translateCurrentStaticSourceText("domains.learn.LearnPage", "en", "page") : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function LearningRecordShortcut() {
  return (
    <aside className="learn-record-shortcut" lang="ko" aria-label={translateCurrentStaticSourceText("domains.learn.LearnPage", "ko", "학습 기록 관리")}>
      <Link to="/learn/records">{translateCurrentStaticSourceText("domains.learn.LearnPage", "ko", "내 학습 기록 · 백업 / 복원 →")}</Link>
    </aside>
  );
}

/** Public lazy entry; the enhanced home, reference guides and legacy lesson routes share the same document-local store. */
export function LearnPage() {
  const { pathname } = useLocation();
  const normalizedPath = pathname.replace(/\/+$/u, "") || "/";
  if (normalizedPath === "/learn/records") {
    return <LearningRecordsPage />;
  }

  const isHome = normalizedPath === "/learn";
  const resourceHub = normalizedPath === "/learn/resources" ? <LearningResourceHub /> : null;
  const classroomPage = normalizedPath === "/learn/classroom" ? <LearningClassroomPage /> : null;
  const pathMatch = normalizedPath.match(/^\/learn\/paths\/([^/]+)$/u);
  const referencePage = normalizedPath === "/learn/process"
    ? <WebtoonProcessPage />
    : normalizedPath === "/learn/careers"
      ? <WebtoonCareerPage />
      : normalizedPath === "/learn/education"
        ? <EducationDirectoryPage />
        : null;

  return (
    <>
      <LearningReferenceNavigation pathname={normalizedPath} />
      <LearningRecordShortcut />
      {referencePage ?? resourceHub ?? classroomPage ?? (isHome ? <LearningHome /> : pathMatch ? <LearningPathPage pathId={pathMatch[1]} /> : <LearnContent />)}
    </>
  );
}
