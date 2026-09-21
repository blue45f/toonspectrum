import { useLayoutEffect, useRef, useState } from "react";
import type { ProductionNotificationPolicy, ProductionProjectAggregate } from "@toonspectrum/core/production";
import { getAuthSessionRevision } from "@/compat/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { ProductionClientCommand } from "./production-api";

const field = "min-h-11 max-w-full rounded-lg border border-line bg-panel px-3 text-sm disabled:opacity-50";
type Props = { readonly aggregate: ProductionProjectAggregate; readonly assignmentId: string; readonly disabled: boolean; readonly canManage: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void> };
export function ProductionNotificationPolicyEditor(props: Props) {
  return <PolicyForAssignment key={JSON.stringify([props.aggregate.projectId, props.assignmentId, getAuthSessionRevision()])} {...props} />;
}
function PolicyForAssignment({ aggregate, assignmentId, disabled, canManage, execute }: Props) {
  const bt = useBilingual("ProductionNotificationPolicyEditor");
  const existing = (aggregate.notificationPolicies ?? []).find((policy) => policy.assignmentId === assignmentId);
  const initial = (): ProductionNotificationPolicy => existing ?? { id: crypto.randomUUID(), projectId: aggregate.projectId, assignmentId,
    channels: ["in-app"], digest: "daily", quietHoursStart: "22:00", quietHoursEnd: "08:00",
    timezone: (aggregate.resourceCalendars ?? []).find((calendar) => calendar.assignmentId === assignmentId)?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    dueSoonHours: 48, escalationHours: 24, enabled: true, updatedAt: "" };
  const fingerprint = JSON.stringify(existing ?? null);
  const [draft, setDraft] = useState<ProductionNotificationPolicy>(initial), [base, setBase] = useState(fingerprint);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const pending = useRef(false), generation = useRef(0);
  useLayoutEffect(() => () => { ++generation.current; }, []);
  const changed = fingerprint !== base;
  const active = aggregate.assignments.some((assignment) => assignment.id === assignmentId && assignment.status === "active");
  const locked = disabled || busy || !canManage || !active;
  const modify = (patch: Partial<ProductionNotificationPolicy>) => { setDraft((value) => ({ ...value, ...patch })); setConfirmed(false); };
  const valid = (() => {
    const time = /^([01]\d|2[0-3]):[0-5]\d$/u;
    if (!draft.timezone || !draft.channels.length || new Set(draft.channels).size !== draft.channels.length
      || ![draft.dueSoonHours, draft.escalationHours].every((value) => Number.isInteger(value) && value > 0 && value <= 8760)) return false;
    if ((draft.quietHoursStart === null) !== (draft.quietHoursEnd === null)
      || (draft.quietHoursStart !== null && (!time.test(draft.quietHoursStart) || !time.test(draft.quietHoursEnd!)))) return false;
    try { new Intl.DateTimeFormat("en", { timeZone: draft.timezone }); return true; } catch { return false; }
  })();
  const save = async () => {
    if (pending.current || locked || changed || !valid || !confirmed) return;
    const own = generation.current, session = getAuthSessionRevision();
    const current = () => own === generation.current && session === getAuthSessionRevision();
    const submitted = { ...draft, updatedAt: new Date().toISOString() };
    pending.current = true; setBusy(true); setNotice("");
    try {
      await execute({ type: "upsert-operations-record", record: { kind: "notification-policy", value: submitted }, expectedNotificationPolicy: existing ?? null }, bt("알림 정책을 저장했습니다.", "Notification policy saved."));
      if (!current()) return;
      setDraft(submitted); setBase(JSON.stringify(submitted)); setConfirmed(false);
      setNotice(bt("알림 선호를 저장했습니다. 예약 발송 등록·외부 발송·기기 알림 권한 요청은 수행하지 않았습니다.", "Notification preferences saved. No scheduled delivery, external message or device permission request was made."));
    } catch { if (current()) setNotice(bt("저장 결과를 확인하지 못했습니다. 입력은 유지됩니다. 현재 기록을 다시 확인해 주세요.", "The save result could not be confirmed. Your input is retained; inspect the current records.")); }
    finally { pending.current = false; if (current()) setBusy(false); }
  };
  return <div className="space-y-3" aria-label={bt("알림 정책 편집", "Notification policy editor")}>
    <p className="text-xs text-fg-2">{bt("선택한 담당자의 묶음 주기와 조용한 시간을 저장합니다. 외부 채널의 연결·실제 예약 발송은 별도이며, 이 설정만으로 발송되지는 않습니다.", "Save this assignee’s digest and quiet-hour preferences. External channel connection and scheduled delivery are separate; this setting does not send messages.")}</p>
    {!active ? <p role="alert">{bt("활성 담당자를 먼저 선택해 주세요.", "Choose an active assignee first.")}</p> : null}
    {changed ? <p role="alert">{bt("다른 변경으로 현재 정책이 달라졌습니다. 입력을 덮어쓰지 않았으며 다시 확인하기 전에는 저장하지 않습니다.", "The policy changed elsewhere. Your input was not replaced and cannot be saved until you recheck.")}</p> : null}
    <fieldset disabled={locked} className="min-w-0 space-y-3">
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(event) => modify({ enabled: event.target.checked })} />{bt("알림 정책 사용", "Enable notification policy")}</label>
      <label className="block text-sm">{bt("묶음 주기", "Digest cadence")}<select className={`${field} mt-1 w-full`} value={draft.digest} onChange={(event) => modify({ digest: event.target.value as ProductionNotificationPolicy["digest"] })}>
        <option value="immediate">{bt("즉시", "Immediate")}</option><option value="daily">{bt("매일", "Daily")}</option><option value="weekly">{bt("매주", "Weekly")}</option>
      </select></label>
      <label className="block text-sm">{bt("시간대", "Timezone")}<input className={`${field} mt-1 w-full`} value={draft.timezone ?? ""} maxLength={120} placeholder="Asia/Seoul" onChange={(event) => modify({ timezone: event.target.value.trim() })} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.quietHoursStart !== null || draft.quietHoursEnd !== null} onChange={(event) => modify({ quietHoursStart: event.target.checked ? "22:00" : null, quietHoursEnd: event.target.checked ? "08:00" : null })} />{bt("조용한 시간 사용", "Use quiet hours")}</label>
      {draft.quietHoursStart !== null || draft.quietHoursEnd !== null ? <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <label className="min-w-0 text-sm">{bt("조용한 시간 시작", "Quiet hours start")}<input type="time" className={`${field} mt-1 w-full min-w-0`} value={draft.quietHoursStart ?? ""} onChange={(event) => modify({ quietHoursStart: event.target.value })} /></label>
        <label className="min-w-0 text-sm">{bt("조용한 시간 종료", "Quiet hours end")}<input type="time" className={`${field} mt-1 w-full min-w-0`} value={draft.quietHoursEnd ?? ""} onChange={(event) => modify({ quietHoursEnd: event.target.value })} /></label>
      </div> : null}
      {draft.quietHoursStart !== null && draft.quietHoursStart === draft.quietHoursEnd ? <p className="text-xs">{bt("시작과 종료가 같으면 조용한 시간을 적용하지 않습니다.", "Equal start and end times mean no quiet period.")}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">{bt("마감 전 알림 시간", "Due-soon hours")}<input type="number" min={1} max={8760} className={`${field} mt-1 w-full`} value={draft.dueSoonHours} onChange={(event) => modify({ dueSoonHours: Number(event.target.value) })} /></label>
        <label className="text-sm">{bt("지연 알림 기준 시간", "Escalation hours")}<input type="number" min={1} max={8760} className={`${field} mt-1 w-full`} value={draft.escalationHours} onChange={(event) => modify({ escalationHours: Number(event.target.value) })} /></label>
      </div>
      <p className="text-xs">{bt("저장된 채널", "Saved channels")}: {draft.channels.join(", ")}. {bt("채널 연결 상태나 전달 완료를 의미하지 않습니다.", "This is not a connection or delivery receipt.")}</p>
      {!valid ? <p role="alert">{bt("유효한 시간대, 시간 범위와 양의 정수 기준을 입력해 주세요.", "Enter a valid timezone, time range and positive integer thresholds.")}</p> : null}
      <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-5" checked={confirmed} disabled={!valid || changed} onChange={(event) => setConfirmed(event.target.checked)} />{bt("표시된 담당자의 알림 선호 변경을 확인했습니다.", "I confirm these changes to the displayed assignee’s notification preferences.")}</label>
      <div className="flex flex-wrap gap-2"><button type="button" className={field} disabled={!valid || changed || !confirmed} onClick={() => void save()}>{bt("알림 정책 저장", "Save notification policy")}</button>
        <button type="button" className={field} onClick={() => { setDraft(initial()); setBase(fingerprint); setConfirmed(false); setNotice(""); }}>{bt("입력을 버리고 현재 정책 확인", "Discard input and inspect current policy")}</button></div>
    </fieldset>
    {notice ? <p role="status" className="text-xs">{notice}</p> : null}
  </div>;
}
