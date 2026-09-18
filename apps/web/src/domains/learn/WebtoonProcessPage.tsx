import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Factory,
  Layers3,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  WEBTOON_CADENCES,
  WEBTOON_ONBOARDING_GOALS,
  WEBTOON_STARTING_POINTS,
  WEBTOON_TEAM_MODELS,
  buildWebtoonOnboardingPlan,
  webtoonOnboardingStartHref,
  type WebtoonCadenceId,
  type WebtoonOnboardingGoalId,
  type WebtoonOnboardingSelection,
  type WebtoonStartingPointId,
  type WebtoonTeamModelId,
} from "@/shared/lib/webtoon-production-onboarding";
import { cn } from "@/shared/lib/utils";

import { LearningReferenceLayout } from "./LearningReferenceLayout";
import { WebtoonProductionSupportGuide } from "./WebtoonProductionSupportGuide";
import {
  WEBTOON_APPROVAL_GATES,
  WEBTOON_EPISODE_PIPELINE,
  WEBTOON_LIFECYCLE_PHASES,
  WEBTOON_PROCESS_REFERENCES,
  WEBTOON_PRODUCTION_MODELS,
  WEBTOON_ROLLING_PIPELINE,
  type WebtoonProductionModelId,
} from "./webtoon-production-guide";

type GuideView = "lifecycle" | "episode" | "rolling" | "onboarding";

function guideViewFromLocationHash(): GuideView {
  if (typeof window === "undefined") return "lifecycle";
  const hash = window.location.hash;
  if (hash === "#episode-pipeline" || hash === "#site-production-support" || hash.startsWith("#episode-stage-")) return "episode";
  if (hash === "#rolling-pipeline") return "rolling";
  if (hash === "#production-onboarding") return "onboarding";
  return "lifecycle";
}

const primaryLinkClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent hover:bg-accent-2";
const secondaryLinkClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-bold text-fg hover:bg-raised";

const GUIDE_VIEWS: readonly {
  readonly id: GuideView;
  readonly label: string;
  readonly summary: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "lifecycle", label: "작품 생애주기", summary: "권리 확인부터 시즌 종료까지", icon: Workflow },
  { id: "episode", label: "회차 제작", summary: "브리프부터 공개 후 회고까지", icon: Layers3 },
  { id: "rolling", label: "병렬 연재 운영", summary: "여러 회차·게이트·버퍼 관리", icon: CalendarClock },
  { id: "onboarding", label: "내 제작 트랙", summary: "현재 상태에서 프로젝트 생성", icon: Sparkles },
] as const;

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="max-w-4xl">
      <p className="text-xs font-bold tracking-[.14em] text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h2>
      <p className="mt-3 leading-7 text-fg-2">{description}</p>
    </div>
  );
}

function DotList({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-6 text-fg-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <CircleDot className="mt-1 size-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ProductionModelSelector({
  selected,
  onSelect,
}: {
  readonly selected: WebtoonProductionModelId;
  readonly onSelect: (id: WebtoonProductionModelId) => void;
}) {
  const current = WEBTOON_PRODUCTION_MODELS.find((model) => model.id === selected) ?? WEBTOON_PRODUCTION_MODELS[0];
  return (
    <section id="production-models" className="scroll-mt-24 rounded-3xl border border-line bg-panel p-5 sm:p-7" aria-labelledby="production-model-title">
      <SectionHeading
        eyebrow="PRODUCTION MODEL"
        title="같은 웹툰도 제작 조직에 따라 운영 방식이 달라집니다."
        description="단계 자체를 없애기보다 누가 여러 역할을 겸하는지, 어떤 시점에 검수하고 잠그는지를 다르게 설정해야 합니다."
      />
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="웹툰 제작 방식">
        {WEBTOON_PRODUCTION_MODELS.map((model) => {
          const active = model.id === selected;
          return (
            <button
              key={model.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(model.id)}
              className={cn(
                "min-h-36 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active ? "border-accent bg-accent-soft/35" : "border-line bg-canvas hover:border-accent/40 hover:bg-raised",
              )}
            >
              <span className={cn("text-xs font-black", active ? "text-accent" : "text-fg-3")}>{model.id.toUpperCase()}</span>
              <strong className="mt-2 block text-base">{model.title}</strong>
              <span className="mt-2 block text-xs leading-5 text-fg-2">{model.summary}</span>
            </button>
          );
        })}
      </div>
      {current ? (
        <div className="mt-5 grid gap-4 rounded-2xl border border-accent/25 bg-accent-soft/20 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <p className="text-xs font-bold text-accent">선택한 운영 기준</p>
            <h3 id="production-model-title" className="mt-1 text-xl font-bold">{current.title}</h3>
            <p className="mt-3 text-sm leading-6 text-fg-2"><strong className="text-fg">책임 구조:</strong> {current.ownership}</p>
            <p className="mt-2 text-sm leading-6 text-fg-2"><strong className="text-fg">검수 방식:</strong> {current.reviewStyle}</p>
          </div>
          <div className="rounded-2xl bg-panel p-4">
            <h4 className="text-sm font-bold">계획에서 우선 확인할 것</h4>
            <div className="mt-3"><DotList items={current.planningFocus} /></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LifecycleGuide() {
  return (
    <section id="lifecycle" className="scroll-mt-24" aria-labelledby="lifecycle-title">
      <SectionHeading
        eyebrow="SERIES LIFECYCLE"
        title="작품은 제작 전에 개발되고, 공개 뒤에도 계속 운영됩니다."
        description="상업 연재에서는 콘셉트와 작화 사이에 피치·계약·프리프로덕션·버퍼 구축이 있으며, 마지막 회차 뒤에는 정산·아카이브·현지화·IP 확장이 이어집니다."
      />
      <ol className="mt-7 grid gap-4 lg:grid-cols-2">
        {WEBTOON_LIFECYCLE_PHASES.map((phase) => (
          <li key={phase.id} id={`lifecycle-${phase.id}`} className="scroll-mt-24">
            <details className="group h-full rounded-3xl border border-line bg-panel p-5 open:border-accent/35 open:shadow-sm" open={phase.order <= 2}>
              <summary className="cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                <div className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-lg font-black text-on-accent">
                    {String(phase.order).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-raised px-2.5 py-1 text-[0.65rem] font-bold text-fg-2">{phase.stage}</span>
                      <span className="rounded-full border border-accent/30 px-2.5 py-1 text-[0.65rem] font-bold text-accent">{phase.gate}</span>
                    </div>
                    <h3 className="mt-2 text-xl font-bold">{phase.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-fg-2">{phase.summary}</p>
                  </div>
                  <span className="mt-1 text-xl text-fg-3 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </div>
              </summary>
              <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
                <div className="rounded-2xl bg-canvas p-4">
                  <h4 className="text-sm font-bold">실제 작업</h4>
                  <div className="mt-3"><DotList items={phase.tasks} /></div>
                </div>
                <div className="rounded-2xl bg-canvas p-4">
                  <h4 className="text-sm font-bold">승인에 필요한 산출물</h4>
                  <div className="mt-3"><DotList items={phase.outputs} /></div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2" aria-label={`${phase.title} 참여 역할`}>
                {phase.roles.map((role) => <span key={role} className="rounded-full border border-line bg-raised px-3 py-1 text-xs font-semibold">{role}</span>)}
              </div>
              <div className="mt-4 rounded-2xl border border-warning/25 bg-warning-soft/10 p-4 text-sm leading-6 text-fg-2">
                <strong className="text-warning">실무 위험</strong><p className="mt-1">{phase.risk}</p>
              </div>
              <Link className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-accent px-3 py-2 text-sm font-bold text-accent hover:bg-accent-soft" to={phase.studioHref}>
                {phase.studioLabel}<ArrowRight size={15} aria-hidden="true" />
              </Link>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EpisodePipelineGuide() {
  return (
    <section id="episode-pipeline" className="scroll-mt-24" aria-labelledby="episode-pipeline-title">
      <SectionHeading
        eyebrow="EPISODE PIPELINE"
        title="한 회차는 14개 작업·검수 단계로 반복됩니다."
        description="순서는 작품마다 일부 겹치지만, 이야기 수정은 대본에서, 연출 수정은 콘티에서, 포즈 수정은 스케치에서 발견해야 후반 공정의 재작업을 줄일 수 있습니다."
      />
      <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-panel">
        <div className="grid gap-px bg-line md:grid-cols-2">
          {WEBTOON_EPISODE_PIPELINE.map((stage) => (
            <article key={stage.id} className="bg-panel p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-sm font-black text-accent">{stage.order}</span>
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-black tracking-[.12em] text-fg-3">{stage.owner}</p>
                  <h3 className="mt-1 text-lg font-bold">{stage.title}</h3>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-fg-2">{stage.purpose}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-canvas p-3">
                  <p className="text-xs font-bold">검수 기준</p>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2">
                    {stage.checks.map((check) => <li key={check}>• {check}</li>)}
                  </ul>
                </div>
                <div className="rounded-xl bg-canvas p-3 text-xs leading-5 text-fg-2">
                  <p><strong className="text-fg">산출물</strong><br />{stage.output}</p>
                  <p className="mt-2"><strong className="text-fg">병행 가능</strong><br />{stage.mayRunWith.join(" · ")}</p>
                </div>
              </div>
              {stage.lock ? <p className="mt-3 inline-flex rounded-full border border-accent/30 px-3 py-1 text-xs font-bold text-accent">{stage.lock}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function RollingPipelineGuide() {
  const riskClass = (risk: string) => risk === "risk"
    ? "border-danger/35 bg-danger-soft/15 text-danger"
    : risk === "watch"
      ? "border-warning/35 bg-warning-soft/15 text-warning"
      : risk === "published"
        ? "border-success/35 bg-success-soft/15 text-success"
        : "border-line bg-panel text-fg";
  return (
    <section id="rolling-pipeline" className="scroll-mt-24" aria-labelledby="rolling-pipeline-title">
      <SectionHeading
        eyebrow="ROLLING SERIALIZATION"
        title="실제 연재는 한 회차가 아니라 여러 회차가 동시에 흐릅니다."
        description="‘23화 70%’만으로는 병목을 찾을 수 없습니다. 회차별 현재 공정, 다음 의존 작업, 담당자 처리량, 버퍼 감소 속도를 함께 봐야 합니다."
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WEBTOON_ROLLING_PIPELINE.map((item) => (
          <article key={item.episode} className={cn("rounded-2xl border p-4", riskClass(item.risk))}>
            <div className="flex items-center justify-between gap-3">
              <strong className="text-lg">{item.episode}</strong>
              <span className="rounded-full border border-current/20 px-2 py-1 text-[0.65rem] font-bold">{item.owner}</span>
            </div>
            <p className="mt-3 text-sm font-bold">{item.stage}</p>
            <p className="mt-1 text-xs opacity-80">{item.risk === "risk" ? "마감 위험" : item.risk === "watch" ? "확인 필요" : item.risk === "published" ? "공개됨" : "정상 흐름"}</p>
          </article>
        ))}
      </div>
      <div className="mt-8 rounded-3xl border border-line bg-panel p-5 sm:p-7">
        <h3 className="text-xl font-bold">승인 게이트는 ‘완료’와 ‘다음 공정 시작 가능’을 구분합니다.</h3>
        <p className="mt-2 text-sm leading-6 text-fg-2">각 게이트에는 필수 산출물, 승인자, 잠금 버전, 잠금 해제 사유와 후속 일정 영향이 남아야 합니다.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WEBTOON_APPROVAL_GATES.map((gate) => (
            <div key={gate.id} className="rounded-2xl border border-line bg-canvas p-4">
              <p className="text-xs font-black text-accent">{gate.id}</p>
              <strong className="mt-1 block">{gate.title}</strong>
              <p className="mt-2 text-xs leading-5 text-fg-2">{gate.evidence}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type ChoiceItem<T extends string> = {
  readonly id: T;
  readonly labelKo: string;
  readonly descriptionKo?: string;
};

function ChoiceGroup<T extends string>({
  id,
  title,
  items,
  value,
  onChange,
}: {
  readonly id: string;
  readonly title: string;
  readonly items: readonly ChoiceItem<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-line bg-canvas p-4">
      <legend id={`${id}-label`} className="px-1 text-sm font-bold">{title}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              aria-labelledby={`${id}-${item.id}-title`}
              onClick={() => onChange(item.id)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active ? "border-accent bg-accent-soft/35" : "border-line bg-panel hover:border-accent/40",
              )}
            >
              <span id={`${id}-${item.id}-title`} className="block text-sm font-bold">{item.labelKo}</span>
              {item.descriptionKo ? <span className="mt-1 block text-xs leading-5 text-fg-2">{item.descriptionKo}</span> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function OnboardingGuide({
  selection,
  onChange,
}: {
  readonly selection: WebtoonOnboardingSelection;
  readonly onChange: (next: WebtoonOnboardingSelection) => void;
}) {
  const plan = useMemo(() => buildWebtoonOnboardingPlan(selection), [selection]);
  const href = useMemo(() => webtoonOnboardingStartHref(selection), [selection]);
  return (
    <section id="production-onboarding" className="scroll-mt-24" aria-labelledby="production-onboarding-title">
      <SectionHeading
        eyebrow="PRODUCTION ONBOARDING"
        title="기능 투어가 아니라 현재 가진 자료에서 첫 산출물까지 연결합니다."
        description="현재 상태·목표·팀 구조·연재 주기를 선택하면 새 프로젝트 화면에 그대로 전달되고, 생성된 프로젝트에는 추천 작업공간과 실제 첫 작업 체크리스트가 저장됩니다."
      />
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,.85fr)]">
        <div className="grid gap-4 rounded-3xl border border-line bg-panel p-5 sm:p-6">
          <ChoiceGroup<WebtoonStartingPointId>
            id="webtoon-start"
            title="1. 지금 가지고 있는 자료"
            items={WEBTOON_STARTING_POINTS}
            value={selection.startingPoint}
            onChange={(startingPoint) => onChange({ ...selection, startingPoint })}
          />
          <ChoiceGroup<WebtoonOnboardingGoalId>
            id="webtoon-goal"
            title="2. 이번 프로젝트의 목표"
            items={WEBTOON_ONBOARDING_GOALS}
            value={selection.goal}
            onChange={(goal) => onChange({ ...selection, goal })}
          />
          <ChoiceGroup<WebtoonTeamModelId>
            id="webtoon-team"
            title="3. 제작 인원"
            items={WEBTOON_TEAM_MODELS}
            value={selection.teamModel}
            onChange={(teamModel) => onChange({ ...selection, teamModel })}
          />
          <ChoiceGroup<WebtoonCadenceId>
            id="webtoon-cadence"
            title="4. 예상 연재 주기"
            items={WEBTOON_CADENCES}
            value={selection.cadence}
            onChange={(cadence) => onChange({ ...selection, cadence })}
          />
        </div>
        <aside className="h-fit rounded-3xl border border-accent/30 bg-accent-soft/20 p-5 sm:p-6 xl:sticky xl:top-24" aria-live="polite">
          <p className="text-xs font-black tracking-[.14em] text-accent">RECOMMENDED TRACK</p>
          <h3 id="production-onboarding-title" className="mt-2 text-2xl font-bold">{plan.titleKo}</h3>
          <p className="mt-3 text-sm leading-6 text-fg-2">{plan.summaryKo}</p>
          <div className="mt-5 rounded-2xl bg-panel p-4">
            <p className="text-xs font-bold text-fg-3">첫 번째 승인 마일스톤</p>
            <p className="mt-1 font-bold">{plan.milestoneKo}</p>
          </div>
          <div className="mt-5">
            <p className="text-sm font-bold">프로젝트 생성 후 첫 작업</p>
            <ol className="mt-3 space-y-2">
              {plan.tasksKo.map((task, index) => (
                <li key={task} className="flex items-start gap-2 text-sm leading-6 text-fg-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[0.65rem] font-black text-on-accent">{index + 1}</span>
                  <span>{task}</span>
                </li>
              ))}
            </ol>
          </div>
          <Link className={cn(primaryLinkClass, "mt-6 w-full")} to={href}>
            이 제작 트랙으로 시작<ArrowRight size={16} aria-hidden="true" />
          </Link>
          <p className="mt-3 text-xs leading-5 text-fg-3">선택값은 새 프로젝트 화면에서 다시 확인·수정할 수 있습니다.</p>
        </aside>
      </div>
    </section>
  );
}

export function WebtoonProcessPage() {
  const [activeView, setActiveView] = useState<GuideView>(guideViewFromLocationHash);
  const [productionModel, setProductionModel] = useState<WebtoonProductionModelId>("solo");
  const [selection, setSelection] = useState<WebtoonOnboardingSelection>(DEFAULT_WEBTOON_ONBOARDING_SELECTION);

  useEffect(() => { document.title = "실제 웹툰 제작 과정 · 툰스튜디오"; }, []);

  const jumpToView = (view: GuideView) => {
    setActiveView(view);
    window.requestAnimationFrame(() => document.getElementById("guide-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <LearningReferenceLayout
      eyebrow="REAL WEBTOON PRODUCTION SYSTEM"
      title="기획부터 계약·제작·연재 운영까지"
      intro="웹툰 제작을 단순한 작화 순서가 아니라 작품 생애주기, 회차 반복 공정, 병렬 연재 운영으로 나누어 설명합니다. 현재 준비 상태를 선택하면 실제 ToonStudio 프로젝트 온보딩으로 이어집니다."
      actions={(
        <>
          <button type="button" className={primaryLinkClass} onClick={() => jumpToView("onboarding")}>
            내 제작 트랙 만들기<ArrowRight size={16} aria-hidden="true" />
          </button>
          <a className={secondaryLinkClass} href="#industry-flow"><Workflow size={16} aria-hidden="true" />전체 구조 보기</a>
          <Link className={secondaryLinkClass} to="/learn/careers"><Users size={16} aria-hidden="true" />직무별 역할</Link>
        </>
      )}
    >
      <section id="industry-flow" className="scroll-mt-24" aria-labelledby="industry-flow-title">
        <SectionHeading
          eyebrow="THREE FLOWS AT ONCE"
          title="실무에서는 세 개의 흐름이 동시에 돌아갑니다."
          description="작품 전체를 개발하고 계약·론칭하는 흐름, 매 회차를 반복 제작하는 흐름, 일정·인력·예산·권리·플랫폼을 관리하는 흐름을 따로 보되 하나의 프로젝트에서 연결해야 합니다."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <article className="rounded-3xl border border-line bg-panel p-5">
            <Workflow className="size-7 text-accent" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-bold">작품 생애주기</h3>
            <p className="mt-2 text-sm leading-6 text-fg-2">IP·전략 → 콘셉트 → 바이블 → 파일럿·계약 → 프리프로덕션 → 론칭 → 연재 → 시즌 종료</p>
          </article>
          <article className="rounded-3xl border border-line bg-panel p-5">
            <Layers3 className="size-7 text-accent" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-bold">회차 제작 파이프라인</h3>
            <p className="mt-2 text-sm leading-6 text-fg-2">브리프 → 대본 잠금 → 콘티 잠금 → 작화 → 채색·후반 → 통합 QA → 납품·공개 → 회고</p>
          </article>
          <article className="rounded-3xl border border-line bg-panel p-5">
            <Factory className="size-7 text-accent" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-bold">프로덕션 운영</h3>
            <p className="mt-2 text-sm leading-6 text-fg-2">병렬 회차·담당자 처리량·버퍼·변경 영향·승인 게이트·휴재·현지화·정산을 관리합니다.</p>
          </article>
        </div>
      </section>

      <ProductionModelSelector selected={productionModel} onSelect={setProductionModel} />

      <section id="guide-workspace" className="scroll-mt-20" aria-label="웹툰 제작 과정 상세 보기">
        <nav className="grid gap-2 rounded-3xl border border-line bg-panel p-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="제작 과정 보기 전환">
          {GUIDE_VIEWS.map((view) => {
            const Icon = view.icon;
            const active = activeView === view.id;
            return (
              <button
                key={view.id}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveView(view.id)}
                className={cn(
                  "flex min-h-20 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                  active ? "border-accent bg-accent-soft/35" : "border-transparent hover:border-line hover:bg-raised",
                )}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", active ? "bg-accent text-on-accent" : "bg-canvas text-fg-2")}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm">{view.label}</strong>
                  <span className="mt-1 block text-xs leading-5 text-fg-3">{view.summary}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <div className="mt-8">
          {activeView === "lifecycle" ? <LifecycleGuide /> : null}
          {activeView === "episode" ? (
            <div className="space-y-10">
              <EpisodePipelineGuide />
              <WebtoonProductionSupportGuide onStartProject={() => jumpToView("onboarding")} />
            </div>
          ) : null}
          {activeView === "rolling" ? <RollingPipelineGuide /> : null}
          {activeView === "onboarding" ? <OnboardingGuide selection={selection} onChange={setSelection} /> : null}
        </div>
      </section>

      <section className="grid gap-5 rounded-3xl border border-line bg-panel p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.8fr)]" aria-labelledby="sustainable-title">
        <div>
          <div className="flex items-center gap-3 text-accent"><ShieldCheck size={22} aria-hidden="true" /><span className="text-xs font-black tracking-[.14em]">SUSTAINABLE SERIALIZATION</span></div>
          <h2 id="sustainable-title" className="mt-3 text-2xl font-bold">마감 관리는 속도 경쟁이 아니라 연재를 지속할 수 있는 시스템입니다.</h2>
          <p className="mt-3 leading-7 text-fg-2">버퍼·병목·누적 수정·작가 건강·휴재 가능성·예산을 함께 관리하고, 휴재를 실패가 아닌 정상적인 운영 상태로 취급해야 합니다.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {["공정별 처리량과 실제 소요시간", "선행 완성 회차와 버퍼 감소 속도", "마감 오버·수정 누적·담당자 부재", "휴재·복귀·긴급 수정 런북"].map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-3 text-sm font-semibold"><CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden="true" />{item}</div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-line bg-panel p-5 sm:p-7" aria-labelledby="process-sources-title">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-1 size-6 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <h2 id="process-sources-title" className="text-xl font-bold">공개된 업계·기관 자료를 바탕으로 일반화했습니다.</h2>
            <p className="mt-2 text-sm leading-6 text-fg-2">작품·계약·플랫폼마다 컷 수, 버퍼, 승인자, 납품 규격은 다릅니다. 아래 자료와 실제 계약 조건을 함께 확인하세요.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {WEBTOON_PROCESS_REFERENCES.map((reference) => (
            <a key={reference.href} href={reference.href} target="_blank" rel="noreferrer" className="rounded-2xl border border-line bg-canvas p-4 hover:border-accent/40 hover:bg-raised">
              <strong className="text-sm">{reference.label}</strong>
              <p className="mt-2 text-xs leading-5 text-fg-2">{reference.description}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="grid gap-5 rounded-3xl border border-accent/30 bg-accent-soft/20 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" aria-labelledby="process-final-title">
        <div>
          <p className="text-xs font-black tracking-[.14em] text-accent">GUIDE → ONBOARDING → PROJECT</p>
          <h2 id="process-final-title" className="mt-2 text-2xl font-bold">현재 준비 상태에서 바로 실제 제작 프로젝트를 시작하세요.</h2>
          <p className="mt-3 leading-7 text-fg-2">선택한 제작 트랙은 프로젝트 생성 화면으로 전달되고, 프로젝트 안에서 첫 승인 마일스톤과 작업 체크리스트로 이어집니다.</p>
        </div>
        <button type="button" onClick={() => jumpToView("onboarding")} className={cn(primaryLinkClass, "w-full lg:w-auto")}>
          온보딩 설정하기<ClipboardCheck size={17} aria-hidden="true" />
        </button>
      </section>
    </LearningReferenceLayout>
  );
}
