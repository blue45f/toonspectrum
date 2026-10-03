import { useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";

import { defineBilingualText, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { normalizeLocaleCode, useI18n, useT } from "@/shared/lib/i18n";
import { SectionArt } from "@/shared/components/section-art";

import { EducationDirectoryPage } from "./EducationDirectoryPage";
import { LearnPage as LearnContent } from "./LearnContent";
import { LESSONS } from "./learning-content";
import { useLearningProgress } from "./use-learning-progress";
import { LearningHome, LearningPathPage } from "./LearningHome";
import { LearningClassesPage } from "./LearningClassesPage";
import { LearningClassroomPage } from "./LearningClassroomPage";
import { LearningResourcesPage } from "./LearningResourcesPage";
import { LearningRecordsPage } from "./LearningRecordsPage";
import { TracePracticePage } from "./TracePracticePage";
import { WebtoonCareerPage } from "./WebtoonCareerPage";
import { WebtoonProcessPage } from "./WebtoonProcessPage";

import "./learning-enhancements.css";
import "./learning-academy.css";

const PRIMARY_LINKS = [
  { path: "/learn", label: defineBilingualText("learnPageNav", "home", "학습 홈", "Learn home") },
  { path: "/learn/resources", label: defineBilingualText("learnPageNav", "resources", "강좌·자료", "Courses & resources") },
  { path: "/learn/classroom", label: defineBilingualText("learnPageNav", "classroom", "Classroom", "Classroom") },
] as const;

const MORE_LINKS = [
  // 배운 뒤 장면에 필요한 자료를 찾는 다음 단계 — 학습 → 리서치 → 제작 동선의 가운데 고리.
  { path: "/research", label: defineBilingualText("learnPageNav", "research", "리서치 데스크 · 자료 찾기", "Research desk · find references") },
  { path: "/learn#learning-paths", label: defineBilingualText("learnPageNav", "paths", "학습 경로", "Learning paths") },
  { path: "/learn/glossary", label: defineBilingualText("learnPageNav", "glossary", "용어 사전", "Glossary") },
  { path: "/learn/studio", label: defineBilingualText("learnPageNav", "studio", "툰스튜디오 실습", "Studio practice") },
  { path: "/learn/classes", label: defineBilingualText("learnPageNav", "classes", "클래스", "Classes") },
  { path: "/learn/trace", label: defineBilingualText("learnPageNav", "trace", "따라 그리기", "Trace practice") },
  { path: "/learn/process", label: defineBilingualText("learnPageNav", "process", "웹툰 제작 과정", "Webtoon production process") },
  { path: "/learn/careers", label: defineBilingualText("learnPageNav", "careers", "진로·직무 안내", "Careers & roles") },
  { path: "/learn/education", label: defineBilingualText("learnPageNav", "education", "교육기관 찾기", "Find education") },
  { path: "/learn/records", label: defineBilingualText("learnPageNav", "records", "내 학습 기록 · 백업 / 복원", "My records · backup / restore") },
] as const;

const NAV_ALL_MENU = defineBilingualText("learnPageNav", "allMenu", "전체 메뉴", "All menu");
const NAV_ARIA_LABEL = defineBilingualText("learnPageNav", "ariaLabel", "웹툰 학습", "Webtoon learning");

const STRIP_LABEL = defineBilingualText("learnProgressStrip", "label", "내 학습 진행", "My learning progress");
const STRIP_DONE = defineBilingualText("learnProgressStrip", "done", "레슨 완료", "lessons completed");
const STRIP_RECORDS = defineBilingualText("learnProgressStrip", "records", "내 학습 기록", "My records");

/**
 * 자체 진행 표시가 없는 하위 화면(자료·트레이스·레퍼런스) 전용 셸 스트립.
 * 홈·경로·클래스·교실·레슨 화면은 이미 진행률을 보여줘서 얹지 않는다.
 */
function LearningProgressStrip() {
  useBilingualI18nRevision();
  const t = useT();
  const { progress } = useLearningProgress();
  const completed = LESSONS.filter((lesson) => progress.lessons[lesson.id]?.completed).length;
  return (
    <section className="learn-progress-strip" aria-label={t(STRIP_LABEL)}>
      <span className="learn-progress-strip__label">{t(STRIP_LABEL)}</span>
      <progress
        className="learn-progress-strip__bar"
        value={completed}
        max={Math.max(LESSONS.length, 1)}
        aria-label={t(STRIP_LABEL)}
      />
      <span className="learn-progress-strip__count">
        <strong>{completed} / {LESSONS.length}</strong> {t(STRIP_DONE)}
      </span>
      <Link className="learn-progress-strip__link" to="/learn/records">
        {t(STRIP_RECORDS)}
      </Link>
    </section>
  );
}

/**
 * 자체 히어로 아트가 없는 정보형 하위 화면(자료·제작 과정·진로·교육기관) 전용 셸 배너.
 * 학습 홈·클래스·교실처럼 자체 비주얼을 가진 화면과, 손으로 직접 그리는 실습(트레이스)처럼
 * 작업 표면이 바로 시작돼야 하는 화면에는 얹지 않는다.
 */
function LearningArtBanner() {
  return (
    <div className="learn-art-banner">
      <SectionArt image="learn" className="learn-art-banner__image" />
    </div>
  );
}

function LearningNavigation({ pathname, hash }: { readonly pathname: string; readonly hash: string }) {
  useBilingualI18nRevision();
  const t = useT();
  const language = useI18n((state) => state.lang);
  const navLang = (normalizeLocaleCode(language) ?? "").startsWith("en") ? "en" : "ko";
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
    <nav className="learn-site-navigation" lang={navLang} aria-label={t(NAV_ARIA_LABEL)}>
      {PRIMARY_LINKS.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          aria-current={isCurrent(item.path) ? "page" : undefined}
        >
          {t(item.label)}
        </Link>
      ))}
      <details
        className="learn-site-navigation__more"
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary ref={summaryRef} data-current={activeMore ? "true" : undefined} onKeyDown={closeFromEscape}>
          <span>{activeMore ? t(activeMore.label) : t(NAV_ALL_MENU)}</span><span aria-hidden="true">⌄</span>
        </summary>
        <div className="learn-site-navigation__menu" hidden={!expanded}>
          {MORE_LINKS.map((item) => (
            <Link key={item.path} to={item.path} aria-current={isCurrent(item.path) ? "page" : undefined} onClick={() => setExpanded(false)} onKeyDown={closeFromEscape}>
              {t(item.label)}
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
      : normalizedPath === "/learn/classes"
        ? <LearningClassesPage />
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
  const showProgressStrip =
    normalizedPath === "/learn/resources" ||
    normalizedPath === "/learn/trace" ||
    referencePage !== null;
  const showArtBanner =
    normalizedPath === "/learn/resources" ||
    referencePage !== null;

  return (
    <>
      <LearningNavigation key={normalizedPath} pathname={normalizedPath} hash={hash} />
      {showArtBanner ? <LearningArtBanner /> : null}
      {showProgressStrip ? <LearningProgressStrip /> : null}
      {normalizedPath === "/learn/records" ? <LearningRecordsPage /> : academyPage ?? referencePage ?? (isHome ? <LearningHome /> : pathMatch ? <LearningPathPage pathId={pathMatch[1]} /> : <LearnContent />)}
    </>
  );
}
