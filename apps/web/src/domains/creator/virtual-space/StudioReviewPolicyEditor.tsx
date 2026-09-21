import { useState } from "react";
import { reviewPolicyDefinitionSchema, type ReviewPolicyDefinition } from "@toonspectrum/studio-project-model";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const field = "min-h-11 max-w-full rounded-lg border border-line bg-panel px-3 text-sm";
export function StudioReviewPolicyEditor({ initial, eligibleIds, disabled, onSave, onCancel }: {
  readonly initial: ReviewPolicyDefinition | null; readonly eligibleIds: readonly string[]; readonly disabled: boolean;
  readonly onSave: (definition: ReviewPolicyDefinition, reason: string) => void; readonly onCancel: () => void;
}) {
  const bt = useBilingual("StudioReviewPolicyEditor");
  const [definition, setDefinition] = useState<ReviewPolicyDefinition>(() => initial ?? { mode: "parallel", groups: [] });
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const change = (next: ReviewPolicyDefinition) => { setDefinition(next); setConfirmed(false); };
  const valid = reviewPolicyDefinitionSchema.safeParse(definition).success && reason.trim().length > 0;
  const update = (index: number, patch: Partial<ReviewPolicyDefinition["groups"][number]>) =>
    change({ ...definition, groups: definition.groups.map((group, i) => i === index ? { ...group, ...patch } : group) });
  return <div className="space-y-3 rounded-lg border border-line p-3">
    <p className="text-xs text-fg-2">{bt("검수에 이미 지정되어 있고 현재 접근 가능한 구성원만 선택합니다. 정책 변경은 이전 그룹 표결을 이력으로 보존하고 새 정책의 표결을 다시 받습니다.", "Choose current designated reviewers only. Changing policy preserves previous votes as history and requires fresh votes for the new policy.")}</p>
    <label className="block text-sm">{bt("검토 순서", "Review ordering")}<select className={`${field} ml-2`} value={definition.mode} disabled={disabled}
      onChange={(event) => change({ ...definition, mode: event.target.value as ReviewPolicyDefinition["mode"] })}>
      <option value="parallel">{bt("병렬 검토", "Parallel")}</option><option value="sequential">{bt("위에서 아래로 순차 검토", "Sequential, top to bottom")}</option>
    </select></label>
    {definition.groups.map((group, index) => <fieldset key={group.id} disabled={disabled} className="min-w-0 space-y-2 rounded-lg border border-line p-3">
      <legend className="text-xs font-semibold">{bt(`검토 그룹 ${index + 1}`, `Review group ${index + 1}`)}</legend>
      <label className="block text-xs">{bt("그룹 이름", "Group name")}<input className={`${field} mt-1 w-full`} value={group.label} maxLength={100} onChange={(event) => update(index, { label: event.target.value })} /></label>
      <label className="block text-xs">{bt("그룹 검토자", "Group reviewers")}<select multiple className={`${field} mt-1 min-h-24 w-full`} value={group.reviewerIds}
        onChange={(event) => update(index, { reviewerIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>
        {[...new Set([...eligibleIds, ...group.reviewerIds])].map((id) => <option key={id} value={id} disabled={!eligibleIds.includes(id)}>{id}{!eligibleIds.includes(id) ? ` · ${bt("접근 불가", "Unavailable")}` : ""}</option>)}
      </select></label>
      <label className="block text-xs">{bt("필요한 승인 수", "Required approvals")}<input className={`${field} ml-2 w-24`} type="number" min={1} max={group.reviewerIds.length || 1} value={group.requiredApprovals}
        onChange={(event) => update(index, { requiredApprovals: Number(event.target.value) })} /></label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={field} disabled={disabled || index === 0} onClick={() => {
          const groups = [...definition.groups]; [groups[index - 1], groups[index]] = [groups[index]!, groups[index - 1]!]; change({ ...definition, groups });
        }}>{bt("위로 이동", "Move up")}</button>
        <button type="button" className={field} disabled={disabled} onClick={() => change({ ...definition, groups: definition.groups.filter((item) => item.id !== group.id) })}>{bt("그룹 제거", "Remove group")}</button>
      </div>
    </fieldset>)}
    <button type="button" className={field} disabled={disabled || definition.groups.length >= 8} onClick={() => change({ ...definition, groups: [...definition.groups,
      { id: crypto.randomUUID(), label: bt(`검토 그룹 ${definition.groups.length + 1}`, `Review group ${definition.groups.length + 1}`), reviewerIds: [], requiredApprovals: 1 }] })}>{bt("검토 그룹 추가", "Add review group")}</button>
    <label className="block text-sm">{bt("설정·변경 이유", "Configuration reason")}<textarea className={`${field} mt-1 w-full p-2`} rows={2} maxLength={2000} disabled={disabled} value={reason} onChange={(event) => { setReason(event.target.value); setConfirmed(false); }} /></label>
    <label className="flex min-h-11 items-start gap-2 text-xs"><input type="checkbox" className="mt-1 size-5" disabled={disabled || !valid} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      {bt("이 고정 검수본에만 적용하며 기존 표결을 새 정책의 승인으로 재사용하지 않는 것을 확인했습니다.", "Apply only to this pinned review. Existing votes will not count as approvals under this new policy.")}</label>
    <div className="flex flex-wrap gap-2"><button type="button" className={field} disabled={disabled || !valid || !confirmed} onClick={() => onSave(reviewPolicyDefinitionSchema.parse(definition), reason.trim())}>{bt("정책 저장 확정", "Confirm policy save")}</button>
      <button type="button" className={field} disabled={disabled} onClick={onCancel}>{bt("편집 취소", "Cancel editing")}</button></div>
  </div>;
}
