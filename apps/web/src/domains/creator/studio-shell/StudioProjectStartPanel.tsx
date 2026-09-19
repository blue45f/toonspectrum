import {
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText, useBilingual ,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision
} from "@/shared/lib/i18n-bilingual-copy";
import { FileText, FileUp, Lightbulb, PlayCircle, UsersRound } from "lucide-react";

import { WorkflowTrustBadge } from "@/shared/components/WorkflowTrustBadge";

import {
  StudioIntentLauncher,
  StudioTaskFlow,
  type StudioIntentAction,
  type StudioTaskFlowStep,
} from "./StudioTaskFlow";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProjectStartPanel", ko, en);

export type StudioProjectStartLocale = string;

function projectStartActions(bt: (ko: string, en: string) => string): readonly StudioIntentAction[] {
  return [
    {
      href: "/studio/new?kind=webtoon&template=webtoon-vertical",
      icon: Lightbulb,
      title: bt("아이디어만 있어요", "I only have an idea"),
      description: bt("작품 이름과 첫 회차부터 시작하고 기획·콘티·작화 순서로 이어갑니다.", "Start with a title and first episode, then move through planning, storyboard and art."),
      badge: bt("처음 시작 추천", "Recommended first start"),
      visual: "/brand/theme-scenes/ink-studio.svg",
    },
    {
      href: "/story-lab",
      icon: FileText,
      title: bt("대본이나 콘티가 있어요", "I have a script or storyboard"),
      visual: "/brand/theme-scenes/graphite-studio.svg",
      description: bt("기존 대본·캐릭터·장면을 정리하고 회차 제작으로 연결합니다.", "Organize existing scripts, characters and scenes, then connect them to production."),
    },
    {
      href: "/studio/import",
      icon: FileUp,
      title: bt("그리던 파일이 있어요", "I have work-in-progress files"),
      visual: "/brand/atelier-process-640.webp",
      description: bt("PSD·ORA·이미지·브러시·3D 파일을 분석하고 원본을 보존한 채 가져옵니다.", "Analyze PSD, ORA, image, brush and 3D files while preserving the originals."),
    },
    {
      href: "/production",
      icon: UsersRound,
      title: bt("팀 프로젝트를 시작해요", "I am starting a team project"),
      visual: "/brand/production-os-journey.svg",
      description: bt("역할·마감·작업 넘기기·검수 기준을 먼저 정하고 함께 제작합니다.", "Set roles, deadlines, handoffs and review rules before producing together."),
    },
    {
      href: "/production/projects/sample-project/overview",
      icon: PlayCircle,
      title: bt("샘플로 먼저 둘러볼게요", "Show me a sample first"),
      description: bt("기획부터 검토·연재 준비까지 연결된 샘플을 안전하게 체험합니다.", "Explore a safe sample connected from planning through review and publishing."),
      badge: bt("원본 유지", "Original stays intact"),
      visual: "/brand/production-os-hero.svg",
    },
  ];
}

function projectFlow(bt: (ko: string, en: string) => string): readonly StudioTaskFlowStep[] {
  const ko: readonly (readonly [string, string, string])[] = [
    ["plan", "기획", "작품·캐릭터·회차 기준"],
    ["storyboard", "콘티", "대본을 컷과 스크롤로 구성"],
    ["create", "2D·3D 제작", "선화·채색·배경·식자"],
    ["collaborate", "협업", "작업 배정·넘기기·버전"],
    ["review", "검토", "수정 요청·승인본 고정"],
    ["publish", "연재", "규격 검사·예약 공개"],
  ];
  const en: readonly (readonly [string, string, string])[] = [
    ["plan", "Plan", "Series, character and episode foundation"],
    ["storyboard", "Storyboard", "Turn the script into panels and scroll rhythm"],
    ["create", "Create in 2D & 3D", "Line art, color, backgrounds and lettering"],
    ["collaborate", "Collaborate", "Assignments, handoffs and versions"],
    ["review", "Review", "Change requests and approved revisions"],
    ["publish", "Publish", "Preflight checks and scheduled release"],
  ];
  return ko.map(([id, labelKo, descriptionKo], index) => {
    const [, labelEn, descriptionEn] = en[index] ?? [id, labelKo, descriptionKo];
    return {
      id,
      label: bt(labelKo, labelEn),
      description: bt(descriptionKo, descriptionEn),
      state: index === 0 ? "current" : "upcoming",
    };
  });
}

/** Keep the existing project library as the canonical home while making first actions obvious. */
export function StudioProjectStartPanel({ locale }: { readonly locale: StudioProjectStartLocale }) {
  const bt = useBilingual("StudioProjectStartPanel");
  return (
    <section className="mt-7 min-w-0 rounded-3xl border border-line bg-panel/55 p-4 shadow-sm sm:p-6" aria-labelledby="studio-starting-point-title">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioProjectStartPanel", "en", "START FROM WHAT YOU HAVE")}</p>
          <h2 id="studio-starting-point-title" className="mt-1 break-words text-2xl font-black tracking-tight text-fg">
            {bt("지금 무엇을 가지고 있나요?", "What do you have right now?")}
          </h2>
          <p className="mt-1 max-w-3xl break-words text-sm leading-6 text-fg-3">
            {bt("실력 수준이 아니라 현재 재료를 기준으로 가장 짧은 시작 경로를 안내합니다. 기존 프로젝트는 아래에서 바로 이어서 작업할 수 있습니다.", "The shortest path is based on your current material, not an expertise label. Continue existing projects below.")}
          </p>
        </div>
        <WorkflowTrustBadge state="device-saved" locale={locale} compact={false} className="max-w-full" />
      </div>

      <StudioIntentLauncher
        actions={projectStartActions(bt)}
        ariaLabel={bt("현재 재료별 시작 경로", "Starting paths by current material")}
        actionLabel={bt("시작", "Start")}
        className="mt-5"
      />

      <div className="mt-5 min-w-0">
        <p className="mb-2 break-words text-xs font-black text-fg-2">
          {bt("한 프로젝트에서 이어지는 전체 제작 흐름", "The complete flow inside one project")}
        </p>
        <StudioTaskFlow
          steps={projectFlow(bt)}
          ariaLabel={bt("웹툰 제작 전체 흐름", "Complete webtoon production flow")}
        />
      </div>
    </section>
  );
}
