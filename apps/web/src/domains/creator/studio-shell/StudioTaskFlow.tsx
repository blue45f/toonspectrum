import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleHelp,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import Link from "@/shared/navigation/router-link";
import { cn } from "@/shared/lib/utils";

export type StudioTaskFlowState = "complete" | "current" | "upcoming";

export interface StudioTaskFlowStep {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly state: StudioTaskFlowState;
}

/**
 * Show the smallest useful production path without shrinking labels into unreadable chips.
 * The rail scrolls on narrow viewports and keeps every step keyboard and screen-reader legible.
 */
export function StudioTaskFlow({
  steps,
  ariaLabel,
  className,
}: {
  readonly steps: readonly StudioTaskFlowStep[];
  readonly ariaLabel: string;
  readonly className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn("min-w-0 overflow-hidden rounded-2xl border border-line bg-card", className)}
    >
      <ol className="flex min-w-0 gap-2 overflow-x-auto p-3 [scrollbar-width:thin]">
        {steps.map((step, index) => {
          const complete = step.state === "complete";
          const current = step.state === "current";
          return (
            <li
              key={step.id}
              aria-current={current ? "step" : undefined}
              className={cn(
                "relative flex min-h-16 min-w-[10.5rem] flex-1 items-start gap-3 rounded-xl border px-3 py-2.5",
                complete && "border-good/30 bg-good/10",
                current && "border-accent/35 bg-accent-soft/55",
                step.state === "upcoming" && "border-line bg-panel/70",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border text-[0.6875rem] font-black",
                  complete && "border-good/35 bg-good text-white",
                  current && "border-accent/35 bg-accent text-on-accent",
                  step.state === "upcoming" && "border-line bg-card text-fg-3",
                )}
                aria-hidden="true"
              >
                {complete ? <Check size={14} /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block break-words text-xs font-black text-fg">{step.label}</span>
                {step.description ? (
                  <span className="mt-1 block break-words text-[0.6875rem] leading-5 text-fg-3">
                    {step.description}
                  </span>
                ) : null}
              </span>
              {index < steps.length - 1 ? (
                <ChevronRight
                  className="absolute -right-2.5 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-fg-3 sm:block"
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Keep disabled controls understandable instead of leaving users to guess. */
export function DisabledReason({
  id,
  visible,
  children,
  className,
}: {
  readonly id: string;
  readonly visible: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  if (!visible) return null;
  return (
    <p
      id={id}
      role="status"
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-5 text-fg-2",
        className,
      )}
    >
      <CircleHelp className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

export type RecoverableNoticeTone = "info" | "warning" | "danger";

const NOTICE_TONES: Readonly<Record<RecoverableNoticeTone, string>> = {
  info: "border-accent/30 bg-accent-soft/35",
  warning: "border-warn/30 bg-warn/10",
  danger: "border-bad/30 bg-bad/10",
};

const NOTICE_ICONS: Readonly<Record<RecoverableNoticeTone, LucideIcon>> = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
};

/** Explain failures and recovery paths without discarding the user's current inputs. */
export function RecoverableActionNotice({
  tone,
  title,
  description,
  action,
  className,
}: {
  readonly tone: RecoverableNoticeTone;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  const Icon = NOTICE_ICONS[tone];
  return (
    <section
      role={tone === "danger" ? "alert" : "status"}
      className={cn("min-w-0 rounded-2xl border p-4", NOTICE_TONES[tone], className)}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-fg-2 shadow-sm">
            <Icon size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="break-words text-sm font-black text-fg">{title}</h2>
            <p className="mt-1 break-words text-xs leading-5 text-fg-2">{description}</p>
          </div>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{action}</div> : null}
      </div>
    </section>
  );
}

/** A compact summary that keeps the chosen outcome visible beside the final action. */
export function StudioTaskSummary({
  eyebrow,
  title,
  description,
  meta,
  className,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly meta?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-2xl border border-line bg-panel/70 p-4", className)}>
      <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
      <p className="mt-1 break-words text-sm font-black text-fg">{title}</p>
      <p className="mt-1 break-words text-xs leading-5 text-fg-3">{description}</p>
      {meta ? <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">{meta}</div> : null}
    </div>
  );
}

export interface StudioIntentAction {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly badge?: string;
  readonly visual?: string;
}

/** Intent-first launcher used by entry pages and onboarding surfaces. */
export function StudioIntentLauncher({
  actions,
  ariaLabel,
  actionLabel,
  className,
}: {
  readonly actions: readonly StudioIntentAction[];
  readonly ariaLabel: string;
  readonly actionLabel: string;
  readonly className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <li key={`${action.href}:${action.title}`} className="min-w-0">
              <Link
                href={action.href}
                className="group flex h-full min-h-36 min-w-0 flex-col rounded-2xl border border-line bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-accent/45 hover:bg-raised hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transform-none"
              >
                {action.visual ? (
                  <span className="relative -mx-1 -mt-1 mb-3 block h-24 overflow-hidden rounded-xl border border-line bg-panel">
                    <img
                      src={action.visual}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
                    />
                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/[0.035]" aria-hidden="true" />
                  </span>
                ) : null}
                <span className="flex min-w-0 items-start justify-between gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-colors group-hover:border-accent/35 group-hover:text-accent">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  {action.badge ? (
                    <span className="max-w-full break-words rounded-full border border-accent/30 bg-accent-soft px-2 py-1 text-[0.625rem] font-bold leading-4 text-accent">
                      {action.badge}
                    </span>
                  ) : null}
                </span>
                <strong className="mt-4 break-words text-sm text-fg">{action.title}</strong>
                <span className="mt-1.5 flex-1 break-words text-xs leading-5 text-fg-3">{action.description}</span>
                <span className="mt-3 inline-flex min-w-0 items-center gap-1 text-xs font-bold text-accent">
                  <span className="break-words">{actionLabel}</span>
                  <ChevronRight size={13} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
