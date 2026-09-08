import { useEffect, useId, useState } from "react";
import { Link, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";

import { LESSONS, READINGS, TERMS } from "./learning-content";
import {
  getLessonMeta,
  getLessonRequirementProgress,
  SKILLS,
} from "./learning-paths";
import { canComplete, EMPTY_LESSON, matchesSearch, type Lesson } from "./learning-model";
import { LessonLab } from "./LessonLab";
import { useLearningProgress, type LearningStore } from "./use-learning-progress";

import "./learning.css";
import "./learning-lesson.css";

const lessonUrl = (id: string) => `/learn/lessons/${encodeURIComponent(id)}`;
const termUrl = (id: string) => `/learn/glossary?term=${encodeURIComponent(id)}`;

const LEVEL_LABELS = {
  starter: "처음 시작",
  growing: "기초를 익힌 뒤",
  advanced: "완성·게시 단계",
} as const;

const LAB_LABELS: Readonly<Record<Lesson["lab"], string>> = {
  pacing: "컷 호흡 실험",
  perspective: "투시 조절",
  strokes: "선화 비교",
  layers: "레이어 실험",
  lettering: "말풍선 조절",
  values: "명도 비교",
};

function LessonCard({ lesson, store, index }: { lesson: Lesson; store: LearningStore; index: number }) {
  const completed = store.progress.lessons[lesson.id]?.completed;
  return (
    <article className="learn-card">
      <div className="learn-card-top">
        <span className="learn-number">{String(index + 1).padStart(2, "0")}</span>
        <span className="learn-tag">{completed ? "학습 완료" : lesson.track === "studio" ? "툰스튜디오 실습" : "제작 기초"}</span>
      </div>
      <h3><Link to={lessonUrl(lesson.id)}>{lesson.title}</Link></h3>
      <p>{lesson.summary}</p>
      <div className="learn-card-bottom">
        <span>약 {lesson.minutes}분 · 실습 별도</span>
        <Link to={lessonUrl(lesson.id)} aria-label={`${lesson.title} ${completed ? "복습" : "시작"}`}>
          {completed ? "복습하기" : "배우기"} <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </article>
  );
}

function Curriculum({ store }: { store: LearningStore }) {
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") ?? "").slice(0, 200);
  const track = ["foundation", "studio"].includes(params.get("track") ?? "") ? params.get("track") : "all";
  const filtered = LESSONS.filter((lesson) => (
    track === "all" || lesson.track === track
  ) && matchesSearch(query, [
    lesson.title,
    lesson.summary,
    ...lesson.terms.map((id) => TERMS.find((term) => term.id === id)?.name ?? ""),
  ]));
  const next = LESSONS.find((lesson) => !store.progress.lessons[lesson.id]?.completed) ?? LESSONS[0];
  const count = LESSONS.filter((lesson) => store.progress.lessons[lesson.id]?.completed).length;
  return (
    <>
      <header className="learn-hero">
        <div>
          <p className="learn-eyebrow">TOONSTUDIO LEARNING LAB</p>
          <h1>읽고, 움직여 보고.<br />나만의 한 컷으로.</h1>
          <p className="learn-intro">이야기의 첫 문장부터 완성 원고까지.<br />눈으로 이해하고 직접 실험하는 웹툰 제작 수업입니다.</p>
          <div className="learn-actions">
            <Link className="learn-primary" to={lessonUrl(next.id)}>{count ? "이어서 학습하기" : "첫 수업 시작하기"} <span aria-hidden="true">→</span></Link>
            <Link className="learn-secondary" to="/learn/glossary">용어부터 찾아보기</Link>
          </div>
        </div>
        <aside className="learn-hero-note" aria-label="학습 방법">
          <span className="learn-eyebrow">YOUR FIRST THREE PANELS</span>
          <div className="learn-mini-panels" aria-hidden="true"><span>상황<br /><b>?</b></span><span>변화<br /><b>!</b></span><span>반응<br /><b>→</b></span></div>
          <h2>작은 콘티부터 시작하세요.</h2>
          <p>선이 완벽하지 않아도 괜찮습니다. 독자가 무엇을, 어떤 순서로 읽을지 먼저 실험해 보세요.</p>
          <span className="learn-small">학습용 도식 · 작품 예시 아님</span>
        </aside>
      </header>
      <section className="learn-summary" aria-label="학습 현황">
        <div><strong>{LESSONS.length}</strong><span>수업</span></div>
        <div><strong>{TERMS.length}</strong><span>핵심 용어</span></div>
        <div><strong>6</strong><span>조작형 예제</span></div>
        <div className="learn-progress-summary">
          <label htmlFor="learn-overall-progress">내 진행률 <strong>{count} / {LESSONS.length}</strong></label>
          <progress id="learn-overall-progress" value={count} max={LESSONS.length} />
          <span className="learn-small">현재 브라우저에 저장</span>
        </div>
      </section>
      <section aria-labelledby="learn-curriculum-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">CURRICULUM</p><h2 id="learn-curriculum-title">한 편을 만드는 순서</h2></div>
          <p className="learn-small">설명 → 예제 → 실습 → 확인 퀴즈</p>
        </div>
        <div className="learn-filters">
          <label className="learn-search-label" htmlFor="learn-course-search">강좌 검색
            <input
              id="learn-course-search"
              type="search"
              maxLength={200}
              value={query}
              placeholder="콘티, 채색, 말풍선…"
              onChange={(event) => {
                const updated = new URLSearchParams(params);
                if (event.currentTarget.value) updated.set("q", event.currentTarget.value);
                else updated.delete("q");
                setParams(updated, { replace: true });
              }}
            />
          </label>
          <label>학습 과정
            <select
              value={track ?? "all"}
              onChange={(event) => {
                const updated = new URLSearchParams(params);
                updated.set("track", event.currentTarget.value);
                setParams(updated);
              }}
            >
              <option value="all">전체 과정</option>
              <option value="foundation">제작 기초</option>
              <option value="studio">툰스튜디오 실습</option>
            </select>
          </label>
        </div>
        <p className="learn-small" role="status">검색 결과 {filtered.length}개</p>
        {filtered.length
          ? <div className="learn-card-grid">{filtered.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} store={store} index={LESSONS.indexOf(lesson)} />)}</div>
          : <div className="learn-empty"><h3>일치하는 강좌가 없습니다.</h3><p>다른 키워드 또는 전체 과정을 선택해 보세요.</p><button type="button" onClick={() => setParams({})}>검색 초기화</button></div>}
      </section>
      <section className="learn-banner">
        <div><p className="learn-eyebrow">FROM LEARNING TO MAKING</p><h2>배운 것을 툰스튜디오에서.</h2><p>새 탭에서 직접 따라 하는 기본 실습부터 시작합니다. 작업 자동 생성이나 자동 채점 기능은 아닙니다.</p></div>
        <Link className="learn-secondary" to="/learn/studio">실습 과정 살펴보기 →</Link>
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
  const meta = getLessonMeta(lesson.id);
  const progress = getLessonRequirementProgress(lesson, store.progress);
  const checkedCount = lesson.checks.reduce((count, _, index) => count + (saved.checks.includes(index) ? 1 : 0), 0);
  const quizCorrect = saved.answer === lesson.quiz.answer;
  const status = saved.completed ? "완료" : progress > 0 ? "학습 중" : "시작 전";
  const skillLabels = meta.skills.map((skillId) => SKILLS.find((skill) => skill.id === skillId)?.label).filter(Boolean);

  return (
    <>
      <header className="learn-lesson-header learn-guided-lesson-header">
        <Link className="learn-back" to="/learn#learn-library">← 전체 강좌</Link>
        <p className="learn-eyebrow">
          {lesson.track === "studio" ? "SELF-GUIDED STUDIO PRACTICE" : "WEBTOON FOUNDATIONS"} · LESSON {String(lessonIndex + 1).padStart(2, "0")}
        </p>
        <h1>{lesson.title}</h1>
        <p className="learn-intro">{lesson.summary}</p>
        <div className="learn-lesson-meta" aria-label="강좌 정보">
          <span>{lesson.track === "studio" ? "툰스튜디오 실습" : "제작 기초"}</span>
          <span>{LEVEL_LABELS[meta.level]}</span>
          <span>약 {lesson.minutes}분</span>
          <span>{LAB_LABELS[lesson.lab]}</span>
          <span>{status}</span>
        </div>
        <div className="learn-header-progress">
          <div><span>자가 점검 진행률</span><strong>{progress}%</strong></div>
          <progress value={progress} max={100} aria-label={`${lesson.title} 자가 점검 진행률`} />
        </div>
      </header>

      <section className="learn-lesson-kickoff" aria-labelledby={`${id}-outcome`}>
        <div className="learn-outcome-card">
          <p className="learn-eyebrow">LEARNING OUTCOME</p>
          <h2 id={`${id}-outcome`}>이 수업을 마치면</h2>
          <strong>{meta.outcome}</strong>
          <p>{lesson.task}</p>
          <div className="learn-skill-list" aria-label="관련 제작 역량">
            {skillLabels.map((label) => <span key={label}>{label}</span>)}
          </div>
        </div>
        <nav className="learn-lesson-outline" aria-label="이 강좌 목차">
          <strong>바로 이동</strong>
          {lesson.sections.map((section, index) => (
            <a key={section.title} href={`#${lesson.id}-concept-${index + 1}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>{section.title}
            </a>
          ))}
          <a href={`#${lesson.id}-lab`}><span>LAB</span>예제 조절하기</a>
          <a href={`#${lesson.id}-practice`}><span>DO</span>직접 실습하기</a>
          <a href={`#${lesson.id}-quiz`}><span>Q</span>확인 퀴즈</a>
          <a href={`#${lesson.id}-notes`}><span>NOTE</span>실습 메모</a>
        </nav>
      </section>

      <div className="learn-lesson-layout learn-guided-lesson-layout">
        <div className="learn-lesson-body">
          {lesson.sections.map((section, index) => (
            <section
              key={section.title}
              id={`${lesson.id}-concept-${index + 1}`}
              className="learn-prose learn-anchor-target"
              tabIndex={-1}
            >
              <span className="learn-eyebrow">CONCEPT {String(index + 1).padStart(2, "0")}</span>
              <h2>{section.title}</h2>
              <p>{section.text}</p>
            </section>
          ))}

          <div id={`${lesson.id}-lab`} className="learn-anchor-target" tabIndex={-1}>
            <LessonLab key={lesson.id} kind={lesson.lab} />
          </div>

          <section
            id={`${lesson.id}-practice`}
            className="learn-practice learn-guided-practice learn-anchor-target"
            aria-labelledby={`${id}-practice`}
            tabIndex={-1}
          >
            <p className="learn-eyebrow">YOUR TURN</p>
            <h2 id={`${id}-practice`}>직접 만들어 보세요</h2>
            <p className="learn-practice-task">{lesson.task}</p>
            <div className="learn-actions">
              <a className="learn-secondary" href="/studio" target="_blank" rel="noopener noreferrer">툰스튜디오 열기 <span aria-hidden="true">↗</span></a>
              <span className="learn-small">새 탭에서 열립니다. 기존 작업을 자동 변경하지 않습니다.</span>
            </div>
            <fieldset>
              <legend>실습 체크리스트 <span>{checkedCount} / {lesson.checks.length}</span></legend>
              {lesson.checks.map((check, index) => {
                const checked = saved.checks.includes(index);
                return (
                  <label className="learn-check" data-checked={checked ? "true" : "false"} key={check}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => store.patchLesson(lesson.id, {
                        checks: event.currentTarget.checked
                          ? [...saved.checks, index]
                          : saved.checks.filter((value) => value !== index),
                      })}
                    />
                    <span>{check}</span>
                  </label>
                );
              })}
            </fieldset>
          </section>

          <aside className="learn-caution">
            <h3>자주 생기는 실수</h3>
            <p>{lesson.mistake}</p>
          </aside>

          <section
            id={`${lesson.id}-quiz`}
            className="learn-quiz learn-guided-quiz learn-anchor-target"
            aria-labelledby={`${id}-quiz`}
            tabIndex={-1}
          >
            <p className="learn-eyebrow">CHECK YOUR UNDERSTANDING</p>
            <h2 id={`${id}-quiz`}>확인 퀴즈</h2>
            <fieldset>
              <legend>{lesson.quiz.question}</legend>
              {lesson.quiz.options.map((option, index) => (
                <label className="learn-check" data-checked={saved.answer === index ? "true" : "false"} key={option}>
                  <input
                    type="radio"
                    name={`${id}-answer`}
                    checked={saved.answer === index}
                    onChange={() => store.patchLesson(lesson.id, { answer: index })}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
            {saved.answer !== null && (
              <p className="learn-caption" data-correct={quizCorrect ? "true" : "false"} role="status">
                <strong>{quizCorrect ? "정답입니다. " : "다시 생각해 보세요. "}</strong>{lesson.quiz.explanation}
              </p>
            )}
          </section>

          <section id={`${lesson.id}-notes`} className="learn-notes learn-anchor-target" tabIndex={-1}>
            <div className="learn-section-heading">
              <div><p className="learn-eyebrow">REFLECTION</p><h2><label htmlFor={`${id}-notes`}>나의 실습 메모</label></h2></div>
              <span className="learn-small">입력 즉시 자동 저장</span>
            </div>
            <textarea
              id={`${id}-notes`}
              maxLength={4000}
              rows={6}
              value={saved.notes}
              onChange={(event) => store.patchLesson(lesson.id, { notes: event.currentTarget.value })}
              placeholder="내가 바꾼 점, 달라진 결과, 다음에 확인할 점을 적어 보세요."
            />
            <p className="learn-small">{saved.notes.length.toLocaleString("ko-KR")} / 4,000자 · 이 브라우저에만 저장됩니다. 계정·다른 기기로 동기화되지 않습니다.</p>
          </section>

          <section className="learn-finish learn-guided-finish">
            <div>
              <p className="learn-eyebrow">COMPLETE THE LESSON</p>
              <h2>{saved.completed ? "수업을 완료했습니다" : "배운 내용을 기록으로 남기세요"}</h2>
            </div>
            <button
              type="button"
              className="learn-primary"
              disabled={!ready || saved.completed}
              onClick={() => store.patchLesson(lesson.id, { completed: true })}
            >
              {saved.completed ? "학습 완료됨" : "이 강좌 학습 완료"}
            </button>
            <p className="learn-small" role="status">
              {saved.completed
                ? store.warning
                  ? "이 화면에서 완료했습니다. 저장에 실패했으므로 새로고침 전에 기록을 백업하세요."
                  : "완료 기록을 저장했습니다. 언제든 다시 열어 복습할 수 있습니다."
                : ready
                  ? "체크리스트와 정답을 확인했습니다. 완료 버튼으로 기록을 남기세요."
                  : "실습 체크리스트를 모두 체크하고 퀴즈에 정답을 선택해야 완료할 수 있습니다."}
            </p>
          </section>

          <nav className="learn-prev-next" aria-label="이전·다음 강좌">
            {previous
              ? <Link to={lessonUrl(previous.id)}><span>← 이전 수업</span><strong>{previous.title}</strong></Link>
              : <Link to="/learn#learning-paths"><span>학습 경로</span><strong>목표별 경로 선택하기</strong></Link>}
            {next
              ? <Link to={lessonUrl(next.id)}><span>다음 수업 →</span><strong>{next.title}</strong></Link>
              : <Link to="/learn"><span>커리큘럼</span><strong>전체 강좌 다시 보기 →</strong></Link>}
          </nav>
        </div>

        <aside className="learn-lesson-sidebar learn-guided-lesson-sidebar">
          <section className="learn-side-card learn-progress-card">
            <div className="learn-progress-card-heading">
              <div><p className="learn-eyebrow">LESSON PROGRESS</p><h2>완료까지 확인할 것</h2></div>
              <strong aria-label={`현재 ${progress}%`}>{progress}%</strong>
            </div>
            <progress value={progress} max={100} aria-label="강좌 완료 요구사항 진행률" />
            <ul className="learn-requirement-list">
              <li data-done={checkedCount === lesson.checks.length ? "true" : "false"}>
                <span aria-hidden="true">✓</span><div>실습 체크리스트<strong>{checkedCount}/{lesson.checks.length}</strong></div>
              </li>
              <li data-done={quizCorrect ? "true" : "false"}>
                <span aria-hidden="true">✓</span><div>확인 퀴즈<strong>{quizCorrect ? "정답 확인" : "미완료"}</strong></div>
              </li>
              <li data-done={saved.completed ? "true" : "false"}>
                <span aria-hidden="true">✓</span><div>완료 기록<strong>{saved.completed ? "저장됨" : "미완료"}</strong></div>
              </li>
            </ul>
          </section>

          <section className="learn-side-card">
            <h2>이번 수업의 결과물</h2>
            <p className="learn-side-outcome">{meta.outcome}</p>
            <div className="learn-skill-list" aria-label="관련 제작 역량">
              {skillLabels.map((label) => <span key={label}>{label}</span>)}
            </div>
          </section>

          <section className="learn-side-card">
            <h2>함께 알아둘 용어</h2>
            <div className="learn-term-links">
              {lesson.terms.map((termId) => {
                const term = TERMS.find((entry) => entry.id === termId);
                return term ? <Link key={term.id} to={termUrl(term.id)}>{term.name} <span aria-hidden="true">↗</span></Link> : null;
              })}
            </div>
          </section>

          <section className="learn-side-card">
            <h2>더 읽어 보기</h2>
            <p className="learn-small">공식 참고 자료입니다. 본 수업의 본문과 도식은 별도로 작성했습니다.</p>
            {lesson.sources.map((sourceId) => {
              const source = READINGS[sourceId];
              return source
                ? <a key={sourceId} href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span><span className="learn-visually-hidden">새 탭</span></a>
                : null;
            })}
          </section>

          {lesson.track === "studio" && (
            <p className="learn-small">저장소 매뉴얼 기반의 자율 실습입니다. 현재 앱의 세부 메뉴 위치가 다를 수 있으며, 화면 하이라이트·자동 진행 판정은 제공하지 않습니다.</p>
          )}
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
  const visible = TERMS.filter((term) => (
    !selected || term.id === selected
  ) && (
    category === "all" || term.category === category
  ) && (
    !bookmarksOnly || store.progress.bookmarks.includes(term.id)
  ) && matchesSearch(query, [term.name, term.english, term.definition, ...term.aliases]));

  function setFilter(key: string, value: string, replace = false) {
    const updated = new URLSearchParams(params);
    updated.delete("term");
    if (value) updated.set(key, value);
    else updated.delete(key);
    setParams(updated, { replace });
  }

  return (
    <>
      <header className="learn-lesson-header">
        <p className="learn-eyebrow">WEBTOON GLOSSARY</p>
        <h1>알면 더 잘 보이는<br />웹툰의 언어.</h1>
        <p className="learn-intro">뜻만 외우지 마세요. 쓰이는 장면과 헷갈리는 개념까지 함께 익혀 보세요.</p>
      </header>
      <div className="learn-filters">
        <label className="learn-search-label" htmlFor="learn-term-search">용어 검색
          <input id="learn-term-search" type="search" maxLength={200} value={query} placeholder="소실점, clipping, 밑색…" onChange={(event) => setFilter("q", event.currentTarget.value, true)} />
        </label>
        <label>분류
          <select value={category ?? "all"} onChange={(event) => setFilter("category", event.currentTarget.value)}>
            <option value="all">전체 분류</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <button type="button" aria-pressed={bookmarksOnly} onClick={() => setFilter("saved", bookmarksOnly ? "" : "1")}>저장한 용어 {store.progress.bookmarks.length}</button>
      </div>
      <p className="learn-small" role="status">{visible.length}개 용어 · 한국어·영문·다른 이름으로 검색할 수 있습니다.</p>
      {selected && <p><Link className="learn-back" to="/learn/glossary">← 전체 용어 보기</Link></p>}
      {visible.length ? (
        <div className="learn-term-grid">
          {visible.map((term) => (
            <article className="learn-term-card" key={term.id}>
              <div className="learn-card-top">
                <span className="learn-tag">{term.category}</span>
                <button type="button" aria-label={`${term.name} 저장`} aria-pressed={store.progress.bookmarks.includes(term.id)} onClick={() => store.toggleBookmark(term.id)}>
                  {store.progress.bookmarks.includes(term.id) ? "저장됨 ★" : "저장 ☆"}
                </button>
              </div>
              <h2><Link to={termUrl(term.id)}>{term.name}</Link></h2>
              <p className="learn-english">{term.english}{term.aliases.length ? ` · ${term.aliases.join(" / ")}` : ""}</p>
              <p>{term.definition}</p>
              <details open={selected === term.id}>
                <summary>예시와 주의점 읽기</summary>
                <h3>이렇게 사용해요</h3><p>{term.example}</p>
                <h3>헷갈리지 마세요</h3><p>{term.caution}</p>
              </details>
              <Link className="learn-next" to={lessonUrl(term.lesson)}>관련 강좌에서 실험하기 →</Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="learn-empty">
          <h2>{selected ? "해당 용어를 찾을 수 없습니다." : "조건에 맞는 용어가 없습니다."}</h2>
          <p>검색어와 분류를 바꾸거나 저장한 용어 필터를 해제해 보세요.</p>
          <button type="button" onClick={() => setParams({})}>전체 용어 보기</button>
        </div>
      )}
      <p className="learn-small">용어는 제작 맥락에서 풀어쓴 설명입니다. 도구별 기능과 메뉴 이름은 달라질 수 있습니다.</p>
    </>
  );
}

function StudioCourses({ store }: { store: LearningStore }) {
  return (
    <>
      <header className="learn-lesson-header">
        <p className="learn-eyebrow">MAKE IT IN TOONSTUDIO</p>
        <h1>배운 것을<br />내 작업으로 연결하기.</h1>
        <p className="learn-intro">툰스튜디오를 새 탭에 열어 따라 하는 자율 실습입니다.<br />종이 또는 다른 드로잉 도구에서도 기본 과제를 연습할 수 있습니다.</p>
      </header>
      <div className="learn-card-grid">
        {LESSONS.filter((lesson) => lesson.track === "studio").map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} store={store} index={LESSONS.indexOf(lesson)} />
        ))}
      </div>
      <section className="learn-prose">
        <h2>이번에 제공하는 것</h2>
        <p>세 컷 초안과 레이어 분리 실습, 원리 설명, 조절 가능한 도식, 체크리스트와 확인 퀴즈를 제공합니다. 스튜디오의 기존 작업을 변경하지 않으며 학습 기록과 실제 작품은 별도로 관리됩니다.</p>
        <h2>향후 확장할 과정</h2>
        <p>실제 앱 화면의 도구 하이라이트, 버전별 작업 단계 안내, 예제 프로젝트 불러오기, 3D·브러시 심화 과정과 Remotion 기반 영상 렌더링은 후속 확장 대상입니다. 현재 동작하는 기능으로 표시하거나 자동 실행하지 않습니다.</p>
        <a className="learn-secondary" href="/studio" target="_blank" rel="noopener noreferrer">툰스튜디오 열기 (새 탭) ↗</a>
      </section>
    </>
  );
}

function LearningNotFound() {
  return (
    <section className="learn-empty">
      <h1>학습 페이지를 찾을 수 없습니다.</h1>
      <p>주소가 변경되었거나 존재하지 않는 강좌입니다.</p>
      <Link className="learn-primary" to="/learn">강좌 목록으로</Link>
    </section>
  );
}

export function LearnPage() {
  const store = useLearningProgress();
  const location = useLocation();
  const [confirmReset, setConfirmReset] = useState(false);
  const lesson = LESSONS.find((item) => location.pathname === lessonUrl(item.id));
  const title = lesson?.title
    ?? (location.pathname.startsWith("/learn/glossary")
      ? "웹툰 용어 사전"
      : location.pathname.startsWith("/learn/studio")
        ? "툰스튜디오 실습"
        : "웹툰 제작 강좌");

  useEffect(() => { document.title = `${title} · 툰스튜디오`; }, [title]);

  return (
    <div className="learn-page" lang="ko">
      <a className="learn-skip-link" href="#learn-main">본문으로 건너뛰기</a>
      <nav className="learn-navigation" aria-label="웹툰 학습">
        <Link to="/learn">학습 홈</Link>
        <Link to="/learn#learning-paths">학습 경로</Link>
        <Link to="/learn/glossary" aria-current={location.pathname.startsWith("/learn/glossary") ? "page" : undefined}>용어 사전</Link>
        <Link to="/learn/studio" aria-current={location.pathname.startsWith("/learn/studio") ? "page" : undefined}>툰스튜디오 실습</Link>
      </nav>
      {store.warning && <p className="learn-caution" role="status">{store.warning}</p>}
      <main id="learn-main">
        <Routes>
          <Route index element={<Curriculum store={store} />} />
          <Route path="lessons/:lessonId" element={<LessonDetail store={store} />} />
          <Route path="glossary" element={<Glossary store={store} />} />
          <Route path="studio" element={<StudioCourses store={store} />} />
          <Route path="*" element={<LearningNotFound />} />
        </Routes>
      </main>
      <footer className="learn-local-footer">
        <p>한국어 학습 콘텐츠 · 로그인 없이 이용 가능 · 학습 기록은 현재 브라우저에만 저장됩니다.</p>
        <p>공식 문서와 공개 교육 자료를 참고해 본문·도식·과제를 새로 작성했습니다. 특정 교육 기관의 공식 인증 과정이 아닙니다.</p>
        {confirmReset ? (
          <div className="learn-actions" role="group" aria-label="학습 기록 초기화 확인">
            <p>이 브라우저의 학습 완료 기록·메모·저장한 용어를 모두 지울까요?</p>
            <button type="button" onClick={() => { store.reset(); setConfirmReset(false); }}>모두 지우기</button>
            <button type="button" onClick={() => setConfirmReset(false)}>취소</button>
          </div>
        ) : <button type="button" onClick={() => setConfirmReset(true)}>학습 기록 초기화…</button>}
      </footer>
    </div>
  );
}
