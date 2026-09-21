import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { deriveProductionAutomationExecutionPlan, type ProductionProjectAggregate } from "@toonspectrum/core/production";
import { getAuthSessionRevision } from "@/compat/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { ProductionClientCommand } from "./production-api";

const button = "min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50";
type Props = { readonly aggregate: ProductionProjectAggregate; readonly canManage: boolean; readonly disabled: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void> };
export function ProductionAutomationExecutionControl(props: Props) {
  return <ExecutionForProject key={props.aggregate.projectId} {...props} />;
}
function ExecutionForProject({ aggregate, canManage, disabled, execute }: Props) {
  const bt = useBilingual("ProductionAutomationExecutionControl");
  const [preview, setPreview] = useState<{ revision: number; at: number; plan: ReturnType<typeof deriveProductionAutomationExecutionPlan> } | null>(null);
  const [confirmed, setConfirmed] = useState(false), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef(false), generation = useRef(0);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  useLayoutEffect(() => invalidate, [invalidate]);
  const simulate = () => {
    if (!canManage || disabled || pending.current) return;
    try {
      const at = Date.now(), rules = (aggregate.automationRules ?? []).filter((rule) => rule.enabled);
      if (!rules.length) throw new Error("empty");
      const plan = deriveProductionAutomationExecutionPlan(aggregate, rules, new Date(at));
      setPreview({ revision: aggregate.revision, at, plan }); setConfirmed(false); setNotice("");
    } catch { setPreview(null); setNotice(bt("규칙·담당자·실행 한도를 확인하지 못했습니다. 현재 작업은 변경하지 않았습니다.", "Rules, assignees or execution limits could not be validated. No work was changed.")); }
  };
  const apply = async () => {
    if (!preview || !confirmed || disabled || !canManage || pending.current) return;
    if (preview.revision !== aggregate.revision || Date.now() - preview.at > 300_000) {
      setConfirmed(false); setNotice(bt("작업 내용이나 미리보기 유효 시간이 바뀌었습니다. 다시 미리보기 해 주세요.", "The project or preview validity changed. Run the preview again.")); return;
    }
    const own = generation.current, session = getAuthSessionRevision(), { plan } = preview;
    const current = () => generation.current === own && getAuthSessionRevision() === session;
    pending.current = true; setBusy(true);
    try {
      await execute({ type: "apply-automation-execution", tasks: plan.tasks, notifications: plan.notifications, evaluatedRules: plan.evaluatedRules },
        bt("확인한 자동화 업무·알림·실행 상태를 하나의 변경으로 저장했습니다.", "Saved the confirmed tasks, notifications and rule state in one change."));
      if (current()) { setPreview(null); setConfirmed(false); setNotice(bt("확인한 자동화 결과를 저장했습니다. 승인·게시·삭제·외부 발송은 수행하지 않았습니다.", "Saved the confirmed automation results. No approval, publication, deletion or external send was performed.")); }
    } catch { if (current()) { setConfirmed(false); setNotice(bt("실행 결과를 확인하지 못했습니다. 프로젝트를 다시 확인한 뒤 같은 작업을 중복 생성하지 않도록 새로 미리보기 하세요.", "The result could not be confirmed. Reload the project and preview again to avoid duplicating work.")); } }
    finally { pending.current = false; if (generation.current === own) setBusy(false); }
  };
  return <div className="mt-3 space-y-3">
    <button type="button" className={button} disabled={disabled || busy || !canManage || !(aggregate.automationRules ?? []).some((rule) => rule.enabled)} onClick={simulate}>{bt("활성 규칙 실행", "Run active rules")}</button>
    {preview ? <section className="space-y-3 rounded-lg border border-line p-3" aria-label={bt("자동화 실행 미리보기", "Automation execution preview")}>
      <h4 className="font-semibold">{bt("자동화 실행 미리보기", "Automation execution preview")}</h4>
      <p className="text-xs text-fg-2">{bt("아직 저장하지 않았습니다. 현재 서버 규칙과 프로젝트 버전을 다시 대조한 뒤 확인한 변경만 적용합니다. 생성된 업무의 예상 시간은 임의로 채우지 않습니다.", "Nothing has been saved. The server will rederive these changes from current rules and project revision. New task effort is left unknown, not invented.")}</p>
      <p className="text-sm">{bt(`업무 ${preview.plan.tasks.length}개 · 알림 ${preview.plan.notifications.length}개 · 중복 ${preview.plan.suppressedTaskCount + preview.plan.suppressedNotificationCount}개 제외`, `${preview.plan.tasks.length} tasks · ${preview.plan.notifications.length} notifications · ${preview.plan.suppressedTaskCount + preview.plan.suppressedNotificationCount} duplicates suppressed`)}</p>
      <ul className="max-h-60 space-y-1 overflow-auto text-sm">{preview.plan.tasks.map((task) => <li key={task.id}>{bt("새 업무", "New task")}: {task.title}</li>)}{preview.plan.notifications.map((notice) => <li key={notice.id}>{bt("알림", "Notification")}: {notice.title} — {notice.body}</li>)}</ul>
      {preview.revision !== aggregate.revision ? <p role="alert">{bt("프로젝트가 변경되어 이 미리보기는 적용할 수 없습니다.", "The project changed; this preview cannot be applied.")}</p> : null}
      <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-5" disabled={disabled || busy || preview.revision !== aggregate.revision} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{bt("표시된 업무와 알림만 저장하는 것을 확인했습니다.", "I confirm saving only the displayed tasks and notifications.")}</label>
      <button type="button" className={button} disabled={disabled || busy || !canManage || !confirmed || preview.revision !== aggregate.revision} onClick={() => void apply()}>{bt("미리보기 확인 후 적용", "Apply confirmed preview")}</button>
      <button type="button" className={`${button} ml-2`} disabled={busy} onClick={() => { setPreview(null); setConfirmed(false); }}>{bt("미리보기 취소", "Cancel preview")}</button>
    </section> : null}
    {notice ? <p role="status" className="text-xs">{notice}</p> : null}
  </div>;
}
