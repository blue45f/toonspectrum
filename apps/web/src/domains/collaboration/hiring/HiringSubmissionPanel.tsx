import { useEffect, useRef, useState } from "react";

import { CollabField, CollabNotice, collabButton, collabInput, collabPrimary } from "../collaboration-ui";

import { hiringClient } from "./hiring-client";
import { ResumePreview } from "./ResumePreview";

import type { HiringApplicationSnapshot, HiringResume, HiringResumeVersion } from "../../../../../../packages/contracts/src/creator-hiring";
import type { CollaborationAction } from "../collaboration-application-panel";

import Link from "@/compat/router-link";
import { getApiErrorMessage } from "@/platform/api";

export function HiringSubmissionPanel({ postId, postVersion, busy, act }: { postId: string; postVersion: number; busy: boolean; act: CollaborationAction }) {
  const [resumes, setResumes] = useState<HiringResume[] | null>(null), [resumeId, setResumeId] = useState("");
  const [versions, setVersions] = useState<HiringResumeVersion[]>([]), [versionId, setVersionId] = useState("");
  const [indexes, setIndexes] = useState<number[]>([]), [message, setMessage] = useState(""), [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false), [resumeError, setResumeError] = useState(""), [versionError, setVersionError] = useState(""), [refresh, setRefresh] = useState(0);
  const retry = useRef<{ digest: string; mutationId: string } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    void hiringClient.resumes(c.signal).then((v) => { if (!c.signal.aborted) { setResumes(v); setResumeError(""); } }).catch(async (e) => { const m = await getApiErrorMessage(e, "이력서를 불러오지 못했어요."); if (!c.signal.aborted) setResumeError(m); });
    return () => c.abort();
  }, [refresh]);
  useEffect(() => {
    setVersions([]); setVersionId(""); setIndexes([]); setConsent(false); setVersionError("");
    if (!resumeId) return;
    const c = new AbortController();
    void hiringClient.versions(resumeId, c.signal).then((v) => { if (!c.signal.aborted) { const owned = v.filter((version) => version.resumeId === resumeId); setVersions(owned); setVersionId(owned[0]?.id ?? ""); } }).catch(async (e) => { const m = await getApiErrorMessage(e, "버전을 불러오지 못했어요."); if (!c.signal.aborted) setVersionError(m); });
    return () => c.abort();
  }, [resumeId, refresh]);
  const error = resumeError || versionError;
  const selected = !error && resumes?.some((r) => r.id === resumeId && !r.submissionBlocked) ? versions.find((v) => v.id === versionId && v.resumeId === resumeId) : undefined;
  async function submit() {
    if (!selected || !consent || busy) return;
    const value = { resumeVersionId: selected.id, portfolioIndexes: indexes, message, contact, consentRevision: "2026-09-20" as const, expectedPostVersion: postVersion };
    const digest = JSON.stringify(value);
    if (retry.current?.digest !== digest) retry.current = { digest, mutationId: crypto.randomUUID() };
    await act(() => hiringClient.submit(postId, { ...value, mutationId: retry.current!.mutationId }), "선택한 버전으로 지원했어요. 이력서를 수정해도 제출 내용은 유지됩니다.");
  }
  return <section className="mb-6 space-y-4 rounded-2xl border border-accent/30 bg-panel p-6"><h2 className="text-xl font-bold">저장한 이력서로 지원하기</h2><Link href="/collaborate/workspace" className={collabButton}>이력서 작성·관리</Link>
    {error && <CollabNotice error>{error}<button className={collabButton} onClick={() => setRefresh((v) => v + 1)}>다시 불러오기</button></CollabNotice>}
    {!resumes && !error && <p role="status">이력서를 불러오고 있어요.</p>}{resumes?.length === 0 && <p>저장한 이력서가 없어요. 이력서를 작성하거나 아래의 간단 지원을 이용하세요.</p>}
    {!!resumes?.length && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}><fieldset disabled={busy} className="space-y-4">
      <CollabField label="제출할 이력서"><select required className={collabInput} value={resumeId} onChange={(e) => { setResumeId(e.target.value); setVersions([]); setVersionId(""); setIndexes([]); setConsent(false); }}><option value="">이력서 선택</option>{resumes.map((r) => <option key={r.id} value={r.id} disabled={r.submissionBlocked}>{r.title}{r.submissionBlocked ? " (권리 철회로 제출 불가)" : ""}</option>)}</select></CollabField>
      {selected && <><CollabField label="제출할 저장 버전"><select className={collabInput} value={versionId} onChange={(e) => { setVersionId(e.target.value); setIndexes([]); setConsent(false); }}>{versions.map((v) => <option key={v.id} value={v.id}>버전 {v.revision} · {new Date(v.createdAt).toLocaleString("ko-KR")}</option>)}</select></CollabField>
        <fieldset><legend className="font-semibold">함께 제출할 포트폴리오</legend>{selected.content.portfolio.map((p, i) => <label key={i} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={indexes.includes(i)} onChange={() => { setIndexes(indexes.includes(i) ? indexes.filter((n) => n !== i) : [...indexes, i]); setConsent(false); }} />{p.title}</label>)}</fieldset>
        <details><summary className="cursor-pointer py-3 text-accent">제출 내용 미리보기</summary><ResumePreview content={{ ...selected.content, portfolio: indexes.map((i) => selected.content.portfolio[i]) }} /></details>
      </>}
      <CollabField label="지원 메시지"><textarea className={collabInput} required minLength={20} maxLength={2500} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} /></CollabField>
      <CollabField label="지원용 비공개 연락처"><input className={collabInput} required maxLength={250} value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" /></CollabField>
      <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />선택한 이력서 버전·포트폴리오와 연락처를 이 공고 작성자에게 제출하는 데 동의합니다. 제출본은 고정됩니다. 이력서 삭제는 이력서와 파생 제출본 내용만 지웁니다. 별도 지원 메시지·연락처도 지우려면 해당 공고에서 지원을 철회해야 합니다.</label>
      <button className={collabPrimary} disabled={!selected || !consent} type="submit">선택한 버전으로 지원</button>
    </fieldset></form>}
  </section>;
}
export function HiringSnapshotPanel({ postId, applicationId }: { postId: string; applicationId: string }) {
  const [items, setItems] = useState<HiringApplicationSnapshot[] | null>(null), [opened, setOpened] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (!opened) return;
    const c = new AbortController();
    void hiringClient.snapshots(postId, applicationId, c.signal).then((v) => { if (!c.signal.aborted) setItems(v); }).catch(async (e) => { const m = await getApiErrorMessage(e, "제출 이력서를 불러오지 못했어요."); if (!c.signal.aborted) setError(m); });
    return () => c.abort();
  }, [postId, applicationId, opened]);
  return <div className="mt-4 space-y-3"><button type="button" className={collabButton} onClick={() => { setOpened(!opened); setItems(null); setError(""); }}>{opened ? "제출 이력서 닫기" : "제출 이력서 확인"}</button>{opened && <>{error && <CollabNotice error>{error}</CollabNotice>}{!items && !error && <p role="status">불러오는 중…</p>}{items?.length === 0 && <p className="text-sm">첨부한 저장 이력서가 없는 지원입니다.</p>}{items?.map((s) => <div key={s.id}><p className="my-2 text-sm">제출 버전 {s.resumeRevision} · {new Date(s.submittedAt).toLocaleString("ko-KR")}</p>{s.content ? <ResumePreview content={s.content} /> : <p className="text-sm">철회 또는 삭제로 제출본 내용이 지워졌어요.</p>}</div>)}</>}</div>;
}
