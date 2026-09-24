import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Edit3,
  FileCheck2,
  GitCompareArrows,
  LockKeyhole,
  MessageSquare,
  PackageCheck,
  Send,
} from "lucide-react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { StudioPinnedReviewPanel } from "../virtual-space/StudioPinnedReviewPanel";
import type { ProductionReviewCandidate } from "./production-manuscript-competitive-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import { ProductionManuscriptLifecyclePanel } from "./ProductionManuscriptLifecyclePanel";
import { ProductionQuickExportPanel } from "./ProductionQuickExportPanel";

type FlowDestination = "versions" | "feedback" | "delivery" | "workbench";

type NextAction =
  | Readonly<{ title: string; detail: string; kind: "editor"; label: string }>
  | Readonly<{ title: string; detail: string; kind: FlowDestination; label: string }>;
function nextAction(process: ProductionManuscriptProcess): NextAction {
  if (!process.headRevision) return {
    title: "첫 작업본을 시작하세요",
    detail: "편집기에서 원고를 만든 뒤 체크포인트 또는 검수 제출본으로 저장합니다.",
    kind: "editor",
    label: "편집기에서 시작",
  };
  if (process.openRequiredFeedbackCount > 0 || process.latestReview?.status === "changes-requested") return {
    title: `필수 수정 ${process.openRequiredFeedbackCount}개를 처리하세요`,
    detail: "검수본의 정확한 위치와 담당자를 확인한 뒤 새 revision으로 수정합니다.",
    kind: "feedback",
    label: "필수 수정 확인",
  };
  if (process.latestReview?.status === "open") return {
    title: "현재 검수를 완료하세요",
    detail: "의견을 묶어 발행하고 해결 여부를 확인한 뒤 승인 또는 수정 요청을 기록합니다.",
    kind: "feedback",
    label: "검수 계속",
  };
  if (!process.reviewSnapshotRevision || process.hasUnapprovedChanges) return {
    title: "현재 HEAD를 검수 제출본으로 고정하세요",
    detail: "편집기에서 현재 문서를 검수 제출본으로 저장합니다. Production에서 임의 snapshot을 만들지 않습니다.",
    kind: "editor",
    label: "검수 제출 준비",
  };
  if (!process.approvedRevision) return {
    title: "제출된 검수본을 승인하거나 수정 요청하세요",
    detail: "고정된 revision만 검수하며 최신 HEAD로 자동 대체하지 않습니다.",
    kind: "feedback",
    label: "검수 결정",
  };
  if (!process.releaseRevision) return {
    title: "승인 FINAL을 출력하거나 공식 전달하세요",
    detail: "빠른 출력과 수신자·manifest 기반 공식 전달을 목적에 맞게 선택합니다.",
    kind: "delivery",
    label: "출력·전달",
  };
  return {
    title: "전달된 RELEASE와 후속 변경을 확인하세요",
    detail: "전달 기록은 보존됩니다. 후속 변경은 새 HEAD·검수·승인으로 다시 진행합니다.",
    kind: "versions",
    label: "전달 이력 확인",
  };
}

export function ProductionUnifiedManuscriptFlow({
  projectId,
  workId,
  process,
  candidate,
  editorHref,
  onOpen,
}: {
  readonly projectId: string;
  readonly workId: string;
  readonly process: ProductionManuscriptProcess | null;
  readonly candidate: ProductionReviewCandidate | null;
  readonly editorHref: string | null;
  readonly onOpen: (destination: FlowDestination) => void;
}) {
  if (!process) {
    return <section className="rounded-3xl border border-dashed border-line bg-card p-8 text-center">
      <FileCheck2 className="mx-auto size-8 text-fg-3" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-black text-fg">원고 공정을 먼저 선택하세요</h2>
      <p className="mt-1 text-sm text-fg-2">작업·제출·검수·승인·출력 흐름을 한 화면에서 이어갈 수 있습니다.</p>
    </section>;
  }
  const action = nextAction(process);
  const isText = process.processType === "text";
  const readOnlyComplete = isText && Boolean(process.approvedRevision || process.releaseRevision);
  const stages = [
    { label: "작업본", ok: Boolean(process.headRevision), icon: Edit3 },
    { label: "검수 제출", ok: Boolean(process.reviewSnapshotRevision), icon: Send },
    { label: "승인 FINAL", ok: Boolean(process.approvedRevision), icon: BadgeCheck },
    { label: "RELEASE", ok: Boolean(process.releaseRevision), icon: PackageCheck },
  ];

  return <div className="space-y-4" data-production-unified-flow="">
    <ProductionManuscriptLifecyclePanel process={process} onOpen={onOpen} />
    <section className={cn(
      "rounded-3xl border p-4 sm:p-6",
      process.openRequiredFeedbackCount > 0 ? "border-bad/35 bg-bad/10" : "border-accent/30 bg-card",
    )} aria-labelledby="next-safe-action-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">NEXT SAFE ACTION</p>
          <h2 id="next-safe-action-title" className="mt-2 text-xl font-black text-fg">{action.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">{action.detail}</p>
        </div>
        {action.kind === "editor" && editorHref ? (
          <Link to={editorHref} className={buttonClass({ size: "sm", className: "min-h-11 shrink-0" })}>
            <Edit3 className="size-4" aria-hidden="true" /> {action.label}
          </Link>
        ) : action.kind !== "editor" ? (
          <button type="button" onClick={() => onOpen(action.kind)} className={buttonClass({ size: "sm", className: "min-h-11 shrink-0" })}>
            {action.kind === "delivery" ? <PackageCheck className="size-4" aria-hidden="true" />
              : action.kind === "workbench" ? <GitCompareArrows className="size-4" aria-hidden="true" />
                : action.kind === "feedback" ? <MessageSquare className="size-4" aria-hidden="true" />
                  : <Send className="size-4" aria-hidden="true" />}
            {action.label}<ArrowRight className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {stages.map(({ label, ok, icon: Icon }) => (
          <div key={label} className={cn(
            "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-xs font-bold",
            ok ? "border-good/30 bg-good/10 text-good" : "border-line bg-panel text-fg-3",
          )}>
            <Icon className="size-4" aria-hidden="true" />{label}
            <span className="ml-auto">{ok ? "완료" : "대기"}</span>
          </div>
        ))}
      </div>
    </section>

    {isText ? <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="text-lifecycle-title">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-panel text-accent">
          <BookOpenText className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="text-lifecycle-title" className="font-black text-fg">텍스트 공정도 같은 제출·검수·승인 기준을 사용합니다</h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">대본·식자·현지화 문서는 별도 저장소를 만들지 않습니다. 완료본은 읽기 기준으로 보존하고, 수정은 새 체크포인트·제출본으로 이어갑니다.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[0.625rem] font-black text-fg-3">현재 의미</p>
          <p className="mt-1 text-sm font-bold text-fg">{readOnlyComplete ? "완료 기준본 · 읽기 우선" : "편집 가능한 작업본"}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[0.625rem] font-black text-fg-3">수정 방법</p>
          <p className="mt-1 text-sm font-bold text-fg">새 체크포인트 또는 제출본</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[0.625rem] font-black text-fg-3">승인 보호</p>
          <p className="mt-1 text-sm font-bold text-fg">이전 FINAL 자동 교체 금지</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {editorHref ? <Link to={editorHref} className={buttonClass({ variant: "outline", size: "sm" })}>
          {readOnlyComplete ? <LockKeyhole className="size-4" aria-hidden="true" /> : <Edit3 className="size-4" aria-hidden="true" />}
          {readOnlyComplete ? "복제·새 체크포인트로 수정" : "텍스트 편집 계속"}
        </Link> : null}
        <button type="button" onClick={() => onOpen("versions")} className={buttonClass({ variant: "outline", size: "sm" })}>
          <GitCompareArrows className="size-4" aria-hidden="true" /> 텍스트 버전 확인
        </button>
      </div>
    </section> : null}
    <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="review-workflow-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">REVIEW WORKFLOW</p>
          <h2 id="review-workflow-title" className="mt-2 text-xl font-black text-fg">고정 검수본에서 의견·수정·승인을 처리합니다</h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">댓글 초안, 묶음 발행, 담당자·기한, 해결·재열기와 승인 결정을 같은 revision에 남깁니다.</p>
        </div>
        <button type="button" onClick={() => onOpen("workbench")} className={buttonClass({ variant: "outline", size: "sm" })}>
          <GitCompareArrows className="size-4" aria-hidden="true" /> 여러 원고 비교
        </button>
      </div>
      <div className="mt-4">
        <StudioPinnedReviewPanel subject={candidate?.subject ?? null} showShareTools={false} showExportTools={false} />
      </div>
    </section>

    <ProductionQuickExportPanel
      projectId={projectId}
      workId={workId}
      candidate={candidate}
      process={process}
    />
  </div>;
}
