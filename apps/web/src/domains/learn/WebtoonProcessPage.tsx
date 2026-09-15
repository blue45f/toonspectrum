import { useEffect } from "react";
import { Link } from "react-router-dom";

import { LearningReferenceLayout } from "./LearningReferenceLayout";
import { WEBTOON_CAREER_ROLES, WEBTOON_PROCESS_STEPS } from "./learning-reference-data";

const roleLabels = new Map(WEBTOON_CAREER_ROLES.map((role) => [role.id, role.title]));

const secondaryLinkClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg hover:bg-raised";

export function WebtoonProcessPage() {
  useEffect(() => { document.title = "웹툰 제작 과정 · 툰스튜디오"; }, []);

  return (
    <LearningReferenceLayout
      eyebrow="WEBTOON PRODUCTION ROADMAP"
      title="아이디어가 연재 원고가 되기까지"
      intro="웹툰 제작의 일반적인 9단계를 산출물·참여 직무·초보자 점검 항목과 함께 정리했습니다. 작품 규모와 팀 구성에 따라 순서는 겹치거나 달라질 수 있습니다."
      actions={(
        <>
          <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent hover:bg-accent-2" href="#process-steps">
            9단계 살펴보기
          </a>
          <Link className={secondaryLinkClass} to="/learn/careers">직무별 역할 보기</Link>
          <Link className={secondaryLinkClass} to="/learn/education">배울 곳 찾기</Link>
        </>
      )}
    >
      <section className="grid gap-4 sm:grid-cols-3" aria-label="제작 과정 요약">
        <article className="rounded-2xl border border-line bg-panel p-5">
          <strong className="text-3xl">{WEBTOON_PROCESS_STEPS.length}</strong>
          <p className="mt-2 font-semibold">아이디어부터 연재 운영까지</p>
          <p className="mt-2 text-sm leading-6 text-fg-2">각 단계에서 해야 할 일과 남겨야 할 결과물을 구분했습니다.</p>
        </article>
        <article className="rounded-2xl border border-line bg-panel p-5">
          <strong className="text-3xl">{WEBTOON_CAREER_ROLES.length}</strong>
          <p className="mt-2 font-semibold">협업 직무 연결</p>
          <p className="mt-2 text-sm leading-6 text-fg-2">혼자 만드는 작품과 팀 제작 모두에서 담당 범위를 확인할 수 있습니다.</p>
        </article>
        <article className="rounded-2xl border border-line bg-panel p-5">
          <strong className="text-3xl">1</strong>
          <p className="mt-2 font-semibold">단계마다 다음 행동</p>
          <p className="mt-2 text-sm leading-6 text-fg-2">관련 ToonStudio 작업공간 또는 실습 페이지로 바로 이동합니다.</p>
        </article>
      </section>

      <section className="rounded-3xl border border-line bg-accent-soft p-6 sm:p-8" aria-labelledby="process-before-title">
        <p className="text-xs font-bold tracking-[.14em] text-accent">BEFORE YOU START</p>
        <h2 id="process-before-title" className="mt-2 text-2xl font-bold">먼저 작품의 규모와 협업 방식을 정하세요.</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-panel p-5"><strong>혼자 제작</strong><p className="mt-2 text-sm leading-6 text-fg-2">단계를 줄이기보다 파일·레이어·검수 역할을 시간 순서로 분리합니다.</p></div>
          <div className="rounded-2xl bg-panel p-5"><strong>스토리·그림 분업</strong><p className="mt-2 text-sm leading-6 text-fg-2">시나리오, 콘티, 수정 요청의 승인 기준을 제작 전에 합의합니다.</p></div>
          <div className="rounded-2xl bg-panel p-5"><strong>스튜디오형 협업</strong><p className="mt-2 text-sm leading-6 text-fg-2">담당자·마감·파일 규칙과 최종 승인자를 단계별로 명시합니다.</p></div>
        </div>
      </section>

      <section id="process-steps" aria-labelledby="process-title" className="scroll-mt-24">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[.14em] text-accent">PRODUCTION STEPS</p>
            <h2 id="process-title" className="mt-2 text-3xl font-bold">웹툰 제작 9단계</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-fg-2">단계명은 절대적인 규칙이 아니라 팀이 서로 같은 진행 상태를 이해하기 위한 기준입니다.</p>
        </div>

        <ol className="mt-7 space-y-6">
          {WEBTOON_PROCESS_STEPS.map((step) => (
            <li key={step.id} id={`step-${step.id}`} className="scroll-mt-24">
              <article className="grid gap-6 rounded-3xl border border-line bg-panel p-5 sm:p-7 lg:grid-cols-[7rem_minmax(0,1fr)]">
                <div>
                  <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-on-accent" aria-hidden="true">
                    {String(step.order).padStart(2, "0")}
                  </span>
                  <p className="mt-3 text-xs font-bold tracking-[.12em] text-accent">STEP {step.order}</p>
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{step.title}</h3>
                  <p className="mt-3 max-w-4xl leading-7 text-fg-2">{step.summary}</p>

                  <div className="mt-6 grid gap-5 lg:grid-cols-2">
                    <div className="rounded-2xl border border-line bg-canvas p-5">
                      <h4 className="font-bold">이 단계에서 하는 일</h4>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-fg-2">
                        {step.tasks.map((task) => <li key={task}>• {task}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-line bg-canvas p-5">
                      <h4 className="font-bold">남겨야 할 산출물</h4>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-fg-2">
                        {step.outputs.map((output) => <li key={output}>• {output}</li>)}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2" aria-label={`${step.title} 참여 직무`}>
                    <span className="mr-1 text-sm font-semibold text-fg-2">주요 참여:</span>
                    {step.roleIds.map((roleId) => (
                      <span key={roleId} className="rounded-full border border-line bg-raised px-3 py-1 text-xs font-semibold">
                        {roleLabels.get(roleId)}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl bg-accent-soft p-4 text-sm leading-7">
                    <strong className="text-accent">초보자 점검</strong>
                    <p className="mt-1 text-fg-2">{step.beginnerNote}</p>
                  </div>

                  <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-accent px-4 py-2 text-sm font-bold text-accent hover:bg-accent-soft" to={step.studioHref}>
                    {step.studioLabel} →
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-5 rounded-3xl border border-line bg-panel p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" aria-labelledby="process-next-title">
        <div>
          <p className="text-xs font-bold tracking-[.14em] text-accent">NEXT ROUTE</p>
          <h2 id="process-next-title" className="mt-2 text-2xl font-bold">내가 맡고 싶은 역할에 맞춰 학습 순서를 좁혀 보세요.</h2>
          <p className="mt-3 leading-7 text-fg-2">직무 안내에서 필요한 역량과 포트폴리오 증거를 확인한 뒤, 교육기관 디렉터리에서 목적별 과정을 찾을 수 있습니다.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link className={secondaryLinkClass} to="/learn/careers">진로·직무 안내</Link>
          <Link className={secondaryLinkClass} to="/learn/education">교육기관 찾기</Link>
        </div>
      </section>
    </LearningReferenceLayout>
  );
}
