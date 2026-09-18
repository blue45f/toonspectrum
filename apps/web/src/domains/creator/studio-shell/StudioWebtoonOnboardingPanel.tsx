import {
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Check, CheckCircle2, Circle, Compass, Flag, ListChecks } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  WEBTOON_CADENCES,
  WEBTOON_ONBOARDING_GOALS,
  WEBTOON_STARTING_POINTS,
  WEBTOON_TEAM_MODELS,
  buildWebtoonOnboardingPlan,
  completeStudioWebtoonOnboarding,
  readStudioWebtoonOnboardingProfile,
  toggleStudioWebtoonOnboardingTask,
  webtoonOnboardingProjectHref,
  writeStudioWebtoonOnboardingProfile,
  type StudioWebtoonOnboardingProfile,
} from "@/shared/lib/webtoon-production-onboarding";
import { cn } from "@/shared/lib/utils";

type Locale = string;

function localizedLabel(
  options: readonly { readonly id: string; readonly labelKo: string; readonly labelEn: string }[],
  id: string,
  locale: Locale,
): string {
  const option = options.find((item) => item.id === id);
  if (!option) return id;
  return translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", option.labelKo, option.labelEn);
}

function taskId(profile: StudioWebtoonOnboardingProfile, index: number): string {
  return `${profile.startingPoint}:task:${index + 1}`;
}

export function StudioWebtoonOnboardingPanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: Locale;
}) {
  const [profile, setProfile] = useState<StudioWebtoonOnboardingProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setProfile(readStudioWebtoonOnboardingProfile(window.localStorage, projectId));
    setLoaded(true);
  }, [projectId]);

  const plan = useMemo(() => profile ? buildWebtoonOnboardingPlan(profile) : null, [profile]);
  const tasks = plan ? (translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", plan.tasksKo, plan.tasksEn)) : [];
  const completedCount = profile
    ? tasks.filter((_, index) => profile.completedTaskIds.includes(taskId(profile, index))).length
    : 0;
  const allTasksComplete = tasks.length > 0 && completedCount === tasks.length;

  const persist = (next: StudioWebtoonOnboardingProfile) => {
    if (typeof window === "undefined") return;
    try {
      writeStudioWebtoonOnboardingProfile(window.localStorage, next);
      setProfile(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", "온보딩 진행을 저장하지 못했습니다.", "Onboarding progress could not be saved."));
    }
  };

  const toggleTask = (index: number) => {
    if (!profile) return;
    persist(toggleStudioWebtoonOnboardingTask(profile, taskId(profile, index)));
  };

  const complete = () => {
    if (!profile || !allTasksComplete) return;
    persist(completeStudioWebtoonOnboarding(profile));
  };

  if (!loaded || !profile || profile.completedAt || !plan) return null;

  const progress = Math.round((completedCount / Math.max(tasks.length, 1)) * 100);
  const recommendedHref = webtoonOnboardingProjectHref(projectId, profile);
  const badges = [
    localizedLabel(WEBTOON_STARTING_POINTS, profile.startingPoint, locale),
    localizedLabel(WEBTOON_ONBOARDING_GOALS, profile.goal, locale),
    localizedLabel(WEBTOON_TEAM_MODELS, profile.teamModel, locale),
    localizedLabel(WEBTOON_CADENCES, profile.cadence, locale),
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-accent/30 bg-card shadow-sm" aria-labelledby="webtoon-project-onboarding-title">
      <div className="grid gap-6 bg-accent-soft/25 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.65fr)] lg:items-start">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
              <Compass size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">{translateCurrentStaticSourceText("domains.creator.studio.shell.StudioWebtoonOnboardingPanel", "en", "PROJECT ONBOARDING")}</p>
              <h2 id="webtoon-project-onboarding-title" className="mt-1 break-words text-xl font-black text-fg sm:text-2xl">
                {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", plan.titleKo, plan.titleEn)}
              </h2>
              <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-fg-2">
                {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", plan.summaryKo, plan.summaryEn)}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" aria-label={translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", "선택한 제작 조건", "Selected production conditions")}>
            {badges.map((badge) => (
              <span key={badge} className="rounded-full border border-accent/25 bg-card px-3 py-1 text-xs font-bold text-fg-2">{badge}</span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-accent/20 bg-card p-4">
          <div className="flex items-start gap-3">
            <Flag className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <p className="text-[0.65rem] font-bold text-fg-3">{translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", "첫 승인 마일스톤", "First approval milestone")}</p>
              <p className="mt-1 text-sm font-black text-fg">{translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", plan.milestoneKo, plan.milestoneEn)}</p>
            </div>
          </div>
          <Link href={recommendedHref} className={buttonClass({ variant: "outline", size: "sm", className: "mt-4 w-full min-w-0" })}>
            {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", "추천 작업공간 열기", "Open recommended workspace")}
          </Link>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ListChecks size={18} className="text-accent" aria-hidden="true" />
              <h3 className="text-lg font-black text-fg">{translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", "첫 작업 체크리스트", "First-work checklist")}</h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", "기능을 둘러보는 대신 실제 제작 준비 항목을 완료하세요.", "Complete real production setup instead of a generic feature tour.")}
            </p>
          </div>
          <p className="text-sm font-black text-accent">{completedCount} / {tasks.length} · {progress}%</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-raised" aria-hidden="true">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
        </div>

        <ol className="mt-5 grid gap-3 lg:grid-cols-2">
          {tasks.map((task, index) => {
            const id = taskId(profile, index);
            const completed = profile.completedTaskIds.includes(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-pressed={completed}
                  onClick={() => toggleTask(index)}
                  className={cn(
                    "flex min-h-16 w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                    completed ? "border-success/35 bg-success-soft/15" : "border-line bg-panel hover:border-accent/40 hover:bg-raised",
                  )}
                >
                  <span className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
                    completed ? "border-success bg-success text-white" : "border-line bg-card text-fg-3",
                  )}>
                    {completed ? <Check size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
                  </span>
                  <span className={cn("text-sm font-semibold leading-6", completed ? "text-fg-2 line-through" : "text-fg")}>{task}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {error ? <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-soft/10 px-3 py-2 text-xs font-semibold text-danger">{error}</p> : null}

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/learn/process#production-onboarding" className={buttonClass({ variant: "quiet", className: "w-full min-w-0 sm:w-auto" })}>
            {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", "제작 과정과 트랙 다시 보기", "Review the workflow and tracks")}
          </Link>
          <button
            type="button"
            disabled={!allTasksComplete}
            onClick={complete}
            className={buttonClass({ className: "w-full min-w-0 sm:w-auto" })}
          >
            <CheckCircle2 size={17} aria-hidden="true" />
            {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", "초기 제작 준비 완료", "Complete initial production setup")}
          </button>
        </div>
        {!allTasksComplete ? (
          <p className="mt-3 text-right text-xs leading-5 text-fg-3">
            {translateBilingualValueForLocale(locale, "domains.creator.studio.shell.StudioWebtoonOnboardingPanel", "모든 첫 작업을 확인하면 온보딩을 완료할 수 있습니다.", "Complete every first-work item to finish onboarding.")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
