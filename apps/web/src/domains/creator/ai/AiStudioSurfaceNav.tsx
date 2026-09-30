import { Clapperboard, Cpu, KeyRound, PackageCheck, ShieldCheck, SlidersHorizontal, Sparkles, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  AI_STUDIO_CONDITION_LABELS,
  AI_STUDIO_SURFACES,
  aiStudioSurface,
  type AiStudioConditionKind,
  type AiStudioSurfaceId,
} from "./ai-studio-hub";
import { PillTabNav } from "./PillTabNav";

const SURFACE_ICONS: Readonly<Record<AiStudioSurfaceId, LucideIcon>> = {
  director: Sparkles,
  generate: Clapperboard,
  runtime: Cpu,
  settings: SlidersHorizontal,
};

const CONDITION_ICONS: Readonly<Record<AiStudioConditionKind, LucideIcon>> = {
  cost: WalletCards,
  key: KeyRound,
  data: ShieldCheck,
  output: PackageCheck,
};

/** AI 진입 화면 네 곳을 같은 순서·같은 이름으로 오가는 탭형 이동 막대. */
function AiStudioSurfaceNav({ current }: { readonly current: AiStudioSurfaceId }) {
  const bt = useBilingual("AiStudioSurfaceNav");
  return (
    <PillTabNav
      label={bt("AI 도구 이동", "AI tools")}
      items={AI_STUDIO_SURFACES.map((surface) => ({
        id: surface.id,
        href: surface.href,
        label: bt(surface.title.ko, surface.title.en),
        icon: SURFACE_ICONS[surface.id],
        active: surface.id === current,
      }))}
    />
  );
}

/** AI 진입 화면 공통 머리말: 짧은 제목·설명과 AI 도구 이동 막대를 같은 자리에 둔다. */
export function AiStudioPageHeader({
  current,
  eyebrow,
  title,
  lede,
}: {
  readonly current: AiStudioSurfaceId;
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly lede: ReactNode;
}) {
  return (
    <header className="grid gap-5">
      <div className="min-w-0 max-w-3xl">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">{eyebrow}</p>
        <h1 className="mt-2 break-keep text-balance text-3xl font-black tracking-[-0.04em] text-fg sm:text-[2.6rem] sm:leading-tight">{title}</h1>
        <p className="mt-3 break-keep text-sm leading-7 text-fg-2 sm:text-base">{lede}</p>
      </div>
      <AiStudioSurfaceNav current={current} />
    </header>
  );
}

/** 한 AI 화면의 비용·키·데이터·결과 조건을 아이콘과 함께 나열한다. */
export function AiStudioConditionList({
  surfaceId,
  className,
}: {
  readonly surfaceId: AiStudioSurfaceId;
  readonly className?: string;
}) {
  const bt = useBilingual("AiStudioConditionList");
  const surface = aiStudioSurface(surfaceId);
  return (
    <dl className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {surface.conditions.map((condition) => {
        const Icon = CONDITION_ICONS[condition.kind];
        const label = AI_STUDIO_CONDITION_LABELS[condition.kind];
        return (
          <div key={condition.kind} className="flex min-w-0 items-start gap-3 rounded-2xl border border-line bg-card/80 p-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Icon size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-fg-3">{bt(label.ko, label.en)}</dt>
              <dd className="mt-1 text-sm font-semibold leading-5 text-fg">{bt(condition.value.ko, condition.value.en)}</dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}

/** AI 허브의 "무엇을 할 수 있나요" 카드 묶음. 각 카드는 실제 화면으로 이동한다. */
export function AiStudioSurfaceCards({ current }: { readonly current: AiStudioSurfaceId }) {
  const bt = useBilingual("AiStudioSurfaceCards");
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {AI_STUDIO_SURFACES.map((surface) => {
        const Icon = SURFACE_ICONS[surface.id];
        const here = surface.id === current;
        return (
          <li key={surface.id} className="min-w-0">
            <article
              aria-labelledby={`ai-surface-${surface.id}`}
              className={cn(
                "flex h-full flex-col rounded-3xl border p-5 shadow-sm",
                here ? "border-accent/60 bg-accent-soft/60" : "border-line bg-card/80",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-panel text-accent">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 id={`ai-surface-${surface.id}`} className="text-base font-black text-fg">
                    {bt(surface.title.ko, surface.title.en)}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-fg-2">{bt(surface.summary.ko, surface.summary.en)}</p>
                </div>
              </div>
              <dl className="mt-4 grid flex-1 gap-1.5 text-xs leading-5">
                {surface.conditions.map((condition) => {
                  const ConditionIcon = CONDITION_ICONS[condition.kind];
                  const label = AI_STUDIO_CONDITION_LABELS[condition.kind];
                  return (
                    <div key={condition.kind} className="grid grid-cols-[1.25rem_5.5rem_minmax(0,1fr)] items-start gap-1.5">
                      <ConditionIcon size={14} className="mt-0.5 text-accent" aria-hidden="true" />
                      <dt className="font-bold text-fg-3">{bt(label.ko, label.en)}</dt>
                      <dd className="text-fg-2">{bt(condition.value.ko, condition.value.en)}</dd>
                    </div>
                  );
                })}
              </dl>
              {here ? (
                <p className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-accent">{bt("지금 보고 있는 화면", "You are here")}</p>
              ) : (
                <Link
                  href={surface.href}
                  className="mt-4 inline-flex min-h-11 items-center gap-1 self-start rounded-xl px-1 text-sm font-bold text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {bt(`${surface.title.ko} 열기`, `Open ${surface.title.en}`)}
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
