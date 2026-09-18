import {
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  Cloud,
  CloudUpload,
  FileCheck2,
  History,
  Laptop,
  RefreshCw,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

import { useT } from "@/shared/lib/i18n";
import {
  resolveWorkflowTrustPresentation,
  type WorkflowTrustLocale,
  type WorkflowTrustState,
  type WorkflowTrustTone,
} from "@/shared/lib/workflow-trust";
import { cn } from "@/shared/lib/utils";

const ICONS: Readonly<Record<WorkflowTrustState, LucideIcon>> = {
  "resume-ready": History,
  "device-saved": Laptop,
  syncing: CloudUpload,
  synced: Cloud,
  "offline-pending": WifiOff,
  "retry-needed": RefreshCw,
  conflict: CircleAlert,
  "review-submitted": FileCheck2,
  approved: BadgeCheck,
  published: CheckCircle2,
};

const TONES: Readonly<Record<WorkflowTrustTone, string>> = {
  neutral: "border-line bg-raised text-fg-2",
  accent: "border-accent/35 bg-accent-soft text-accent",
  success: "border-good/35 bg-good/10 text-good",
  warning: "border-warn/35 bg-warn/10 text-warn",
  danger: "border-bad/35 bg-bad/10 text-bad",
};

export interface WorkflowTrustBadgeProps {
  readonly state: WorkflowTrustState;
  /** @deprecated Copy follows the global i18n locale. */
  readonly locale?: WorkflowTrustLocale;
  readonly compact?: boolean;
  readonly className?: string;
}

export function WorkflowTrustBadge({
  state,
  compact = true,
  className,
}: WorkflowTrustBadgeProps) {
  const t = useT();
  const presentation = resolveWorkflowTrustPresentation(state);
  const description = t(presentation.description);
  const Icon = ICONS[state];
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[0.6875rem] font-semibold leading-none",
        TONES[presentation.tone],
        className,
      )}
      role="status"
      aria-live={presentation.live}
      title={description}
      data-workflow-trust-state={state}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{t(presentation.label)}</span>
      {!compact ? <span className="sr-only">. {description}</span> : null}
    </span>
  );
}
