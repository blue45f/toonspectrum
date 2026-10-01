/**
 * 제작 관리 화면이 함께 쓰는 작은 표시 요소.
 *
 * 여러 파일에 복사돼 있던 Pill·SectionCard·Metric·EmptyState를 한곳으로 모으고,
 * 샘플 표시·아바타처럼 협업 화면 전반에서 같은 모양이어야 하는 요소를 추가한다.
 * 색은 디자인 토큰(`accent`, `good`, `warn`, `bad`, `cool`)만 사용한다.
 */
import { FlaskConical, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { productionInitials } from "./production-format";

import { cn } from "@/shared/lib/utils";

export type ProductionTone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONE_CLASSES: Readonly<Record<ProductionTone, string>> = Object.freeze({
  neutral: "border-line bg-raised text-fg-2",
  accent: "border-accent/35 bg-accent-soft text-accent",
  success: "border-good/35 bg-good/10 text-good",
  warning: "border-warn/35 bg-warn/10 text-warn",
  danger: "border-bad/35 bg-bad/10 text-bad",
});

const SURFACE_TONE_CLASSES: Readonly<Record<ProductionTone, string>> = Object.freeze({
  neutral: "border-line bg-panel",
  accent: "border-accent/30 bg-accent-soft",
  success: "border-good/30 bg-good/10",
  warning: "border-warn/30 bg-warn/10",
  danger: "border-bad/30 bg-bad/10",
});

export function ProductionPill({
  children,
  tone = "neutral",
  className,
}: {
  readonly children: ReactNode;
  readonly tone?: ProductionTone;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProductionSectionCard({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
}) {
  return (
    <section id={id} className={cn("creator-workflow-panel scroll-mt-4 rounded-2xl border border-line bg-card p-4", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-fg">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-2">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ProductionMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly icon: LucideIcon;
  readonly tone?: ProductionTone;
}) {
  return (
    <div className={cn("rounded-2xl border p-3.5", SURFACE_TONE_CLASSES[tone])}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">{label}</p>
        <Icon className="size-4 text-fg-3" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight text-fg">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-fg-2">{detail}</p>
    </div>
  );
}

export function ProductionEmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <p className="text-sm font-bold text-fg">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-fg-2">{description}</p>
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** 샘플·예시 데이터임을 실제 데이터와 구분해 보여 주는 배지. */
export function ProductionSampleBadge({ label, className }: { readonly label: string; readonly className?: string }) {
  return (
    <span
      data-production-sample-badge="true"
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[0.6875rem] font-bold text-warn",
        className,
      )}
    >
      <FlaskConical className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

const AVATAR_TONES: readonly string[] = Object.freeze([
  "bg-accent-soft text-accent",
  "bg-cool/15 text-cool",
  "bg-good/15 text-good",
  "bg-warn/15 text-warn",
  "bg-accent-2/15 text-accent-2",
]);

function avatarToneIndex(seed: string): number {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 9973;
  return hash % AVATAR_TONES.length;
}

/** 이름 이니셜 아바타. 색은 이름으로 결정되어 같은 사람은 어디서나 같은 색이다. */
export function ProductionAvatar({
  name,
  size = "md",
  className,
}: {
  readonly name: string;
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      title={name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-black ring-2 ring-card",
        size === "sm" ? "size-6 text-[0.625rem]" : size === "lg" ? "size-10 text-sm" : "size-8 text-xs",
        AVATAR_TONES[avatarToneIndex(name)],
        className,
      )}
    >
      {productionInitials(name)}
    </span>
  );
}

/** 여러 담당자를 겹친 아바타로 보여 주고, 이름은 텍스트로 함께 제공한다. */
export function ProductionAvatarStack({
  names,
  max = 3,
  emptyLabel,
}: {
  readonly names: readonly string[];
  readonly max?: number;
  readonly emptyLabel: string;
}) {
  if (names.length === 0) return <span className="text-xs text-fg-3">{emptyLabel}</span>;
  const visible = names.slice(0, max);
  const hidden = names.length - visible.length;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="flex -space-x-2">
        {visible.map((name) => <ProductionAvatar key={name} name={name} size="sm" />)}
        {hidden > 0 ? (
          <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-full bg-raised text-[0.625rem] font-bold text-fg-2 ring-2 ring-card">
            +{hidden}
          </span>
        ) : null}
      </span>
      <span className="truncate text-xs text-fg-2" title={names.join(" · ")}>{names.join(" · ")}</span>
    </span>
  );
}
