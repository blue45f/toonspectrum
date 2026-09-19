import {
  CheckCircle2,
  Play,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import type {
  ProductionProjectAggregate,
  ProductionRiskResponse,
  ProductionRiskResponseStatus,
} from "@toonspectrum/core/production";

import type { ProductionClientCommand } from "./production-api";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface ProductionRiskResponseCardProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly response: ProductionRiskResponse;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly canManage: boolean;
}

const STATUS_LABELS: Readonly<Record<ProductionRiskResponseStatus, string>> = Object.freeze({
  proposed: "제안됨",
  approved: "승인됨",
  "in-progress": "진행 중",
  completed: "완료",
  cancelled: "취소됨",
});

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null): string {
  if (!value) return "미정";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : "미정";
}

function ownerName(
  aggregate: ProductionProjectAggregate,
  response: ProductionRiskResponse,
): string {
  const assignment = aggregate.assignments.find((entry) => entry.id === response.ownerAssignmentId);
  const party = assignment
    ? aggregate.parties.find((entry) => entry.id === assignment.partyId)
    : null;
  return party?.publicDisplayName ?? "담당자 미정";
}

function statusClass(status: ProductionRiskResponseStatus): string {
  if (status === "completed") return "border-good/35 bg-good/10 text-good";
  if (status === "in-progress") return "border-warn/35 bg-warn/10 text-warn";
  if (status === "cancelled") return "border-line bg-raised text-fg-3";
  return "border-accent/35 bg-accent-soft text-accent";
}

export function ProductionRiskResponseCard({
  aggregate,
  response,
  execute,
  canEdit,
  canManage,
}: ProductionRiskResponseCardProps) {
  const [resultNote, setResultNote] = useState(response.actualEffect ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transition = async (toStatus: ProductionRiskResponseStatus) => {
    if (busy || (toStatus === "approved" ? !canManage : !canEdit)) return;
    if ((toStatus === "completed" || toStatus === "cancelled") && !resultNote.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await execute({
        type: "transition-risk-response",
        responseId: response.id,
        toStatus,
        actualEffect: toStatus === "completed" ? resultNote.trim() : null,
        reason: toStatus === "cancelled" ? resultNote.trim() : null,
        expectedResponseRevision: response.revision ?? 0,
      }, `${response.title} 대응을 ${STATUS_LABELS[toStatus]} 상태로 변경했습니다.`);
      if (toStatus === "proposed") setResultNote("");
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : "대응 상태를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const active = ["proposed", "approved", "in-progress"].includes(response.status);
  return (
    <article className="rounded-xl border border-line bg-panel p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-fg">{response.title}</p>
          <p className="mt-1 text-[0.6875rem] text-fg-3">
            {ownerName(aggregate, response)} · 기한 {formatDate(response.dueAt)}
          </p>
        </div>
        <span className={cn(
          "inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
          statusClass(response.status),
        )}>
          {STATUS_LABELS[response.status]}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-fg-2">{response.description}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-card p-2.5">
          <p className="text-[0.625rem] font-bold text-fg-3">기대 효과</p>
          <p className="mt-1 text-xs leading-5 text-fg-2">{response.expectedEffect || "기대 효과 미정"}</p>
        </div>
        <div className="rounded-lg border border-line bg-card p-2.5">
          <p className="text-[0.625rem] font-bold text-fg-3">실제 결과</p>
          <p className="mt-1 text-xs leading-5 text-fg-2">{response.actualEffect || "아직 기록되지 않음"}</p>
        </div>
      </div>
      {active ? (
        <label className="mt-3 block">
          <span className="text-[0.6875rem] font-bold text-fg-3">결과 또는 취소 사유</span>
          <textarea
            value={resultNote}
            onChange={(event) => setResultNote(event.target.value)}
            rows={2}
            disabled={!canEdit || busy}
            className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 text-xs leading-5 text-fg outline-none focus:border-accent disabled:opacity-65"
            placeholder="완료 효과나 취소 사유를 기록하세요. 완료·취소 처리에는 기록이 필수입니다."
          />
        </label>
      ) : null}

      {error ? (
        <div role="alert" className="mt-3 rounded-lg border border-bad/35 bg-bad/10 px-3 py-2 text-xs font-semibold text-bad">
          {error}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {response.status === "proposed" && canManage ? (
          <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={busy} onClick={() => void transition("approved")}>
            <ShieldCheck className="size-4" aria-hidden="true" /> 승인
          </button>
        ) : null}
        {response.status === "approved" && canEdit ? (
          <button type="button" className={buttonClass({ size: "sm" })} disabled={busy} onClick={() => void transition("in-progress")}>
            <Play className="size-4" aria-hidden="true" /> 대응 시작
          </button>
        ) : null}
        {response.status === "in-progress" && canEdit ? (
          <button type="button" className={buttonClass({ size: "sm" })} disabled={busy || !resultNote.trim()} onClick={() => void transition("completed")}>
            <CheckCircle2 className="size-4" aria-hidden="true" /> 완료 처리
          </button>
        ) : null}
        {active && canEdit ? (
          <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={busy || !resultNote.trim()} onClick={() => void transition("cancelled")}>
            <XCircle className="size-4" aria-hidden="true" /> 취소
          </button>
        ) : null}
        {response.status === "cancelled" && canEdit ? (
          <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={busy} onClick={() => void transition("proposed")}>
            <RotateCcw className="size-4" aria-hidden="true" /> 다시 제안
          </button>
        ) : null}
      </div>
      {response.completedAt ? (
        <p className="mt-2 text-[0.6875rem] text-fg-3">완료 {formatDate(response.completedAt)}</p>
      ) : null}
    </article>
  );
}
