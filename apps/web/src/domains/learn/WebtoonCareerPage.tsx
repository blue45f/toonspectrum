import { useEffect } from "react";
import { Link } from "react-router-dom";

import { LearningReferenceLayout } from "./LearningReferenceLayout";
import {
  EDUCATION_GOAL_LABELS,
  WEBTOON_CAREER_ROLES,
  processStepTitle,
} from "./learning-reference-data";

const secondaryLinkClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg hover:bg-raised";

export function WebtoonCareerPage() {
  useEffect(() => { document.title = "웹툰 진로·직무 안내 · 툰스튜디오"; }, []);

  return (
    <LearningReferenceLayout
      eyebrow="WEBTOON CAREER MAP"
      title="작가 한 명이 아니라, 한 편을 만드는 역할들"
      intro="웹툰 제작에서 자주 만나는 8개 역할을 주요 업무·필요 역량·포트폴리오 증거와 연결했습니다. 실제 현장에서는 한 사람이 여러 역할을 맡거나 회사마다 직무 이름이 달라질 수 있습니다."
      actions={(
        <>
          <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent hover:bg-accent-2" href="#career-roles">
            직무 살펴보기
          </a>
          <Link className={secondaryLinkClass} to="/learn/process">제작 과정 보기</Link>
          <Link className={secondaryLinkClass} to="/learn/education">관련 교육 찾기</Link>
        </>
      )}
    >
      <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8" aria-labelledby="career-use-title">
        <p className="text-xs font-bold tracking-[.14em] text-accent">HOW TO USE</p>
        <h2 id="career-use-title" className="mt-2 text-2xl font-bold">직무명보다 내가 반복해서 잘하고 싶은 일을 먼저 찾으세요.</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-line bg-canvas p-5"><strong>1. 업무 확인</strong><p className="mt-2 text-sm leading-6 text-fg-2">글·연출·그림·운영 중 에너지를 오래 쓸 수 있는 일을 고릅니다.</p></article>
          <article className="rounded-2xl border border-line bg-canvas p-5"><strong>2. 작은 결과물</strong><p className="mt-2 text-sm leading-6 text-fg-2">완성 작품만이 아니라 과정과 판단이 보이는 자료를 남깁니다.</p></article>
          <article className="rounded-2xl border border-line bg-canvas p-5"><strong>3. 교육 목적 설정</strong><p className="mt-2 text-sm leading-6 text-fg-2">입시·데뷔·PD·작화 등 목표가 정해지면 교육기관 비교가 쉬워집니다.</p></article>
        </div>
      </section>

      <section id="career-roles" className="scroll-mt-24" aria-labelledby="career-roles-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[.14em] text-accent">ROLE DIRECTORY</p>
            <h2 id="career-roles-title" className="mt-2 text-3xl font-bold">웹툰 제작 직무 8가지</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-fg-2">포트폴리오는 결과물의 양보다 맡은 문제·판단·수정 과정을 설명할 수 있는지가 중요합니다.</p>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          {WEBTOON_CAREER_ROLES.map((role, index) => (
            <article key={role.id} className="flex flex-col rounded-3xl border border-line bg-panel p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold tracking-[.12em] text-accent">ROLE {String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 text-2xl font-bold">{role.title}</h3>
                </div>
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">{EDUCATION_GOAL_LABELS[role.educationGoal]}</span>
              </div>
              <p className="mt-4 leading-7 text-fg-2">{role.summary}</p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-line bg-canvas p-4">
                  <h4 className="font-bold">주요 업무</h4>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-fg-2">
                    {role.responsibilities.map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                </div>
                <div className="rounded-2xl border border-line bg-canvas p-4">
                  <h4 className="font-bold">필요 역량</h4>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-fg-2">
                    {role.skills.map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-accent-soft p-4">
                <h4 className="font-bold text-accent">포트폴리오에서 보여줄 것</h4>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-fg-2">
                  {role.portfolioEvidence.map((item) => <li key={item}>• {item}</li>)}
                </ul>
              </div>

              <div className="mt-5">
                <p className="text-sm font-semibold text-fg-2">연결되는 제작 단계</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {role.processStepIds.map((stepId) => (
                    <Link key={stepId} className="rounded-full border border-line bg-raised px-3 py-1 text-xs font-semibold hover:border-accent hover:text-accent" to={`/learn/process#step-${stepId}`}>
                      {processStepTitle(stepId)}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-auto pt-6">
                <Link className="inline-flex min-h-11 items-center justify-center rounded-xl border border-accent px-4 py-2 text-sm font-bold text-accent hover:bg-accent-soft" to={`/learn/education?goal=${role.educationGoal}`}>
                  {EDUCATION_GOAL_LABELS[role.educationGoal]} 관련 교육 찾기 →
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8" aria-labelledby="career-collaboration-title">
        <p className="text-xs font-bold tracking-[.14em] text-accent">COLLABORATION CHECK</p>
        <h2 id="career-collaboration-title" className="mt-2 text-2xl font-bold">스토리 작가와 그림 작가가 다르다면 반드시 합의할 것</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["인계 기준", "시나리오·콘티·작화 중 어느 상태에서 다음 담당자에게 넘길지"],
            ["수정 권한", "대사·컷·캐릭터·배경을 누가 어디까지 바꿀 수 있는지"],
            ["완료 정의", "검수 체크리스트와 최종 승인자를 누구로 둘지"],
            ["파일 규칙", "레이어 이름·버전·원본·내보내기 파일을 어떻게 관리할지"],
          ].map(([title, description]) => (
            <article key={title} className="rounded-2xl border border-line bg-canvas p-5">
              <h3 className="font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-fg-2">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </LearningReferenceLayout>
  );
}
