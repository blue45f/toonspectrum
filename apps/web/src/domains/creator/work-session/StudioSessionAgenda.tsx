import { useState } from "react";
import type { StudioSessionResources, StudioWorkSessionView } from "@toonspectrum/studio-project-model/work-session";
import type { StudioReviewSourceReference } from "@toonspectrum/studio-project-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { newStudioProjectGraphId } from "../project-graph/studio-project-graph-client";
import type { StudioWorkSessionController } from "./studio-work-session-controller";
import { StudioSessionAgendaItemActions } from "./StudioSessionAgendaItemActions";
import { useStudioSessionFormDraft } from "./use-studio-session-form-draft";

const control = "min-h-11 max-w-full rounded-lg border border-line bg-card px-3 text-sm disabled:opacity-50";
const field = "mt-1 block min-h-11 w-full rounded-lg border border-line bg-card p-2 text-sm";
interface Props { readonly view: StudioWorkSessionView; readonly actorId: string; readonly controller: StudioWorkSessionController;
  readonly busy: boolean; readonly saving?: boolean; readonly resources: StudioSessionResources | null; readonly name: (id: string) => string;
  readonly onInspect: (source: StudioReviewSourceReference) => void }
export function StudioSessionAgenda({ view, actorId, controller, busy, saving = busy, resources, name, onInspect }: Props) {
  const bt = useBilingual("StudioSessionAgenda"), { session } = view;
  const entries = session.workflow?.agenda ?? [];
  const terminal = ["closed", "cancelled"].includes(session.status);
  const editable = view.capabilities.edit && session.participantUserIds.includes(actorId) && !terminal;
  const [sourceIndex, setSourceIndex] = useState(""), [frameId, setFrameId] = useState(""), [assignee, setAssignee] = useState("");
  const prefix = JSON.stringify(["session-agenda-draft-v1", actorId, session.workId, session.id]);
  const [title, setTitle, titleError] = useStudioSessionFormDraft(prefix + ":title", 160);
  const [purpose, setPurpose, purposeError] = useStudioSessionFormDraft(prefix + ":purpose", 1000);
  const [dialogue, setDialogue, dialogueError] = useStudioSessionFormDraft(prefix + ":dialogue", 4000);
  const available = resources?.pages ?? [];
  const chosen = available.find((page) => page.source.pageId === sourceIndex);
  const add = async () => {
    if (!resources || !chosen || !title.trim() || busy || !editable || (frameId && !chosen.frameIds.includes(frameId))) return;
    const id = newStudioProjectGraphId("session-agenda");
    await controller.command({ action: "agenda-add", item: { id, title, purpose, dialogue,
      source: { ...chosen.source, ...(frameId ? { frameId } : {}) }, assignedUserId: assignee || null } });
    if (controller.getSnapshot().view?.session.workflow?.agenda.some((item) => item.id === id)) {
      setTitle(""); setPurpose(""); setDialogue(""); setAssignee("");
    }
  };
  const reorder = (index: number, delta: -1 | 1) => {
    const ids = entries.map((item) => item.id), target = index + delta;
    if (target < 0 || target >= ids.length || busy) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void controller.command({ action: "agenda-reorder", expectedOrder: entries.map((item) => item.id), itemIds: ids });
  };
  const titleText = session.kind === "reading" ? bt("대본 리딩 진행표", "Script reading agenda")
    : session.kind === "storyboard" ? bt("콘티 검토 진행표", "Storyboard review agenda")
      : session.kind === "mentoring" ? bt("멘토링 안건", "Mentoring agenda") : bt("장면별 검토 진행표", "Scene review agenda");
  return <section className="space-y-3 rounded-xl border border-line p-3" aria-label={titleText}>
    <h4 className="font-semibold">{titleText} · {entries.length}/32</h4>
    <p className="text-xs text-fg-2">{bt("고정 원고의 페이지·컷에 검토 순서, 대사 제안, 담당자와 결론을 연결합니다. 순서·대사 변경은 세션의 제안이며 원본 편집·승인·공개를 실행하지 않습니다.", "Tie discussion order, dialogue proposals, participants and outcomes to pinned pages/cuts. These are session proposals, not manuscript edits, approval or publication.")}</p>
    <ol className="space-y-3">{entries.map((item, index) => <li key={item.id} className="rounded-lg border border-line p-3" aria-current={session.workflow?.activeAgendaItemId === item.id ? "step" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2"><h5 className="min-w-0 break-words font-semibold">{index + 1}. {item.title}</h5>
        {session.workflow?.activeAgendaItemId === item.id ? <span role="status" className="text-xs text-accent">{bt("지금 진행 중", "Current item")}</span> : null}</div>
      <p className="mt-1 text-xs text-fg-3">{bt(`${item.source.pageOrdinal + 1}페이지`, `Page ${item.source.pageOrdinal + 1}`)}{item.source.frameId ? ` · ${item.source.frameId}` : ""} · v{item.revision}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.purpose}</p>
      {item.dialogue ? <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-line pl-3 text-sm">{item.dialogue}</blockquote> : null}
      <p className="mt-2 text-xs">{bt("진행 담당", "Assigned participant")} · {item.assignedUserId ? name(item.assignedUserId) : bt("미지정", "Unassigned")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={control} onClick={() => onInspect(item.source)}>{bt("이 페이지 직접 보기", "Inspect this page")}</button>
        {editable ? <><button type="button" className={control} disabled={busy || index === 0} onClick={() => reorder(index, -1)} aria-label={bt(`${item.title} 앞 순서로`, `Move ${item.title} earlier`)}>↑</button>
          <button type="button" className={control} disabled={busy || index === entries.length - 1} onClick={() => reorder(index, 1)} aria-label={bt(`${item.title} 뒤 순서로`, `Move ${item.title} later`)}>↓</button>
          <button type="button" className={control} disabled={busy || session.status !== "active" || Boolean(item.assignedUserId && !session.participantUserIds.includes(item.assignedUserId))}
            onClick={() => { void controller.command({ action: "agenda-focus", itemId: item.id }); }}>{bt("이 안건 진행", "Start this agenda item")}</button></> : null}
      </div>
      {item.outcome ? <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-panel p-3 text-sm"><strong>{bt("기록한 결론", "Recorded outcome")} · {name(item.outcome.authorUserId)}</strong><br />{item.outcome.body}</p>
        : editable ? <StudioSessionAgendaItemActions draftKey={prefix + ":item:" + item.id} actorId={actorId} saving={saving} key={item.id} item={item} sessionStatus={session.status} controller={controller} busy={busy} people={session.participantUserIds} name={name} /> : null}
    </li>)}</ol>
    {!entries.length ? <p className="text-sm">{bt("아직 진행 안건이 없습니다. 고정 페이지를 골라 첫 안건을 추가하세요.", "No agenda items yet. Choose a pinned page to add the first item.")}</p> : null}
    {editable ? <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">{bt("새 안건 추가", "Add agenda item")}</summary>
      <form className="mt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); void add(); }}>
        <fieldset disabled={saving || entries.length >= 32} className="space-y-3">
          <label className="block text-sm">{bt("고정 페이지", "Pinned page")}<select className={field} value={chosen?.source.pageId ?? ""} disabled={!resources} onChange={(event) => { setSourceIndex(event.target.value); setFrameId(""); }}>
            <option value="">{bt("페이지를 선택하세요", "Choose a page")}</option>{available.map((page) => <option key={page.source.pageId} value={page.source.pageId}>{page.source.pageOrdinal + 1}</option>)}</select></label>
          <label className="block text-sm">{bt("고정 컷", "Pinned cut")}<select className={field} value={frameId} onChange={(event) => setFrameId(event.target.value)}>
            <option value="">{bt("페이지 전체", "Whole page")}</option>{chosen?.frameIds.map((id, index) => <option key={id} value={id}>{bt(`컷 ${index + 1}`, `Cut ${index + 1}`)}</option>)}</select></label>
          <label className="block text-sm">{bt("안건 제목", "Agenda title")}<input className={field} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="block text-sm">{bt("검토 목적", "Discussion purpose")}<textarea className={field} maxLength={1000} value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
          <label className="block text-sm">{bt("대사·연출 제안", "Dialogue / direction proposal")}<textarea className={field} rows={3} maxLength={4000} value={dialogue} onChange={(event) => setDialogue(event.target.value)} /></label>
          <label className="block text-sm">{bt("진행 담당자", "Assigned participant")}<select className={field} value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">{bt("미지정", "Unassigned")}</option>
            {session.participantUserIds.map((id) => <option key={id} value={id}>{name(id)}</option>)}</select></label>
          <button type="submit" className={control} disabled={busy || !chosen || !title.trim() || Boolean(assignee && !session.participantUserIds.includes(assignee))}>{bt("고정 원고에 안건 연결", "Attach agenda to pinned source")}</button>
        </fieldset>
        {titleError || purposeError || dialogueError ? <p role="status" className="text-xs">{bt("이 탭의 초안 저장 공간을 사용할 수 없습니다. 화면을 닫기 전에 입력을 보관하세요.", "Tab draft storage is unavailable. Preserve your input before closing.")}</p> : null}
      </form></details> : null}
  </section>;
}

