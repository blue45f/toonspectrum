import { useState } from "react";
import { z } from "zod";
import type { StudioSessionAgendaItem } from "@toonspectrum/studio-project-model/work-session";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioWorkSessionController } from "./studio-work-session-controller";
import { useStudioSessionFormDraft } from "./use-studio-session-form-draft";

const control = "min-h-11 max-w-full rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";
const field = "mt-1 block min-h-11 w-full rounded-lg border border-line bg-card p-2 text-sm";
const draftSchema = z.object({ baseRevision: z.number().int().positive(), title: z.string().max(160),
  purpose: z.string().max(1000), dialogue: z.string().max(4000), assignedUserId: z.string().max(160).nullable() }).strict();
const outcomeSchema = z.object({ baseRevision: z.number().int().positive(), body: z.string().max(2000) }).strict();
function parse<T>(raw: string, schema: z.ZodType<T>): T | null {
  if (!raw) return null;
  try { return schema.parse(JSON.parse(raw)); } catch { return null; }
}
export function StudioSessionAgendaItemActions({ item, sessionStatus, controller, busy, saving, people, name, draftKey, actorId }: {
  readonly item: StudioSessionAgendaItem; readonly sessionStatus: string; readonly controller: StudioWorkSessionController;
  readonly busy: boolean; readonly saving: boolean; readonly people: readonly string[]; readonly name: (id: string) => string;
  readonly draftKey: string; readonly actorId: string;
}) {
  const bt = useBilingual("StudioSessionAgendaItemActions");
  const [raw, write, storageError] = useStudioSessionFormDraft(draftKey + ":edit", 12_000);
  const [outcomeRaw, writeOutcome, outcomeStorageError] = useStudioSessionFormDraft(draftKey + ":outcome", 5000);
  const fromItem = () => ({ baseRevision: item.revision, title: item.title, purpose: item.purpose, dialogue: item.dialogue, assignedUserId: item.assignedUserId });
  const stored = parse(raw, draftSchema), draft = stored ?? fromItem();
  const outcome = parse(outcomeRaw, outcomeSchema) ?? { baseRevision: item.revision, body: "" };
  const corrupt = Boolean(raw && !stored), corruptOutcome = Boolean(outcomeRaw && !parse(outcomeRaw, outcomeSchema));
  const [editing, setEditing] = useState(Boolean(raw)), [removeRevision, setRemoveRevision] = useState<number | null>(null);
  const stale = draft.baseRevision !== item.revision;
  const update = (value: Partial<z.infer<typeof draftSchema>>) => write(JSON.stringify({ ...draft, ...value }));
  const save = async () => {
    if (busy || stale || corrupt || !draft.title.trim()) return;
    const attempted = { ...draft };
    await controller.command({ action: "agenda-edit", itemId: item.id, expectedItemRevision: attempted.baseRevision,
      title: attempted.title, purpose: attempted.purpose, dialogue: attempted.dialogue, assignedUserId: attempted.assignedUserId });
    const recorded = controller.getSnapshot().view?.session.workflow?.agenda.find((entry) => entry.id === item.id);
    if (recorded?.revision === attempted.baseRevision + 1 && recorded.updatedBy === actorId
      && recorded.title === attempted.title.trim() && recorded.purpose === attempted.purpose.trim()
      && recorded.dialogue === attempted.dialogue.trim() && recorded.assignedUserId === attempted.assignedUserId) {
      write(""); setEditing(false);
    }
  };
  const conclude = async () => {
    if (busy || corruptOutcome || !outcome.body.trim() || outcome.baseRevision !== item.revision) return;
    const attempted = { ...outcome };
    await controller.command({ action: "agenda-conclude", itemId: item.id, expectedItemRevision: attempted.baseRevision, body: attempted.body });
    const recorded = controller.getSnapshot().view?.session.workflow?.agenda.find((entry) => entry.id === item.id);
    if (recorded?.revision === attempted.baseRevision && recorded.outcome?.authorUserId === actorId && recorded.outcome.body === attempted.body.trim()) writeOutcome("");
  };
  return <div className="mt-3 space-y-2">
    {storageError || outcomeStorageError ? <p role="status" className="text-xs">{bt("이 탭의 입력 복구 저장을 사용할 수 없습니다. 닫기 전에 입력을 보관하세요.", "Tab recovery storage is unavailable. Preserve your input before closing.")}</p> : null}
    <button type="button" className={control} disabled={saving} aria-expanded={editing} onClick={() => { if (!editing && !raw) write(JSON.stringify(fromItem())); setEditing(!editing); }}>{bt("제안 내용 편집", "Edit proposal")}</button>
    {editing ? <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {stale || corrupt ? <p role="alert" className="text-sm">{bt("최신 제안과 내 입력의 기준이 다르거나 복구 내용을 읽지 못했습니다. 저장된 내 입력은 유지합니다.", "The proposal changed or the draft could not be read. Your stored input is preserved.")} <button type="button" className={control} disabled={saving} onClick={() => write(JSON.stringify(fromItem()))}>{bt("내 초안을 버리고 최신 내용 사용", "Discard my draft and use latest")}</button></p> : null}
      <label className="block text-sm">{bt("제안 제목 수정", "Edit proposal title")}<input className={field} value={draft.title} maxLength={160} onChange={(event) => update({ title: event.target.value })} disabled={saving || corrupt} /></label>
      <label className="block text-sm">{bt("목적 수정", "Edit purpose")}<textarea className={field} value={draft.purpose} maxLength={1000} onChange={(event) => update({ purpose: event.target.value })} disabled={saving || corrupt} /></label>
      <label className="block text-sm">{bt("대사 제안 수정", "Edit dialogue proposal")}<textarea className={field} value={draft.dialogue} maxLength={4000} onChange={(event) => update({ dialogue: event.target.value })} disabled={saving || corrupt} /></label>
      <label className="block text-sm">{bt("담당 변경", "Change participant")}<select className={field} value={draft.assignedUserId ?? ""} onChange={(event) => update({ assignedUserId: event.target.value || null })} disabled={saving || corrupt}>
        <option value="">{bt("미지정", "Unassigned")}</option>
        {draft.assignedUserId && !people.includes(draft.assignedUserId) ? <option value={draft.assignedUserId} disabled>{bt("현재 참여하지 않는 담당자", "Assignee is no longer participating")}</option> : null}
        {people.map((id) => <option key={id} value={id}>{name(id)}</option>)}</select></label>
      <button type="submit" className={control} disabled={busy || stale || corrupt || !draft.title.trim() || Boolean(draft.assignedUserId && !people.includes(draft.assignedUserId))}>{bt("현재 제안 저장", "Save this proposal")}</button>
    </form> : null}
    {corruptOutcome ? <p role="alert" className="text-xs">{bt("결론 초안을 읽지 못했습니다.", "The outcome draft could not be read.")} <button className={control} type="button" disabled={saving} onClick={() => writeOutcome("")}>{bt("결론 초안 삭제하고 다시 작성", "Discard outcome draft and start again")}</button></p> : null}
    <label className="block text-sm">{bt("이 안건의 결론", "Outcome of this item")}<textarea className={field} maxLength={2000} value={outcome.body} disabled={saving || corruptOutcome}
      onChange={(event) => writeOutcome(JSON.stringify({ baseRevision: outcome.body ? outcome.baseRevision : item.revision, body: event.target.value }))} /></label>
    {outcome.body && outcome.baseRevision !== item.revision ? <p role="alert" className="text-xs">{bt("결론 작성 중 제안이 변경됐습니다. 입력은 유지했습니다.", "The proposal changed while writing. Your input is preserved.")} <button type="button" className={control} disabled={saving} onClick={() => writeOutcome(JSON.stringify({ ...outcome, baseRevision: item.revision }))}>{bt("최신 제안을 확인함", "Reviewed latest proposal")}</button></p> : null}
    <button type="button" className={control} disabled={busy || sessionStatus !== "active" || !outcome.body.trim() || corruptOutcome || outcome.baseRevision !== item.revision} onClick={() => { void conclude(); }}>{bt("결론 확정 기록", "Record explicit outcome")}</button>
    {sessionStatus !== "active" ? <><button type="button" className={control} disabled={saving} aria-expanded={removeRevision !== null} onClick={() => setRemoveRevision(removeRevision === null ? item.revision : null)}>{bt("안건 제거…", "Remove item…")}</button>
      {removeRevision !== null ? <p className="text-xs">{bt("진행표에서만 제거합니다. 원고와 서버 이력은 남습니다.", "Only removes from the agenda. Manuscript and server history remain.")}
        {removeRevision !== item.revision ? <span role="alert">{bt("제안이 변경되어 제거를 보류합니다.", "Removal paused because the proposal changed.")}</span> : null}
        <button className={control} type="button" disabled={busy || removeRevision !== item.revision} onClick={() => { void controller.command({ action: "agenda-remove", expectedItemRevision: removeRevision, itemId: item.id }); }}>{bt("제거 확인", "Confirm removal")}</button></p> : null}</> : null}
  </div>;
}
