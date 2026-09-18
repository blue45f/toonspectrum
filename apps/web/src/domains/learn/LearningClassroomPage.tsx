import { useEffect } from "react";
import { Link } from "react-router-dom";

const WEEKS = [
  ["01", "웹툰 제작 파이프라인", "기획부터 게시까지 전체 흐름과 직군별 역할을 이해합니다.", "/learn/process"],
  ["02", "스토리와 캐릭터", "목표·갈등·관계를 정리하고 한 회차의 핵심 사건을 설계합니다.", "/story-lab"],
  ["03", "콘티와 컷 호흡", "컷 분할, 시선 흐름, 스크롤 리듬을 실습합니다.", "/learn/lessons/scroll-rhythm"],
  ["04", "인체와 포즈", "제스처와 무게 중심을 관찰하고 캐릭터 동세를 만듭니다.", "/studio/poser"],
  ["05", "선화와 브러시", "선의 굵기·속도·질감을 비교하며 장면에 맞는 선화를 선택합니다.", "/learn/studio"],
  ["06", "채색과 명도", "명도 구조와 빛의 방향을 먼저 잡고 색을 쌓는 순서를 익힙니다.", "/learn/lessons/color-layers"],
  ["07", "배경과 원근", "소실점과 카메라 시점을 사용해 공간의 설득력을 높입니다.", "/studio/poser"],
  ["08", "말풍선과 대사", "읽기 순서, 대사량, 말풍선 배치로 장면 리듬을 다듬습니다.", "/learn/lessons/lettering"],
  ["09", "1화 제작", "스토리·콘티·작화 과정을 연결해 짧은 완성 원고를 만듭니다.", "/studio"],
  ["10", "검수와 포트폴리오", "피드백을 반영하고 수정 이력과 결과물을 정리합니다.", "/learn/records"],
] as const;

const ROLES = [
  ["글 작가", "스토리 · 캐릭터 · 회차 구성 · 대사"],
  ["그림 작가", "인체 · 선화 · 채색 · 배경 · 연출"],
  ["어시스턴트", "레이어 · 밑색 · 배경 · 효과 · 제작 규칙"],
  ["프로듀서", "기획 · 리뷰 · 일정 · 제작 파이프라인 · 게시"],
] as const;
export function LearningClassroomPage() {
  useEffect(() => { document.title = "교육기관 활용 · 툰스튜디오"; }, []);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6" lang="ko">
      <header className="rounded-[2rem] border border-line bg-panel p-6 lg:p-10">
        <p className="text-xs font-black tracking-[.18em] text-accent">TOONSTUDIO CLASSROOM</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight text-fg sm:text-5xl">강의 자료와 제작 도구가<br />한 수업 안에서 이어지도록.</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-fg-2">웹툰 학원·대학·동아리가 공통 커리큘럼을 구성하고, 학생이 같은 환경에서 배우고 바로 결과물을 만들 수 있도록 설계한 교육용 기반입니다.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="rounded-full bg-accent px-5 py-3 text-sm font-bold text-accent-contrast" to="/learn/resources">교육 자료 고르기</Link>
          <Link className="rounded-full border border-line px-5 py-3 text-sm font-bold text-fg hover:bg-raised" to="/learn">학생 학습 화면 보기</Link>
        </div>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="직군별 학습 축">
        {ROLES.map(([role, topics]) => <article key={role} className="rounded-3xl border border-line bg-panel p-5"><p className="text-xs font-black tracking-[.14em] text-accent">ROLE PATH</p><h2 className="mt-2 text-xl font-black text-fg">{role}</h2><p className="mt-3 text-sm leading-6 text-fg-2">{topics}</p></article>)}
      </section>
      <section className="mt-10" aria-labelledby="classroom-syllabus-title">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black tracking-[.16em] text-accent">10-WEEK TEMPLATE</p><h2 id="classroom-syllabus-title" className="mt-1 text-2xl font-black text-fg">바로 수업에 쓸 수 있는 기본 커리큘럼</h2></div><p className="text-sm text-fg-2">각 주차를 내부 강좌·Studio 실습과 연결합니다.</p></div>
        <ol className="mt-5 grid gap-3 lg:grid-cols-2">
          {WEEKS.map(([week, title, description, href]) => (
            <li key={week} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-4 rounded-2xl border border-line bg-panel p-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-sm font-black text-accent">{week}</span>
              <div><h3 className="font-black text-fg">{title}</h3><p className="mt-1 text-sm leading-6 text-fg-2">{description}</p></div>
              <Link className="mt-1 text-sm font-bold text-accent" to={href}>열기 →</Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-3" aria-label="교육기관 기능 기반">
        <article className="rounded-3xl border border-line bg-panel p-5"><p className="text-xs font-black text-accent">ASSIGNMENT READY</p><h2 className="mt-2 text-xl font-black text-fg">강의 → 실습 → 제출</h2><p className="mt-3 text-sm leading-6 text-fg-2">현재 학습 강좌와 Studio 작업 목적지를 짝지어 수업 중 설명과 실습 사이의 이동을 줄입니다. 다음 단계에서는 과제·제출 버전·피드백을 같은 프로젝트에 연결합니다.</p></article>
        <article className="rounded-3xl border border-line bg-panel p-5"><p className="text-xs font-black text-accent">TEACHER TEMPLATE</p><h2 className="mt-2 text-xl font-black text-fg">같은 실습 환경</h2><p className="mt-3 text-sm leading-6 text-fg-2">Canvas 크기, 레이어, 브러시, 3D 장면, 팔레트를 수업 템플릿으로 고정하는 Teacher Freeze 모델을 기준으로 확장합니다.</p></article>
        <article className="rounded-3xl border border-line bg-panel p-5"><p className="text-xs font-black text-accent">LMS BRIDGE</p><h2 className="mt-2 text-xl font-black text-fg">기관 LMS 연동 준비</h2><p className="mt-3 text-sm leading-6 text-fg-2">Classroom 도메인은 향후 LTI 1.3의 Deep Linking, 과제·성적 연동과 충돌하지 않도록 학습 콘텐츠와 Studio 작업을 분리된 리소스로 취급합니다.</p></article>
      </section>
      <section className="mt-10 rounded-3xl border border-line bg-raised/70 p-6">
        <p className="text-xs font-black tracking-[.16em] text-accent">TEACHING LOOP</p>
        <h2 className="mt-2 text-2xl font-black text-fg">설명 → 실습 → 피드백 → 수정 → 포트폴리오</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-fg-2">교육기관에서 필요한 것은 강좌 개수보다 반복 가능한 제작 루프입니다. 현재 버전은 커리큘럼과 실습 진입점을 제공하고, 제출·루브릭·교수자 피드백은 이 경계를 유지한 채 Classroom 데이터 계층으로 확장할 수 있습니다.</p>
      </section>
    </main>
  );
}
