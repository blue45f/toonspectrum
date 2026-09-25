import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { APPLICATION_STATUS, validateCollaborationApplication } from "../../../../../packages/core/src/collaboration";
import { CollabField, CollabLogin, CollabNotice, PortfolioLink, collabButton, collabInput, collabPrimary } from "./collaboration-ui";
import type { ApplicationStatus, CollaborationApplication, CollaborationDetail } from "../../../../../packages/core/src/collaboration";
import { getApiErrorMessage } from "@/platform/api";
import { collaborationClient } from "@/platform/collaboration-client";
import { saveCollaborationOnboarding } from "@/shared/lib/collaboration-onboarding";

import { InterviewScheduleButton } from "./hiring/CreatorMeetingPanel";
import { HiringSnapshotPanel, HiringSubmissionPanel } from "./hiring/HiringSubmissionPanel";

export type CollaborationAction = (work: () => Promise<unknown>, success: string) => Promise<boolean>;
export function ApplicationPanel({ data, userId, busy, act }: { data: CollaborationDetail; userId: string | null; busy: boolean; act: CollaborationAction }) {
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [error, setError] = useState("");
  const current = data.application;
  const post = data.post;
  async function apply() {
    const parsed = validateCollaborationApplication({ message, contact, portfolioUrl });
    if (!parsed.value) { setError(parsed.error); return; }
    setError("");
    const value = parsed.value;
    if (await act(() => collaborationClient.apply(post.id, value), "지원·제안을 접수했어요. 연락처는 공고 작성자만 볼 수 있어요.")) {
      setMessage(""); setContact(""); setPortfolioUrl("");
    }
  }
  if (!userId) return <CollabLogin />;
  if (current && current.status !== "withdrawn") return <section className="rounded-2xl border border-accent/30 bg-accent/5 p-6">
    <h2 className="text-lg font-bold text-fg">내 지원·제안 · {APPLICATION_STATUS[current.status]}</h2>
    {current.status === "selected" && <p className="mt-3 rounded-xl border border-good/35 bg-good/10 p-3 text-sm font-semibold text-good">합류가 확정됐어요. 작품 접근과 첫 작업은 공고 작성자가 별도 팀 초대로 연결합니다.</p>}
    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-fg-2">{current.message}</p>
    <p className="mt-3 break-all text-sm text-fg-3">연락처: {current.contact}</p>
    <PortfolioLink url={current.portfolioUrl} />
    <HiringSnapshotPanel postId={post.id} applicationId={current.id} />
    <p className="mt-3 text-xs leading-6 text-fg-3">작성자와 본인만 볼 수 있어요. 협의 중 표시는 계약 체결이나 작업실 접근 권한 부여를 뜻하지 않습니다.</p>
    {current.status !== "selected" && <button type="button" disabled={busy} className={`${collabButton} mt-4`} onClick={() => {
      if (globalThis.confirm("지원을 철회하고 메시지와 연락처를 삭제할까요?")) void act(() => collaborationClient.withdraw(post.id), "지원을 철회하고 연락처를 삭제했어요.");
    }}>지원 철회</button>}
  </section>;
  if (post.status !== "open" || post.expired || post.hidden) return <CollabNotice>이 공고는 현재 새 지원·제안을 받지 않아요.</CollabNotice>;
  return <><HiringSubmissionPanel postId={post.id} postVersion={post.version} busy={busy} act={act} /><form className="space-y-5 rounded-2xl border border-accent/30 bg-panel p-6" onSubmit={(event) => { event.preventDefault(); void apply(); }}>
    <h2 className="text-xl font-bold text-fg">{post.type === "available" ? "작업 제안하기" : "이 공고에 지원하기"}</h2>
    <p className="text-sm leading-7 text-fg-3">지원서와 연락처는 공고 작성자와 본인만 확인합니다. 필요한 범위의 연락 정보만 적어 주세요.</p>
    <CollabField label="지원·제안 내용"><textarea disabled={busy} className={collabInput} rows={5} required minLength={20} maxLength={2500} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="경험, 가능한 작업 분량과 일정, 협의하고 싶은 조건을 알려주세요." /></CollabField>
    <CollabField label="비공개 연락처" hint="이메일 또는 연락용 http/https 링크"><input disabled={busy} className={collabInput} required maxLength={250} value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="off" /></CollabField>
    <CollabField label="포트폴리오 주소 (선택)"><input disabled={busy} type="url" className={collabInput} maxLength={500} value={portfolioUrl} onChange={(event) => setPortfolioUrl(event.target.value)} placeholder="https://" /></CollabField>
    {error && <CollabNotice error>{error}</CollabNotice>}
    <button type="submit" disabled={busy} className={collabPrimary}>{busy ? "처리 중…" : "비공개 지원·제안 보내기"}</button>
  </form></>;
}
export function ApplicationsPanel({ id, busy, act }: { id: string; busy: boolean; act: CollaborationAction }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<CollaborationApplication[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void collaborationClient.applications(id, controller.signal).then((result) => {
      if (!Array.isArray(result)) throw new Error("지원서 응답을 확인하지 못했어요.");
      if (!controller.signal.aborted) setItems(result);
    }).catch(async (reason) => { const message = await getApiErrorMessage(reason, "지원서를 불러오지 못했어요."); if (!controller.signal.aborted) setError(message); });
    return () => controller.abort();
  }, [id]);
  async function updateStatus(item: CollaborationApplication, status: Exclude<ApplicationStatus, "withdrawn">) {
    const selected = status === "selected";
    const completed = await act(
      () => collaborationClient.applicationStatus(id, item.id, status),
      selected ? "합류를 확정했어요. 이제 팀과 작품 권한을 연결해 주세요." : "지원 처리 상태를 변경했어요.",
    );
    if (!completed || !selected) return;
    try {
      saveCollaborationOnboarding(sessionStorage, {
        postId: id,
        applicationId: item.id,
        candidateUserId: item.userId,
        candidateName: item.applicantName || "창작자",
        candidateContact: item.contact,
      });
    } catch {
      // The selected status is already durable; onboarding can continue without browser storage.
    }
    navigate(`/team/people?onboard=${encodeURIComponent(item.id)}`);
  }
  return <section className="rounded-2xl border border-line bg-panel p-6">
    <h2 className="text-xl font-bold text-fg">받은 지원·제안</h2>
    <p className="mt-2 text-xs leading-6 text-fg-3">작성자 전용 · 최근 200건까지 표시합니다. 합류 확정 후 사람·권한 화면에서 실제 팀과 작품 접근을 연결합니다.</p>
    {error && <div className="mt-4"><CollabNotice error>{error}</CollabNotice></div>}
    {!items && !error && <p role="status" className="mt-4 text-sm text-fg-3">지원서를 불러오고 있어요.</p>}
    {items?.length === 0 && <p className="mt-5 text-sm text-fg-3">아직 접수된 지원서가 없어요.</p>}
    <div className="mt-5 space-y-4">{items?.map((item) => <article key={item.id} className="rounded-xl border border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-fg">{item.applicantName || "창작자"}</h3><span className="text-xs text-accent">{APPLICATION_STATUS[item.status]}</span></div>
      {item.status === "withdrawn" ? <p className="mt-3 text-sm text-fg-3">지원자가 철회하여 메시지와 연락처가 삭제되었어요.</p> : <>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-fg-2">{item.message}</p>
        <p className="mt-3 break-all text-sm text-fg">연락처: {item.contact}</p>
        <PortfolioLink url={item.portfolioUrl} />
        <HiringSnapshotPanel postId={id} applicationId={item.id} />
        {!["declined", "selected"].includes(item.status) && <InterviewScheduleButton applicationId={item.id} candidateId={item.userId} />}
        <CollabField label={`${item.applicantName || "창작자"} 지원 처리 상태`}>
          <select disabled={busy} className={collabInput} value={item.status} onChange={(event) => {
            const status = event.target.value as Exclude<ApplicationStatus, "withdrawn">;
            if (status === "selected" && !globalThis.confirm(`${item.applicantName || "이 지원자"}의 합류를 확정하고 팀 온보딩으로 이동할까요?`)) return;
            void updateStatus(item, status);
          }}>{Object.entries(APPLICATION_STATUS).filter(([key]) => key !== "withdrawn").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </CollabField>
      </>}
    </article>)}</div>
  </section>;
}
