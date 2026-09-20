import { useEffect, useState } from "react";
import type { StudioWorkSession, StudioWorkSessionResult } from "@toonspectrum/studio-project-model";
import { getAuthSessionRevision, listeners } from "@/compat/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { loadStudioServerProductionWorkspace } from "../studio-production/studio-production-server-client";
import { studioHandoffClient } from "../handoff-envelope/studio-handoff-envelope-client";
import { listStudioVirtualSpaceReviewHistory } from "../virtual-space/studio-virtual-space-review-invitation";
import type { StudioWorkSessionController } from "./studio-work-session-controller";

interface Choice { readonly key: string; readonly label: string; readonly result: StudioWorkSessionResult }
const control = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm";
export function StudioWorkSessionResultPicker({ workId, actorId, input, controller, busy }: {
  readonly workId: string; readonly actorId: string; readonly input: StudioWorkSession["input"];
  readonly controller: StudioWorkSessionController; readonly busy: boolean;
}) {
  const bt = useBilingual("StudioWorkSessionResultPicker"), [pin] = useState(input);
  const [open, setOpen] = useState(false), [attempt, reload] = useState(0), [selected, select] = useState("");
  const [choices, setChoices] = useState<readonly Choice[]>([]), [failures, setFailures] = useState<readonly string[]>([]), [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true; const revision = getAuthSessionRevision(), abort = new AbortController();
    setChoices([]); setFailures([]); select(""); setLoading(true);
    const expire = () => { alive = false; abort.abort(); setChoices([]); setFailures(["expired"]); setLoading(false); };
    const timeout = setTimeout(expire, 15_000);
    const hidden = () => { if (document.visibilityState === "hidden") expire(); };
    listeners.add(expire); document.addEventListener("visibilitychange", hidden);
    void Promise.allSettled([listStudioVirtualSpaceReviewHistory(pin), loadStudioServerProductionWorkspace(workId, abort.signal), studioHandoffClient.list(workId, null, abort.signal)]).then((results) => {
      if (!alive || revision !== getAuthSessionRevision()) return;
      const next: Choice[] = [], errors: string[] = [];
      const [reviews, production, handoffs] = results;
      if (reviews.status === "fulfilled" && reviews.value.ok) {
        next.push(...reviews.value.choices.map((choice) => ({ key: `review:${choice.subject.reviewId}`, label: `${choice.title} · ${choice.subject.revisionId}`, result: { type: "review" as const, subject: choice.subject } })));
        if (reviews.value.truncated) errors.push("review-truncated");
      } else errors.push("review");
      if (production.status === "fulfilled" && production.value.capabilities.view) next.push(...production.value.document.tasks.map((task) => ({ key: `task:${task.id}`, label: task.title, result: { type: "task" as const, id: task.id } })));
      else errors.push("task");
      if (handoffs.status === "fulfilled") {
        next.push(...handoffs.value.items.map((handoff) => ({ key: `handoff:${handoff.id}`, label: handoff.taskTitle, result: { type: "handoff" as const, id: handoff.id } })));
        if (handoffs.value.nextCursor) errors.push("handoff-truncated");
      } else errors.push("handoff");
      setChoices(next); setFailures(errors); setLoading(false);
    });
    return () => { alive = false; abort.abort(); clearTimeout(timeout); listeners.delete(expire); document.removeEventListener("visibilitychange", hidden); };
  }, [open, attempt, workId, actorId, pin]);
  return <div className="space-y-2"><button className={control} type="button" disabled={busy} aria-expanded={open} onClick={() => setOpen((value) => !value)}>{bt("기존 산출물·작업 연결", "Link an existing outcome or task")}</button>
    {open ? <div className="space-y-2 rounded-lg border border-line p-3">
      {loading ? <p role="status">{bt("접근 가능한 결과를 확인 중입니다.", "Checking available outcomes.")}</p> : null}
      <label className="block text-sm">{bt("연결할 기존 기록", "Existing record to link")}<select className={`${control} mt-1 w-full`} value={selected} disabled={busy || loading} onChange={(event) => select(event.target.value)}>
        <option value="">{bt("선택하세요", "Choose a record")}</option>
        {choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.result.type === "review" ? bt("검수본", "Review") : choice.result.type === "task" ? bt("작업", "Task") : bt("봉투", "Handoff")} · {choice.label}</option>)}
      </select></label>
      {failures.length ? <p role="status" className="text-xs text-fg-2">{bt("일부 목록을 확인하지 못했거나 표시 범위·유효 시간이 제한되었습니다. 확인된 항목만 선택할 수 있습니다.", "Some lists are unavailable, truncated or expired. Only verified options may be selected.")}</p> : null}
      <div className="flex flex-wrap gap-2"><button className={control} type="button" disabled={busy || loading} onClick={() => reload((value) => value + 1)}>{bt("목록 다시 읽기", "Reload choices")}</button>
        <button className={control} type="button" disabled={busy || loading || !choices.some((choice) => choice.key === selected)} onClick={() => {
          const choice = choices.find((item) => item.key === selected); if (choice) void controller.command({ action: "attach-result", result: choice.result });
        }}>{bt("선택한 기록 연결", "Link selected record")}</button></div>
    </div> : null}
  </div>;
}
