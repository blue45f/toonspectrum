import { Link, useLocation } from "react-router-dom";

import { EducationDirectoryPage } from "./EducationDirectoryPage";
import { LearnPage as LearnContent } from "./LearnContent";
import { LearningHome, LearningPathPage } from "./LearningHome";
import { LearningClassroomPage } from "./LearningClassroomPage";
import { LearningResourcesPage } from "./LearningResourcesPage";
import { LearningRecordsPage } from "./LearningRecordsPage";
import { WebtoonCareerPage } from "./WebtoonCareerPage";
import { WebtoonProcessPage } from "./WebtoonProcessPage";

import "./learning-enhancements.css";
import "./learning-academy.css";

const REFERENCE_LINKS = [
  { path: "/learn/resources", label: "강좌·자료" },
  { path: "/learn/classroom", label: "Classroom" },
  { path: "/learn/process", label: "웹툰 제작 과정" },
  { path: "/learn/careers", label: "진로·직무 안내" },
  { path: "/learn/education", label: "교육기관 찾기" },
  { path: "/learn/resources", label: "교육 자료 허브" },
  { path: "/learn/classroom", label: "교육기관 활용" },
] as const;

function LearningReferenceNavigation({ pathname }: { readonly pathname: string }) {
  return (
    <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pt-4 sm:px-6" lang="ko" aria-label="웹툰 제작·진로·교육 안내">
      <span className="mr-1 text-xs font-bold tracking-[.12em] text-fg-2">ACADEMY</span>
      {REFERENCE_LINKS.map((item) => (
        <Link
          key={item.path}
          className={`inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${pathname === item.path ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg hover:bg-raised"}`}
          to={item.path}
          aria-current={pathname === item.path ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function LearningRecordShortcut() {
  return (
    <aside className="learn-record-shortcut" lang="ko" aria-label="학습 기록 관리">
      <Link to="/learn/records">내 학습 기록 · 백업 / 복원 →</Link>
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
  const pathMatch = normalizedPath.match(/^\/learn\/paths\/([^/]+)$/u);
  const academyPage = normalizedPath === "/learn/resources"
    ? <LearningResourcesPage />
    : normalizedPath === "/learn/classroom"
      ? <LearningClassroomPage />
      : null;
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
      {academyPage ?? referencePage ?? (isHome ? <LearningHome /> : pathMatch ? <LearningPathPage pathId={pathMatch[1]} /> : <LearnContent />)}
    </>
  );
}
