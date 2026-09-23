import {
  ArrowRight,
  BadgeCheck,
  CircleDot,
  FileCheck2,
  GitCompareArrows,
  MessageSquare,
  PackageCheck,
  PencilLine,
  Send,
} from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  productionManuscriptLifecycleLabel,
  productionManuscriptRevisionLabel,
  type ProductionManuscriptLifecyclePhase,
  type ProductionManuscriptProcess,
} from "./production-manuscript-model";

type Destination = "versions" | "feedback" | "delivery";

interface Props {
  readonly process: ProductionManuscriptProcess;
  readonly onOpen: (destination: Destination) => void;
  readonly compact?: boolean;
}

const STAGES = [
  { id: "editing", label: "작업", icon: PencilLine },
  { id: "submitted", label: "제출", icon: Send },
  { id: "review", label: "검수", icon: MessageSquare },
  { id: "approved", label: "승인", icon: BadgeCheck },
  { id: "released", label: "전달", icon: PackageCheck },
] as const;

function stageIndex(phase: ProductionManuscriptLifecyclePhase): number {
  if (phase === "released") return 4;
  if (phase === "approved" || phase === "ready-to-deliver") return 3;
  if (phase === "in-review" || phase === "changes-requested") return 2;
  if (phase === "submitted") return 1;
  return 0;
}

function phaseTone(phase: ProductionManuscriptLifecyclePhase): string {
  if (phase === "changes-requested") return "border-bad/35 bg-bad/10 text-bad";
  if (phase === "in-review" || phase === "submitted") return "border-warn/35 bg-warn/10 text-warn";
  if (phase === "approved" || phase === "ready-to-deliver" || phase === "released") {
    return "border-good/35 bg-good/10 text-good";
  }
  return "border-line bg-raised text-fg-2";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function RevisionIdentity({
  label,
  revision,
  fallback,
  tone = "neutral",
}: {
  readonly label: string;
  readonly revision: ProductionManuscriptProcess["headRevision"];
  readonly fallback: string;
  readonly tone?: "neutral" | "good" | "accent";
}) {
  const tones = {
    neutral: "border-line bg-panel",
    good: "border-good/25 bg-good/5",
    accent: "border-accent/25 bg-accent-soft/20",
  } as const;
  return <div className={cn("min-w-0 rounded-2xl border p-3", tones[tone])}>
    <p className="text-[0.625rem] font-black uppercase tracking-[0.14em] text-fg-3">{label}</p>
    {revision ? <>
      <p className="mt-1 truncate text-sm font-black text-fg">
        {productionManuscriptRevisionLabel(revision.kind)}
      </p>
      <p className="mt-1 truncate font-mono text-[0.625rem] text-fg-3">{revision.id}</p>
      <p className="mt-1 text-[0.6875rem] text-fg-2">{formatDate(revision.createdAt)}</p>
    </> : <p className="mt-2 text-sm font-bold text-fg-3">{fallback}</p>}
  </div>;
}

export function ProductionManuscriptLifecyclePanel({ process, onOpen, compact = false }: Props) {
  const activeStage = stageIndex(process.lifecyclePhase);
  const hasActiveReview = process.latestReview?.status === "open"
    || process.latestReview?.status === "changes-requested";
  return <section
    className={cn("rounded-3xl border border-line bg-card", compact ? "p-4" : "p-4 sm:p-6")}
    aria-labelledby={`manuscript-lifecycle-${process.artifact.id}`}
  >
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            "inline-flex min-h-7 items-center rounded-full border px-2.5 text-[0.6875rem] font-bold",
            phaseTone(process.lifecyclePhase),
          )}>
            <CircleDot className="mr-1 size-3.5" aria-hidden="true" />
            {productionManuscriptLifecycleLabel(process.lifecyclePhase)}
          </span>
          <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[0.6875rem] font-bold text-fg-2">
            {process.artifact.scope.episodeId ?? "프로젝트 공통"} · {process.label}
          </span>
        </div>
        <h2 id={`manuscript-lifecycle-${process.artifact.id}`} className="mt-2 truncate text-xl font-black text-fg">
          {process.artifact.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-fg-2">
          HEAD는 가장 최근 작업, FINAL은 승인 기준, RELEASE는 실제 전달·게시 기준입니다. 세 상태는 서로 자동 대체되지 않습니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onOpen("versions")} className={buttonClass({ variant: "outline", size: "sm" })}>
          <GitCompareArrows className="size-4" aria-hidden="true" /> 버전·비교
        </button>
        <button type="button" onClick={() => onOpen("feedback")} className={buttonClass({ variant: "outline", size: "sm" })}>
          <MessageSquare className="size-4" aria-hidden="true" /> 검수
        </button>
        <button type="button" onClick={() => onOpen("delivery")} className={buttonClass({ size: "sm" })}>
          <PackageCheck className="size-4" aria-hidden="true" /> 공유·전달
        </button>
      </div>
    </div>

    <ol className="mt-5 grid grid-cols-5 gap-1" aria-label="원고 제작 단계">
      {STAGES.map(({ id, label, icon: Icon }, index) => {
        const current = index === activeStage;
        const completed = index < activeStage || process.lifecyclePhase === "released";
        const blocked = current && process.lifecyclePhase === "changes-requested";
        return <li key={id} className="min-w-0">
          <div className={cn(
            "flex min-h-12 flex-col items-center justify-center rounded-xl border px-1 text-center",
            current && blocked ? "border-bad/40 bg-bad/10 text-bad"
              : current ? "border-accent/45 bg-accent-soft text-accent"
                : completed ? "border-good/25 bg-good/5 text-good"
                  : "border-line bg-panel text-fg-3",
          )} aria-current={current ? "step" : undefined}>
            <Icon className="size-4" aria-hidden="true" />
            <span className="mt-1 truncate text-[0.625rem] font-bold">{label}</span>
          </div>
        </li>;
      })}
    </ol>

    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <RevisionIdentity label="HEAD · 최근 작업" revision={process.headRevision} fallback="작업본 없음" tone="accent" />
      <RevisionIdentity label="FINAL · 승인 기준" revision={process.approvedRevision} fallback="최종본 미지정" tone="good" />
      <RevisionIdentity label="RELEASE · 전달 기준" revision={process.releaseRevision} fallback="아직 전달되지 않음" />
    </div>

    {process.hasUnapprovedChanges ? <div className="mt-3 flex items-start gap-2 rounded-xl border border-warn/35 bg-warn/10 p-3 text-xs leading-5 text-fg-2" role="status">
      <FileCheck2 className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
      <p>승인된 FINAL 이후 HEAD가 변경됐습니다. 기존 FINAL은 보존되며 새 작업본은 다시 제출·검수해야 합니다.</p>
    </div> : null}
    {hasActiveReview && process.latestReview ? <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line bg-panel p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-xs font-black text-fg">{process.latestReview.title}</p>
        <p className="mt-1 text-[0.6875rem] text-fg-3">
          검토자 {process.latestReview.reviewerIds.length}명 · 필수 수정 {process.latestReview.openRequiredCommentCount}개
        </p>
      </div>
      <button type="button" onClick={() => onOpen("feedback")} className={buttonClass({ variant: "outline", size: "sm" })}>
        검수 계속 <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </div> : null}
  </section>;
}
