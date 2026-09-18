import {
  ArrowRight,
  Check,
  Circle,
  ExternalLink,
  Factory,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useBilingual  } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  webtoonProductionActionHref,
  webtoonProductionStagesForProjectView,
  type WebtoonProductionStageSupport,
} from "@/shared/lib/webtoon-production-support";
import { cn } from "@/shared/lib/utils";

import type { StudioProjectSection } from "../studio-project-views";

type ProgressMap = Readonly<Record<string, readonly number[]>>;

function progressKey(projectId: string, stageId: string): string {
  return `toonstudio:webtoon-production-checks:v1:${encodeURIComponent(projectId)}:${stageId}`;
}

function readProgress(projectId: string, stage: WebtoonProductionStageSupport): readonly number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(progressKey(projectId, stage.stageId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((value): value is number => (
      Number.isInteger(value) && value >= 0 && value < stage.readinessChecksKo.length
    )))];
  } catch {
    return [];
  }
}

function writeProgress(projectId: string, stageId: string, values: readonly number[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(progressKey(projectId, stageId), JSON.stringify(values));
  } catch {
    // Progress is a convenience layer; canonical project data must keep working if storage is unavailable.
  }
}

function localizedStageTitle(
  stage: WebtoonProductionStageSupport,
  localize: (ko: string, en: string) => string,
): string {
  return localize(stage.titleKo, stage.titleEn);
}

export function StudioWebtoonProductionCompanion({
  projectId,
  section,
  view,
  locale: _locale,
}: {
  readonly projectId: string;
  readonly section: StudioProjectSection;
  readonly view: string;
  readonly locale?: string;
}) {
  const bt = useBilingual("StudioWebtoonProductionCompanion");
  const stages = useMemo(
    () => webtoonProductionStagesForProjectView(section, view),
    [section, view],
  );
  const [progress, setProgress] = useState<ProgressMap>({});

  useEffect(() => {
    setProgress(Object.fromEntries(
      stages.map((stage) => [stage.stageId, readProgress(projectId, stage)]),
    ));
  }, [projectId, stages]);

  if (stages.length === 0) return null;

  const toggleCheck = (stage: WebtoonProductionStageSupport, index: number) => {
    setProgress((current) => {
      const selected = new Set(current[stage.stageId] ?? []);
      if (selected.has(index)) selected.delete(index);
      else selected.add(index);
      const values = [...selected].sort((a, b) => a - b);
      writeProgress(projectId, stage.stageId, values);
      return { ...current, [stage.stageId]: values };
    });
  };

  return (
    <section className="rounded-3xl border border-accent/25 bg-card p-5 shadow-sm sm:p-6" aria-labelledby="webtoon-production-companion-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Factory size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">WEBTOON PRODUCTION COMPANION</p>
            <h2 id="webtoon-production-companion-title" className="mt-1 text-xl font-black text-fg sm:text-2xl">
              {bt("현재 화면과 연결된 실제 제작 단계", "Production stages connected to this workspace")}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
              {bt("지금 사용하는 기능이 실제 연재 공정의 어디에 해당하는지, 무엇을 확인하고 어디로 넘겨야 하는지 함께 보여줍니다.", "See where this workspace sits in a real serialization pipeline and what should be checked before handoff.")}
            </p>
          </div>
        </div>
        <Link href="/learn/process#episode-pipeline" className={buttonClass({ variant: "outline", size: "sm", className: "shrink-0 gap-2" })}>
          {bt("전체 제작 과정", "Full workflow")}
          <ExternalLink size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {stages.map((stage) => {
          const completed = progress[stage.stageId] ?? [];
          const percent = Math.round((completed.length / stage.readinessChecksKo.length) * 100);
          return (
            <article key={stage.stageId} className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-sm font-black text-on-accent">{stage.order}</span>
                  <div className="min-w-0">
                    <p className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-fg-3">EPISODE PIPELINE</p>
                    <h3 className="mt-1 text-lg font-black text-fg">{localizedStageTitle(stage, bt)}</h3>
                  </div>
                </div>
                <span className="rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-xs font-black text-accent">
                  {completed.length}/{stage.readinessChecksKo.length} · {percent}%
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-canvas p-3">
                  <p className="text-xs font-black text-fg">입력</p>
                  <p className="mt-1 text-xs leading-5 text-fg-2">{stage.inputKo}</p>
                </div>
                <div className="rounded-xl bg-canvas p-3">
                  <p className="text-xs font-black text-fg">다음 인계</p>
                  <p className="mt-1 text-xs leading-5 text-fg-2">{stage.handoffKo}</p>
                </div>
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-soft/10 p-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <p className="text-xs leading-5 text-fg-2"><strong className="text-warning">재작업 위험 · </strong>{stage.reworkRiskKo}</p>
              </div>

              <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-accent" aria-hidden="true" />
                  <p className="text-xs font-black text-fg">이 단계에서 줄이는 반복 작업</p>
                </div>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2">
                  {stage.conveniencesKo.map((item) => <li key={item}>• {item}</li>)}
                </ul>
              </div>

              <div className="mt-4">
                <div className="flex items-end justify-between gap-3">
                  <p className="text-xs font-black text-fg">다음 단계 전 확인</p>
                  <p className="text-[0.65rem] font-bold text-fg-3">보조 체크 · 정식 승인을 대체하지 않음</p>
                </div>
                <div className="mt-2 grid gap-2">
                  {stage.readinessChecksKo.map((item, index) => {
                    const checked = completed.includes(index);
                    return (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => toggleCheck(stage, index)}
                        className={cn(
                          "flex min-h-10 items-start gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold leading-5 transition-colors",
                          checked ? "border-success/35 bg-success-soft/15 text-fg-2" : "border-line bg-card text-fg hover:border-accent/40",
                        )}
                      >
                        <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", checked ? "border-success bg-success text-white" : "border-line text-fg-3")}>
                          {checked ? <Check size={12} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                        </span>
                        <span className={checked ? "line-through" : undefined}>{item}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {stage.actions.map((action, index) => (
                  <Link
                    key={action.id}
                    href={webtoonProductionActionHref(projectId, action)}
                    className={buttonClass({
                      variant: index === 0 ? "solid" : "outline",
                      size: "sm",
                      className: "gap-1.5",
                    })}
                  >
                    {bt(action.labelKo, action.labelEn)}
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
