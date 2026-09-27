import { useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";

import { EducationDirectoryPage } from "./EducationDirectoryPage";
import { LearnPage as LearnContent } from "./LearnContent";
import { LearningHome, LearningPathPage } from "./LearningHome";
import { LearningClassroomPage } from "./LearningClassroomPage";
import { LearningResourcesPage } from "./LearningResourcesPage";
import { LearningRecordsPage } from "./LearningRecordsPage";
import { TracePracticePage } from "./TracePracticePage";
import { WebtoonCareerPage } from "./WebtoonCareerPage";
import { WebtoonProcessPage } from "./WebtoonProcessPage";

import "./learning-enhancements.css";
import "./learning-academy.css";

const PRIMARY_LINKS = [
  { path: "/learn", label: "학습 홈" },
  { path: "/learn/resources", label: "강좌·자료" },
  { path: "/learn/classroom", label: "Classroom" },
] as const;

const MORE_LINKS = [
  { path: "/learn#learning-paths", label: "학습 경로" },
  { path: "/learn/glossary", label: "용어 사전" },
  { path: "/learn/studio", label: "툰스튜디오 실습" },
  { path: "/learn/trace", label: "따라 그리기" },
  { path: "/learn/process", label: "웹툰 제작 과정" },
  { path: "/learn/careers", label: "진로·직무 안내" },
  { path: "/learn/education", label: "교육기관 찾기" },
  { path: "/learn/records", label: "내 학습 기록 · 백업 / 복원" },
] as const;

function LearningNavigation({ pathname, hash }: { readonly pathname: string; readonly hash: string }) {
  const [expanded, setExpanded] = useState(false);
  const summaryRef = useRef<HTMLElement>(null);
  const isCurrent = (path: string) => path === "/learn#learning-paths"
    ? pathname.startsWith("/learn/paths/") || (pathname === "/learn" && hash === "#learning-paths")
    : pathname === path && !(path === "/learn" && hash === "#learning-paths");
  const activeMore = MORE_LINKS.find((item) => isCurrent(item.path));
  const closeFromEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setExpanded(false);
      summaryRef.current?.focus();
    }
  };
  return (
    <nav className="learn-site-navigation" lang="ko" aria-label="웹툰 학습">
      {PRIMARY_LINKS.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          aria-current={isCurrent(item.path) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
      <details
        className="learn-site-navigation__more"
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary ref={summaryRef} data-current={activeMore ? "true" : undefined} onKeyDown={closeFromEscape}>
          <span>{activeMore?.label ?? "전체 메뉴"}</span><span aria-hidden="true">⌄</span>
        </summary>
        <div className="learn-site-navigation__menu" hidden={!expanded}>
          {MORE_LINKS.map((item) => (
            <Link key={item.path} to={item.path} aria-current={isCurrent(item.path) ? "page" : undefined} onClick={() => setExpanded(false)} onKeyDown={closeFromEscape}>
              {item.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}

/** Public lazy entry; the enhanced home, reference guides and legacy lesson routes share the same document-local store. */
export function LearnPage() {
  const { pathname, hash } = useLocation();
  const normalizedPath = pathname.replace(/\/+$/u, "") || "/";

  const isHome = normalizedPath === "/learn";
  const pathMatch = normalizedPath.match(/^\/learn\/paths\/([^/]+)$/u);
  const academyPage = normalizedPath === "/learn/resources"
    ? <LearningResourcesPage />
    : normalizedPath === "/learn/classroom"
      ? <LearningClassroomPage />
      : normalizedPath === "/learn/trace"
        ? <TracePracticePage />
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
      <LearningNavigation key={normalizedPath} pathname={normalizedPath} hash={hash} />
      {normalizedPath === "/learn/records" ? <LearningRecordsPage /> : academyPage ?? referencePage ?? (isHome ? <LearningHome /> : pathMatch ? <LearningPathPage pathId={pathMatch[1]} /> : <LearnContent />)}
    </>
  );
}
