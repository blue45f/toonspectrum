import { useEffect, useState } from "react";
import type { StudioWorkSessionCreate } from "@toonspectrum/studio-project-model/work-session";
import { getAuthSessionRevision } from "@/compat/auth-session-state";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { listStudioVirtualSpaceReviewSubjects, type StudioVirtualSpaceReviewChoices } from "../virtual-space/studio-virtual-space-review-invitation";
import { useStudioReviewRoster } from "../virtual-space/use-studio-review-roster";
import type { StudioWorkSessionController } from "./studio-work-session-controller";

const control = "min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm";
export function StudioWorkSessionComposer({ workId, actorId, controller, busy, onCreated }: {
  readonly workId: string; readonly actorId: string; readonly controller: StudioWorkSessionController;
  readonly busy: boolean; readonly onCreated: () => void;
}) {
  const bt = useBilingual("StudioWorkSessionComposer");
  const [title, setTitle] = useState(""), [purpose, setPurpose] = useState("");
  const [kind, setKind] = useState<StudioWorkSessionCreate["kind"]>("review");
  const [reviewId, setReviewId] = useState(""), [invitees, setInvitees] = useState<readonly string[]>([]);
  const [choices, setChoices] = useState<StudioVirtualSpaceReviewChoices | null>(null), [attempt, retry] = useState(0);
  const roster = useStudioReviewRoster({ workId, actorId, enabled: true, autoStart: true });
  useEffect(() => {
    let alive = true; const revision = getAuthSessionRevision(); setChoices(null);
    void listStudioVirtualSpaceReviewSubjects(workId).then((value) => {
      if (alive && revision === getAuthSessionRevision()) setChoices(value);
    }, () => { if (alive) setChoices({ ok: false, reason: "unavailable" }); });
    return () => { alive = false; };
  }, [workId, actorId, attempt]);
  const choice = choices?.ok ? choices.choices.find((item) => item.subject.reviewId === reviewId) : null;
  const members = roster.members?.filter((item) => item.userId !== actorId) ?? [];
  return <form className="space-y-3 rounded-xl border border-line p-4" onSubmit={(event) => {
    event.preventDefault();
    if (!choice || busy || !title.trim() || !purpose.trim() || invitees.some((id) => !members.some((member) => member.userId === id))) return;
    void controller.create({ title, purpose, kind, input: choice.subject, invitedUserIds: [...invitees] }).then(() => {
      if (controller.getSnapshot().phase === "ready" && controller.getSnapshot().view) onCreated();
    });
  }}>
    <h3 className="font-semibold">{bt("새 작업 세션", "New work session")}</h3>
    <p className="text-sm text-fg-2">{bt("기존 고정 검수본과 실제 팀원으로 초안을 저장합니다. 참여·작업 시작·미디어 사용은 각각 별도 행동입니다.", "Save a draft with an existing pinned review and actual teammates. Joining, starting and using media are separate actions.")}</p>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm">{bt("세션 제목", "Session title")}<input required className={control} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="block text-sm">{bt("이번 작업의 목적", "Purpose")}<textarea required className={`${control} min-h-24 py-2`} maxLength={1000} value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
      <label className="block text-sm">{bt("작업 유형", "Session type")}<select className={control} value={kind} onChange={(event) => setKind(event.target.value as StudioWorkSessionCreate["kind"])}>
        <option value="review">{bt("수정 검수", "Revision review")}</option><option value="storyboard">{bt("콘티 검토", "Storyboard review")}</option>
        <option value="reading">{bt("대본 리딩", "Script reading")}</option><option value="material-choice">{bt("소재 후보 검토", "Material candidate review")}</option>
        <option value="scene-review">{bt("3D 렌더 검토", "3D render review")}</option><option value="mentoring">{bt("팀 멘토링", "Team mentoring")}</option>
      </select></label>
      <label className="block text-sm">{bt("같이 확인할 고정 검수본", "Pinned input review")}<select required className={control} value={reviewId} onChange={(event) => setReviewId(event.target.value)}>
        <option value="">{bt("검수본을 선택하세요", "Select a review")}</option>
        {choices?.ok ? choices.choices.map((item) => <option key={item.subject.reviewId} value={item.subject.reviewId}>{item.title} · {item.subject.revisionId}</option>) : null}
      </select></label>
      {!choices ? <p role="status">{bt("검수본을 확인 중입니다.", "Checking review inputs.")}</p> : !choices.ok || !choices.choices.length ? <p role="status">{bt("사용 가능한 고정 검수본이 없습니다. 검수 작업실에서 제출본과 권한을 먼저 확인하세요.", "No available pinned input. Check submissions and access in the review workspace.")}</p> : null}
      <button className={control} type="button" onClick={() => { retry((value) => value + 1); roster.refresh(); }}>{bt("입력본·팀원 다시 확인", "Refresh inputs and teammates")}</button>
      <fieldset className="space-y-1"><legend className="text-sm font-semibold">{bt("초대할 팀원", "Invite teammates")}</legend>
        {members.map((member) => <label className="flex min-h-11 items-center gap-2 text-sm" key={member.userId}>
          <input type="checkbox" checked={invitees.includes(member.userId)} disabled={!invitees.includes(member.userId) && invitees.length >= 23}
            onChange={(event) => setInvitees((value) => event.target.checked ? [...value, member.userId] : value.filter((id) => id !== member.userId))} />
          {member.name} · {member.role}
        </label>)}
        {!roster.members ? <p className="text-sm" role="status">{bt("팀원 권한 확인 중이거나 확인할 수 없습니다. 팀원 선택은 최신 목록에서만 가능합니다.", "Teammate access is loading or unavailable. Select only from the current verified roster.")}</p> : null}
      </fieldset>
      <button type="submit" className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent" disabled={!choice || !title.trim() || !purpose.trim()}>
        {bt("세션 초안 저장", "Save session draft")}
      </button>
    </fieldset>
  </form>;
}
