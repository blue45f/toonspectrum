import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

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

function LearningNavigation({ active }: { active: "home" | "paths" }) {
  return (
    <nav className="learn-navigation" aria-label="웹툰 학습">
      <Link to="/learn" aria-current={active === "home" ? "page" : undefined}>학습 홈</Link>
      <Link to="/learn#learning-paths" aria-current={active === "paths" ? "page" : undefined}>학습 경로</Link>
      <Link to="/learn/resources">강좌·자료</Link>
      <Link to="/learn/classroom">Classroom</Link>
      <Link to="/learn/glossary">용어 사전</Link>
      <Link to="/learn/studio">툰스튜디오 실습</Link>
    </nav>
  );
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
    <article className={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "learn-card learn-library-card{v0}"), { v0: String(state === "completed" ? " is-complete" : "") })}>
      <div className="learn-card-top">
        <span className="learn-number">{String(index + 1).padStart(2, "0")}</span>
        <span className={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "learn-status learn-status-{v0}"), { v0: String(state) })}>{STATUS_LABELS[state]}</span>
      </div>
      <div className="learn-card-chips" aria-label={translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "강좌 정보")}>
        <span>{lesson.track === "studio" ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "툰스튜디오 실습") : translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "제작 기초")}</span>
        <span>{LEVEL_LABELS[meta.level]}</span>
        <span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "약 ")}{lesson.minutes}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분")}</span>
      </div>
      <h3><Link to={lessonUrl(lesson.id)}>{lesson.title}</Link></h3>
      <p>{lesson.summary}</p>
      <div className="learn-card-outcome"><strong>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "완성할 것")}</strong><span>{meta.outcome}</span></div>
      <div className="learn-card-skills" aria-label={translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "관련 역량")}>
        {meta.skills.map((skillId) => <span key={skillId}>{SKILLS.find((skill) => skill.id === skillId)?.label}</span>)}
      </div>
      {state !== "not-started" && (
        <div className="learn-card-progress">
          <span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "자가 점검 진행 ")}{progress}%</span>
          <progress value={progress} max={100} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "{v0} 자가 점검 진행률"), { v0: String(lesson.title) })} />
        </div>
      )}
      <div className="learn-card-bottom">
        <span>{meta.format === "studio-practice" ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "작업 화면에서 따라 하기") : translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "설명 · 조작형 예제 · 실습")}</span>
        <Link to={lessonUrl(lesson.id)} aria-label={`${lesson.title} ${state === "completed" ? "복습" : state === "in-progress" ? "계속 학습" : "시작"}`}>
          {state === "completed" ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "복습하기") : state === "in-progress" ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "계속하기") : translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "배우기")} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

function PathCard({ path, store, recommended }: { path: LearningPath; store: LearningStore; recommended: boolean }) {
  const stats = getPathStats(path, store.progress);
  return (
    <article className={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "learn-path-card{v0}"), { v0: String(recommended ? " is-recommended" : "") })}>
      <div className="learn-path-card-top">
        <span className="learn-path-index">{String(LEARNING_PATHS.indexOf(path) + 1).padStart(2, "0")}</span>
        {recommended && <span className="learn-recommended-label">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "내 추천 경로")}</span>}
      </div>
      <p className="learn-eyebrow">{LEVEL_LABELS[path.level]} · {path.lessonIds.length}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "개 강좌")}</p>
      <h3><Link to={pathUrl(path.id)}>{path.title}</Link></h3>
      <p>{path.summary}</p>
      <div className="learn-path-outcome"><strong>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "경로 결과물")}</strong><span>{path.outcome}</span></div>
      <div className="learn-path-progress">
        <div><span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "완료 ")}{stats.completed}/{stats.total}</span><span>{stats.percent}%</span></div>
        <progress value={stats.completed} max={Math.max(stats.total, 1)} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "{v0} 완료율"), { v0: String(path.title) })} />
      </div>
      <div className="learn-path-card-bottom">
        <span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "총 약 ")}{stats.totalMinutes}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분")}{stats.remainingMinutes < stats.totalMinutes ? formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", " · 남은 {v0}분"), { v0: String(stats.remainingMinutes) }) : ""}</span>
        <Link to={pathUrl(path.id)}>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "경로 보기 →")}</Link>
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

export function LearningHome() {
  const store = useLearningProgress();
  const [params, setParams] = useSearchParams();
  const [profile, setProfile] = useState<LearningProfile>(() => loadLearningProfile(browserStorage()));
  const [profileWarning, setProfileWarning] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => { document.title = "배우기 · 툰스튜디오"; }, []);

  const recommendedPath = recommendLearningPath(profile.goal, profile.level);
  const recommendedStats = getPathStats(recommendedPath, store.progress);
  const sessionLessons = buildSessionPlan(recommendedPath, store.progress, profile.sessionMinutes);
  const nextLesson = sessionLessons[0] ?? LESSONS[0];
  const completedCount = LESSONS.filter((lesson) => getLessonState(store.progress, lesson.id) === "completed").length;
  const overallPercent = Math.round((completedCount / Math.max(LESSONS.length, 1)) * 100);
  const totalMinutes = LESSONS.reduce((sum, lesson) => sum + lesson.minutes, 0);
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

  function updateProfile(next: LearningProfile) {
    setProfile(next);
    setProfileWarning(saveLearningProfile(browserStorage(), next) ? "" : "학습 목표를 기기에 저장하지 못했습니다. 현재 화면에서는 계속 사용할 수 있습니다.");
  }

  function setFilter(key: string, value: string, replace = false) {
    setParams(updateSearchParam(params, key, value), { replace });
  }

  return (
    <div className="learn-page learn-home-page" lang="ko">
      <a className="learn-skip-link" href="#learn-library">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "전체 강좌로 건너뛰기")}</a>
      <LearningNavigation active="home" />
      {store.warning && <p className="learn-caution" role="status">{store.warning}</p>}

      <header className="learn-hub-hero">
        <div className="learn-hub-hero-copy">
          <p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "TOONSTUDIO / ARTIST CLASSROOM")}</p>
          <h1>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "상상하던 장면이,")}<br />{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "내 손끝의 실력으로.")}</h1>
          <p className="learn-intro">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "웹툰 콘티의 첫 선부터 빛과 색, 원고의 마무리까지. 전문 웹툰 드로잉 도구를 내 작업에 맞게 익히고, 매 수업마다 작은 결과물을 완성해 보세요.")}</p>
          <div className="learn-actions">
            <Link className="learn-primary" to={lessonUrl(nextLesson.id)}>
              {recommendedStats.started ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "추천 경로 이어서 학습") : translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "내 추천 경로 시작")} <span aria-hidden="true">→</span>
            </Link>
            <a className="learn-secondary" href="#learn-plan">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "학습 설정 바꾸기")}</a>
          </div>
          <p className="learn-small">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "로그인 없이 시작 · 완료 기록과 메모는 현재 브라우저에 저장")}</p>
        </div>
        <figure className="learn-hero-art"><img src="/brand/atelier-world.webp" alt={translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "배경과 인물, 빛과 색이 어우러진 상상 속 항구 도시 콘셉트 아트")} width={1536} height={1024} fetchPriority="high" /><figcaption><span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "YOUR NEXT SCENE")}</span><strong>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "관찰하고. 익히고. 그려보세요.")}</strong><span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "ToonStudio 콘셉트 아트")}</span></figcaption></figure>
      </header>

        <aside className="learn-dashboard-card learn-dashboard-overview" aria-label={translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "내 학습 현황")}>
          <div className="learn-dashboard-heading">
            <div><span className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "MY LEARNING")}</span><h2>{recommendedPath.title}</h2></div>
            <strong aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "전체 강좌 {v0}% 완료"), { v0: String(overallPercent) })}>{overallPercent}%</strong>
          </div>
          <progress value={completedCount} max={Math.max(LESSONS.length, 1)} aria-label={translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "전체 강좌 완료율")} />
          <dl className="learn-dashboard-stats">
            <div><dt>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "완료 강좌")}</dt><dd>{completedCount}/{LESSONS.length}</dd></div>
            <div><dt>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "저장한 용어")}</dt><dd>{store.progress.bookmarks.length}</dd></div>
            <div><dt>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "다음 세션")}</dt><dd>{sessionLessons.reduce((sum, lesson) => sum + lesson.minutes, 0)}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분")}</dd></div>
          </dl>
          <div className="learn-dashboard-next">
            <span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "다음에 만들 것")}</span>
            <strong>{getLessonMeta(nextLesson.id).outcome}</strong>
            <Link to={lessonUrl(nextLesson.id)}>{nextLesson.title} →</Link>
          </div>
        </aside>

      <LearningProcessStudy />

      <section className="learn-hub-facts" aria-label={translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "학습 콘텐츠 요약")}>
        <div><strong>{LEARNING_PATHS.length}</strong><span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "목표별 학습 경로")}</span></div>
        <div><strong>{LESSONS.length}</strong><span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "실습형 강좌")}</span></div>
        <div><strong>{new Set(LESSONS.map((lesson) => lesson.lab)).size}</strong><span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "조작형 예제")}</span></div>
        <div><strong>{TERMS.length}</strong><span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "웹툰 핵심 용어")}</span></div>
        <div><strong>{totalMinutes}</strong><span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분량 · 실습 별도")}</span></div>
      </section>

      <section id="learn-plan" className="learn-plan-section" aria-labelledby="learn-plan-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "PERSONAL LEARNING PLAN")}</p><h2 id="learn-plan-title">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "오늘 무엇을 만들지부터 정하세요.")}</h2></div>
          <p className="learn-small">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "설정은 이 브라우저에만 저장되며 언제든 바꿀 수 있습니다.")}</p>
        </div>
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
            <label htmlFor="learn-level">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "현재 경험")}<select id="learn-level" value={profile.level} onChange={(event) => {
                const value = event.currentTarget.value as LearningLevel;
                updateProfile({ ...profile, level: LEARNING_LEVELS.includes(value) ? value : DEFAULT_LEARNING_PROFILE.level });
              }}>
                <option value="starter">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "처음 시작하거나 기본부터 다시")}</option>
                <option value="growing">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "기초 제작 경험이 있음")}</option>
                <option value="advanced">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "한 회차를 완성·게시해 본 적 있음")}</option>
              </select>
            </label>
            <label htmlFor="learn-session-minutes">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "한 번에 집중할 시간")}<select id="learn-session-minutes" value={profile.sessionMinutes} onChange={(event) => {
                const value = Number(event.currentTarget.value) as SessionMinutes;
                updateProfile({ ...profile, sessionMinutes: SESSION_MINUTES.includes(value) ? value : DEFAULT_LEARNING_PROFILE.sessionMinutes });
              }}>
                {SESSION_MINUTES.map((minutes) => <option key={minutes} value={minutes}>{minutes}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분")}</option>)}
              </select>
            </label>
            {profileWarning && <p className="learn-caption" role="status">{profileWarning}</p>}
          </div>
          <article className="learn-plan-result">
            <span className="learn-recommended-label">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "추천 경로")}</span>
            <h3>{recommendedPath.title}</h3>
            <p>{recommendedPath.summary}</p>
            <div className="learn-plan-result-meta">
              <span>{recommendedPath.lessonIds.length}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "개 강좌")}</span>
              <span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "총 약 ")}{recommendedStats.totalMinutes}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분")}</span>
              <span>{LEVEL_LABELS[recommendedPath.level]}</span>
            </div>
            <p><strong>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "완성 목표")}</strong><br />{recommendedPath.outcome}</p>
            <Link className="learn-secondary" to={pathUrl(recommendedPath.id)}>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "추천 경로 자세히 보기 →")}</Link>
          </article>
        </div>
      </section>

      <section id="learning-paths" aria-labelledby="learning-paths-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "GUIDED PATHS")}</p><h2 id="learning-paths-title">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "목표까지 길을 잃지 않는 학습 경로")}</h2></div>
          <p className="learn-small">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "강좌를 건너뛰어도 막지 않으며, 필요한 부분만 골라 학습할 수 있습니다.")}</p>
        </div>
        <div className="learn-path-grid">
          {LEARNING_PATHS.map((path) => <PathCard key={path.id} path={path} store={store} recommended={path.id === recommendedPath.id} />)}
        </div>
      </section>

      <section className="learn-session-section" aria-labelledby="learn-session-title">
        <div className="learn-session-heading">
          <div><p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "YOUR NEXT SESSION")}</p><h2 id="learn-session-title">{profile.sessionMinutes}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분 안에 이어갈 학습")}</h2></div>
          <span>{recommendedStats.completed === recommendedStats.total ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "경로를 완료해 복습 강좌를 제안합니다.") : formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "추천 경로의 남은 시간 약 {v0}분"), { v0: String(recommendedStats.remainingMinutes) })}</span>
        </div>
        <ol className="learn-session-list">
          {sessionLessons.map((lesson, index) => {
            const state = getLessonState(store.progress, lesson.id);
            return (
              <li key={lesson.id}>
                <span className="learn-session-number">{index + 1}</span>
                <div><span>{STATUS_LABELS[state]} {translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "· 약 ")}{lesson.minutes}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분")}</span><h3>{lesson.title}</h3><p>{getLessonMeta(lesson.id).outcome}</p></div>
                <Link to={lessonUrl(lesson.id)}>{state === "completed" ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "복습") : state === "in-progress" ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "계속") : translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "시작")} →</Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="learn-skill-section" aria-labelledby="learn-skills-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "SKILL MAP")}</p><h2 id="learn-skills-title">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "완료한 강좌로 보는 나의 제작 경험")}</h2></div>
          <p className="learn-small">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "숙련도 평가가 아니라 관련 강좌의 완료 비율입니다.")}</p>
        </div>
        <div className="learn-skill-grid">
          {skillProgress.map((skill) => (
            <article key={skill.id}>
              <div><h3>{skill.label}</h3><strong>{skill.completed}/{skill.total}</strong></div>
              <p>{skill.description}</p>
              <progress value={skill.completed} max={Math.max(skill.total, 1)} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "{v0} 관련 강좌 완료율"), { v0: String(skill.label) })} />
              <button type="button" onClick={() => {
                setFilter("skill", skill.id);
                document.querySelector("#learn-library")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
              }}>{skill.label} {translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "강좌 보기")}</button>
            </article>
          ))}
        </div>
      </section>

      <section id="learn-library" className="learn-library-section" aria-labelledby="learn-library-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "COURSE LIBRARY")}</p><h2 id="learn-library-title">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "필요한 수업을 바로 찾는 전체 강좌")}</h2></div>
          <p className="learn-small">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "추천 순서는 선택한 목표를 반영합니다.")}</p>
        </div>
        <div className="learn-library-filters">
          <label className="learn-search-label" htmlFor="learn-course-search">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "강좌 검색")}<input id="learn-course-search" type="search" maxLength={200} value={query} placeholder={translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "콘티, 채색, 말풍선…")} onChange={(event) => setFilter("q", event.currentTarget.value, true)} />
          </label>
          <label htmlFor="learn-track-filter">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "학습 과정")}<select id="learn-track-filter" value={track} onChange={(event) => setFilter("track", event.currentTarget.value)}>
              <option value="all">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "전체 과정")}</option><option value="foundation">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "제작 기초")}</option><option value="studio">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "툰스튜디오 실습")}</option>
            </select>
          </label>
          <label htmlFor="learn-level-filter">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "난이도")}<select id="learn-level-filter" value={level} onChange={(event) => setFilter("level", event.currentTarget.value)}>
              <option value="all">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "전체 난이도")}</option><option value="starter">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "처음 시작")}</option><option value="growing">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "기초를 익힌 뒤")}</option><option value="advanced">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "완성·게시 단계")}</option>
            </select>
          </label>
          <label htmlFor="learn-duration-filter">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "소요 시간")}<select id="learn-duration-filter" value={duration} onChange={(event) => setFilter("duration", event.currentTarget.value)}>
              <option value="all">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "전체 시간")}</option><option value="quick">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "12분 이하")}</option><option value="standard">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "13–16분")}</option><option value="deep">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "17분 이상")}</option>
            </select>
          </label>
          <label htmlFor="learn-status-filter">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "진행 상태")}<select id="learn-status-filter" value={status} onChange={(event) => setFilter("status", event.currentTarget.value)}>
              <option value="all">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "전체 상태")}</option><option value="not-started">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "시작 전")}</option><option value="in-progress">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "학습 중")}</option><option value="completed">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "완료")}</option>
            </select>
          </label>
          <label htmlFor="learn-skill-filter">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "핵심 역량")}<select id="learn-skill-filter" value={skill} onChange={(event) => setFilter("skill", event.currentTarget.value)}>
              <option value="all">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "전체 역량")}</option>{SKILLS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label htmlFor="learn-sort">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "정렬")}<select id="learn-sort" value={sort} onChange={(event) => setFilter("sort", event.currentTarget.value)}>
              <option value="recommended">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "내 목표 추천순")}</option><option value="sequence">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "제작 순서")}</option><option value="shortest">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "짧은 강좌순")}</option>
            </select>
          </label>
        </div>
        <div className="learn-library-result-row">
          <p className="learn-small" role="status">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "검색 결과 ")}{filteredLessons.length}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "개")}</p>
          {params.size > 0 && <button type="button" onClick={() => setParams({})}>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "필터 초기화")}</button>}
        </div>
        {filteredLessons.length ? (
          <div className="learn-card-grid">
            {filteredLessons.map((lesson) => <LessonLibraryCard key={lesson.id} lesson={lesson} store={store} index={LESSONS.indexOf(lesson)} />)}
          </div>
        ) : (
          <div className="learn-empty"><h3>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "조건에 맞는 강좌가 없습니다.")}</h3><p>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "검색어나 필터를 바꾸어 보세요.")}</p><button type="button" onClick={() => setParams({})}>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "전체 강좌 보기")}</button></div>
        )}
      </section>

      <section className="learn-resource-grid" aria-label="학습 도구">
        <article><span className="learn-eyebrow">RESOURCE HUB</span><h2>외부 강좌까지 한 번에 찾기</h2><p>공식·공공 교육 자료와 자체 실습 강좌를 직군과 제작 단계별로 모아봅니다.</p><Link to={`/learn/resources?role=${profile.role}`}>내 역할에 맞는 자료 →</Link></article>
        <article><span className="learn-eyebrow">CLASSROOM</span><h2>교육기관용 수업 설계</h2><p>주차별 커리큘럼에 강좌·자료·실습 과제를 묶고 수업 계획을 저장합니다.</p><Link to="/learn/classroom">Classroom 열기 →</Link></article>
        <article><span className="learn-eyebrow">GLOSSARY</span><h2>낯선 용어를 바로 찾기</h2><p>한국어·영문·다른 이름으로 36개 핵심 용어를 검색하고 저장합니다.</p><Link to="/learn/glossary">용어 사전 열기 →</Link></article>
        <article><span className="learn-eyebrow">PRACTICE</span><h2>작업 화면에서 직접 해보기</h2><p>기존 작업을 바꾸지 않는 자기주도 툰스튜디오 실습으로 연결합니다.</p><Link to="/learn/studio">실습 과정 보기 →</Link></article>
        <article><span className="learn-eyebrow">RECORDS</span><h2>메모와 완료 기록 지키기</h2><p>현재 브라우저의 학습 기록을 점검하고 파일로 백업하거나 복원합니다.</p><Link to="/learn/records">학습 기록 관리 →</Link></article>
        <article><span className="learn-eyebrow">RESOURCE HUB</span><h2>외부 강좌와 공식 자료 함께 찾기</h2><p>에듀코카, WEBTOON Academy, 공식 제작 팁과 YouTube 탐색 링크를 주제별로 모았습니다.</p><Link to="/learn/resources">교육 자료 허브 →</Link></article>
        <article><span className="learn-eyebrow">CLASSROOM</span><h2>교육기관용 수업 흐름 보기</h2><p>10주 기본 커리큘럼과 직군별 학습 축을 실제 강좌·Studio 실습에 연결합니다.</p><Link to="/learn/classroom">교육기관 활용 →</Link></article>
      </section>

      <footer className="learn-local-footer">
        <p>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "한국어 학습 콘텐츠 · 로그인 없이 이용 가능 · 학습 기록과 목표 설정은 현재 브라우저에만 저장됩니다.")}</p>
        <p>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "완료 표시는 자기주도 점검 기록이며 공인 수료증, 작품 심사 또는 자동 품질 평가가 아닙니다.")}</p>
        {confirmReset ? (
          <div className="learn-actions" role="group" aria-label={translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "학습 기록 초기화 확인")}>
            <p>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "이 브라우저의 학습 완료 기록·메모·저장한 용어를 모두 지울까요?")}</p>
            <button type="button" onClick={() => { store.reset(); setConfirmReset(false); }}>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "모두 지우기")}</button>
            <button type="button" onClick={() => setConfirmReset(false)}>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "취소")}</button>
          </div>
        ) : <button type="button" onClick={() => setConfirmReset(true)}>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "학습 기록 초기화…")}</button>}
      </footer>
    </div>
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
        <LearningNavigation active="paths" />
        <section className="learn-empty"><h1>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "학습 경로를 찾을 수 없습니다.")}</h1><p>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "주소가 변경되었거나 존재하지 않는 경로입니다.")}</p><Link className="learn-primary" to="/learn#learning-paths">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "학습 경로 보기")}</Link></section>
      </div>
    );
  }

  return (
    <div className="learn-page learn-path-page" lang="ko">
      <LearningNavigation active="paths" />
      {store.warning && <p className="learn-caution" role="status">{store.warning}</p>}
      <header className="learn-path-hero">
        <div>
          <Link className="learn-back" to="/learn#learning-paths">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "← 모든 학습 경로")}</Link>
          <p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "GUIDED LEARNING PATH · ")}{LEVEL_LABELS[path.level]}</p>
          <h1>{path.title}</h1>
          <p className="learn-intro">{path.summary}</p>
          <div className="learn-actions"><Link className="learn-primary" to={lessonUrl(nextLesson.id)}>{stats.completed ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "이어서 학습하기") : translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "경로 시작하기")} →</Link><Link className="learn-secondary" to="/learn#learn-library">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "전체 강좌 보기")}</Link></div>
        </div>
        <aside className="learn-path-hero-card" aria-label={translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "경로 진행 현황")}>
          <span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "경로 결과물")}</span><strong>{path.outcome}</strong>
          <div><span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "완료 ")}{stats.completed}/{stats.total}</span><span>{stats.percent}%</span></div>
          <progress value={stats.completed} max={Math.max(stats.total, 1)} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "{v0} 완료율"), { v0: String(path.title) })} />
          <p>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "총 약 ")}{stats.totalMinutes}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분 · 남은 강좌 약 ")}{stats.remainingMinutes}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분")}</p>
        </aside>
      </header>

      <div className="learn-path-detail-layout">
        <section aria-labelledby="learn-path-course-title">
          <div className="learn-section-heading"><div><p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "STEP BY STEP")}</p><h2 id="learn-path-course-title">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "결과물을 쌓는 순서")}</h2></div><p className="learn-small">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "완료 조건은 각 강좌의 실습 체크리스트와 확인 퀴즈입니다.")}</p></div>
          <ol className="learn-path-course-list">
            {lessons.map((lesson, index) => {
              const meta = getLessonMeta(lesson.id);
              const state = getLessonState(store.progress, lesson.id);
              return (
                <li key={lesson.id} className={formatI18nTemplate(translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "is-{v0}"), { v0: String(state) })}>
                  <span className="learn-path-step">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="learn-card-chips"><span>{STATUS_LABELS[state]}</span><span>{LEVEL_LABELS[meta.level]}</span><span>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "약 ")}{lesson.minutes}{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "분")}</span></div>
                    <h3><Link to={lessonUrl(lesson.id)}>{lesson.title}</Link></h3>
                    <p>{lesson.summary}</p>
                    <strong>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "결과물 · ")}{meta.outcome}</strong>
                  </div>
                  <Link to={lessonUrl(lesson.id)}>{state === "completed" ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "복습") : state === "in-progress" ? translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "계속") : translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "시작")} →</Link>
                </li>
              );
            })}
          </ol>
        </section>
        <aside className="learn-path-side">
          <section><p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "NEXT STEP")}</p><h2>{nextLesson.title}</h2><p>{getLessonMeta(nextLesson.id).outcome}</p><Link className="learn-primary" to={lessonUrl(nextLesson.id)}>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "다음 강좌 열기 →")}</Link></section>
          <section><h2>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "이 경로가 다루는 역량")}</h2><div className="learn-card-skills">{[...new Set(lessons.flatMap((lesson) => getLessonMeta(lesson.id).skills))].map((skillId) => <span key={skillId}>{SKILLS.find((skill) => skill.id === skillId)?.label}</span>)}</div></section>
          <section><h2>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "기억할 점")}</h2><p>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "경로는 권장 순서입니다. 이미 아는 강좌는 건너뛰고, 필요한 강좌만 골라 학습해도 기록은 정상적으로 저장됩니다.")}</p></section>
        </aside>
      </div>

      <section className="learn-banner"><div><p className="learn-eyebrow">{translateCurrentStaticSourceText("domains.learn.LearningHome", "en", "LEARN BY MAKING")}</p><h2>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "설명보다 결과물로 확인하세요.")}</h2><p>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "각 강좌의 체크리스트는 스스로 작업을 검수하기 위한 도구입니다. 자동 채점이나 작품 품질 인증으로 사용하지 않습니다.")}</p></div><Link className="learn-secondary" to="/learn/records">{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "내 학습 기록 보기 →")}</Link></section>
      <footer className="learn-local-footer"><p>{translateCurrentStaticSourceText("domains.learn.LearningHome", "ko", "학습 경로와 진행률은 현재 브라우저에서 계산됩니다. 계정·다른 기기로 자동 동기화되지 않습니다.")}</p></footer>
    </div>
  );
}
