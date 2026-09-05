import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const STUDIO_PRODUCTION_INPUT_CLASS =
  "min-h-10 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none " +
  "placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/20 pointer-coarse:min-h-11";

export const STUDIO_PRODUCTION_TEXTAREA_CLASS =
  "min-h-24 w-full resize-y rounded-xl border border-line bg-panel px-3 py-2.5 text-sm leading-relaxed " +
  "text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/20";

export function StudioProductionCard({
  children,
  className,
  title,
  description,
  action,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly title?: string;
  readonly description?: string;
  readonly action?: ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-line bg-card/95 p-4 shadow-sm", className)}>
      {(title || description || action) ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-bold text-fg">{title}</h2> : null}
            {description ? (
              <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-fg-2">{description}</p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StudioProductionMetric({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail?: string;
  readonly icon?: ReactNode;
  readonly tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "border-line bg-panel text-fg",
    accent: "border-accent/35 bg-accent-soft/60 text-fg",
    success: "border-emerald-500/30 bg-emerald-500/10 text-fg",
    warning: "border-amber-500/35 bg-amber-500/10 text-fg",
    danger: "border-red-500/35 bg-red-500/10 text-fg",
  }[tone];
  return (
    <div className={cn("rounded-2xl border p-3.5", toneClass)}>
      <div className="flex items-center justify-between gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fg-2">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight">{value}</div>
      {detail ? <p className="mt-1 text-xs leading-relaxed text-fg-2">{detail}</p> : null}
    </div>
  );
}

export function StudioProductionProgress({
  value,
  label,
  className,
}: {
  readonly value: number;
  readonly label?: string;
  readonly className?: string;
}) {
  const normalized = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("space-y-1", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
          <span>{label}</span>
          <span className="font-semibold text-fg">{normalized}%</span>
        </div>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalized}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${normalized}%` }}
        />
      </div>
    </div>
  );
}

export function StudioProductionPill({
  children,
  tone = "neutral",
  className,
}: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  readonly className?: string;
}) {
  const toneClass = {
    neutral: "border-line bg-raised text-fg-2",
    accent: "border-accent/30 bg-accent-soft text-accent",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  }[tone];
  return (
    <span className={cn(
      "inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold",
      toneClass,
      className,
    )}>
      {children}
    </span>
  );
}

export function StudioProductionEmpty({
  icon,
  title,
  description,
  action,
}: {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-line bg-panel/50 p-6 text-center">
      <div className="max-w-sm">
        {icon ? <div className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-raised text-fg-2">{icon}</div> : null}
        <h3 className="text-sm font-bold text-fg">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-2">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

export function StudioProductionField({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between gap-2 text-xs font-semibold text-fg">
        {label}
        {hint ? <span className="font-normal text-fg-3">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function formatStudioProductionDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    ...(value.length === 10 ? {} : { hour: "2-digit", minute: "2-digit" }),
  }).format(date);
}

export function studioProductionRelativeDate(
  value: string,
  nowIso = new Date().toISOString(),
): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  const now = new Date(nowIso);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return value;
  const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  if (days === -1) return "어제";
  if (days > 1) return `${days}일 후`;
  return `${Math.abs(days)}일 지남`;
}
