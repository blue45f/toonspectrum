import {
  Archive,
  BookOpen,
  CalendarCheck,
  GraduationCap,
  LayoutGrid,
  Library,
  PenTool,
  Route,
  Sparkles,
  Telescope,
  type LucideIcon,
} from "lucide-react";
import { PageIntro } from "@/shared/components/page-intro";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SiteRail, SiteShowMoreButton } from "@/domains/legal/public/site-rail";
import { SiteSectionTabs, SiteTabPanel, type SiteSectionTab } from "@/domains/legal/public/site-section-tabs";
import { useShowMore } from "@/domains/legal/public/site-show-more";
import { useSiteTabAnchors, useSiteTabs } from "@/domains/legal/public/site-tabs";
import { WorkflowIllustration } from "@/shared/components/site-experience/WorkflowIllustration";

import { LESSONS, TERMS } from "./learning-content";
import { LEARNING_ROLES, ROLE_LABELS, type LearningRole } from "./learning-resources";
import { matchesSearch, type Lesson } from "./learning-model";
import {
  LEARNING_GOALS,
  LEARNING_LEVELS,
  LEARNING_PATHS,
  SKILLS,
  SKILL_IDS,
  buildSessionPlan,
  getLessonMeta,
  getLessonState,
  getPathLessons,
  getPathStats,
  getSkillProgress,
  recommendLearningPath,
  type LearningGoal,
  type LearningLevel,
  type LearningPath,
  type SkillId,
} from "./learning-paths";
import {
  DEFAULT_LEARNING_PROFILE,
  SESSION_MINUTES,
  loadLearningProfile,
  saveLearningProfile,
  type LearningProfile,
  type SessionMinutes,
} from "./learning-profile";
import { SKILL_ICONS } from "./learning-skill-icons";
import { useLearningProgress, type LearningStore } from "./use-learning-progress";
import { LearningProcessStudy } from "./LearningProcessStudy";

import "./learning-hub.css";

const lessonUrl = (id: string) => `/learn/lessons/${encodeURIComponent(id)}`;
const pathUrl = (id: string) => `/learn/paths/${encodeURIComponent(id)}`;

const LEVEL_LABELS: Readonly<Record<LearningLevel, string>> = {
  starter: "처음 시작",
  growing: "기초를 익힌 뒤",
  advanced: "완성·게시 단계",
};

const GOAL_OPTIONS: readonly { value: LearningGoal; label: string }[] = [
  { value: "first-episode", label: "첫 3컷·첫 회차를 완성하고 싶어요" },
  { value: "story", label: "이야기와 컷 연출을 강화하고 싶어요" },
  { value: "visual", label: "그림과 채색 완성도를 높이고 싶어요" },
  { value: "studio", label: "툰스튜디오를 빠르게 익히고 싶어요" },
  { value: "publish", label: "게시 전 원고를 제대로 검수하고 싶어요" },
];

const STATUS_LABELS = {
  "not-started": "시작 전",
  "in-progress": "학습 중",
  completed: "완료",
} as const;

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function lessonRequirementProgress(lesson: Lesson, store: LearningStore): number {
  const saved = store.progress.lessons[lesson.id];
  if (saved?.completed) return 100;
  if (!saved) return 0;
  const correct = saved.answer === lesson.quiz.answer ? 1 : 0;
  return Math.round(((saved.checks.length + correct) / (lesson.checks.length + 1)) * 100);
}

function LessonLibraryCard({ lesson, store, index }: { lesson: Lesson; store: LearningStore; index: number }) {
  const meta = getLessonMeta(lesson.id);
  const state = getLessonState(store.progress, lesson.id);
  const progress = lessonRequirementProgress(lesson, store);
  return (
    <article className={`learn-card learn-library-card${state === "completed" ? " is-complete" : ""}`}>
      <div className="learn-card-top">
        <span className="learn-number">{String(index + 1).padStart(2, "0")}</span>
        <span className={`learn-status learn-status-${state}`}>{STATUS_LABELS[state]}</span>
      </div>
      <div className="learn-card-chips" aria-label="강좌 정보">
        <span>{lesson.track === "studio" ? "툰스튜디오 실습" : "제작 기초"}</span>
        <span>{LEVEL_LABELS[meta.level]}</span>
        <span>약 {lesson.minutes}분</span>
      </div>
      <h3><Link to={lessonUrl(lesson.id)}>{lesson.title}</Link></h3>
      <p>{lesson.summary}</p>
      <div className="learn-card-outcome"><strong>완성할 것</strong><span>{meta.outcome}</span></div>
      <div className="learn-card-skills" aria-label="관련 역량">
        {meta.skills.map((skillId) => {
          const SkillIcon = SKILL_ICONS[skillId];
          return <span key={skillId}><SkillIcon size={13} aria-hidden="true" />{SKILLS.find((skill) => skill.id === skillId)?.label}</span>;
        })}
      </div>
      {state !== "not-started" && (
        <div className="learn-card-progress">
          <span>자가 점검 진행 {progress}%</span>
          <progress value={progress} max={100} aria-label={`${lesson.title} 자가 점검 진행률`} />
        </div>
      )}
      <div className="learn-card-bottom">
        <span>{meta.format === "studio-practice" ? "작업 화면에서 따라 하기" : "설명 · 조작형 예제 · 실습"}</span>
        <Link to={lessonUrl(lesson.id)} aria-label={`${lesson.title} ${state === "completed" ? "복습" : state === "in-progress" ? "계속 학습" : "시작"}`}>
          {state === "completed" ? "복습하기" : state === "in-progress" ? "계속하기" : "배우기"} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

type SkillProgress = ReturnType<typeof getSkillProgress>[number];

/** 스킬 카드 — 완료율과 함께 해당 역량의 다음 추천 강좌를 바로 보여준다. */
function SkillCard({ skill, store, onBrowse }: { skill: SkillProgress; store: LearningStore; onBrowse: (skillId: SkillId) => void }) {
  const skillLessons = LESSONS.filter((lesson) => getLessonMeta(lesson.id).skills.includes(skill.id));
  const nextLesson = skillLessons.find((lesson) => getLessonState(store.progress, lesson.id) !== "completed");
  const SkillIcon = SKILL_ICONS[skill.id];
  return (
    <article>
      <div><h3><SkillIcon size={17} aria-hidden="true" className="learn-skill-icon" />{skill.label}</h3><strong>{skill.completed}/{skill.total}</strong></div>
      <p>{skill.description}</p>
      <progress value={skill.completed} max={Math.max(skill.total, 1)} aria-label={`${skill.label} 관련 강좌 완료율`} />
      {nextLesson ? (
        <p className="learn-skill-next">
          <span>다음에 추천</span>
          <Link to={lessonUrl(nextLesson.id)}>{nextLesson.title} <span aria-hidden="true">→</span></Link>
        </p>
      ) : (
        <p className="learn-skill-next"><span>이 역량의 모든 강좌를 완료했어요.</span></p>
      )}
      <button type="button" onClick={() => onBrowse(skill.id)}>{skill.label} 강좌 보기</button>
    </article>
  );
}

function PathCard({ path, store, recommended }: { path: LearningPath; store: LearningStore; recommended: boolean }) {
  const stats = getPathStats(path, store.progress);
  return (
    <article className={`learn-path-card${recommended ? " is-recommended" : ""}`}>
      <div className="learn-path-card-top">
        <span className="learn-path-index">{String(LEARNING_PATHS.indexOf(path) + 1).padStart(2, "0")}</span>
        {recommended && <span className="learn-recommended-label">내 추천 경로</span>}
      </div>
      <p className="learn-eyebrow">{LEVEL_LABELS[path.level]} · {path.lessonIds.length}개 강좌</p>
      <h3><Link to={pathUrl(path.id)}>{path.title}</Link></h3>
      <p>{path.summary}</p>
      <div className="learn-path-outcome"><strong>경로 결과물</strong><span>{path.outcome}</span></div>
      <div className="learn-path-progress">
        <div><span>완료 {stats.completed}/{stats.total}</span><span>{stats.percent}%</span></div>
        <progress value={stats.completed} max={Math.max(stats.total, 1)} aria-label={`${path.title} 완료율`} />
      </div>
      <div className="learn-path-card-bottom">
        <span>총 약 {stats.totalMinutes}분{stats.remainingMinutes < stats.totalMinutes ? ` · 남은 ${stats.remainingMinutes}분` : ""}</span>
        <Link to={pathUrl(path.id)}>경로 보기 →</Link>
      </div>
    </article>
  );
}

function updateSearchParam(params: URLSearchParams, key: string, value: string) {
  const updated = new URLSearchParams(params);
  if (!value || value === "all" || (key === "sort" && value === "recommended")) updated.delete(key);
  else updated.set(key, value);
  return updated;
}

type LearnHubTab = "today" | "paths" | "library" | "skills";
const LEARN_HUB_TABS: readonly LearnHubTab[] = ["today", "paths", "library", "skills"];
const LEARN_TAB_PREFIX = "learn-hub";
/** 강좌 목록은 처음 이만큼만 보여 주고 "더 보기"로 늘린다(모바일 길이 관리). */
const LIBRARY_PAGE_SIZE = 6;
/** 주소의 강좌 필터 키 — 하나라도 있으면 공유 링크가 전체 강좌 탭으로 열린다. */
const LIBRARY_FILTER_KEYS = ["q", "track", "level", "duration", "status", "skill", "sort"] as const;
/** 예전 섹션 앵커(공유 링크·경로 상세의 "모든 학습 경로")를 해당 탭으로 연다. */
const LEARN_HASH_TABS: Readonly<Record<string, LearnHubTab>> = {
  "#learn-plan": "today",
  "#learning-paths": "paths",
  "#learn-library": "library",
};

const LEARN_NEXT_STEPS: readonly { href: string; icon: LucideIcon; title: string; description: string }[] = [
  { href: "/research", icon: Telescope, title: "리서치 데스크에서 자료 찾기", description: "배운 장면에 필요한 레퍼런스·3D 재료·폰트를 출처와 함께 모읍니다." },
  { href: "/learn/studio", icon: PenTool, title: "작업 화면에서 직접 해보기", description: "기존 작업을 바꾸지 않는 툰스튜디오 실습으로 이어집니다." },
  { href: "/learn/resources", icon: Library, title: "외부 강좌·공식 자료 찾기", description: "에듀코카·WEBTOON Academy 등 공식 자료를 직군별로 봅니다." },
  { href: "/learn/classroom", icon: GraduationCap, title: "교육기관용 Classroom", description: "주차별 커리큘럼에 강좌·자료·실습 과제를 묶습니다." },
  { href: "/learn/glossary", icon: BookOpen, title: "용어 사전", description: `한국어·영문·다른 이름으로 핵심 용어 ${TERMS.length}개를 찾고 저장합니다.` },
  { href: "/learn/records", icon: Archive, title: "학습 기록 백업·복원", description: "이 브라우저의 완료 기록과 메모를 파일로 지킵니다." },
];

export function LearningHome() {
  const store = useLearningProgress();
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const [profile, setProfile] = useState<LearningProfile>(() => loadLearningProfile(browserStorage()));
  const [profileWarning, setProfileWarning] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [planOpen, setPlanOpen] = useState(hash === "#learn-plan");

  useEffect(() => { document.title = "배우기 · 툰스튜디오"; }, []);

  const hasLibraryFilters = LIBRARY_FILTER_KEYS.some((key) => params.has(key));
  const { value: activeTab, select: selectTab, isMounted } = useSiteTabs({
    ids: LEARN_HUB_TABS,
    fallback: hasLibraryFilters ? "library" : "today",
    param: "view",
  });

  const recommendedPath = recommendLearningPath(profile.goal, profile.level);
  const recommendedStats = getPathStats(recommendedPath, store.progress);
  const sessionLessons = buildSessionPlan(recommendedPath, store.progress, profile.sessionMinutes);
  const nextLesson = sessionLessons[0] ?? LESSONS[0];
  const completedCount = LESSONS.filter((lesson) => getLessonState(store.progress, lesson.id) === "completed").length;
  const overallPercent = Math.round((completedCount / Math.max(LESSONS.length, 1)) * 100);
  const skillProgress = getSkillProgress(store.progress);

  const query = (params.get("q") ?? "").slice(0, 200);
  const rawTrack = params.get("track") ?? "all";
  const track = rawTrack === "foundation" || rawTrack === "studio" ? rawTrack : "all";
  const rawLevel = params.get("level") ?? "all";
  const level = LEARNING_LEVELS.includes(rawLevel as LearningLevel) ? rawLevel as LearningLevel : "all";
  const rawDuration = params.get("duration") ?? "all";
  const duration = ["quick", "standard", "deep"].includes(rawDuration) ? rawDuration : "all";
  const rawStatus = params.get("status") ?? "all";
  const status = ["not-started", "in-progress", "completed"].includes(rawStatus) ? rawStatus : "all";
  const rawSkill = params.get("skill") ?? "all";
  const skill = SKILL_IDS.includes(rawSkill as SkillId) ? rawSkill as SkillId : "all";
  const rawSort = params.get("sort") ?? "recommended";
  const sort = ["sequence", "shortest"].includes(rawSort) ? rawSort : "recommended";
  const secondaryFilterCount = [duration, status, skill].filter((value) => value !== "all").length + (sort !== "recommended" ? 1 : 0);

  const recommendedRank = new Map(recommendedPath.lessonIds.map((id, index) => [id, index]));
  const filteredLessons = LESSONS.filter((lesson) => {
    const meta = getLessonMeta(lesson.id);
    const lessonState = getLessonState(store.progress, lesson.id);
    const termNames = lesson.terms.map((termId) => TERMS.find((term) => term.id === termId)?.name ?? termId);
    const durationMatches = duration === "all"
      || (duration === "quick" && lesson.minutes <= 12)
      || (duration === "standard" && lesson.minutes >= 13 && lesson.minutes <= 16)
      || (duration === "deep" && lesson.minutes >= 17);
    return (track === "all" || lesson.track === track)
      && (level === "all" || meta.level === level)
      && durationMatches
      && (status === "all" || lessonState === status)
      && (skill === "all" || meta.skills.includes(skill))
      && matchesSearch(query, [lesson.title, lesson.summary, meta.outcome, ...termNames]);
  });
  filteredLessons.sort((left, right) => {
    if (sort === "shortest") return left.minutes - right.minutes || LESSONS.indexOf(left) - LESSONS.indexOf(right);
    if (sort === "sequence") return LESSONS.indexOf(left) - LESSONS.indexOf(right);
    return (recommendedRank.get(left.id) ?? 100) - (recommendedRank.get(right.id) ?? 100)
      || LESSONS.indexOf(left) - LESSONS.indexOf(right);
  });
  const filterKey = [query, track, level, duration, status, skill, sort].join("|");
  const library = useShowMore(filteredLessons.length, LIBRARY_PAGE_SIZE, filterKey);

  // 공유 앵커·히어로 행동은 해당 탭을 고른 뒤 패널이 그려지면 그 영역으로 스크롤한다.
  const { openAnchor, revealAnchor } = useSiteTabAnchors(LEARN_HASH_TABS, activeTab, selectTab);

  function updateProfile(next: LearningProfile) {
    setProfile(next);
    setProfileWarning(saveLearningProfile(browserStorage(), next) ? "" : "학습 목표를 기기에 저장하지 못했습니다. 현재 화면에서는 계속 사용할 수 있습니다.");
  }

  function setFilter(key: string, value: string, replace = false) {
    setParams(updateSearchParam(params, key, value), { replace });
  }

  function resetFilters() {
    const kept = new URLSearchParams();
    const view = params.get("view");
    if (view) kept.set("view", view);
    setParams(kept);
  }

  function browseSkill(skillId: SkillId) {
    // 역량 필터와 탭을 주소 한 번에 바꾼 뒤(두 번 나눠 바꾸면 앞의 변경이 덮인다) 강좌 목록으로 스크롤한다.
    const updated = updateSearchParam(params, "skill", skillId);
    updated.set("view", "library");
    setParams(updated);
    revealAnchor("#learn-library");
  }

  function editPlan() {
    setPlanOpen(true);
    openAnchor("#learn-plan");
  }

  const hubTabs: readonly SiteSectionTab<LearnHubTab>[] = [
    { id: "today", icon: CalendarCheck, label: "오늘의 학습" },
    { id: "paths", icon: Route, label: "학습 경로", badge: LEARNING_PATHS.length },
    { id: "library", icon: LayoutGrid, label: "전체 강좌", badge: LESSONS.length },
    { id: "skills", icon: Sparkles, label: "역량 지도" },
  ];

  return (
    <PageIntro variant="chapter" className="learn-page learn-home-page" lang="ko">
      <a className="learn-skip-link" href={`#${LEARN_TAB_PREFIX}`}>학습 영역으로 건너뛰기</a>
      {store.warning && <p className="learn-caution" role="status">{store.warning}</p>}

      <header className="learn-hub-hero">
        <div className="learn-hub-hero-copy">
          <p className="learn-eyebrow">TOONSTUDIO / ARTIST CLASSROOM</p>
          <h1>상상하던 장면이,<br />내 손끝의 실력으로.</h1>
          <p className="learn-intro">콘티의 첫 선부터 빛과 색, 원고 마무리까지 — 매 수업마다 작은 결과물을 하나씩 완성합니다.</p>
          <div className="learn-actions">
            <Link className="learn-primary" to={lessonUrl(nextLesson.id)}>
              {recommendedStats.started ? "추천 경로 이어서 학습" : "내 추천 경로 시작"} <span aria-hidden="true">→</span>
            </Link>
            <button type="button" className="learn-secondary" onClick={editPlan}>학습 설정 바꾸기</button>
          </div>
          <p className="learn-small">로그인 없이 시작 · 강좌 {LESSONS.length}개 · 학습 경로 {LEARNING_PATHS.length}개 · 용어 {TERMS.length}개 · 기록은 이 브라우저에 저장</p>
        </div>
        <figure className="learn-hero-art"><WorkflowIllustration kind="learn" priority /><figcaption><span>YOUR NEXT SCENE</span><strong>관찰하고. 익히고. 그려보세요.</strong><span>ToonStudio 콘셉트 아트</span></figcaption></figure>
      </header>

      <aside className="learn-dashboard-card learn-dashboard-overview" aria-label="내 학습 현황">
        <div className="learn-dashboard-heading">
          <div><span className="learn-eyebrow">MY LEARNING</span><h2>{recommendedPath.title}</h2></div>
          <strong aria-label={`전체 강좌 ${overallPercent}% 완료`}>{overallPercent}%</strong>
        </div>
        <progress value={completedCount} max={Math.max(LESSONS.length, 1)} aria-label="전체 강좌 완료율" />
        <dl className="learn-dashboard-stats">
          <div><dt>완료 강좌</dt><dd>{completedCount}/{LESSONS.length}</dd></div>
          <div><dt>저장한 용어</dt><dd>{store.progress.bookmarks.length}</dd></div>
          <div><dt>다음 세션</dt><dd>{sessionLessons.reduce((sum, lesson) => sum + lesson.minutes, 0)}분</dd></div>
        </dl>
        <div className="learn-dashboard-next">
          <span>다음에 만들 것</span>
          <strong>{getLessonMeta(nextLesson.id).outcome}</strong>
          <Link to={lessonUrl(nextLesson.id)}>{nextLesson.title} →</Link>
        </div>
      </aside>

      <section id={LEARN_TAB_PREFIX} className="learn-hub-tabs" aria-label="학습 영역">
        <SiteSectionTabs tabs={hubTabs} value={activeTab} onChange={selectTab} label="학습 영역" idPrefix={LEARN_TAB_PREFIX} />

        <SiteTabPanel idPrefix={LEARN_TAB_PREFIX} id="today" active={activeTab === "today"} mounted={isMounted("today")} className="learn-hub-panel">
          <section className="learn-session-section" aria-labelledby="learn-session-title">
            <div className="learn-session-heading">
              <div><p className="learn-eyebrow">YOUR NEXT SESSION · {recommendedPath.title}</p><h2 id="learn-session-title">{profile.sessionMinutes}분 안에 이어갈 학습</h2></div>
              <span>{recommendedStats.completed === recommendedStats.total ? "경로를 완료해 복습 강좌를 제안합니다." : `추천 경로의 남은 시간 약 ${recommendedStats.remainingMinutes}분`}</span>
            </div>
            <ol className="learn-session-list">
              {sessionLessons.map((lesson, index) => {
                const state = getLessonState(store.progress, lesson.id);
                return (
                  <li key={lesson.id}>
                    <span className="learn-session-number">{index + 1}</span>
                    <div><span>{STATUS_LABELS[state]} · 약 {lesson.minutes}분</span><h3>{lesson.title}</h3><p>{getLessonMeta(lesson.id).outcome}</p></div>
                    <Link to={lessonUrl(lesson.id)}>{state === "completed" ? "복습" : state === "in-progress" ? "계속" : "시작"} →</Link>
                  </li>
                );
              })}
            </ol>
          </section>

          <details id="learn-plan" className="learn-plan-section learn-plan-disclosure" open={planOpen} onToggle={(event) => setPlanOpen(event.currentTarget.open)}>
            <summary>
              <span><span className="learn-eyebrow">PERSONAL LEARNING PLAN</span><strong id="learn-plan-title">학습 목표·시간 설정</strong></span>
              <span className="learn-plan-summary">{GOAL_OPTIONS.find((option) => option.value === profile.goal)?.label} · {LEVEL_LABELS[profile.level]} · {profile.sessionMinutes}분</span>
            </summary>
            <div className="learn-plan-layout">
              <div className="learn-plan-controls">
                <label htmlFor="learn-role">나의 역할
                  <select id="learn-role" value={profile.role} onChange={(event) => {
                    const value = event.currentTarget.value as LearningRole;
                    updateProfile({ ...profile, role: LEARNING_ROLES.includes(value) ? value : DEFAULT_LEARNING_PROFILE.role });
                  }}>
                    {LEARNING_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </label>
                <label htmlFor="learn-goal">지금 가장 중요한 목표
                  <select id="learn-goal" value={profile.goal} onChange={(event) => {
                    const value = event.currentTarget.value as LearningGoal;
                    updateProfile({ ...profile, goal: LEARNING_GOALS.includes(value) ? value : DEFAULT_LEARNING_PROFILE.goal });
                  }}>
                    {GOAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label htmlFor="learn-level">현재 경험
                  <select id="learn-level" value={profile.level} onChange={(event) => {
                    const value = event.currentTarget.value as LearningLevel;
                    updateProfile({ ...profile, level: LEARNING_LEVELS.includes(value) ? value : DEFAULT_LEARNING_PROFILE.level });
                  }}>
                    <option value="starter">처음 시작하거나 기본부터 다시</option>
                    <option value="growing">기초 제작 경험이 있음</option>
                    <option value="advanced">한 회차를 완성·게시해 본 적 있음</option>
                  </select>
                </label>
                <label htmlFor="learn-session-minutes">한 번에 집중할 시간
                  <select id="learn-session-minutes" value={profile.sessionMinutes} onChange={(event) => {
                    const value = Number(event.currentTarget.value) as SessionMinutes;
                    updateProfile({ ...profile, sessionMinutes: SESSION_MINUTES.includes(value) ? value : DEFAULT_LEARNING_PROFILE.sessionMinutes });
                  }}>
                    {SESSION_MINUTES.map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}
                  </select>
                </label>
                {profileWarning && <p className="learn-caption" role="status">{profileWarning}</p>}
                <p className="learn-small">설정은 이 브라우저에만 저장되며 언제든 바꿀 수 있습니다.</p>
              </div>
              <article className="learn-plan-result">
                <span className="learn-recommended-label">추천 경로</span>
                <h3>{recommendedPath.title}</h3>
                <p>{recommendedPath.summary}</p>
                <div className="learn-plan-result-meta">
                  <span>{recommendedPath.lessonIds.length}개 강좌</span>
                  <span>총 약 {recommendedStats.totalMinutes}분</span>
                  <span>{LEVEL_LABELS[recommendedPath.level]}</span>
                </div>
                <p><strong>완성 목표</strong><br />{recommendedPath.outcome}</p>
                <Link className="learn-secondary" to={pathUrl(recommendedPath.id)}>추천 경로 자세히 보기 →</Link>
              </article>
            </div>
          </details>
        </SiteTabPanel>

        <SiteTabPanel idPrefix={LEARN_TAB_PREFIX} id="paths" active={activeTab === "paths"} mounted={isMounted("paths")} className="learn-hub-panel">
          <section id="learning-paths" aria-labelledby="learning-paths-title">
            <div className="learn-section-heading">
              <div><p className="learn-eyebrow">GUIDED PATHS</p><h2 id="learning-paths-title">목표까지 길을 잃지 않는 학습 경로</h2></div>
              <p className="learn-small">강좌를 건너뛰어도 막지 않으며, 필요한 부분만 골라 학습할 수 있습니다.</p>
            </div>
            <SiteRail label="학습 경로 목록" className="learn-path-rail" columns="sm:grid-cols-2 xl:grid-cols-3">
              {LEARNING_PATHS.map((path) => <PathCard key={path.id} path={path} store={store} recommended={path.id === recommendedPath.id} />)}
            </SiteRail>
          </section>
          <LearningProcessStudy />
        </SiteTabPanel>

        <SiteTabPanel idPrefix={LEARN_TAB_PREFIX} id="library" active={activeTab === "library"} mounted={isMounted("library")} className="learn-hub-panel">
          <section id="learn-library" className="learn-library-section" aria-labelledby="learn-library-title">
            <div className="learn-section-heading">
              <div><p className="learn-eyebrow">COURSE LIBRARY</p><h2 id="learn-library-title">필요한 수업을 바로 찾는 전체 강좌</h2></div>
              <p className="learn-small">추천 순서는 선택한 목표를 반영합니다.</p>
            </div>
            <div className="learn-library-filters">
              <label className="learn-search-label" htmlFor="learn-course-search">강좌 검색
                <input id="learn-course-search" type="search" maxLength={200} value={query} placeholder="콘티, 채색, 말풍선…" onChange={(event) => setFilter("q", event.currentTarget.value, true)} />
              </label>
              <label htmlFor="learn-track-filter">학습 과정
                <select id="learn-track-filter" value={track} onChange={(event) => setFilter("track", event.currentTarget.value)}>
                  <option value="all">전체 과정</option><option value="foundation">제작 기초</option><option value="studio">툰스튜디오 실습</option>
                </select>
              </label>
              <label htmlFor="learn-level-filter">난이도
                <select id="learn-level-filter" value={level} onChange={(event) => setFilter("level", event.currentTarget.value)}>
                  <option value="all">전체 난이도</option><option value="starter">처음 시작</option><option value="growing">기초를 익힌 뒤</option><option value="advanced">완성·게시 단계</option>
                </select>
              </label>
              <details className="learn-filter-more" open={secondaryFilterCount > 0 || undefined}>
                <summary>필터 더 보기{secondaryFilterCount > 0 ? ` · ${secondaryFilterCount}개 적용` : ""}</summary>
                <div className="learn-filter-more-grid">
                  <label htmlFor="learn-duration-filter">소요 시간
                    <select id="learn-duration-filter" value={duration} onChange={(event) => setFilter("duration", event.currentTarget.value)}>
                      <option value="all">전체 시간</option><option value="quick">12분 이하</option><option value="standard">13–16분</option><option value="deep">17분 이상</option>
                    </select>
                  </label>
                  <label htmlFor="learn-status-filter">진행 상태
                    <select id="learn-status-filter" value={status} onChange={(event) => setFilter("status", event.currentTarget.value)}>
                      <option value="all">전체 상태</option><option value="not-started">시작 전</option><option value="in-progress">학습 중</option><option value="completed">완료</option>
                    </select>
                  </label>
                  <label htmlFor="learn-skill-filter">핵심 역량
                    <select id="learn-skill-filter" value={skill} onChange={(event) => setFilter("skill", event.currentTarget.value)}>
                      <option value="all">전체 역량</option>{SKILLS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </label>
                  <label htmlFor="learn-sort">정렬
                    <select id="learn-sort" value={sort} onChange={(event) => setFilter("sort", event.currentTarget.value)}>
                      <option value="recommended">내 목표 추천순</option><option value="sequence">제작 순서</option><option value="shortest">짧은 강좌순</option>
                    </select>
                  </label>
                </div>
              </details>
            </div>
            <div className="learn-library-result-row">
              <p className="learn-small" role="status">검색 결과 {filteredLessons.length}개</p>
              {hasLibraryFilters && <button type="button" onClick={resetFilters}>필터 초기화</button>}
            </div>
            {filteredLessons.length ? (
              <>
                <div className="learn-card-grid">
                  {filteredLessons.slice(0, library.visible).map((lesson) => <LessonLibraryCard key={lesson.id} lesson={lesson} store={store} index={LESSONS.indexOf(lesson)} />)}
                </div>
                <SiteShowMoreButton remaining={library.remaining} onClick={() => library.showMore()} label={`강좌 더 보기 · ${library.remaining}개 남음`} />
              </>
            ) : (
              <div className="learn-empty"><h3>조건에 맞는 강좌가 없습니다.</h3><p>검색어나 필터를 바꾸어 보세요.</p><button type="button" onClick={resetFilters}>전체 강좌 보기</button></div>
            )}
          </section>
        </SiteTabPanel>

        <SiteTabPanel idPrefix={LEARN_TAB_PREFIX} id="skills" active={activeTab === "skills"} mounted={isMounted("skills")} className="learn-hub-panel">
          <section className="learn-skill-section" aria-labelledby="learn-skills-title">
            <div className="learn-section-heading">
              <div><p className="learn-eyebrow">SKILL MAP</p><h2 id="learn-skills-title">완료한 강좌로 보는 나의 제작 경험</h2></div>
              <p className="learn-small">숙련도 평가가 아니라 관련 강좌의 완료 비율입니다.</p>
            </div>
            <div className="learn-skill-grid">
              {skillProgress.map((item) => (
                <SkillCard key={item.id} skill={item} store={store} onBrowse={browseSkill} />
              ))}
            </div>
          </section>
        </SiteTabPanel>
      </section>

      <section className="learn-next-steps" aria-labelledby="learn-next-steps-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">NEXT STEPS</p><h2 id="learn-next-steps-title">배운 것을 자료와 작업으로 잇기</h2></div>
          <p className="learn-small">학습 → 자료 찾기 → 실제 작업 순서로 이어집니다.</p>
        </div>
        <SiteRail label="학습 다음 단계" columns="sm:grid-cols-2 xl:grid-cols-3">
          {LEARN_NEXT_STEPS.map((step) => (
            <SiteLinkCard
              key={step.href}
              href={step.href === "/learn/resources" ? `/learn/resources?role=${profile.role}` : step.href}
              icon={step.icon}
              title={step.title}
              description={step.description}
              cta="열기"
              className="w-full"
            />
          ))}
        </SiteRail>
      </section>

      <footer className="learn-local-footer">
        <p>한국어 학습 콘텐츠 · 로그인 없이 이용 가능 · 학습 기록과 목표 설정은 현재 브라우저에만 저장됩니다.</p>
        <p>완료 표시는 자기주도 점검 기록이며 공인 수료증, 작품 심사 또는 자동 품질 평가가 아닙니다.</p>
        {confirmReset ? (
          <div className="learn-actions" role="group" aria-label="학습 기록 초기화 확인">
            <p>이 브라우저의 학습 완료 기록·메모·저장한 용어를 모두 지울까요?</p>
            <button type="button" onClick={() => { store.reset(); setConfirmReset(false); }}>모두 지우기</button>
            <button type="button" onClick={() => setConfirmReset(false)}>취소</button>
          </div>
        ) : <button type="button" onClick={() => setConfirmReset(true)}>학습 기록 초기화…</button>}
      </footer>
    </PageIntro>
  );
}

export function LearningPathPage({ pathId }: { pathId: string }) {
  const store = useLearningProgress();
  const path = LEARNING_PATHS.find((candidate) => candidate.id === pathId);
  const lessons = path ? getPathLessons(path) : [];
  const stats = path ? getPathStats(path, store.progress) : null;
  const nextLesson = lessons.find((lesson) => getLessonState(store.progress, lesson.id) !== "completed") ?? lessons[0];

  useEffect(() => { document.title = `${path?.title ?? "학습 경로"} · 툰스튜디오`; }, [path?.title]);

  if (!path || !stats || !nextLesson) {
    return (
      <div className="learn-page learn-path-page" lang="ko">
        <section className="learn-empty"><h1>학습 경로를 찾을 수 없습니다.</h1><p>주소가 변경되었거나 존재하지 않는 경로입니다.</p><Link className="learn-primary" to="/learn#learning-paths">학습 경로 보기</Link></section>
      </div>
    );
  }

  return (
    <div className="learn-page learn-path-page" lang="ko">
      {store.warning && <p className="learn-caution" role="status">{store.warning}</p>}
      <header className="learn-path-hero">
        <div>
          <Link className="learn-back" to="/learn#learning-paths">← 모든 학습 경로</Link>
          <p className="learn-eyebrow">GUIDED LEARNING PATH · {LEVEL_LABELS[path.level]}</p>
          <h1>{path.title}</h1>
          <p className="learn-intro">{path.summary}</p>
          <div className="learn-actions"><Link className="learn-primary" to={lessonUrl(nextLesson.id)}>{stats.completed ? "이어서 학습하기" : "경로 시작하기"} →</Link><Link className="learn-secondary" to="/learn#learn-library">전체 강좌 보기</Link></div>
        </div>
        <aside className="learn-path-hero-card" aria-label="경로 진행 현황">
          <span>경로 결과물</span><strong>{path.outcome}</strong>
          <div><span>완료 {stats.completed}/{stats.total}</span><span>{stats.percent}%</span></div>
          <progress value={stats.completed} max={Math.max(stats.total, 1)} aria-label={`${path.title} 완료율`} />
          <p>총 약 {stats.totalMinutes}분 · 남은 강좌 약 {stats.remainingMinutes}분</p>
        </aside>
      </header>

      <div className="learn-path-detail-layout">
        <section aria-labelledby="learn-path-course-title">
          <div className="learn-section-heading"><div><p className="learn-eyebrow">STEP BY STEP</p><h2 id="learn-path-course-title">결과물을 쌓는 순서</h2></div><p className="learn-small">완료 조건은 각 강좌의 실습 체크리스트와 확인 퀴즈입니다.</p></div>
          <ol className="learn-path-course-list">
            {lessons.map((lesson, index) => {
              const meta = getLessonMeta(lesson.id);
              const state = getLessonState(store.progress, lesson.id);
              return (
                <li key={lesson.id} className={`is-${state}`}>
                  <span className="learn-path-step">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="learn-card-chips"><span>{STATUS_LABELS[state]}</span><span>{LEVEL_LABELS[meta.level]}</span><span>약 {lesson.minutes}분</span></div>
                    <h3><Link to={lessonUrl(lesson.id)}>{lesson.title}</Link></h3>
                    <p>{lesson.summary}</p>
                    <strong>결과물 · {meta.outcome}</strong>
                  </div>
                  <Link to={lessonUrl(lesson.id)}>{state === "completed" ? "복습" : state === "in-progress" ? "계속" : "시작"} →</Link>
                </li>
              );
            })}
          </ol>
        </section>
        <aside className="learn-path-side">
          <section><p className="learn-eyebrow">NEXT STEP</p><h2>{nextLesson.title}</h2><p>{getLessonMeta(nextLesson.id).outcome}</p><Link className="learn-primary" to={lessonUrl(nextLesson.id)}>다음 강좌 열기 →</Link></section>
          <section><h2>이 경로가 다루는 역량</h2><div className="learn-card-skills">{[...new Set(lessons.flatMap((lesson) => getLessonMeta(lesson.id).skills))].map((skillId) => <span key={skillId}>{SKILLS.find((skill) => skill.id === skillId)?.label}</span>)}</div></section>
          <section><h2>기억할 점</h2><p>경로는 권장 순서입니다. 이미 아는 강좌는 건너뛰고, 필요한 강좌만 골라 학습해도 기록은 정상적으로 저장됩니다.</p></section>
        </aside>
      </div>

      <section className="learn-banner"><div><p className="learn-eyebrow">LEARN BY MAKING</p><h2>설명보다 결과물로 확인하세요.</h2><p>각 강좌의 체크리스트는 스스로 작업을 검수하기 위한 도구입니다. 자동 채점이나 작품 품질 인증으로 사용하지 않습니다.</p></div><Link className="learn-secondary" to="/learn/records">내 학습 기록 보기 →</Link></section>
      <footer className="learn-local-footer"><p>학습 경로와 진행률은 현재 브라우저에서 계산됩니다. 계정·다른 기기로 자동 동기화되지 않습니다.</p></footer>
    </div>
  );
}
