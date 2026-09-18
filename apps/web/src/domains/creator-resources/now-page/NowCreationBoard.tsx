import {
  ArrowRight,
  Building2,
  CloudSun,
  Copy,
  PackageSearch,
  PanelsTopLeft,
  Volume2,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";

import {
  NOW_PROGRESS_STEPS,
  type DailyTheme,
  type DirectingMode,
  type KstDay,
  type NowProgressStepId,
  type StoryBeat,
} from "../now";
import { ACTION_BUTTON, type SessionPreset } from "./config";

function IngredientCard({
  icon: Icon,
  index,
  eyebrow,
  title,
  body,
}: {
  icon: LucideIcon;
  index: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <article className="group relative min-h-52 overflow-hidden rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-accent/35 sm:p-6">
      <span className="absolute right-4 top-2 font-display text-6xl font-black tabular-nums text-fg/5" aria-hidden="true">
        {index}
      </span>
      <div className="relative flex items-center justify-between gap-3">
        <span className="text-xs font-bold tracking-[0.16em] text-accent">{eyebrow}</span>
        <span className="grid size-9 place-items-center rounded-xl bg-raised text-fg-3 transition-colors group-hover:text-accent">
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <h3 className="relative mt-10 text-lg font-bold text-fg">{title}</h3>
      <p className="relative mt-2 text-sm leading-7 text-fg-2">{body}</p>
    </article>
  );
}

function SceneIngredients({ theme }: { theme: DailyTheme }) {
  return (
    <section id="scene-ingredients" className="scroll-mt-28 space-y-4" aria-labelledby="scene-ingredients-title">
      <div>
        <p className="text-xs font-bold tracking-[0.14em] text-accent">SCENE INGREDIENTS</p>
        <h2 id="scene-ingredients-title" className="mt-1 text-2xl font-bold text-fg">
          장면을 움직이는 네 가지 감각
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
          사물·공간·빛·소리를 따로 읽은 뒤, 5컷 안에서 하나씩 공개해 정보의 순서를 설계하세요.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="오늘의 장면 재료">
        <IngredientCard index="01" icon={PackageSearch} eyebrow="OBJECT" title="오늘의 사물" body={theme.object} />
        <IngredientCard index="02" icon={Building2} eyebrow="PLACE" title="오늘의 공간" body={theme.place} />
        <IngredientCard index="03" icon={CloudSun} eyebrow="LIGHT" title="오늘의 빛" body={theme.light} />
        <IngredientCard index="04" icon={Volume2} eyebrow="SOUND" title="오늘의 소리" body={theme.sound.join(" · ")} />
      </div>
    </section>
  );
}

function MissionAndProgress({
  day,
  theme,
  mode,
  sessionPreset,
  selectedProgress,
  progressPercent,
  nextStepLabel,
  onToggleProgress,
}: {
  day: KstDay;
  theme: DailyTheme;
  mode: DirectingMode;
  sessionPreset: SessionPreset;
  selectedProgress: readonly NowProgressStepId[];
  progressPercent: number;
  nextStepLabel: string;
  onToggleProgress: (stepId: NowProgressStepId) => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)]">
      <article className="rounded-3xl border border-accent/30 bg-accent-soft p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-accent">
            <PanelsTopLeft size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">FIVE-PANEL MISSION</p>
            <h2 className="mt-2 text-2xl font-bold text-fg">오늘의 5컷 미션</h2>
            <p className="mt-4 text-base leading-8 text-fg-2">{theme.mission}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 border-t border-accent/20 pt-5 sm:grid-cols-3">
          <div>
            <span className="text-xs font-bold text-accent">시간</span>
            <p className="mt-1 text-sm font-semibold text-fg">{sessionPreset.minutes}분</p>
          </div>
          <div>
            <span className="text-xs font-bold text-accent">연출</span>
            <p className="mt-1 text-sm font-semibold text-fg">{mode.label}</p>
          </div>
          <div>
            <span className="text-xs font-bold text-accent">핵심 제약</span>
            <p className="mt-1 text-sm font-semibold leading-6 text-fg">#{theme.moods[0]}을 직접 설명하지 않기</p>
          </div>
        </div>
      </article>

      <article
        id="creation-loop"
        className="scroll-mt-28 rounded-3xl border border-line bg-panel p-5 sm:p-6"
        aria-labelledby="progress-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">CREATION LOOP</p>
            <h2 id="progress-title" className="mt-2 text-2xl font-bold text-fg">
              오늘의 진행률
            </h2>
            <p className="mt-2 text-xs text-fg-3">다음 단계 · {nextStepLabel}</p>
          </div>
          <strong className="font-display text-3xl tabular-nums text-fg">{progressPercent}%</strong>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-canvas"
          role="progressbar"
          aria-label={`${day.iso} 창작 진행률`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <span
            className="block h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-5 space-y-2">
          {NOW_PROGRESS_STEPS.map((step) => {
            const checked = selectedProgress.includes(step.id);
            return (
              <label
                aria-label={`${step.label}: ${step.detail}`}
                key={step.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors motion-reduce:transition-none",
                  checked ? "border-good/35 bg-good/10" : "border-line bg-canvas/50 hover:border-accent/35",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-accent"
                  checked={checked}
                  onChange={() => onToggleProgress(step.id)}
                />
                <span>
                  <strong className="block text-sm text-fg">{step.label}</strong>
                  <span className="mt-0.5 block text-xs leading-5 text-fg-3">{step.detail}</span>
                </span>
              </label>
            );
          })}
        </div>
        {progressPercent === 100 && (
          <p
            className="mt-4 rounded-xl border border-good/30 bg-good/10 p-4 text-sm font-semibold leading-6 text-good"
            role="status"
          >
            오늘의 루프를 완주했습니다. 첫 컷과 마지막 컷의 변화만 다시 확인하고 Studio에서 다음 장면으로 이어가세요.
          </p>
        )}
      </article>
    </section>
  );
}

function Storyboard({
  mode,
  storyBeats,
  onCopyBrief,
}: {
  mode: DirectingMode;
  storyBeats: readonly StoryBeat[];
  onCopyBrief: () => void;
}) {
  return (
    <section id="storyboard" className="scroll-mt-28 space-y-4" aria-labelledby="storyboard-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">STORY BEATS</p>
          <h2 id="storyboard-title" className="mt-1 text-2xl font-bold text-fg">
            {mode.label}용 5컷 비트 보드
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
            정답이 아니라 첫 썸네일을 빠르게 만들기 위한 연출 발판입니다. 각 문장을 화면 안의 정보 순서로 번역하세요.
          </p>
        </div>
        <button type="button" className={ACTION_BUTTON} onClick={onCopyBrief}>
          <Copy size={15} aria-hidden="true" /> 5컷 포함 브리프 복사
        </button>
      </div>
      <ol className="grid gap-3 lg:grid-cols-5">
        {storyBeats.map((beat, index) => (
          <li key={beat.id} className="relative min-h-52 rounded-2xl border border-line bg-panel p-4">
            <span className="font-display text-xs font-black tracking-[0.14em] text-accent">{beat.label}</span>
            <h3 className="mt-5 text-sm font-bold leading-6 text-fg">{beat.title}</h3>
            <p className="mt-2 text-xs leading-6 text-fg-2">{beat.body}</p>
            {index < storyBeats.length - 1 && (
              <ArrowRight
                size={15}
                className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 rounded-full bg-canvas text-fg-3 lg:block"
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function NowCreationBoard({
  day,
  theme,
  mode,
  sessionPreset,
  selectedProgress,
  progressPercent,
  nextStepLabel,
  storyBeats,
  onToggleProgress,
  onCopyBrief,
}: {
  day: KstDay;
  theme: DailyTheme;
  mode: DirectingMode;
  sessionPreset: SessionPreset;
  selectedProgress: readonly NowProgressStepId[];
  progressPercent: number;
  nextStepLabel: string;
  storyBeats: readonly StoryBeat[];
  onToggleProgress: (stepId: NowProgressStepId) => void;
  onCopyBrief: () => void;
}) {
  return (
    <>
      <SceneIngredients theme={theme} />
      <MissionAndProgress
        day={day}
        theme={theme}
        mode={mode}
        sessionPreset={sessionPreset}
        selectedProgress={selectedProgress}
        progressPercent={progressPercent}
        nextStepLabel={nextStepLabel}
        onToggleProgress={onToggleProgress}
      />
      <Storyboard mode={mode} storyBeats={storyBeats} onCopyBrief={onCopyBrief} />
    </>
  );
}
