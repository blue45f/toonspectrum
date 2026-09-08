import { useEffect, useId, useState } from "react";
import { Link, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";

import { LESSONS, READINGS, TERMS } from "./learning-content";
import {
  filterAndSortLessons,
  learningStats,
  lessonCompletionPercent,
  lessonStatus,
  nextLesson as findNextLesson,
  type LearningDuration,
  type LearningSort,
  type LearningStatus,
} from "./learning-dashboard";
import { canComplete, EMPTY_LESSON, type Lesson } from "./learning-model";
import { LessonLab } from "./LessonLab";
import { useLearningProgress, type LearningStore } from "./use-learning-progress";

import "./learning.css";

const lessonUrl = (id: string) => `/learn/lessons/${encodeURIComponent(id)}`;
const termUrl = (id: string) => `/learn/glossary?term=${encodeURIComponent(id)}`;

const TRACK_LABELS: Record<Lesson["track"], string> = {
  foundation: "제작 기초",
  studio: "툰스튜디오 실습",
};
const STATUS_LABELS: Record<Exclude<LearningStatus, "all">, string> = {
  "not-started": "시작 전",
  "in-progress": "학습 중",
  completed: "완료",
};
const LAB_LABELS: Record<Lesson["lab"], string> = {
  pacing: "컷 호흡 실험",
  perspective: "투시 조절",
  strokes: "선화 비교",
  layers: "레이어 실험",
  lettering: "말풍선 조절",
  values: "명도 비교",
};

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `약 ${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `약 ${hours}시간 ${rest}분` : `약 ${hours}시간`;
}

function ProgressRing({ value, label, compact = false }: { value: number; label: string; compact?: boolean }) {
  const normalized = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className={`learn-progress-ring${compact ? " is-compact" : ""}`} role="img" aria-label={`${label} ${normalized}%`}>
      <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <circle className="learn-progress-ring-track" cx="22" cy="22" r="18" pathLength="100" />
        <circle className="learn-progress-ring-value" cx="22" cy="22" r="18" pathLength="100" strokeDasharray={`${normalized} ${100 - normalized}`} />
      </svg>
      <strong>{normalized}<span>%</span></strong>
    </div>
  );
}

function LessonCard({ lesson, store, index }: { lesson: Lesson; store: LearningStore; index: number }) {
  const status = lessonStatus(lesson, store.progress);
  const percent = lessonCompletionPercent(lesson, store.progress);
  const action = status === "completed" ? "복습하기" : status === "in-progress" ? "이어서 배우기" : "배우기";
  return (
    <article className="learn-card" data-status={status}>
      <div className="learn-card-top">
        <span className="learn-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <span className="learn-status-chip" data-status={status}>{STATUS_LABELS[status]}</span>
      </div>
      <div className="learn-card-meta" aria-label="강좌 정보">
        <span>{TRACK_LABELS[lesson.track]}</span><span>{formatMinutes(lesson.minutes)}</span><span>{LAB_LABELS[lesson.lab]}</span>
      </div>
      <h3><Link to={lessonUrl(lesson.id)}>{lesson.title}</Link></h3>
      <p>{lesson.summary}</p>
      <div className="learn-card-progress">
        <span>진행률 {percent}%</span>
        <progress aria-label={`${lesson.title} 진행률`} value={percent} max={100} />
      </div>
      <div className="learn-card-bottom">
        <span>{lesson.sections.length}개 개념 · 실습 · 퀴즈</span>
        <Link to={lessonUrl(lesson.id)} aria-label={`${lesson.title} ${action}`}>{action} <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}

function Curriculum({ store }: { store: LearningStore }) {
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").slice(0, 200);
  const trackParam = params.get("track");
  const track: "all" | Lesson["track"] = trackParam === "foundation" || trackParam === "studio" ? trackParam : "all";
  const statusParam = params.get("status");
  const status: LearningStatus = statusParam === "not-started" || statusParam === "in-progress" || statusParam === "completed" ? statusParam : "all";
  const durationParam = params.get("duration");
  const duration: LearningDuration = durationParam === "quick" || durationParam === "standard" || durationParam === "deep" ? durationParam : "all";
  const sortParam = params.get("sort");
  const sort: LearningSort = sortParam === "recommended" || sortParam === "shortest" ? sortParam : "curriculum";
  const termNames = Object.fromEntries(TERMS.map((term) => [term.id, `${term.name} ${term.english} ${term.aliases.join(" ")}`])) as Record<string, string>;
  const filtered = filterAndSortLessons(LESSONS, store.progress, { query, track, status, duration, sort }, termNames);
  const stats = learningStats(LESSONS, store.progress);
  const next = findNextLesson(LESSONS, store.progress);
  const nextStatus = next ? lessonStatus(next, store.progress) : "not-started";
  const recommended = filterAndSortLessons(LESSONS, store.progress, {
    query: "",
    track: "all",
    status: "all",
    duration: "all",
    sort: "recommended",
  }, termNames).slice(0, 3);
  const foundationCount = LESSONS.filter((lesson) => lesson.track === "foundation").length;
  const studioCount = LESSONS.length - foundationCount;
  const activeFilterCount = [query, track !== "all", status !== "all", duration !== "all", sort !== "curriculum"].filter(Boolean).length;

  function setFilter(key: "q" | "track" | "status" | "duration" | "sort", value: string, replace = false) {
    const updated = new URLSearchParams(params);
    const defaultValue = value === "" || value === "all" || (key === "sort" && value === "curriculum");
    if (defaultValue) updated.delete(key); else updated.set(key, value);
    setParams(updated, { replace });
  }

  return (
    <>
      <header className="learn-hero learn-dashboard-hero">
        <div className="learn-hero-copy">
          <p className="learn-eyebrow">TOONSTUDIO LEARNING LAB</p>
          <h1>배우는 순간이,<br />다음 컷이 되도록.</h1>
          <p className="learn-intro">이야기 설계부터 선화·채색·말풍선까지. 원리를 짧게 이해하고, 움직이는 예제로 확인한 뒤, 툰스튜디오에서 바로 연습하세요.</p>
          <div className="learn-actions">
            {next && <Link className="learn-primary" to={lessonUrl(next.id)}>{nextStatus === "in-progress" ? "이어서 학습하기" : stats.completed === LESSONS.length ? "다시 복습하기" : "오늘의 수업 시작하기"} <span aria-hidden="true">→</span></Link>}
            <Link className="learn-secondary" to="/learn?duration=quick&sort=shortest">12분 안에 하나 배우기</Link>
          </div>
          <ul className="learn-trust-list" aria-label="학습 방식">
            <li>로그인 없이 시작</li><li>조작형 예제로 비교</li><li>기록은 내 브라우저에 저장</li>
          </ul>
        </div>
        {next && (
          <aside className="learn-continue-card" aria-labelledby="learn-next-heading">
            <div className="learn-continue-top">
              <div><p className="learn-eyebrow">YOUR NEXT PANEL</p><span className="learn-status-chip" data-status={nextStatus}>{STATUS_LABELS[nextStatus]}</span></div>
              <ProgressRing value={lessonCompletionPercent(next, store.progress)} label="추천 강좌 진행률" />
            </div>
            <p className="learn-continue-kicker">{TRACK_LABELS[next.track]} · {formatMinutes(next.minutes)}</p>
            <h2 id="learn-next-heading">{next.title}</h2>
            <p>{next.summary}</p>
            <div className="learn-next-checkpoint">
              <span>이번 수업의 결과물</span>
              <strong>{next.task}</strong>
            </div>
            <Link className="learn-continue-link" to={lessonUrl(next.id)}>{nextStatus === "completed" ? "이 수업 복습하기" : nextStatus === "in-progress" ? "멈춘 곳에서 이어가기" : "수업 살펴보기"} <span aria-hidden="true">↗</span></Link>
          </aside>
        )}
      </header>

      <section className="learn-summary learn-dashboard-summary" aria-label="내 학습 현황">
        <div className="learn-summary-primary">
          <ProgressRing value={stats.completionPercent} label="전체 학습 진도" compact />
          <div><strong>{stats.completed} / {LESSONS.length}</strong><span>완료한 수업</span></div>
        </div>
        <div><strong>{stats.inProgress}</strong><span>진행 중</span></div>
        <div><strong>{store.progress.bookmarks.length}</strong><span>저장한 용어</span></div>
        <div><strong>{formatMinutes(stats.remainingMinutes)}</strong><span>남은 예상 시간</span></div>
        <Link to="/learn/records">기록 백업·복원 <span aria-hidden="true">→</span></Link>
      </section>

      <section className="learn-path-section" aria-labelledby="learn-path-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">CHOOSE YOUR PATH</p><h2 id="learn-path-title">지금 필요한 방식으로 시작하세요</h2></div>
          <p className="learn-small">순서대로 완주하거나, 오늘 필요한 기술만 골라도 됩니다.</p>
        </div>
        <div className="learn-path-grid">
          <article className="learn-path-card is-featured">
            <span className="learn-path-icon" aria-hidden="true">↗</span><p className="learn-eyebrow">QUICK WIN</p>
            <h3>짧게 하나 완성하기</h3><p>12분 이하 수업부터 시작해 바로 적용할 한 가지 원리를 익힙니다.</p>
            <Link to="/learn?duration=quick&sort=shortest">빠른 수업 보기 <span aria-hidden="true">→</span></Link>
          </article>
          <article className="learn-path-card">
            <span className="learn-path-icon" aria-hidden="true">01</span><p className="learn-eyebrow">FOUNDATIONS</p>
            <h3>웹툰 제작 기초</h3><p>콘티·투시·실루엣·선화·채색·레터링을 제작 순서로 익힙니다.</p>
            <Link to="/learn?track=foundation">{foundationCount}개 수업 보기 <span aria-hidden="true">→</span></Link>
          </article>
          <article className="learn-path-card">
            <span className="learn-path-icon" aria-hidden="true">02</span><p className="learn-eyebrow">STUDIO PRACTICE</p>
            <h3>툰스튜디오 따라 하기</h3><p>학습 페이지와 편집기를 나란히 열고 결과물을 직접 만들어 봅니다.</p>
            <Link to="/learn/studio">{studioCount}개 실습 보기 <span aria-hidden="true">→</span></Link>
          </article>
          <article className="learn-path-card">
            <span className="learn-path-icon" aria-hidden="true">Aa</span><p className="learn-eyebrow">GLOSSARY</p>
            <h3>막힌 용어부터 찾기</h3><p>한국어·영문·별칭으로 검색하고 관련 수업에서 개념을 실험합니다.</p>
            <Link to="/learn/glossary">{TERMS.length}개 용어 찾기 <span aria-hidden="true">→</span></Link>
          </article>
        </div>
      </section>

      <section className="learn-recommended" aria-labelledby="learn-recommended-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">RECOMMENDED FOR YOU</p><h2 id="learn-recommended-title">다음 흐름을 놓치지 마세요</h2></div>
          <p className="learn-small">진행 중인 수업을 먼저, 다음 미완료 수업을 그다음에 보여 줍니다.</p>
        </div>
        <div className="learn-recommendation-list">
          {recommended.map((lesson, index) => {
            const lessonState = lessonStatus(lesson, store.progress);
            return (
              <Link key={lesson.id} className="learn-recommendation" to={lessonUrl(lesson.id)}>
                <span className="learn-recommendation-rank">0{index + 1}</span>
                <span><small>{lessonState === "in-progress" ? "계속 학습" : lessonState === "completed" ? "복습 추천" : `${TRACK_LABELS[lesson.track]} · ${formatMinutes(lesson.minutes)}`}</small><strong>{lesson.title}</strong></span>
                <span aria-hidden="true">→</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="learn-curriculum-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">CURRICULUM</p><h2 id="learn-curriculum-title">한 편을 만드는 순서</h2></div>
          <p className="learn-small">설명 → 조작형 예제 → 직접 실습 → 확인 퀴즈</p>
        </div>
        <div className="learn-filter-panel" role="search" aria-label="강좌 찾아보기">
          <label className="learn-search-label" htmlFor="learn-course-search">강좌 검색
            <span className="learn-search-input"><span aria-hidden="true">⌕</span><input id="learn-course-search" type="search" maxLength={200} value={query} placeholder="콘티, 채색, 말풍선, clipping…" onChange={(event) => setFilter("q", event.currentTarget.value, true)} /></span>
          </label>
          <div className="learn-filter-grid">
            <label>학습 과정<select value={track} onChange={(event) => setFilter("track", event.currentTarget.value)}><option value="all">전체 과정</option><option value="foundation">제작 기초</option><option value="studio">툰스튜디오 실습</option></select></label>
            <label>진행 상태<select value={status} onChange={(event) => setFilter("status", event.currentTarget.value)}><option value="all">모든 상태</option><option value="not-started">시작 전</option><option value="in-progress">학습 중</option><option value="completed">완료</option></select></label>
            <label>학습 시간<select value={duration} onChange={(event) => setFilter("duration", event.currentTarget.value)}><option value="all">모든 길이</option><option value="quick">12분 이하</option><option value="standard">13–16분</option><option value="deep">17분 이상</option></select></label>
            <label>정렬<select value={sort} onChange={(event) => setFilter("sort", event.currentTarget.value)}><option value="curriculum">커리큘럼 순</option><option value="recommended">나에게 추천</option><option value="shortest">짧은 수업 순</option></select></label>
          </div>
          <div className="learn-filter-result">
            <p role="status"><strong>{filtered.length}</strong>개 수업{activeFilterCount ? ` · 필터 ${activeFilterCount}개 적용` : ""}</p>
            {activeFilterCount > 0 && <button type="button" onClick={() => setParams({})}>필터 모두 초기화</button>}
          </div>
        </div>
        {filtered.length ? <div className="learn-card-grid">{filtered.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} store={store} index={LESSONS.indexOf(lesson)} />)}</div> : <div className="learn-empty"><span aria-hidden="true">⌕</span><h3>조건에 맞는 수업이 없습니다.</h3><p>검색어를 줄이거나 과정·진행 상태·시간 필터를 바꿔 보세요.</p><button type="button" onClick={() => setParams({})}>전체 수업 보기</button></div>}
      </section>

      <section className="learn-banner">
        <div><p className="learn-eyebrow">FROM LEARNING TO MAKING</p><h2>읽기에서 끝내지 말고, 한 컷으로 남기세요.</h2><p>학습 페이지와 툰스튜디오를 나란히 열고 체크리스트를 따라 결과물을 직접 만들어 보세요. 기존 작업은 자동으로 변경하지 않습니다.</p></div>
        <Link className="learn-secondary" to="/learn/studio">실습 과정 살펴보기 <span aria-hidden="true">→</span></Link>
      </section>
    </>
  );
}

function LessonDetail({ store }: { store: LearningStore }) {
  const { lessonId } = useParams();
  const lesson = LESSONS.find((item) => item.id === lessonId);
  if (!lesson) return <LearningNotFound />;
  return <LessonSession key={lesson.id} lesson={lesson} store={store} />;
}

function LessonSession({ lesson, store }: { lesson: Lesson; store: LearningStore }) {
  const id = useId();
  const saved = store.progress.lessons[lesson.id] ?? EMPTY_LESSON;
  const ready = canComplete(lesson, saved);
  const lessonIndex = LESSONS.indexOf(lesson);
  const previous = LESSONS[lessonIndex - 1];
  const next = LESSONS[lessonIndex + 1];
  const percent = lessonCompletionPercent(lesson, store.progress);
  const correctQuiz = saved.answer === lesson.quiz.answer;
  const checkedCount = lesson.checks.filter((_, index) => saved.checks.includes(index)).length;
  return (
    <>
      <header className="learn-lesson-header">
        <Link className="learn-back" to="/learn">← 전체 강좌</Link>
        <p className="learn-eyebrow">{lesson.track === "studio" ? "SELF-GUIDED STUDIO PRACTICE" : "WEBTOON FOUNDATIONS"} · LESSON {String(lessonIndex + 1).padStart(2, "0")}</p>
        <h1>{lesson.title}</h1>
        <p className="learn-intro">{lesson.summary}</p>
        <ul className="learn-meta-list" aria-label="강좌 정보"><li>{TRACK_LABELS[lesson.track]}</li><li>{formatMinutes(lesson.minutes)}</li><li>{LAB_LABELS[lesson.lab]}</li><li>{lesson.sections.length}개 개념</li></ul>
        <div className="learn-header-progress"><div><span>현재 진행률</span><strong>{percent}%</strong></div><progress aria-label="현재 강좌 진행률" value={percent} max={100} /></div>
      </header>

      <section className="learn-lesson-kickoff" aria-labelledby={`${id}-outcomes`}>
        <div><p className="learn-eyebrow">LEARNING OUTCOMES</p><h2 id={`${id}-outcomes`}>이 수업을 마치면</h2><ol>{lesson.sections.map((section) => <li key={section.title}>{section.title}</li>)}</ol></div>
        <nav className="learn-lesson-outline" aria-label="이 강좌 목차"><span>바로 이동</span>{lesson.sections.map((section, index) => <a key={section.title} href={`#${lesson.id}-concept-${index + 1}`}>{String(index + 1).padStart(2, "0")} {section.title}</a>)}<a href={`#${lesson.id}-lab`}>예제 조절하기</a><a href={`#${lesson.id}-practice`}>직접 실습하기</a><a href={`#${lesson.id}-quiz`}>확인 퀴즈</a></nav>
      </section>

      <div className="learn-lesson-layout">
        <div className="learn-lesson-body">
          {lesson.sections.map((section, index) => <section key={section.title} id={`${lesson.id}-concept-${index + 1}`} className="learn-prose learn-anchor-target" tabIndex={-1}><span className="learn-eyebrow">CONCEPT {String(index + 1).padStart(2, "0")}</span><h2>{section.title}</h2><p>{section.text}</p></section>)}
          <div id={`${lesson.id}-lab`} className="learn-anchor-target"><LessonLab key={lesson.id} kind={lesson.lab} /></div>
          <section id={`${lesson.id}-practice`} className="learn-practice learn-anchor-target" aria-labelledby={`${id}-practice`} tabIndex={-1}>
            <p className="learn-eyebrow">YOUR TURN</p><h2 id={`${id}-practice`}>직접 만들어 보세요</h2><p className="learn-practice-task">{lesson.task}</p>
            <div className="learn-actions"><a className="learn-primary" href="/studio" target="_blank" rel="noopener noreferrer">툰스튜디오 열기 <span aria-hidden="true">↗</span></a><span className="learn-small">새 탭에서 열립니다. 기존 작업을 자동 변경하지 않습니다.</span></div>
            <fieldset><legend>실습 체크리스트 <span>{checkedCount} / {lesson.checks.length}</span></legend>{lesson.checks.map((check, index) => <label className="learn-check" key={check} data-checked={saved.checks.includes(index) ? "true" : "false"}><input type="checkbox" checked={saved.checks.includes(index)} onChange={(event) => store.patchLesson(lesson.id, { checks: event.currentTarget.checked ? [...saved.checks, index] : saved.checks.filter((value) => value !== index) })} /><span>{check}</span></label>)}</fieldset>
          </section>
          <aside className="learn-caution"><span aria-hidden="true">!</span><div><h3>자주 생기는 실수</h3><p>{lesson.mistake}</p></div></aside>
          <section id={`${lesson.id}-quiz`} className="learn-quiz learn-anchor-target" aria-labelledby={`${id}-quiz`} tabIndex={-1}>
            <p className="learn-eyebrow">CHECK YOUR UNDERSTANDING</p><h2 id={`${id}-quiz`}>확인 퀴즈</h2>
            <fieldset><legend>{lesson.quiz.question}</legend>{lesson.quiz.options.map((option, index) => <label className="learn-check" key={option} data-checked={saved.answer === index ? "true" : "false"}><input type="radio" name={`${id}-answer`} checked={saved.answer === index} onChange={() => store.patchLesson(lesson.id, { answer: index })} /><span>{option}</span></label>)}</fieldset>
            {saved.answer !== null && <p className="learn-caption" data-correct={correctQuiz ? "true" : "false"} role="status"><strong>{correctQuiz ? "정답입니다. " : "한 번 더 살펴보세요. "}</strong>{lesson.quiz.explanation}</p>}
          </section>
          <section id={`${lesson.id}-notes`} className="learn-notes learn-anchor-target"><div className="learn-section-heading"><h2><label htmlFor={`${id}-notes`}>나의 실습 메모</label></h2><span className="learn-small">자동 저장</span></div><textarea id={`${id}-notes`} maxLength={4000} rows={6} value={saved.notes} onChange={(event) => store.patchLesson(lesson.id, { notes: event.currentTarget.value })} placeholder="내가 바꾼 점, 달라진 결과, 다음에 확인할 점을 적어 보세요." /><p className="learn-small">{saved.notes.length.toLocaleString("ko-KR")} / 4,000자 · 이 브라우저에만 저장됩니다. 계정·다른 기기로 자동 동기화되지 않습니다.</p></section>
          <section className="learn-finish">
            <div><p className="learn-eyebrow">COMPLETE THE LESSON</p><h2>{saved.completed ? "수업을 완료했습니다" : "배운 내용을 기록으로 남기세요"}</h2></div>
            <button type="button" className="learn-primary" disabled={!ready || saved.completed} onClick={() => store.patchLesson(lesson.id, { completed: true })}>{saved.completed ? "학습 완료됨" : "이 강좌 학습 완료"}</button>
            <p className="learn-small" role="status">{saved.completed ? (store.warning ? "이 화면에서는 완료했지만 저장에 실패했습니다. 새로고침 전에 기록을 백업하세요." : "완료 기록을 저장했습니다. 언제든 다시 열어 복습할 수 있습니다.") : ready ? "체크리스트와 정답을 모두 확인했습니다. 완료 버튼으로 기록을 남기세요." : "실습 체크리스트를 모두 체크하고 퀴즈에 정답을 선택하면 완료할 수 있습니다."}</p>
          </section>
          <nav className="learn-prev-next" aria-label="이전·다음 강좌">{previous ? <Link to={lessonUrl(previous.id)}><span>← 이전 수업</span><strong>{previous.title}</strong></Link> : <span />}{next ? <Link to={lessonUrl(next.id)}><span>다음 수업 →</span><strong>{next.title}</strong></Link> : <Link to="/learn"><span>커리큘럼</span><strong>전체 강좌 다시 보기 →</strong></Link>}</nav>
        </div>
        <aside className="learn-lesson-sidebar">
          <section className="learn-side-card learn-side-progress">
            <div className="learn-side-progress-heading"><ProgressRing value={percent} label="현재 강좌 진행률" compact /><div><span className="learn-eyebrow">LESSON PROGRESS</span><h2>{saved.completed ? "완료" : "완료까지 확인할 것"}</h2></div></div>
            <ul className="learn-requirements"><li data-done={checkedCount === lesson.checks.length ? "true" : "false"}><span aria-hidden="true">✓</span> 실습 체크 {checkedCount}/{lesson.checks.length}</li><li data-done={correctQuiz ? "true" : "false"}><span aria-hidden="true">✓</span> 확인 퀴즈 정답</li><li data-done={saved.completed ? "true" : "false"}><span aria-hidden="true">✓</span> 완료 기록 저장</li></ul>
          </section>
          <section className="learn-side-card"><h2>함께 알아둘 용어</h2><div className="learn-term-links">{lesson.terms.map((termId) => { const term = TERMS.find((entry) => entry.id === termId); return term ? <Link key={term.id} to={termUrl(term.id)}>{term.name} <span aria-hidden="true">↗</span></Link> : null; })}</div></section>
          <section className="learn-side-card"><h2>더 읽어 보기</h2><p className="learn-small">공식 참고 자료입니다. 본 수업의 본문·도식·과제는 별도로 작성했습니다.</p>{lesson.sources.map((sourceId) => { const source = READINGS[sourceId]; return source ? <a key={sourceId} href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span><span className="learn-visually-hidden">새 탭</span></a> : null; })}</section>
          {lesson.track === "studio" && <p className="learn-small">저장소 매뉴얼 기반의 자율 실습입니다. 앱 버전에 따라 세부 메뉴 위치가 다를 수 있으며 화면 자동 조작이나 자동 채점은 하지 않습니다.</p>}
        </aside>
      </div>
    </>
  );
}

function Glossary({ store }: { store: LearningStore }) {
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").slice(0, 200);
  const categories = [...new Set(TERMS.map((term) => term.category))];
  const category = categories.includes(params.get("category") ?? "") ? params.get("category") : "all";
  const selected = params.get("term");
  const bookmarksOnly = params.get("saved") === "1";
  const visible = TERMS.filter((term) => (!selected || term.id === selected) && (category === "all" || term.category === category) && (!bookmarksOnly || store.progress.bookmarks.includes(term.id)) && [term.name, term.english, term.definition, ...term.aliases].some((value) => value.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/gu, "").includes(query.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/gu, ""))));
  function setFilter(key: string, value: string, replace = false) {
    const updated = new URLSearchParams(params);
    updated.delete("term");
    if (value && value !== "all") updated.set(key, value); else updated.delete(key);
    setParams(updated, { replace });
  }
  return (
    <>
      <header className="learn-lesson-header learn-glossary-header"><p className="learn-eyebrow">WEBTOON GLOSSARY</p><h1>알면 더 잘 보이는<br />웹툰의 언어.</h1><p className="learn-intro">뜻만 외우지 마세요. 한국어·영문·별칭으로 찾고, 실제 제작 장면과 헷갈리는 개념까지 함께 익혀 보세요.</p><div className="learn-glossary-stats"><span><strong>{TERMS.length}</strong> 핵심 용어</span><span><strong>{categories.length}</strong>개 분류</span><span><strong>{store.progress.bookmarks.length}</strong>개 저장</span></div></header>
      <div className="learn-filter-panel learn-glossary-filter" role="search" aria-label="용어 찾아보기"><label className="learn-search-label" htmlFor="learn-term-search">용어 검색<span className="learn-search-input"><span aria-hidden="true">⌕</span><input id="learn-term-search" type="search" maxLength={200} value={query} placeholder="소실점, clipping, 밑색…" onChange={(event) => setFilter("q", event.currentTarget.value, true)} /></span></label><div className="learn-filter-grid"><label>분류<select value={category ?? "all"} onChange={(event) => setFilter("category", event.currentTarget.value)}><option value="all">전체 분류</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button type="button" className="learn-bookmark-filter" aria-pressed={bookmarksOnly} onClick={() => setFilter("saved", bookmarksOnly ? "" : "1")}>저장한 용어만 <strong>{store.progress.bookmarks.length}</strong></button></div><div className="learn-filter-result"><p role="status"><strong>{visible.length}</strong>개 용어</p>{(query || category !== "all" || bookmarksOnly) && <button type="button" onClick={() => setParams({})}>필터 초기화</button>}</div></div>
      {selected && <p><Link className="learn-back" to="/learn/glossary">← 전체 용어 보기</Link></p>}
      {visible.length ? <div className="learn-term-grid">{visible.map((term) => <article className="learn-term-card" key={term.id}><div className="learn-card-top"><span className="learn-tag">{term.category}</span><button type="button" aria-label={`${term.name} 저장`} aria-pressed={store.progress.bookmarks.includes(term.id)} onClick={() => store.toggleBookmark(term.id)}>{store.progress.bookmarks.includes(term.id) ? "저장됨 ★" : "저장 ☆"}</button></div><h2><Link to={termUrl(term.id)}>{term.name}</Link></h2><p className="learn-english">{term.english}{term.aliases.length ? ` · ${term.aliases.join(" / ")}` : ""}</p><p>{term.definition}</p><details open={selected === term.id}><summary>예시와 주의점 읽기</summary><h3>이렇게 사용해요</h3><p>{term.example}</p><h3>헷갈리지 마세요</h3><p>{term.caution}</p></details><Link className="learn-next" to={lessonUrl(term.lesson)}>관련 강좌에서 실험하기 <span aria-hidden="true">→</span></Link></article>)}</div> : <div className="learn-empty"><span aria-hidden="true">Aa</span><h2>{selected ? "해당 용어를 찾을 수 없습니다." : "조건에 맞는 용어가 없습니다."}</h2><p>검색어와 분류를 바꾸거나 저장한 용어 필터를 해제해 보세요.</p><button type="button" onClick={() => setParams({})}>전체 용어 보기</button></div>}
      <p className="learn-small">용어는 웹툰 제작 맥락에서 풀어쓴 설명입니다. 도구별 기능과 메뉴 이름은 달라질 수 있습니다.</p>
    </>
  );
}

function StudioCourses({ store }: { store: LearningStore }) {
  const studioLessons = LESSONS.filter((lesson) => lesson.track === "studio");
  return (
    <>
      <header className="learn-lesson-header learn-studio-header"><p className="learn-eyebrow">MAKE IT IN TOONSTUDIO</p><h1>배운 것을<br />내 작업으로 연결하기.</h1><p className="learn-intro">학습 페이지와 툰스튜디오를 새 탭에 나란히 열고, 설명을 읽은 뒤 직접 손으로 결과물을 만드는 자율 실습입니다.</p><div className="learn-actions"><a className="learn-primary" href="/studio" target="_blank" rel="noopener noreferrer">툰스튜디오 열기 <span aria-hidden="true">↗</span></a><Link className="learn-secondary" to="/learn?track=foundation">기초부터 다시 보기</Link></div></header>
      <section className="learn-practice-flow" aria-labelledby="learn-practice-flow-title"><div className="learn-section-heading"><div><p className="learn-eyebrow">PRACTICE LOOP</p><h2 id="learn-practice-flow-title">설명과 편집기를 오가는 4단계</h2></div></div><ol><li><span>01</span><strong>목표 읽기</strong><p>이번 실습에서 바꿀 한 가지를 정합니다.</p></li><li><span>02</span><strong>예제 비교</strong><p>슬라이더로 결과 차이를 먼저 확인합니다.</p></li><li><span>03</span><strong>직접 만들기</strong><p>툰스튜디오에서 체크리스트를 따라 작업합니다.</p></li><li><span>04</span><strong>메모하고 완료</strong><p>달라진 점을 기록하고 퀴즈로 확인합니다.</p></li></ol></section>
      <div className="learn-card-grid">{studioLessons.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} store={store} index={LESSONS.indexOf(lesson)} />)}</div>
      <section className="learn-banner"><div><p className="learn-eyebrow">SAFE PRACTICE</p><h2>내 원고와 학습 실습을 분리하세요.</h2><p>실습은 기존 작업을 덮어쓰거나 새 문서를 자동 생성하지 않습니다. 중요한 작업을 저장한 뒤 새 문서 또는 복제본에서 연습하세요.</p></div><Link className="learn-secondary" to="/learn/records">학습 기록 백업하기 <span aria-hidden="true">→</span></Link></section>
    </>
  );
}

function LearningNotFound() {
  return <section className="learn-empty"><span aria-hidden="true">404</span><h1>학습 페이지를 찾을 수 없습니다.</h1><p>주소가 변경되었거나 존재하지 않는 강좌입니다.</p><Link className="learn-primary" to="/learn">강좌 목록으로</Link></section>;
}

export function LearnPage() {
  const store = useLearningProgress();
  const location = useLocation();
  const [confirmReset, setConfirmReset] = useState(false);
  const lesson = LESSONS.find((item) => location.pathname === lessonUrl(item.id));
  const title = lesson?.title ?? (location.pathname.startsWith("/learn/glossary") ? "웹툰 용어 사전" : location.pathname.startsWith("/learn/studio") ? "툰스튜디오 실습" : "웹툰 제작 강좌");
  useEffect(() => { document.title = `${title} · 툰스튜디오`; }, [title]);
  return (
    <div className="learn-page" lang="ko">
      <a className="learn-skip-link" href="#learn-main">본문으로 건너뛰기</a>
      <nav className="learn-navigation" aria-label="웹툰 학습"><Link to="/learn" aria-current={location.pathname === "/learn" ? "page" : undefined}>제작 강좌</Link><Link to="/learn/glossary" aria-current={location.pathname.startsWith("/learn/glossary") ? "page" : undefined}>용어 사전</Link><Link to="/learn/studio" aria-current={location.pathname.startsWith("/learn/studio") ? "page" : undefined}>툰스튜디오 실습</Link><Link to="/learn/records">내 학습 기록</Link></nav>
      {store.warning && <p className="learn-caution" role="status"><span aria-hidden="true">!</span><span>{store.warning}</span></p>}
      <main id="learn-main"><Routes><Route index element={<Curriculum store={store} />} /><Route path="lessons/:lessonId" element={<LessonDetail store={store} />} /><Route path="glossary" element={<Glossary store={store} />} /><Route path="studio" element={<StudioCourses store={store} />} /><Route path="*" element={<LearningNotFound />} /></Routes></main>
      <footer className="learn-local-footer"><div><strong>툰스튜디오 배우기</strong><p>한국어 학습 콘텐츠 · 로그인 없이 이용 가능 · 학습 기록은 현재 브라우저에만 저장됩니다.</p><p>공식 문서와 공개 교육 자료를 참고해 본문·도식·과제를 새로 작성했습니다. 특정 교육 기관의 공식 인증 과정이 아닙니다.</p></div><div>{confirmReset ? <div className="learn-reset-confirm" role="group" aria-label="학습 기록 초기화 확인"><p>완료 기록·메모·저장한 용어를 모두 지울까요?</p><button type="button" onClick={() => { store.reset(); setConfirmReset(false); }}>모두 지우기</button><button type="button" onClick={() => setConfirmReset(false)}>취소</button></div> : <button type="button" onClick={() => setConfirmReset(true)}>학습 기록 초기화…</button>}</div></footer>
    </div>
  );
}
