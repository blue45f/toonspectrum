import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { LESSONS } from "./learning-content";
import {
  CLASSROOM_TEMPLATES,
  createClassroomPlan,
  loadClassroomPlan,
  saveClassroomPlan,
  type ClassroomAssignment,
  type ClassroomPlan,
  type ClassroomTemplateId,
} from "./learning-classroom";
import { CURATED_LEARNING_RESOURCES } from "./learning-resources";

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function assignmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `assignment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function lessonUrl(id: string): string {
  return `/learn/lessons/${encodeURIComponent(id)}`;
}

export function LearningClassroomPage() {
  const [plan, setPlan] = useState<ClassroomPlan>(() => loadClassroomPlan(browserStorage()));
  const [warning, setWarning] = useState("");
  const [title, setTitle] = useState("");
  const [week, setWeek] = useState(1);
  const [lessonId, setLessonId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { document.title = "Classroom · 툰스튜디오 Academy"; }, []);

  const lessonById = useMemo(() => new Map(LESSONS.map((lesson) => [lesson.id, lesson])), []);
  const resourceById = useMemo(() => new Map(CURATED_LEARNING_RESOURCES.map((resource) => [resource.id, resource])), []);
  const template = CLASSROOM_TEMPLATES.find((candidate) => candidate.id === plan.templateId) ?? CLASSROOM_TEMPLATES[0];

  function persist(next: ClassroomPlan) {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setPlan(stamped);
    setWarning(saveClassroomPlan(browserStorage(), stamped) ? "" : "이 기기에 수업 계획을 저장하지 못했습니다. 내보내기로 사본을 보관하세요.");
  }

  function applyTemplate(templateId: ClassroomTemplateId) {
    const next = createClassroomPlan(templateId);
    const assignments = plan.assignments.map((assignment) => ({
      ...assignment,
      week: Math.min(assignment.week, next.weeks.length),
    }));
    persist({ ...next, assignments });
    setWeek(1);
    setLessonId("");
  }

  function addAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.normalize("NFKC").trim().slice(0, 160);
    if (!normalizedTitle) return;
    const assignment: ClassroomAssignment = {
      id: assignmentId(),
      title: normalizedTitle,
      week: Math.max(1, Math.min(plan.weeks.length, week)),
      lessonId: lessonId || null,
      dueDate: dueDate.slice(0, 20),
      notes: notes.slice(0, 1200),
    };
    persist({ ...plan, assignments: [...plan.assignments, assignment] });
    setTitle("");
    setDueDate("");
    setNotes("");
  }

  function removeAssignment(id: string) {
    persist({ ...plan, assignments: plan.assignments.filter((assignment) => assignment.id !== id) });
  }

  function exportPlan() {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `toonstudio-classroom-${plan.templateId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="learn-page academy-classroom-page" lang="ko">
      <header className="academy-page-hero academy-classroom-hero">
        <div>
          <p className="learn-eyebrow">TOONSPECTRUM CLASSROOM</p>
          <h1>강의를 모으는 데서 끝내지 않고,<br />수업과 과제로 연결합니다.</h1>
          <p className="learn-intro">교수·강사가 자체 강좌와 외부 공식 자료를 주차별로 엮고, 학생이 툰스튜디오에서 바로 실습하도록 만드는 교육기관용 파일럿입니다.</p>
        </div>
        <aside>
          <strong>{plan.weeks.length}주</strong>
          <span>{template.title}</span>
          <p>현재 버전은 브라우저 로컬 수업 설계입니다. 학생 명단·성적·LTI 동기화는 서버형 Classroom의 다음 단계입니다.</p>
        </aside>
      </header>

      {warning && <p className="learn-caution" role="status">{warning}</p>}

      <section className="academy-template-picker" aria-labelledby="academy-template-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">CURRICULUM TEMPLATE</p><h2 id="academy-template-title">수업 목적에 맞는 시작점을 고르세요.</h2></div>
          <button type="button" onClick={exportPlan}>수업 계획 JSON 내보내기</button>
        </div>
        <div className="academy-template-grid">
          {CLASSROOM_TEMPLATES.map((item) => (
            <button key={item.id} type="button" aria-pressed={item.id === plan.templateId} onClick={() => applyTemplate(item.id)}>
              <span>{item.weeks.length}주 과정</span>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </button>
          ))}
        </div>
        <label className="academy-class-name" htmlFor="academy-class-name">수업 이름
          <input
            id="academy-class-name"
            maxLength={160}
            value={plan.name}
            onChange={(event) => persist({ ...plan, name: event.currentTarget.value.slice(0, 160) })}
          />
        </label>
      </section>

      <section className="academy-week-section" aria-labelledby="academy-week-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">WEEKLY COURSE</p><h2 id="academy-week-title">강의 → 참고자료 → 실습의 한 흐름</h2></div>
          <Link to="/learn/resources">강좌·자료 더 찾기 →</Link>
        </div>
        <ol className="academy-week-list">
          {plan.weeks.map((item) => (
            <li key={item.week}>
              <span className="academy-week-index">W{String(item.week).padStart(2, "0")}</span>
              <div className="academy-week-copy"><h3>{item.title}</h3><p>{item.summary}</p></div>
              <div className="academy-week-links">
                {item.lessonIds.map((id) => {
                  const lesson = lessonById.get(id);
                  return lesson ? <Link key={id} to={lessonUrl(id)}><span>자체 강좌</span>{lesson.title}</Link> : null;
                })}
                {item.resourceIds.map((id) => {
                  const resource = resourceById.get(id);
                  if (!resource) return null;
                  return resource.external
                    ? <a key={id} href={resource.url} target="_blank" rel="noopener noreferrer"><span>외부 참고</span>{resource.title} ↗</a>
                    : <Link key={id} to={resource.url}><span>학습 자료</span>{resource.title}</Link>;
                })}
                <a href="/studio" target="_blank" rel="noopener noreferrer"><span>실습</span>툰스튜디오에서 작업 ↗</a>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="academy-assignment-section" aria-labelledby="academy-assignment-title">
        <div className="learn-section-heading">
          <div><p className="learn-eyebrow">ASSIGNMENTS</p><h2 id="academy-assignment-title">배운 내용을 바로 과제로 바꾸세요.</h2></div>
          <p className="learn-small">현재 기기에 자동 저장됩니다.</p>
        </div>
        <div className="academy-assignment-layout">
          <form className="academy-assignment-form" onSubmit={addAssignment}>
            <label htmlFor="academy-assignment-name">과제 이름
              <input id="academy-assignment-name" maxLength={160} required value={title} placeholder="예: 3컷 콘티 완성" onChange={(event) => setTitle(event.currentTarget.value)} />
            </label>
            <div className="academy-assignment-row">
              <label htmlFor="academy-assignment-week">주차
                <select id="academy-assignment-week" value={week} onChange={(event) => setWeek(Number(event.currentTarget.value))}>
                  {plan.weeks.map((item) => <option key={item.week} value={item.week}>{item.week}주차 · {item.title}</option>)}
                </select>
              </label>
              <label htmlFor="academy-assignment-due">마감일
                <input id="academy-assignment-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.currentTarget.value)} />
              </label>
            </div>
            <label htmlFor="academy-assignment-lesson">연결 강좌
              <select id="academy-assignment-lesson" value={lessonId} onChange={(event) => setLessonId(event.currentTarget.value)}>
                <option value="">연결하지 않음</option>
                {LESSONS.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
              </select>
            </label>
            <label htmlFor="academy-assignment-notes">과제 안내
              <textarea id="academy-assignment-notes" maxLength={1200} rows={5} value={notes} placeholder="제출 조건, 확인할 포인트, 피드백 기준…" onChange={(event) => setNotes(event.currentTarget.value)} />
            </label>
            <button type="submit">과제 추가</button>
          </form>

          <div className="academy-assignment-list">
            {plan.assignments.length === 0 && <div className="learn-empty"><h3>아직 만든 과제가 없습니다.</h3><p>주차와 연결 강좌를 정해 첫 실습 과제를 추가해 보세요.</p></div>}
            {plan.assignments.map((assignment) => {
              const linkedLesson = assignment.lessonId ? lessonById.get(assignment.lessonId) : null;
              return (
                <article className="academy-assignment-card" key={assignment.id}>
                  <div><span>{assignment.week}주차{assignment.dueDate ? ` · ${assignment.dueDate} 마감` : ""}</span><button type="button" onClick={() => removeAssignment(assignment.id)}>삭제</button></div>
                  <h3>{assignment.title}</h3>
                  {assignment.notes && <p>{assignment.notes}</p>}
                  <div className="academy-assignment-actions">
                    {linkedLesson && <Link to={lessonUrl(linkedLesson.id)}>연결 강좌 · {linkedLesson.title} →</Link>}
                    <a href="/studio" target="_blank" rel="noopener noreferrer">실습 화면 열기 ↗</a>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="academy-institution-roadmap" aria-labelledby="academy-institution-title">
        <div><p className="learn-eyebrow">INSTITUTION READY</p><h2 id="academy-institution-title">교육기관 확장을 위한 다음 연결점</h2></div>
        <div className="academy-roadmap-grid">
          <article><strong>01</strong><h3>학생·반 관리</h3><p>Organization / Class / Teacher / Student 계정과 역할을 서버에 연결합니다.</p></article>
          <article><strong>02</strong><h3>Canvas 피드백</h3><p>제출본 위에 핀·화살표·드로오버·음성 피드백을 남기고 수정 이력을 비교합니다.</p></article>
          <article><strong>03</strong><h3>Rubric · 성적</h3><p>콘티·작화·채색 등 평가 기준을 템플릿화하고 과제별 평가 기록을 남깁니다.</p></article>
          <article><strong>04</strong><h3>LTI 1.3</h3><p>학교 LMS에서 수업을 열고 향후 과제·성적을 상호 연동할 수 있는 경계를 준비합니다.</p></article>
        </div>
      </section>

      <section className="learn-banner">
        <div><p className="learn-eyebrow">RESOURCE HUB</p><h2>수업에 넣을 자료가 더 필요하신가요?</h2><p>자체 실습 강좌와 공식 외부 교육 자료를 직군·제작 단계별로 찾아보세요.</p></div>
        <Link className="learn-secondary" to="/learn/resources">강좌·자료 라이브러리 →</Link>
      </section>
    </div>
  );
}
