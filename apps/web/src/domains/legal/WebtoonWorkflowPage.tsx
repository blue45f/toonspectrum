import { translateCurrentStaticSourceText, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, FileText, Palette, PanelsTopLeft, Save, type LucideIcon } from "lucide-react";

import { AboutSectionNav } from "./AboutSectionNav";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { HeroBlock } from "@/shared/components/layout";
import { Container } from "@/shared/components/section";
import { WorkflowIllustration } from "@/shared/components/site-experience/WorkflowIllustration";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  AboutJourneyPager,
  IntroActions,
  IntroNote,
  IntroSectionHeading,
  IntroStepStrip,
  type IntroStep,
} from "@/domains/marketing/public/intro-primitives";
import { IntroTabs, type IntroTabApi } from "@/domains/marketing/public/intro-tabs";
import { INTRO_PAGE, INTRO_SCROLL_MARGIN, INTRO_SECTION } from "@/domains/marketing/public/intro-tokens";
import {
  WORKFLOW_HANDOFFS,
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_ANCHORS,
  type WorkflowStage,
  type WorkflowStageId,
} from "@/domains/marketing/public/workflow-stages";

const SCOPE = "domains.legal.WebtoonWorkflowPage";

const HANDOFF_ICONS: Readonly<Record<(typeof WORKFLOW_HANDOFFS)[number]["id"], LucideIcon>> = {
  story: FileText,
  board: PanelsTopLeft,
  art: Palette,
  edit: ClipboardCheck,
};

/** 단계 제목에 초점을 옮긴다 — '다음 단계' 버튼을 누른 키보드·스크린 리더 사용자가 새 단계의 시작으로 이어지게 한다. */
function focusStageTitle(id: WorkflowStageId) {
  window.requestAnimationFrame(() => document.getElementById(`workflow-stage-title-${id}`)?.focus({ preventScroll: true }));
}

function WorkflowStagePanel({ stage, index, api }: {
  readonly stage: WorkflowStage;
  readonly index: number;
  readonly api: IntroTabApi<WorkflowStageId>;
}) {
  const bi = useBilingualLocalizer(SCOPE);
  const copy = bi(stage.ko, stage.en);
  const Icon = stage.icon;
  const previous = WORKFLOW_STAGES[index - 1];
  const next = WORKFLOW_STAGES[index + 1];
  const go = (target: WorkflowStage) => {
    api.select(target.id);
    focusStageTitle(target.id);
  };
  return (
    <article id={`workflow-stage-${index + 1}`} className={`grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-center lg:gap-10 ${INTRO_SCROLL_MARGIN}`}>
      <div className="min-w-0 lg:order-2">
        <WorkflowIllustration kind={stage.art} decorative sizes="(max-width: 1023px) calc(100vw - 32px), 24rem" />
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-bold text-accent">
          <Icon size={17} aria-hidden="true" />
          {bi(`단계 ${index + 1} / ${WORKFLOW_STAGES.length}`, `Stage ${index + 1} of ${WORKFLOW_STAGES.length}`)}
        </p>
        <h3 id={`workflow-stage-title-${stage.id}`} tabIndex={-1} className="mt-2 text-balance break-keep text-2xl font-bold tracking-tight text-fg focus-visible:outline-none">{copy.title}</h3>
        <p className="mt-2 break-keep text-base font-semibold leading-7 text-fg">{copy.summary}</p>
        <p className="mt-2 max-w-2xl break-keep text-base leading-7 text-fg-2">{copy.body}</p>
        <ul className="mt-4 flex flex-wrap gap-2" aria-label={bi("이 단계의 결과물", "Stage outputs")}>
          {copy.outputs.map((output) => (
            <li key={output} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line/70 bg-panel/60 px-3 text-sm font-semibold text-fg-2">
              <Check size={14} className="text-accent" aria-hidden="true" />{output}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link href={stage.href} className={buttonClass({ size: "lg", className: "w-full whitespace-normal text-center sm:w-auto" })}>
            {copy.cta}<ArrowRight size={17} aria-hidden="true" />
          </Link>
          {previous ? (
            <button type="button" onClick={() => go(previous)} className={buttonClass({ variant: "quiet", size: "lg", className: "px-3 text-fg-2" })}>
              <ArrowLeft size={16} aria-hidden="true" />{bi("이전", "Back")}
            </button>
          ) : null}
          {next ? (
            <button type="button" onClick={() => go(next)} className={buttonClass({ variant: "outline", size: "lg", className: "whitespace-normal text-center" })}>
              {bi("다음 단계", "Next stage")}<ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function WebtoonWorkflowPage() {
  const bi = useBilingualLocalizer(SCOPE);
  const eyebrow = (text: string) => translateCurrentStaticSourceText(SCOPE, "en", text);

  useDocumentTitle(bi("웹툰 제작 과정 · 기획부터 저장과 연재까지", "Webtoon production workflow · From planning to release"));

  const tabs = WORKFLOW_STAGES.map((stage, index) => ({
    id: stage.id,
    icon: stage.icon,
    label: `${index + 1} · ${bi(stage.ko, stage.en).tab}`,
  }));
  const handoffs: readonly IntroStep[] = WORKFLOW_HANDOFFS.map((role) => {
    const copy = bi(role.ko, role.en);
    return { id: role.id, icon: HANDOFF_ICONS[role.id], title: copy.title, detail: copy.detail };
  });

  return (
    <Container size="wide" className={INTRO_PAGE}>
      <HeroBlock
        eyebrow="WORKFLOW · IDEA TO RELEASE"
        title={bi("웹툰은 한 번에 그려지지 않습니다.", "A webtoon is not drawn in a single step.")}
        lede={bi("기획에서 연재 운영까지 일곱 단계. 지금 있는 단계를 골라 바로 시작하세요.", "Seven stages from planning to release. Pick the one you are in and start there.")}
        actions={(
          <IntroActions
            primary={{ href: "/story-lab", label: bi("기획부터 시작하기", "Start with planning") }}
            secondary={{ href: "/studio/new", label: bi("새 작품 만들기", "Create a new work"), icon: Palette }}
          />
        )}
      />

      <AboutSectionNav variant="compact" className="mt-4" />

      <section className="pb-8 pt-8 sm:pb-12 sm:pt-12" aria-labelledby="workflow-all-stages-title">
        <IntroSectionHeading
          id="workflow-all-stages-title"
          eyebrow={eyebrow("THE SEVEN-STAGE FLOW")}
          title={bi("기획에서 연재 운영까지, 단계를 눌러 보세요.", "From planning to release. Tap a stage.")}
        />
        <IntroTabs
          tabs={tabs}
          fallback="plan"
          label={bi("웹툰 제작 7단계", "Seven production stages")}
          idPrefix="workflow-stage"
          param="stage"
          anchors={WORKFLOW_STAGE_ANCHORS}
          mount="all"
          className="mt-5"
          tabsClassName="[&_button]:min-h-11"
          panelClassName="mt-4 rounded-[1.75rem] border border-line/70 bg-panel/45 p-4 sm:p-6 lg:p-8"
        >
          {(id, api) => {
            const index = WORKFLOW_STAGES.findIndex((stage) => stage.id === id);
            const stage = WORKFLOW_STAGES[index];
            return stage ? <WorkflowStagePanel stage={stage} index={index} api={api} /> : null;
          }}
        </IntroTabs>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="workflow-handoff-title">
        <IntroSectionHeading
          id="workflow-handoff-title"
          eyebrow={eyebrow("WHEN ROLES ARE SEPARATE")}
          title={bi("스토리와 그림 담당이 달라도 흐름은 이어집니다.", "The flow continues even when story and art are different people.")}
        />
        <IntroStepStrip steps={handoffs} label={bi("역할별 인수인계", "Role handoffs")} className="mt-5" />
        <IntroNote
          icon={Save}
          className="mt-5"
          action={(
            <Link href="/studio" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent hover:text-accent-2">
              {bi("내 작업으로 이동", "Go to My work")}<ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
        >
          {bi("마지막 행동은 '게시'가 아니라 '안전하게 남기기'입니다. 저장이 기본, 공개는 선택하는 다음 단계예요.", "The last action is safe keeping, not mandatory publishing. Saving is the default; publishing is an optional next step.")}
        </IntroNote>
      </section>

      <AboutJourneyPager current="/about/workflow" className="mt-2" />
    </Container>
  );
}
