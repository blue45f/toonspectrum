import { useRef, useState, type FormEvent } from "react";
import type { ProductionProjectAggregate, ProductionRisk, ProductionRiskResponse } from "@toonspectrum/core/production";
import type { ProductionClientCommand } from "./production-api";
import { buttonClass } from "@/shared/components/ui/button-utils";

export interface ProductionRiskResponseDraftAction {
  readonly actionType: ProductionRiskResponse["actionType"];
  readonly title: string;
}
export function ProductionRiskResponseComposer({ aggregate, risk, action, actorAssignmentId, description, execute, canEdit, onClose }: {
  readonly aggregate: ProductionProjectAggregate;
  readonly risk: ProductionRisk;
  readonly action: ProductionRiskResponseDraftAction;
  readonly actorAssignmentId: string | null;
  readonly description: string;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly onClose: () => void;
}) {
  const [expectedEffect, setExpectedEffect] = useState(risk.varianceHours
    ? `예상 초과 ${Math.round(risk.varianceHours)}시간 축소` : "차단 원인 또는 일정 위험 축소");
  const [owner, setOwner] = useState(actorAssignmentId ?? risk.ownerAssignmentId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || savingRef.current || !expectedEffect.trim()) return;
    savingRef.current = true; setSaving(true); setError(null);
    try {
    const now = new Date().toISOString();
    const response: ProductionRiskResponse = {
      id: `risk-response:${crypto.randomUUID()}`, projectId: aggregate.projectId, riskId: risk.id,
      revision: 1, strategy: action.actionType === "outsource" ? "transfer" : "mitigate",
      actionType: action.actionType, title: action.title,
      description: description.trim() || `${risk.title}의 영향을 줄이기 위한 운영 대응입니다.`,
      ownerAssignmentId: owner || null, dueAt: risk.responseDueAt,
      linkedTaskId: risk.affectedTaskIds[0] ?? null,
      linkedChangeRequestId: null, linkedChangeOrderId: null,
      expectedEffect: expectedEffect.trim(), actualEffect: null, cancellationReason: null,
      status: "proposed", approvedAt: null, startedAt: null, completedAt: null, cancelledAt: null,
      createdAt: now, updatedAt: now,
    };
      await execute({ type: "upsert-risk-response", response }, `${action.title} 대응안을 제안했습니다.`);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "대응안을 저장하지 못했습니다.");
    } finally {
      savingRef.current = false; setSaving(false);
    }
  };
  return (
    <form className="space-y-3 rounded-xl border border-accent/35 bg-panel p-4" onSubmit={(event) => void submit(event)}>
      <h3 className="text-sm font-black text-fg">대응안 작성</h3>
      <p className="text-xs text-fg-2">{action.title} · 관리자의 승인 이후 대응을 시작할 수 있습니다.</p>
      <label className="block text-xs font-bold text-fg">예상 효과
        <textarea required maxLength={4000} value={expectedEffect} onChange={(event) => setExpectedEffect(event.target.value)} disabled={!canEdit || saving} rows={2} className="mt-1 w-full rounded-lg border border-line bg-card p-2 text-sm" />
      </label>
      <label className="block text-xs font-bold text-fg">대응 담당자
        <select value={owner} onChange={(event) => setOwner(event.target.value)} disabled={!canEdit || saving} className="mt-1 w-full rounded-lg border border-line bg-card p-2 text-sm">
          <option value="">담당자 미정</option>
          {aggregate.assignments.filter((entry) => entry.status === "active").map((entry) => (
            <option key={entry.id} value={entry.id}>{aggregate.parties.find((party) => party.id === entry.partyId)?.publicDisplayName ?? entry.id}</option>
          ))}
        </select>
      </label>
      {error ? <p role="alert" className="text-xs text-bad">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} disabled={saving} className={buttonClass({ variant: "outline", size: "sm" })}>작성 취소</button>
        <button type="submit" disabled={!canEdit || saving || !expectedEffect.trim()} className={buttonClass({ size: "sm" })}>{saving ? "제안 중…" : "대응안 제안"}</button>
      </div>
    </form>
  );
}
