import {
  ArrowRight,
  CheckCircle2,
  Layers3,
  MousePointer2,
  Palette,
  Search,
  Sparkles,
  Store,
} from "lucide-react";

import Link from "@/compat/router-link";
import { cn } from "@/shared/lib/utils";

export type PurposeExperienceVariant = "create" | "discover" | "market" | "my";

interface PurposeExperienceStageProps {
  readonly variant: PurposeExperienceVariant;
  readonly ariaLabel: string;
  readonly steps: readonly [string, string, string];
  readonly className?: string;
}

const VARIANT_ICONS = {
  create: [Sparkles, Palette, Layers3],
  discover: [Search, MousePointer2, Sparkles],
  market: [Search, Store, Palette],
  my: [Layers3, CheckCircle2, MousePointer2],
} as const;

const VARIANT_CAPTIONS = {
  create: ["START", "SHAPE", "MAKE"],
  discover: ["ASK", "FILTER", "FIND"],
  market: ["FIND", "TRY", "USE"],
  my: ["WORK", "SAVE", "CONTINUE"],
} as const;

export function PurposeExperienceStage({
  variant,
  ariaLabel,
  steps,
  className,
}: PurposeExperienceStageProps) {
  const icons = VARIANT_ICONS[variant];
  const captions = VARIANT_CAPTIONS[variant];

  return (
    <figure
      aria-label={ariaLabel}
      className={cn(
        "relative isolate min-h-64 overflow-hidden rounded-[1.75rem] border border-line/80 bg-card/70 p-4 shadow-xl sm:min-h-72 sm:p-5",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-20 size-56 rounded-full bg-accent/15 blur-3xl motion-safe:animate-[hero-bloom_5s_ease-in-out_infinite]"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 -left-16 size-56 rounded-full bg-cool/10 blur-3xl motion-safe:animate-[hero-bloom_6.5s_ease-in-out_infinite_reverse]"
      />

      <div className="relative flex h-full min-h-56 flex-col justify-between">
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-[0.62rem] font-bold tracking-[0.16em] text-fg-3">
            LIVE WORKFLOW
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-line bg-panel/70 px-2.5 py-1 text-[0.64rem] font-semibold text-fg-2">
            <span className="size-1.5 rounded-full bg-good motion-safe:animate-pulse" />
            interactive
          </span>
        </div>

        <div className="my-5 grid grid-cols-3 items-center gap-2">
          {steps.map((step, index) => {
            const Icon = icons[index];
            return (
              <div key={step} className="relative min-w-0">
                {index > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-[calc(100%-0.3rem)] top-6 h-px w-[calc(100%-0.2rem)] overflow-hidden bg-line"
                  >
                    <span className="block h-full w-1/2 bg-gradient-to-r from-transparent via-accent to-transparent motion-safe:animate-[spectrum-sheen_3s_linear_infinite]" />
                  </span>
                ) : null}
                <div className="group relative rounded-2xl border border-line/80 bg-panel/80 p-2.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-accent/45 hover:bg-raised/90 sm:p-3">
                  <span className="grid size-9 place-items-center rounded-xl border border-line bg-canvas/65 text-accent transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="mt-4 block truncate font-display text-[0.56rem] font-bold tracking-[0.13em] text-fg-3">
                    {captions[index]}
                  </span>
                  <strong className="mt-1 block text-xs leading-4 text-fg sm:text-sm">{step}</strong>
                </div>
              </div>
            );
          })}
        </div>

        <div aria-hidden="true" className="relative h-12 overflow-hidden rounded-xl border border-line/70 bg-canvas/55">
          <svg className="absolute inset-0 size-full" viewBox="0 0 420 48" preserveAspectRatio="none">
            <path
              d="M-15 34 C45 8 88 42 145 21 S243 5 305 27 S374 39 440 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="text-accent/65"
            />
            <path
              d="M-15 38 C55 16 96 45 160 27 S255 10 324 31 S384 40 440 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 6"
              className="text-fg-3/40"
            />
          </svg>
          <span className="absolute left-0 top-0 h-full w-14 bg-gradient-to-r from-transparent via-accent/10 to-transparent motion-safe:animate-[route-spectrum-wipe_4.8s_ease-in-out_infinite]" />
        </div>
      </div>
    </figure>
  );
}

interface FriendlyQuickGuideProps {
  readonly title: string;
  readonly description: string;
  readonly steps: readonly string[];
  readonly actionLabel?: string;
  readonly actionHref?: string;
  readonly defaultOpen?: boolean;
  readonly className?: string;
}

export function FriendlyQuickGuide({
  title,
  description,
  steps,
  actionLabel,
  actionHref,
  defaultOpen = false,
  className,
}: FriendlyQuickGuideProps) {
  return (
    <details
      open={defaultOpen || undefined}
      className={cn("group overflow-hidden rounded-2xl border border-line/75 bg-panel/55", className)}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-accent">
          <Sparkles size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm text-fg">{title}</strong>
          <span className="mt-0.5 block text-xs leading-5 text-fg-3">{description}</span>
        </span>
        <span aria-hidden="true" className="text-xs font-bold text-accent transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-line/70 px-4 py-4">
        <ol className="grid gap-2 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step} className="flex items-start gap-2 rounded-xl bg-card/65 p-3 text-xs leading-5 text-fg-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[0.62rem] font-bold text-on-accent">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-accent transition-colors hover:border-accent/40 hover:bg-raised">
            {actionLabel}<ArrowRight size={13} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </details>
  );
}
