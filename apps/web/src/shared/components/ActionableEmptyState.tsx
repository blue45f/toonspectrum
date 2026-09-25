import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import Link from "@/shared/navigation/router-link";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "./ui/button-utils";

export interface ActionableEmptyStateAction {
  readonly href: string;
  readonly label: string;
}

export function ActionableEmptyState({
  icon: Icon,
  title,
  description,
  primary,
  secondary,
  sample,
  children,
  className,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly primary: ActionableEmptyStateAction;
  readonly secondary?: ActionableEmptyStateAction;
  readonly sample?: ActionableEmptyStateAction;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      data-actionable-empty-state="true"
      className={cn(
        "relative overflow-hidden rounded-3xl border border-dashed border-line bg-gradient-to-br from-card/85 via-card/60 to-panel/50 p-6 text-left sm:p-8",
        className,
      )}
    >
      <span aria-hidden="true" className="absolute -right-16 -top-20 size-52 rounded-full border border-accent/15" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent shadow-sm">
          <Icon size={21} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black tracking-tight text-fg">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">{description}</p>
          {children ? <div className="mt-4">{children}</div> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={primary.href} className={buttonClass({ size: "sm", className: "min-h-11" })}>{primary.label}</Link>
            {secondary ? <Link href={secondary.href} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>{secondary.label}</Link> : null}
            {sample ? <Link href={sample.href} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>{sample.label}</Link> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ActionableEmptyState;
