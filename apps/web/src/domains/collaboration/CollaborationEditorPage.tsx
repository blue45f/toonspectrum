import { ArrowLeft, CheckCircle2, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  COLLABORATION_MODES, COLLABORATION_PAY, COLLABORATION_ROLES, COLLABORATION_TYPES,
  COLLABORATION_UNITS, validateCollaborationInput,
} from "../../../../../packages/core/src/collaboration";

import { collaborationDraftKey, collaborationTemplate, emptyCollaborationDraft, readCollaborationDraft, saveCollaborationDraft } from "./collaboration-draft";
import { CollabField, CollabLogin, CollabNotice, collabButton, collabInput, collabPrimary } from "./collaboration-ui";

import type { CollaborationDetails, CollaborationInput } from "../../../../../packages/core/src/collaboration";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { getApiErrorMessage } from "@/infrastructure/api";
import { collaborationClient } from "@/infrastructure/collaboration-client";
import { Container } from "@/shared/components/section";
import { useApp } from "@/shared/lib/store";

export function CollaborationEditorPage() {
  const { id } = useParams();
  const userId = useApp((state) => state.userId);
  useDocumentTitle(id ? "구인·의뢰 공고 수정" : "구인·의뢰 공고 등록");
  return <Container size="wide" className="max-w-4xl py-8 sm:py-12"><Link href={id ? `/collaborate/${id}` : "/collaborate"} className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-3"><ArrowLeft size={16} aria-hidden="true" />공고로 돌아가기</Link><h1 className="mt-4 text-3xl font-bold text-fg">{id ? "공고 수정" : "함께할 사람에게, 정확한 제안을."}</h1><p className="mt-3 text-sm leading-7 text-fg-3">작업 범위와 보수, 서로 지킬 약속을 미리 적으면 더 잘 맞는 동료를 만날 수 있어요.</p><div className="mt-7">{userId ? <EditorLoader key={`${id || "new"}:${userId}`} id={id} userId={userId} /> : <CollabLogin />}</div></Container>;
}
function EditorLoader({ id, userId }: { id?: string; userId: string }) {
  const [initial, setInitial] = useState<{ input: CollaborationInput; version: number } | null>(id ? null : { input: emptyCollaborationDraft(), version: 1 });
  const [error, setError] = useState(""); const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void collaborationClient.detail(id, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      if (!data.canManage) { setError("공고 작성자만 수정할 수 있어요."); return; }
      setInitial({ input: data.post, version: data.post.version }); setError("");
    }).catch(async (reason) => { const message = await getApiErrorMessage(reason, "공고를 불러오지 못했어요."); if (!controller.signal.aborted) setError(message); });
    return () => controller.abort();
  }, [id, refresh]);
  if (error) return <CollabNotice error>{error}<button type="button" className={`${collabButton} ml-3`} onClick={() => setRefresh((value) => value + 1)}>다시 불러오기</button></CollabNotice>;
  if (!initial) return <p role="status" className="text-fg-3">수정할 공고를 불러오고 있어요.</p>;
  return <CollaborationEditorForm id={id} userId={userId} initial={initial.input} version={initial.version} />;
}
function CollaborationEditorForm({ id, userId, initial, version }: { id?: string; userId: string; initial: CollaborationInput; version: number }) {
  const navigate = useNavigate();
  const [input, setInput] = useState(() => { if (id) return initial; try { return readCollaborationDraft(localStorage, userId) ?? initial; } catch { return initial; } });
  const [error, setError] = useState(""); const [draftStatus, setDraftStatus] = useState("");
  const [busy, setBusy] = useState(false); const [confirmed, setConfirmed] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    if (id) return;
    const timer = globalThis.setTimeout(() => {
      try { setDraftStatus(saveCollaborationDraft(localStorage, userId, input) ? "이 기기에 초안 저장됨 · 아직 공개되지 않았어요" : "기기 저장 공간에 접근할 수 없어요. 화면을 닫으면 초안이 사라질 수 있어요."); }
      catch { setDraftStatus("이 기기에서는 임시저장을 사용할 수 없어요."); }
    }, 400);
    return () => globalThis.clearTimeout(timer);
  }, [id, input, userId]);
  function detail<K extends keyof CollaborationDetails>(key: K, value: CollaborationDetails[K]) { setInput((current) => ({ ...current, details: { ...current.details, [key]: value } })); }
  function template(kind: "ink" | "background" | "team") {
    if ((input.title || input.details.description) && !globalThis.confirm("현재 작성 중인 내용을 선택한 작성 예시로 바꿀까요?")) return;
    setInput(collaborationTemplate(kind)); setConfirmed(false); setError("");
  }
  async function submit() {
    if (submitting.current || useApp.getState().userId !== userId) return;
    const candidate = { ...input, details: { ...input.details, tools: input.details.tools.map((tool) => tool.trim()).filter(Boolean) } };
    const parsed = validateCollaborationInput(candidate);
    if (!parsed.value) { setError(parsed.error); return; }
    if (!confirmed) { setError("공개할 내용과 협업 조건을 확인해 주세요."); return; }
    submitting.current = true; setBusy(true); setError("");
    try {
      let postId = id;
      if (id) await collaborationClient.update(id, parsed.value, version);
      else { const created = await collaborationClient.create(parsed.value); if (!created?.id) throw new Error("등록 결과를 확인하지 못했어요. 내 공고를 먼저 확인해 주세요."); postId = created.id; }
      if (!id) { try { localStorage.removeItem(collaborationDraftKey(userId)); } catch { /* A successful publication must not be reported as failed because storage is blocked. */ } }
      if (useApp.getState().userId === userId) navigate(`/collaborate/${postId}`);
    } catch (reason) { setError(await getApiErrorMessage(reason, "공고를 저장하지 못했어요. 입력 내용은 유지됩니다.")); }
    finally { submitting.current = false; setBusy(false); }
  }
  const noAmount = input.payType === "volunteer" || input.payType === "revenue_share";
  return <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-7">
    {!id && <section className="rounded-2xl border border-line bg-panel p-5"><h2 className="text-sm font-bold text-fg">빈칸이 막막하다면 작성 예시로 시작하세요</h2><p className="mt-2 text-xs leading-6 text-fg-3">예시 문구를 실제 작업 조건으로 바꿔 주세요. 버튼을 눌러도 공개 등록되지 않습니다.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={collabButton} onClick={() => template("ink")}>선화 보조 의뢰</button><button type="button" className={collabButton} onClick={() => template("background")}>배경 작업 의뢰</button><button type="button" className={collabButton} onClick={() => template("team")}>팀원 모집</button></div></section>}
    <fieldset disabled={busy} className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-7"><legend className="px-2 text-lg font-bold text-fg">01 · 어떤 동료를 찾나요?</legend>
      <div className="grid gap-5 sm:grid-cols-2"><CollabField label="공고 유형"><select className={collabInput} value={input.type} onChange={(event) => setInput((current) => ({ ...current, type: event.target.value as CollaborationInput["type"], payType: event.target.value !== "team" && ["volunteer", "revenue_share"].includes(current.payType) ? "negotiable" : current.payType }))}>{Object.entries(COLLABORATION_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></CollabField><CollabField label="작업 분야"><select className={collabInput} value={input.role} onChange={(event) => setInput({ ...input, role: event.target.value as CollaborationInput["role"] })}>{Object.entries(COLLABORATION_ROLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></CollabField></div>
      <CollabField label="공고 제목" hint="분야·작업량·일정을 알 수 있는 제목이 좋아요."><input className={collabInput} value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} required minLength={5} maxLength={100} placeholder="주 1회 연재 웹툰의 채색 보조 작업자를 찾습니다" /></CollabField>
      <CollabField label="작품과 작업 소개" hint="30~6000자 · 연락처와 미공개 원고는 공개 본문에 넣지 마세요."><textarea className={collabInput} rows={7} required minLength={30} maxLength={6000} value={input.details.description} onChange={(event) => detail("description", event.target.value)} /></CollabField>
      <div className="grid gap-5 sm:grid-cols-2"><CollabField label="장르·분위기"><input className={collabInput} maxLength={80} value={input.details.genre} onChange={(event) => detail("genre", event.target.value)} placeholder="로맨스 판타지, 학원 액션 등" /></CollabField><CollabField label="사용 도구" hint="쉼표로 구분 · 최대 8개"><input className={collabInput} maxLength={250} value={input.details.tools.join(",")} onChange={(event) => detail("tools", event.target.value.split(","))} placeholder="ToonStudio, Clip Studio, Blender" /></CollabField></div>
    </fieldset>
    <fieldset disabled={busy} className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-7"><legend className="px-2 text-lg font-bold text-fg">02 · 보수와 일정은 명확하게</legend>
      <div className="grid gap-5 sm:grid-cols-2"><CollabField label="보수 방식"><select className={collabInput} value={input.payType} onChange={(event) => { const payType = event.target.value as CollaborationInput["payType"]; setInput((current) => ({ ...current, payType, details: { ...current.details, budgetMin: ["volunteer", "revenue_share"].includes(payType) ? null : current.details.budgetMin, budgetMax: ["volunteer", "revenue_share"].includes(payType) ? null : current.details.budgetMax } })); }}>{Object.entries(COLLABORATION_PAY).filter(([key]) => input.type === "team" || ["paid", "negotiable"].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></CollabField><CollabField label="보수 산정 단위"><select className={collabInput} value={input.details.budgetUnit} onChange={(event) => detail("budgetUnit", event.target.value as CollaborationDetails["budgetUnit"])}>{Object.entries(COLLABORATION_UNITS).map(([key, label]) => <option key={key} value={key}>{label}당</option>)}</select></CollabField></div>
      <div className="grid gap-5 sm:grid-cols-2"><CollabField label="최소 보수 (원)"><input className={collabInput} type="number" min={1} max={1000000000} step={1} disabled={noAmount} required={input.payType === "paid"} value={input.details.budgetMin ?? ""} onChange={(event) => detail("budgetMin", event.target.value === "" ? null : Number(event.target.value))} /></CollabField><CollabField label="최대 보수 (원, 선택)"><input className={collabInput} type="number" min={input.details.budgetMin || 1} max={1000000000} step={1} disabled={noAmount} value={input.details.budgetMax ?? ""} onChange={(event) => detail("budgetMax", event.target.value === "" ? null : Number(event.target.value))} /></CollabField></div>
      <CollabField label="보수·지급 조건" hint="지급일, 정산 방식, 테스트 비용 등을 적어 주세요. 수익 배분·무보수는 조건을 명확히 밝혀 주세요."><textarea className={collabInput} rows={3} required minLength={5} maxLength={1000} value={input.details.compensation} onChange={(event) => detail("compensation", event.target.value)} /></CollabField>
      <div className="grid gap-5 sm:grid-cols-2"><CollabField label="작업 방식"><select className={collabInput} value={input.workMode} onChange={(event) => setInput({ ...input, workMode: event.target.value as CollaborationInput["workMode"] })}>{Object.entries(COLLABORATION_MODES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></CollabField><CollabField label="모집 마감일" hint="한국 시간 해당 날짜 23:59까지 · 비워두면 상시 접수"><input type="date" className={collabInput} value={input.details.deadline} onChange={(event) => detail("deadline", event.target.value)} /></CollabField></div>
      <CollabField label="작업 지역" hint="대면·혼합 작업은 필수 · 상세 주소 대신 시·구 수준만 입력하세요."><input className={collabInput} maxLength={80} required={input.workMode !== "remote"} value={input.details.location} onChange={(event) => detail("location", event.target.value)} /></CollabField>
      <CollabField label="작업 분량·납품물·일정"><textarea className={collabInput} rows={4} minLength={5} maxLength={1000} required value={input.details.deliverables} onChange={(event) => detail("deliverables", event.target.value)} /></CollabField>
    </fieldset>
    <fieldset disabled={busy} className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-7"><legend className="px-2 text-lg font-bold text-fg">03 · 함께 지킬 약속</legend>
      <CollabField label="저작권·크레딧·수정 범위"><textarea className={collabInput} rows={4} minLength={5} maxLength={1000} required value={input.details.terms} onChange={(event) => detail("terms", event.target.value)} /></CollabField>
      <CollabField label="공개 포트폴리오 주소 (선택)" hint="갤러리 작품 또는 외부 포트폴리오의 http/https 주소"><input className={collabInput} type="url" maxLength={500} value={input.details.portfolioUrl} onChange={(event) => detail("portfolioUrl", event.target.value)} placeholder="https://" /></CollabField>
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-7 text-fg-2"><input className="mt-1.5 size-5 shrink-0" type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>공개할 내용과 보수·권리 조건을 확인했습니다. 최근 24시간 5개·보관 공고 100개 한도를 확인했으며, 개인정보·타인의 미공개 자료를 게시하지 않고, 실제 계약과 대금 지급은 당사자끼리 별도로 합의합니다.</span></label>
    </fieldset>
    {error && <CollabNotice error>{error}</CollabNotice>}
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-panel p-5"><p className="inline-flex max-w-xl items-center gap-2 text-xs leading-6 text-fg-3"><Save size={15} className="shrink-0" aria-hidden="true" />{id ? "수정한 내용은 저장 버튼을 눌러야 반영돼요." : draftStatus || "초안 임시저장 준비 중"}</p><button disabled={busy} type="submit" className={collabPrimary}><CheckCircle2 size={17} aria-hidden="true" />{busy ? "저장 중…" : id ? "수정 내용 저장" : "공고 공개 등록"}</button></div>
  </form>;
}
