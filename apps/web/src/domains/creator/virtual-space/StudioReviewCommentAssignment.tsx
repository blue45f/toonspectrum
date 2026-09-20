import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { normalizeStudioReviewAssignees } from "./studio-review-comment-assignment";
import type { StudioReviewRoster } from "./use-studio-review-roster";

/** Roster names have a short permission lease. Draft user IDs remain owned by the actor-keyed panel. */
export function StudioReviewCommentAssignment({ roster, ids, onChange, due, onDueChange, disabled }: {
  readonly roster: StudioReviewRoster; readonly ids: readonly string[];
  readonly onChange: (ids: string[]) => void; readonly due: string; readonly onDueChange: (value: string) => void;
  readonly disabled: boolean;
}) {
  const bt = useBilingual("StudioReviewCommentAssignment");
  const { candidates: members, status } = roster;
  return <fieldset className="mt-3 rounded-xl border border-line p-3" disabled={disabled}>
    <legend className="px-1 text-sm font-semibold">{bt("담당자 · 기한 (선택)", "Assignees · due date (optional)")}</legend>
    <p className="text-xs text-fg-3">{bt("현재 작품을 편집할 수 있는 팀원에게 배정합니다. 저장할 때 권한을 다시 확인해요.", "Assign to teammates who can edit this work. Access is checked again when saving.")}</p>
    <button type="button" className="mt-2 min-h-11 rounded-lg border border-line px-3" disabled={disabled || status === "loading"} onClick={roster.refresh}>
      {status === "loading" ? bt("팀원 확인 중…", "Loading teammates…") : bt("배정 가능한 팀원 확인", "Choose eligible teammates")}
    </button>
    <p className="mt-2 text-sm" aria-live="polite">{bt(`담당자 ${ids.length}명 선택`, `${ids.length} assignees selected`)}</p>
    {ids.length ? <button type="button" className="min-h-11 rounded-lg border border-line px-3" onClick={() => onChange([])}>{bt("담당자 선택 해제", "Clear assignees")}</button> : null}
    {status === "failed" ? <p role="alert" className="mt-2 text-sm">{bt("팀원 권한을 확인하지 못했어요. 선택은 남겨 두었습니다. 다시 확인해 주세요.", "Teammate access could not be verified. Your selection is preserved. Please try again.")}</p> : null}
    {members ? <div className="mt-2 max-h-60 overflow-y-auto">
      {members.map((member) => <label key={member.userId} className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={ids.includes(member.userId)} disabled={disabled || (!ids.includes(member.userId) && ids.length >= 64)}
          onChange={(event) => onChange(event.target.checked ? normalizeStudioReviewAssignees([...ids, member.userId]) : ids.filter((id) => id !== member.userId))} />
        {member.name}
      </label>)}
      {!members.length ? <p>{bt("배정할 수 있는 팀원이 없어요.", "No eligible teammates are available.")}</p> : null}
      {ids.some((id) => !members.some((member) => member.userId === id)) ? <p role="alert">{bt("선택한 담당자 중 현재 권한이 없는 사용자가 있어요. 선택을 해제하고 다시 배정해 주세요.", "A selected assignee no longer has access. Clear the selection and assign again.")}</p> : null}
    </div> : null}
    <label className="mt-3 block text-sm">{bt("완료 기한", "Due date")}
      <input type="datetime-local" className="mt-1 block min-h-11 max-w-full rounded-lg border border-line bg-card px-2" value={due} onChange={(event) => onDueChange(event.target.value)} />
    </label>
    <p className="mt-1 text-xs text-fg-3">{bt("내 기기 시간대", "Your device time zone")} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
  </fieldset>;
}
