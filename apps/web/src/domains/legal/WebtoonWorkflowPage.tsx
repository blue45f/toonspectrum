import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  FileText,
  MessageSquare,
  Palette,
  Save,
  UsersRound,
} from "lucide-react";

import { AboutSectionNav } from "./AboutSectionNav";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";

const WORKFLOW_STAGES = [
  {
    icon: BookOpen,
    href: "/story-lab",
    ko: {
      title: "작품 기획",
      summary: "무엇을, 누구에게, 어떤 감정으로 전할지 정합니다.",
      body: "장르와 독자, 로그라인, 시놉시스, 세계관과 주요 갈등을 정리하고 에피소드의 목표를 세웁니다.",
      cta: "스토리 연구실 열기",
      outputs: ["로그라인", "시놉시스", "에피소드 목표"],
    },
    en: {
      title: "Plan the work",
      summary: "Define what the story says, who it is for and how it should feel.",
      body: "Shape the genre, audience, logline, synopsis, world and central conflict, then set a goal for each episode.",
      cta: "Open Story Lab",
      outputs: ["Logline", "Synopsis", "Episode goal"],
    },
  },
  {
    icon: UsersRound,
    href: "/studio/assets/characters/new",
    ko: {
      title: "캐릭터와 세계 설정",
      summary: "인물과 공간이 반복해서 등장해도 흔들리지 않도록 기준을 만듭니다.",
      body: "캐릭터의 외형, 성격, 표정과 의상, 관계를 정리하고 주요 장소와 소품의 기준 이미지를 준비합니다.",
      cta: "캐릭터 만들기",
      outputs: ["캐릭터 시트", "관계와 설정", "장소·소품 기준"],
    },
    en: {
      title: "Define characters and world",
      summary: "Create stable references for recurring people, places and props.",
      body: "Organize appearance, personality, expression, wardrobe and relationships, then prepare references for important locations and objects.",
      cta: "Create a character",
      outputs: ["Character sheet", "Relationships", "Location references"],
    },
  },
  {
    icon: FileText,
    href: "/studio/comic",
    ko: {
      title: "대본과 콘티",
      summary: "이야기를 장면, 대사와 컷의 흐름으로 바꿉니다.",
      body: "에피소드를 장면으로 나누고 행동과 대사를 배치한 뒤, 세로 스크롤 리듬과 카메라 구도를 콘티로 점검합니다.",
      cta: "웹툰 작업공간 열기",
      outputs: ["장면 대본", "컷 구성", "스크롤 리듬"],
    },
    en: {
      title: "Write the script and storyboard",
      summary: "Turn the story into scenes, dialogue and panel rhythm.",
      body: "Break an episode into scenes, place action and dialogue, then test vertical pacing and camera composition in the storyboard.",
      cta: "Open the webtoon workspace",
      outputs: ["Scene script", "Panel plan", "Scroll rhythm"],
    },
  },
  {
    icon: Palette,
    href: "/studio/new",
    ko: {
      title: "러프·선화·채색",
      summary: "장면을 레이어와 단계로 나누어 실제 원고로 완성합니다.",
      body: "러프에서 비례와 구도를 잡고, 선화와 채색, 배경, 효과와 말풍선을 분리해 수정 가능한 상태로 작업합니다.",
      cta: "새 프로젝트 시작하기",
      outputs: ["러프", "선화·채색", "배경·말풍선"],
    },
    en: {
      title: "Rough, ink and color",
      summary: "Build the final page in editable layers and production stages.",
      body: "Establish proportion and composition in the rough, then separate ink, color, backgrounds, effects and speech balloons for safer revision.",
      cta: "Start a new project",
      outputs: ["Rough", "Ink and color", "Backgrounds and balloons"],
    },
  },
  {
    icon: MessageSquare,
    href: "/collaborate",
    ko: {
      title: "검수와 협업",
      summary: "수정 의견이 원고와 역할 사이에서 사라지지 않도록 전달합니다.",
      body: "스토리, 콘티, 작화와 편집 담당이 검수 기준을 공유하고 수정 요청, 완료 여부와 다음 담당자를 명확하게 남깁니다.",
      cta: "협업 흐름 둘러보기",
      outputs: ["검수 의견", "수정 상태", "담당자 전달"],
    },
    en: {
      title: "Review and collaborate",
      summary: "Keep feedback visible across pages, roles and handoffs.",
      body: "Story, storyboard, art and editing roles share review criteria and make revision requests, completion state and the next owner explicit.",
      cta: "Explore collaboration",
      outputs: ["Review notes", "Revision state", "Role handoff"],
    },
  },
  {
    icon: Save,
    href: "/studio",
    ko: {
      title: "저장과 내보내기",
      summary: "공개보다 먼저 작업을 안전하게 남기고 다른 목적지로 옮길 준비를 합니다.",
      body: "프로젝트 저장과 복구 지점을 확인하고, 중요한 원고는 별도 파일로 내보냅니다. 비공개 보관, 외부 플랫폼 업로드와 공유 목적을 구분합니다.",
      cta: "내 작업 열기",
      outputs: ["프로젝트 저장", "복구 지점", "내보내기 파일"],
    },
    en: {
      title: "Save and export",
      summary: "Protect the work before deciding where or whether to publish it.",
      body: "Check project saves and recovery points, then export important pages as separate files. Keep private storage, external upload and sharing purposes distinct.",
      cta: "Open My work",
      outputs: ["Project save", "Recovery point", "Export file"],
    },
  },
  {
    icon: CalendarDays,
    href: "/publishing",
    ko: {
      title: "연재와 제작 운영",
      summary: "한 화의 완성에서 끝내지 않고 다음 마감과 버전을 이어갑니다.",
      body: "연재 일정, 에피소드 진행률, 수정 이력, 소개 자료와 권리 정보를 점검해 반복 가능한 제작 흐름으로 만듭니다.",
      cta: "연재·출판 준비 보기",
      outputs: ["연재 일정", "진행률", "소개·권리 자료"],
    },
    en: {
      title: "Release and production operations",
      summary: "Continue from one finished episode into the next deadline and version.",
      body: "Review the release calendar, episode progress, revision history, pitch materials and rights information to build a repeatable production flow.",
      cta: "Open publishing preparation",
      outputs: ["Release calendar", "Progress", "Pitch and rights material"],
    },
  },
] as const;

const ROLE_HANDOFFS = [
  {
    ko: ["스토리", "대본·감정선·장면 목적"],
    en: ["Story", "Script, emotional arc and scene goal"],
  },
  {
    ko: ["콘티", "컷 분할·구도·스크롤 리듬"],
    en: ["Storyboard", "Panel split, composition and scroll rhythm"],
  },
  {
    ko: ["작화", "러프·선화·채색·배경"],
    en: ["Art", "Rough, ink, color and backgrounds"],
  },
  {
    ko: ["편집·검수", "말풍선·효과·수정·최종 승인"],
    en: ["Edit & review", "Balloons, effects, revisions and approval"],
  },
] as const;

export function WebtoonWorkflowPage() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const ko = locale === "ko";

  useDocumentTitle(
    ko
      ? "웹툰 제작 과정 · 기획부터 저장과 연재까지"
      : "Webtoon production workflow · From planning to release",
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PublicStoryHero
        eyebrow="WORKFLOW · IDEA TO RELEASE"
        title={
          ko
            ? "웹툰은 한 번에 그려지지 않습니다."
            : "A webtoon is not drawn in a single step."
        }
        description={
          ko
            ? "이야기의 씨앗을 정리하고, 콘티로 호흡을 만들고, 작화와 검수를 거쳐 안전하게 저장하는 과정입니다. ToonStudio가 각 단계에서 어디로 이동해야 하는지 안내합니다."
            : "It moves from a story seed to storyboard rhythm, drawing, review and safe saving. ToonStudio shows where to go at every stage."
        }
        image="process"
        imageAlt={
          ko
            ? "스케치에서 선화와 채색, 완성된 웹툰 장면으로 발전하는 제작 과정 일러스트"
            : "Illustration of a webtoon scene progressing from sketch to ink, color and a finished panel"
        }
        caption={
          ko
            ? "PLAN → BOARD → DRAW → REVIEW → SAVE · 일곱 단계 제작 흐름"
            : "PLAN → BOARD → DRAW → REVIEW → SAVE · A seven-stage production flow"
        }
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/story-lab"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
          >
            {ko ? "기획부터 시작하기" : "Start with planning"}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/studio/new"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
          >
            <Palette size={16} aria-hidden="true" />
            {ko ? "새 작품 만들기" : "Create a new work"}
          </Link>
        </div>
      </PublicStoryHero>

      <AboutSectionNav className="mt-8" />

      <section className="py-14 sm:py-20" aria-labelledby="workflow-stage-picker-title">
        <div className="max-w-3xl">
          <p className="eyebrow text-accent">WHERE ARE YOU NOW?</p>
          <h2
            id="workflow-stage-picker-title"
            className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl"
          >
            {ko ? "현재 단계에서 바로 시작하세요." : "Begin from the stage you are in now."}
          </h2>
          <p className="mt-4 text-sm leading-7 text-fg-2">
            {ko
              ? "처음부터 순서대로 볼 수도 있고, 지금 막힌 단계로 바로 이동할 수도 있습니다. 각 단계의 결과물이 다음 담당자와 다음 작업공간의 입력이 됩니다."
              : "Read from the beginning or jump directly to the stage blocking you. The output of each stage becomes the input for the next role and workspace."}
          </p>
        </div>

        <nav
          aria-label={ko ? "웹툰 제작 단계 바로가기" : "Jump to a production stage"}
          className="mt-7 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {WORKFLOW_STAGES.map((stage, index) => {
            const copy = stage[locale];

            return (
              <a
                key={copy.title}
                href={`#workflow-stage-${index + 1}`}
                className="group flex min-h-14 items-center gap-3 rounded-2xl border border-line/70 bg-card/65 px-4 py-3 text-sm font-semibold text-fg-2 transition-all hover:border-accent/40 hover:bg-raised hover:text-fg"
              >
                <span className="font-display text-[0.65rem] font-bold tracking-[0.12em] text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{copy.title}</span>
              </a>
            );
          })}
        </nav>
      </section>

      <section aria-labelledby="workflow-all-stages-title">
        <div className="flex items-end justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="eyebrow text-accent">THE SEVEN-STAGE FLOW</p>
            <h2
              id="workflow-all-stages-title"
              className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl"
            >
              {ko ? "기획에서 연재 운영까지." : "From planning to release operations."}
            </h2>
          </div>
          <span className="hidden font-display text-xs font-bold uppercase tracking-[0.14em] text-fg-3 sm:block">
            TOONSTUDIO WORKFLOW
          </span>
        </div>

        <ol className="divide-y divide-line">
          {WORKFLOW_STAGES.map((stage, index) => {
            const Icon = stage.icon;
            const copy = stage[locale];

            return (
              <li
                key={copy.title}
                id={`workflow-stage-${index + 1}`}
                className="scroll-mt-36 py-8 sm:py-10"
              >
                <article className="grid gap-6 lg:grid-cols-[8rem_minmax(0,1fr)_18rem] lg:gap-10">
                  <div className="flex items-start gap-4 lg:block">
                    <span className="font-display text-4xl font-bold tracking-[-0.06em] text-fg-3/35">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="grid size-11 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent lg:mt-5">
                      <Icon size={21} aria-hidden="true" />
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-accent">{copy.summary}</p>
                    <h3 className="mt-2 text-balance text-2xl font-bold tracking-tight text-fg">
                      {copy.title}
                    </h3>
                    <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">{copy.body}</p>
                    <Link
                      href={stage.href}
                      className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent"
                    >
                      {copy.cta}
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="rounded-2xl border border-line/70 bg-panel/55 p-4">
                    <p className="font-display text-[0.65rem] font-bold uppercase tracking-[0.14em] text-fg-3">
                      {ko ? "이 단계의 결과물" : "Stage outputs"}
                    </p>
                    <ul className="mt-4 space-y-3">
                      {copy.outputs.map((output) => (
                        <li key={output} className="flex items-start gap-2 text-sm text-fg-2">
                          <CheckCircle2
                            size={15}
                            className="mt-0.5 shrink-0 text-accent"
                            aria-hidden="true"
                          />
                          <span>{output}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        className="mt-14 rounded-[2rem] border border-line/70 bg-panel/65 p-6 shadow-sm sm:p-8 lg:p-10"
        aria-labelledby="workflow-handoff-title"
      >
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-12">
          <div>
            <UsersRound size={24} className="text-accent" aria-hidden="true" />
            <p className="mt-5 eyebrow text-accent">WHEN ROLES ARE SEPARATE</p>
            <h2
              id="workflow-handoff-title"
              className="mt-3 text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl"
            >
              {ko
                ? "스토리 작가와 그림 작가가 달라도 흐름은 이어져야 합니다."
                : "The flow must continue even when story and art belong to different people."}
            </h2>
            <p className="mt-4 text-sm leading-7 text-fg-2">
              {ko
                ? "각 역할이 무엇을 완료했고 다음 사람이 무엇을 받아야 하는지 결과물 단위로 구분하면, 대화가 많아져도 원고의 상태를 놓치지 않습니다."
                : "When each role completes a clear output for the next person, the page state stays understandable even as feedback grows."}
            </p>
          </div>

          <ol className="grid gap-3 sm:grid-cols-2">
            {ROLE_HANDOFFS.map((role, index) => {
              const [title, body] = role[locale];

              return (
                <li
                  key={title}
                  className="relative rounded-2xl border border-line/70 bg-card/65 p-5"
                >
                  <span className="font-display text-[0.62rem] font-bold tracking-[0.14em] text-accent">
                    HANDOFF {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-fg">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-fg-2">{body}</p>
                  {index < ROLE_HANDOFFS.length - 1 ? (
                    <ArrowRight
                      size={16}
                      className="absolute -bottom-2 right-5 z-10 rounded-full bg-accent p-0.5 text-on-accent sm:-right-2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
                      aria-hidden="true"
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section
        className="mt-14 grid gap-6 border-y border-line bg-panel/45 px-6 py-8 md:grid-cols-[1fr_auto] md:items-center sm:px-8"
        aria-labelledby="workflow-save-first-title"
      >
        <div>
          <Save size={22} className="text-accent" aria-hidden="true" />
          <h2 id="workflow-save-first-title" className="mt-4 text-xl font-bold text-fg">
            {ko ? "마지막 행동은 ‘게시’가 아니라 ‘안전하게 남기기’입니다." : "The last action is safe keeping, not mandatory publishing."}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
            {ko
              ? "완성한 원고는 비공개로 보관하거나 외부 플랫폼 업로드용으로 내보낼 수 있어야 합니다. ToonStudio는 저장을 기본 행동으로 두고 공개는 사용자가 선택하는 다음 단계로 다룹니다."
              : "A finished page should be kept privately or exported for another platform. ToonStudio treats saving as the default action and publishing as an optional next step."}
          </p>
        </div>
        <Link
          href="/studio"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-fg px-5 py-3 text-sm font-bold text-canvas"
        >
          {ko ? "내 작업으로 이동" : "Go to My work"}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </Container>
  );
}
