import { useId, useLayoutEffect, useState } from "react";
import type { StudioHandoffEnvelopeView } from "@toonspectrum/studio-project-model";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import Link from "@/shared/navigation/router-link";
import { Button } from "@/shared/components/ui/button";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { studioVirtualSpaceReviewHref } from "../virtual-space/studio-virtual-space-review-invitation";
import { studioProjectSectionPath } from "../studio-route-registry";
import { useStudioHandoffEnvelope } from "./use-studio-handoff-envelope";

type Connection = ReturnType<typeof useStudioHandoffEnvelope>;
function Status({ value }: { readonly value: StudioHandoffEnvelopeView["status"] }) {
  const bt = useBilingual("StudioHandoffEnvelope");
  return <>{({ delivered: bt("전달됨 · 아직 열지 않음", "Delivered · unopened"), read: bt("읽음 · 인수 확인 전", "Opened · not yet accepted"),
    accepted: bt("수신자가 인수 확인", "Accepted by recipient"), cancelled: bt("작성자가 전달 취소", "Cancelled by sender"),
    changed: bt("근거 또는 수신자 변경 · 새 전달 필요", "Evidence or recipient changed · send a new envelope") })[value]}</>;
}
function ErrorAndRefresh({ connection }: { readonly connection: Connection }) {
  const bt = useBilingual("StudioHandoffEnvelope"), busy = ["saving", "loading"].includes(connection.snapshot.phase);
  return <div className="mt-3 space-y-2">{connection.snapshot.reason ? <p role="status" className="text-sm">{connection.snapshot.phase === "uncertain"
    ? bt("전달 상태를 확인하지 못했어요. 같은 요청의 서버 기록을 다시 확인해 주세요. 자동으로 다시 보내지 않습니다.", "The result is uncertain. Recheck the same server record. It is not automatically sent again.")
    : bt("현재 권한과 인계 근거를 다시 확인해 주세요. 이전 화면의 정보로 인수를 기록하지 않았습니다.", "Reload current access and handoff evidence. No acceptance was recorded from stale information.")}</p> : null}
    <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="outline" disabled={busy} onClick={connection.refresh}>{bt("최신 상태 다시 읽기", "Reload current status")}</Button>
      {connection.snapshot.phase === "uncertain" ? <Button className="min-h-11" disabled={busy} onClick={connection.retry}>{bt("동일 요청 확인 후 재시도", "Recheck and retry same request")}</Button> : null}</div>
  </div>;
}
function EnvelopeDetails({ connection, actorId }: { readonly connection: Connection; readonly actorId: string }) {
  const bt = useBilingual("StudioHandoffEnvelope"), value = connection.snapshot.view;
  const [checked, setChecked] = useState(false);
  const proof = value ? `${value.envelope.id}:${value.envelopeDigest}:${value.canAccept}:${value.status}` : null;
  useLayoutEffect(() => { setChecked(false); }, [proof]);
  if (!value) return null;
  const envelope = value.envelope, busy = connection.snapshot.phase === "saving" || connection.snapshot.phase === "loading" || connection.snapshot.phase === "uncertain";
  const recipient = envelope.recipient.userId === actorId;
  return <article className="mt-3 space-y-3 rounded-lg border border-line p-3">
    <h3 className="font-semibold">{envelope.taskTitle}</h3><p role="status" className="text-sm"><Status value={value.status} /></p>
    <p className="text-xs text-fg-3">{new Date(envelope.createdAt).toLocaleString()} · {recipient ? bt("받은 봉투", "Received envelope") : bt("보낸 봉투", "Sent envelope")}</p>
    <div className="flex flex-wrap gap-3 text-sm"><Link className="inline-flex min-h-11 items-center underline" href={studioVirtualSpaceReviewHref(envelope.completion.reference.subject)}>{bt("고정 입력 검수본", "Pinned input review")}</Link>
      <Link className="inline-flex min-h-11 items-center underline" href={studioVirtualSpaceReviewHref(envelope.completion.replacement)}>{bt("완료 근거의 산출물 검수본", "Output review used for completion")}</Link></div>
    <dl className="space-y-2 text-sm"><dt className="font-semibold">{bt("장면 목적과 감정", "Scene purpose and emotion")}</dt><dd className="whitespace-pre-wrap">{envelope.brief.scenePurpose}{"\n"}{envelope.brief.emotionalBeat}</dd>
      <dt className="font-semibold">{bt("포함 항목과 연속성 메모", "Required content and continuity")}</dt><dd className="whitespace-pre-wrap">{[...envelope.brief.mustShow, ...envelope.brief.continuityNotes].join("\n") || bt("등록된 항목 없음", "No entries")}</dd>
      <dt className="font-semibold">{bt("완료 시 확인한 기준", "Criteria confirmed at completion")}</dt><dd><ul className="list-inside list-disc">{envelope.brief.acceptanceCriteria.map((item, i) => <li key={i}>{item}</li>)}</ul></dd>
      <dt className="font-semibold">{bt("사용 조건", "Usage conditions")}</dt><dd className="whitespace-pre-wrap">{envelope.usageConditions}</dd>
      <dt className="font-semibold">{bt("작성자가 남긴 문제", "Sender’s remaining notes")}</dt><dd className="whitespace-pre-wrap">{envelope.remainingNotes || bt("추가 메모 없음", "No additional notes")}</dd>
    </dl>
    <p className="text-xs text-fg-3">{bt("사용 조건은 작성자가 남긴 작업 지침이며 이용 권한이나 저작권 허가를 부여하지 않습니다.", "Usage conditions are sender instructions, not an access or copyright grant.")}</p>
    <section aria-label={bt("전달 시 남은 검수 의견", "Unresolved review comments at delivery")}><h4 className="text-sm font-semibold">{bt("전달 시 남은 검수 의견", "Unresolved review comments at delivery")}</h4>
      {envelope.remainingIssues.length ? <ul className="mt-1 space-y-2 text-sm">{envelope.remainingIssues.map((issue) => <li key={issue.commentId} className="whitespace-pre-wrap rounded border border-line p-2">{issue.body}</li>)}</ul>
        : <p className="text-sm">{bt("두 고정 검수본에 미해결 의견이 없었어요.", "Neither pinned review had unresolved comments at delivery.")}</p>}</section>
    {value.opened ? <p className="text-xs">{bt("수신자 읽음", "Opened by recipient")} · {new Date(value.opened.at).toLocaleString()}</p> : null}
    {value.accepted ? <p className="text-xs">{bt("수신자 인수 기록", "Recipient acceptance record")} · {new Date(value.accepted.at).toLocaleString()}</p> : null}
    {recipient && !value.opened && value.status !== "cancelled" ? <Button className="min-h-11" disabled={busy} onClick={() => connection.act("open")}>{bt("내용을 읽었음을 기록", "Record that I read this envelope")}</Button> : null}
    {value.canAccept ? <><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={checked} disabled={busy} onChange={(event) => setChecked(event.target.checked)} />
      {bt("고정 입력·산출물·남은 문제·사용 조건을 확인하고 인수합니다.", "I reviewed the pinned input, output, remaining issues and usage conditions and accept this handoff.")}</label>
      <Button className="min-h-11" disabled={!checked || busy} onClick={() => connection.act("accept")}>{bt("지정 수신자로 인수 확인", "Confirm acceptance as recipient")}</Button></> : null}
    {value.canCancel ? <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => connection.act("cancel")}>{bt("이 봉투 전달 취소", "Cancel this handoff")}</Button> : null}
    <p className="text-xs text-fg-3">{bt("읽음과 인수는 별도 기록입니다. 인수는 다음 작업의 완료나 검수 승인·공식 배포를 뜻하지 않습니다.", "Opening and accepting are separate records. Acceptance does not complete the next task, approve a review or release anything.")}</p>
  </article>;
}
function Composer({ workId, taskId, actorId }: { readonly workId: string; readonly taskId: string; readonly actorId: string }) {
  const bt = useBilingual("StudioHandoffEnvelope"), connection = useStudioHandoffEnvelope(workId, taskId, actorId);
  const recipientSelectId = useId();
  const [roleId, setRoleId] = useState(""), [usageConditions, setUsage] = useState(""), [remainingNotes, setNotes] = useState("");
  const snapshot = connection.snapshot, prepared = snapshot.prepared, busy = ["loading", "saving", "uncertain"].includes(snapshot.phase);
  return <div>{prepared ? <fieldset disabled={busy} className="mt-3 space-y-3"><legend className="text-sm font-semibold">{prepared.taskTitle}</legend>
    <label htmlFor={recipientSelectId} className="block text-sm">{bt("실제 수신자와 기존 역할 배정", "Recipient and existing role assignment")}</label><select id={recipientSelectId} className="mt-1 min-h-11 w-full rounded border border-line bg-card px-2" value={roleId} onChange={(event) => setRoleId(event.target.value)}>
      <option value="">{bt("수신자 선택", "Select recipient")}</option>{prepared.recipients.map((item) => <option key={item.roleAssignmentId} value={item.roleAssignmentId}>{item.displayName} · {item.roleLabel}</option>)}</select>
    {!prepared.recipients.length ? <p className="text-sm">{bt("이 인계 역할과 범위에 맞는 다른 팀원이 없어요. 제작 보드에서 실제 팀원의 역할을 먼저 배정해 주세요.", "No other team member has the required handoff role and scope. Assign an existing member’s role in the production board first.")}</p> : null}
    <label className="block text-sm">{bt("사용 조건 (필수)", "Usage conditions (required)")}<textarea className="mt-1 min-h-24 w-full rounded border border-line bg-card p-2" maxLength={4000} value={usageConditions} onChange={(event) => setUsage(event.target.value)} /></label>
    <label className="block text-sm">{bt("남은 문제와 주의 사항", "Remaining issues and notes")}<textarea className="mt-1 min-h-24 w-full rounded border border-line bg-card p-2" maxLength={4000} value={remainingNotes} onChange={(event) => setNotes(event.target.value)} /></label>
    <p className="text-xs text-fg-3">{bt("원본·수정 검수본과 완료 기록, 인계서, 해당 검수본의 미해결 의견을 전달 시점에 고정합니다. 받는 사람이 나중에 제작 보드의 수신함에서 직접 인수를 확인합니다.", "The input/output reviews, completion record, brief and their unresolved comments are pinned at delivery. The recipient later confirms acceptance in the production board inbox.")}</p>
    <Button className="min-h-11" disabled={!usageConditions.trim() || !prepared.recipients.some((item) => item.roleAssignmentId === roleId)} onClick={() => connection.send({ roleId, usageConditions, remainingNotes })}>{bt("확인한 수신자에게 봉투 전달", "Deliver envelope to selected recipient")}</Button>
  </fieldset> : null}<EnvelopeDetails connection={connection} actorId={actorId} /><ErrorAndRefresh connection={connection} />
    <Link className="mt-3 inline-flex min-h-11 items-center underline text-sm" href={studioProjectSectionPath(workId, "production")}>{bt("제작 보드와 인수인계함 열기", "Open production board and handoff inbox")}</Link></div>;
}
function Inbox({ workId, actorId }: { readonly workId: string; readonly actorId: string }) {
  const bt = useBilingual("StudioHandoffEnvelope"), connection = useStudioHandoffEnvelope(workId, null, actorId), { snapshot } = connection;
  const busy = ["loading", "saving", "uncertain"].includes(snapshot.phase);
  return <div>{snapshot.list ? <>{(["received", "sent"] as const).map((direction) => <section key={direction} className="mt-3"><h3 className="text-sm font-semibold">{direction === "received" ? bt("받은 봉투", "Received") : bt("보낸 봉투", "Sent")}</h3>
    <ul>{snapshot.list!.items.filter((item) => item.direction === direction).map((item) => <li key={item.id}><Button className="min-h-11 h-auto max-w-full whitespace-normal text-left" variant="ghost" disabled={busy} onClick={() => connection.select(item.id)}>{item.taskTitle} · <Status value={item.status} /></Button></li>)}</ul></section>)}
    {!snapshot.list.items.length ? <p className="mt-3 text-sm">{bt("이 페이지에 보낸 봉투나 받은 봉투가 없어요.", "No sent or received envelopes on this page.")}</p> : null}
    {snapshot.list.nextCursor ? <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => connection.select(null, snapshot.list!.nextCursor)}>{bt("다음 봉투 보기", "Next page")}</Button> : null}</> : null}
    <EnvelopeDetails connection={connection} actorId={actorId} />{snapshot.view ? <Button className="mt-3 min-h-11" variant="outline" disabled={busy} onClick={() => connection.select(null)}>{bt("보낸·받은 봉투 목록", "Sent and received envelopes")}</Button> : null}<ErrorAndRefresh connection={connection} /></div>;
}
export function StudioHandoffEnvelopeComposer({ workId, taskId }: { readonly workId: string; readonly taskId: string }) {
  const bt = useBilingual("StudioHandoffEnvelope"), actorId = useSession().data?.user?.id, [expanded, setExpanded] = useState(false), id = useId();
  if (!actorId) return null;
  return <div className="mt-3"><Button className="min-h-11" variant="outline" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>{bt("완료 근거로 다음 담당자에게 인계", "Hand off completed evidence to the next recipient")}</Button>
    <div id={id}>{expanded ? <Composer key={`${actorId}:${workId}:${taskId}`} workId={workId} taskId={taskId} actorId={actorId} /> : null}</div></div>;
}
export function StudioHandoffEnvelopeInbox({ workId }: { readonly workId: string }) {
  const bt = useBilingual("StudioHandoffEnvelope"), actorId = useSession().data?.user?.id, [expanded, setExpanded] = useState(false), id = useId();
  if (!actorId) return null;
  return <section className="rounded-xl border border-line bg-card p-4"><Button className="min-h-11" variant="outline" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>{bt("보낸·받은 인수인계 봉투", "Sent and received handoff envelopes")}</Button>
    <div id={id}>{expanded ? <Inbox key={`${actorId}:${workId}`} workId={workId} actorId={actorId} /> : null}</div></section>;
}
