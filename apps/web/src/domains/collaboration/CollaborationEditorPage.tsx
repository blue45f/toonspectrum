import { ArrowLeft, CheckCircle2, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  COLLABORATION_MODES, COLLABORATION_PAY, COLLABORATION_ROLES, COLLABORATION_TYPES,
  COLLABORATION_UNITS, validateCollaborationInput,
} from "../../../../../packages/core/src/collaboration";

import { collaborationDraftKey, collaborationTemplate, emptyCollaborationDraft, readCollaborationDraft, saveCollaborationDraft } from "./collaboration-draft";
import { CollaborationConflictPanel, isCollaborationConflictError } from "./collaboration-conflict";
import { CollabField, CollabLogin, CollabNotice, collabButton, collabInput, collabPrimary } from "./collaboration-ui";

import type { CollaborationDetails, CollaborationInput } from "../../../../../packages/core/src/collaboration";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { getApiErrorMessage } from "@/platform/api";
import { isNotFoundError } from "@/platform/api-error";
import { collaborationClient } from "@/platform/collaboration-client";
import { Container } from "@/shared/components/section";
import { NotFoundPage } from "@/shared/components/feedback/NotFoundPage";
import { useApp } from "@/shared/lib/store";

const SCOPE = "domains.collaboration.CollaborationEditorPage";

const EN_LABELS: Record<string, string> = {
  "팀원 모집": "Hire teammates",
  "작업 의뢰": "Commission work",
  "작업자 홍보": "Promote yourself",
  "스토리·콘티": "Story · storyboards",
  "러프·스케치": "Roughs · sketches",
  "선화": "Line art",
  "밑색": "Flats",
  "채색·명암": "Coloring · shading",
  "배경": "Backgrounds",
  "3D 모델·소재": "3D models · assets",
  "식자·편집": "Lettering · editing",
  "모션·영상": "Motion · video",
  "기타·복합 작업": "Other · mixed",
  "유료": "Paid",
  "금액 협의": "Negotiable",
  "수익 배분": "Revenue share",
  "자율 무보수 협업": "Unpaid volunteer collab",
  "원격": "Remote",
  "대면": "On-site",
  "혼합": "Hybrid",
  "회차": "episode",
  "컷": "cut",
  "프로젝트": "project",
  "시간": "hour",
  "월": "month",
};

export function CollaborationEditorPage() {
  const bt = useBilingual(SCOPE);
  const { id } = useParams();
  const userId = useApp((state) => state.userId);
  useDocumentTitle(bt(id ? "구인·의뢰 공고 수정" : "구인·의뢰 공고 등록", id ? "Edit gig post" : "Post a gig"));
  return <Container size="wide" className="max-w-4xl py-8 sm:py-12"><Link href={id ? `/collaborate/${id}` : "/collaborate"} className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-3"><ArrowLeft size={16} aria-hidden="true" />{bt("공고로 돌아가기", "Back to the post")}</Link><h1 className="mt-4 text-3xl font-bold text-fg">{id ? bt("공고 수정", "Edit post") : bt("함께할 사람에게, 정확한 제안을.", "A clear proposal for your future teammate.")}</h1><p className="mt-3 text-sm leading-7 text-fg-3">{bt("작업 범위와 보수, 서로 지킬 약속을 미리 적으면 더 잘 맞는 동료를 만날 수 있어요.", "Write the scope, pay, and shared rules up front and you'll find a better fit.")}</p><div className="mt-7">{userId ? <EditorLoader key={`${id || "new"}:${userId}`} id={id} userId={userId} /> : <CollabLogin />}</div></Container>;
}
function EditorLoader({ id, userId }: { id?: string; userId: string }) {
  const bt = useBilingual(SCOPE);
  const [initial, setInitial] = useState<{ input: CollaborationInput; version: number } | null>(id ? null : { input: emptyCollaborationDraft(), version: 1 });
  const [error, setError] = useState(""); const [refresh, setRefresh] = useState(0);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void collaborationClient.detail(id, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      if (!data.canManage) { setError(bt("공고 작성자만 수정할 수 있어요.", "Only the post author can edit it.")); return; }
      setInitial({ input: data.post, version: data.post.version }); setError(""); setNotFound(false);
    }).catch(async (reason) => {
      if (controller.signal.aborted) return;
      // 존재하지 않는 공고 id는 404 전용 화면으로 분리한다(일시 오류·권한 오류와 구분).
      if (isNotFoundError(reason)) {
        setNotFound(true);
        return;
      }
      setError(await getApiErrorMessage(reason, bt("공고를 불러오지 못했어요.", "Couldn't load the post.")));
    });
    return () => controller.abort();
  }, [id, refresh, bt]);
  if (notFound) return <NotFoundPage />;
  if (error) return <CollabNotice error>{error}<button type="button" className={`${collabButton} ml-3`} onClick={() => setRefresh((value) => value + 1)}>{bt("다시 불러오기", "Reload")}</button></CollabNotice>;
  if (!initial) return <div role="status" aria-label={bt("공고 작성 폼을 불러오는 중", "Loading the post form")} className="space-y-5" aria-hidden="true"><div className="skeleton h-24 rounded-2xl" /><div className="skeleton h-72 rounded-2xl" /><div className="skeleton h-64 rounded-2xl" /></div>;
  return <CollaborationEditorForm key={`${initial.version}:${refresh}`} id={id} userId={userId} initial={initial.input} version={initial.version} onReloadLatest={() => setRefresh((value) => value + 1)} />;
}
function CollaborationEditorForm({ id, userId, initial, version, onReloadLatest }: { id?: string; userId: string; initial: CollaborationInput; version: number; onReloadLatest: () => void }) {
  const bt = useBilingual(SCOPE);
  const navigate = useNavigate();
  const [input, setInput] = useState(() => { if (id) return initial; try { return readCollaborationDraft(localStorage, userId) ?? initial; } catch { return initial; } });
  const [error, setError] = useState(""); const [draftStatus, setDraftStatus] = useState("");
  const [busy, setBusy] = useState(false); const [confirmed, setConfirmed] = useState(false);
  const [conflict, setConflict] = useState(false); const [conflictBusy, setConflictBusy] = useState(false);
  const submitting = useRef(false);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const optLabel = (ko: string) => bt(ko, EN_LABELS[ko] ?? ko);
  useEffect(() => {
    if (error) errorRef.current?.focus({ preventScroll: true });
  }, [error]);
  useEffect(() => {
    if (id) return;
    const timer = globalThis.setTimeout(() => {
      try { setDraftStatus(saveCollaborationDraft(localStorage, userId, input) ? bt("이 기기에 초안 저장됨 · 아직 공개되지 않았어요", "Draft saved on this device · not published yet") : bt("기기 저장 공간에 접근할 수 없어요. 화면을 닫으면 초안이 사라질 수 있어요.", "Can't access device storage. Your draft may be lost if you close this screen.")); }
      catch { setDraftStatus(bt("이 기기에서는 임시저장을 사용할 수 없어요.", "Autosave isn't available on this device.")); }
    }, 400);
    return () => globalThis.clearTimeout(timer);
  }, [id, input, userId, bt]);
  function detail<K extends keyof CollaborationDetails>(key: K, value: CollaborationDetails[K]) { setInput((current) => ({ ...current, details: { ...current.details, [key]: value } })); }
  function template(kind: "ink" | "background" | "team") {
    if ((input.title || input.details.description) && !globalThis.confirm(bt("현재 작성 중인 내용을 선택한 작성 예시로 바꿀까요?", "Replace what you've written with the selected example?"))) return;
    setInput(collaborationTemplate(kind)); setConfirmed(false); setError("");
  }
  async function submit() {
    if (submitting.current) return;
    const candidate = { ...input, details: { ...input.details, tools: input.details.tools.map((tool) => tool.trim()).filter(Boolean) } };
    const parsed = validateCollaborationInput(candidate);
    if (!parsed.value) { setError(parsed.error); setConflict(false); return; }
    if (!confirmed) { setError(bt("공개할 내용과 협업 조건을 확인해 주세요.", "Please confirm the content and collaboration terms.")); setConflict(false); return; }
    submitting.current = true; setBusy(true); setError(""); setConflict(false);
    try {
      let postId = id;
      if (id) await collaborationClient.update(id, parsed.value, version);
      else { const created = await collaborationClient.create(parsed.value); if (!created?.id) throw new Error(bt("등록 결과를 확인하지 못했어요. 내 공고를 먼저 확인해 주세요.", "Couldn't confirm the result. Please check your posts first.")); postId = created.id; }
      if (!id) { try { localStorage.removeItem(collaborationDraftKey(userId)); } catch { /* A successful publication must not be reported as failed because storage is blocked. */ } }
      navigate(`/collaborate/${postId}`);
    } catch (reason) {
      if (isCollaborationConflictError(reason)) { setConflict(true); setError(""); }
      else setError(await getApiErrorMessage(reason, bt("공고를 저장하지 못했어요. 입력 내용은 유지됩니다.", "Couldn't save the post. Your input is kept.")));
    }
    finally { submitting.current = false; setBusy(false); }
  }
  const noAmount = input.payType === "volunteer" || input.payType === "revenue_share";
  return <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-7">
    {!id && <section className="rounded-2xl border border-line bg-panel p-5"><h2 className="text-sm font-bold text-fg">{bt("빈칸이 막막하다면 작성 예시로 시작하세요", "Staring at a blank form? Start from an example")}</h2><p className="mt-2 text-xs leading-6 text-fg-3">{bt("예시 문구를 실제 작업 조건으로 바꿔 주세요. 버튼을 눌러도 공개 등록되지 않습니다.", "Adapt the example to your real terms. Pressing a button doesn't publish anything.")}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={collabButton} onClick={() => template("ink")}>{bt("선화 보조 의뢰", "Line-art help example")}</button><button type="button" className={collabButton} onClick={() => template("background")}>{bt("배경 작업 의뢰", "Background example")}</button><button type="button" className={collabButton} onClick={() => template("team")}>{bt("팀원 모집", "Team hiring example")}</button></div></section>}
    <fieldset disabled={busy} className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-7"><legend className="px-2 text-lg font-bold text-fg">{bt("01 · 어떤 동료를 찾나요?", "01 · Who are you looking for?")}</legend>
      <div className="grid gap-5 sm:grid-cols-2"><CollabField label={bt("공고 유형", "Post type")}><select className={collabInput} value={input.type} onChange={(event) => setInput((current) => ({ ...current, type: event.target.value as CollaborationInput["type"], payType: event.target.value !== "team" && ["volunteer", "revenue_share"].includes(current.payType) ? "negotiable" : current.payType }))}>{Object.entries(COLLABORATION_TYPES).map(([key, label]) => <option key={key} value={key}>{optLabel(label)}</option>)}</select></CollabField><CollabField label={bt("작업 분야", "Role")}><select className={collabInput} value={input.role} onChange={(event) => setInput({ ...input, role: event.target.value as CollaborationInput["role"] })}>{Object.entries(COLLABORATION_ROLES).map(([key, label]) => <option key={key} value={key}>{optLabel(label)}</option>)}</select></CollabField></div>
      <CollabField label={bt("공고 제목", "Post title")} hint={bt("분야·작업량·일정을 알 수 있는 제목이 좋아요.", "Mention the role, workload, and schedule.")}><input className={collabInput} value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} required minLength={5} maxLength={100} placeholder={bt("주 1회 연재 웹툰의 채색 보조 작업자를 찾습니다", "Looking for a colorist for a weekly webtoon")} /></CollabField>
      <CollabField label={bt("작품과 작업 소개", "Project and work description")} hint={bt("30~6000자 · 연락처와 미공개 원고는 공개 본문에 넣지 마세요.", "30–6000 chars · keep contacts and unpublished manuscripts out of the public body.")}><textarea className={collabInput} rows={7} required minLength={30} maxLength={6000} value={input.details.description} onChange={(event) => detail("description", event.target.value)} /></CollabField>
      <div className="grid gap-5 sm:grid-cols-2"><CollabField label={bt("장르·분위기", "Genre · mood")}><input className={collabInput} maxLength={80} value={input.details.genre} onChange={(event) => detail("genre", event.target.value)} placeholder={bt("로맨스 판타지, 학원 액션 등", "Romance fantasy, school action, …")} /></CollabField><CollabField label={bt("사용 도구", "Tools")} hint={bt("쉼표로 구분 · 최대 8개", "Comma-separated · up to 8")}><input className={collabInput} maxLength={250} value={input.details.tools.join(",")} onChange={(event) => detail("tools", event.target.value.split(","))} placeholder="ToonStudio, Clip Studio, Blender" /></CollabField></div>
    </fieldset>
    <fieldset disabled={busy} className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-7"><legend className="px-2 text-lg font-bold text-fg">{bt("02 · 보수와 일정은 명확하게", "02 · State pay and schedule clearly")}</legend>
      <div className="grid gap-5 sm:grid-cols-2"><CollabField label={bt("보수 방식", "Pay model")}><select className={collabInput} value={input.payType} onChange={(event) => { const payType = event.target.value as CollaborationInput["payType"]; setInput((current) => ({ ...current, payType, details: { ...current.details, budgetMin: ["volunteer", "revenue_share"].includes(payType) ? null : current.details.budgetMin, budgetMax: ["volunteer", "revenue_share"].includes(payType) ? null : current.details.budgetMax } })); }}>{Object.entries(COLLABORATION_PAY).filter(([key]) => input.type === "team" || ["paid", "negotiable"].includes(key)).map(([key, label]) => <option key={key} value={key}>{optLabel(label)}</option>)}</select></CollabField><CollabField label={bt("보수 산정 단위", "Rate unit")}><select className={collabInput} value={input.details.budgetUnit} onChange={(event) => detail("budgetUnit", event.target.value as CollaborationDetails["budgetUnit"])}>{Object.entries(COLLABORATION_UNITS).map(([key, label]) => <option key={key} value={key}>{bt(`${optLabel(label)}당`, `per ${optLabel(label)}`)}</option>)}</select></CollabField></div>
      <div className="grid gap-5 sm:grid-cols-2"><CollabField label={bt("최소 보수 (원)", "Minimum pay (KRW)")}><input className={collabInput} type="number" min={1} max={1000000000} step={1} disabled={noAmount} required={input.payType === "paid"} value={input.details.budgetMin ?? ""} onChange={(event) => detail("budgetMin", event.target.value === "" ? null : Number(event.target.value))} /></CollabField><CollabField label={bt("최대 보수 (원, 선택)", "Maximum pay (KRW, optional)")}><input className={collabInput} type="number" min={input.details.budgetMin || 1} max={1000000000} step={1} disabled={noAmount} value={input.details.budgetMax ?? ""} onChange={(event) => detail("budgetMax", event.target.value === "" ? null : Number(event.target.value))} /></CollabField></div>
      <CollabField label={bt("보수·지급 조건", "Pay · payment terms")} hint={bt("지급일, 정산 방식, 테스트 비용 등을 적어 주세요. 수익 배분·무보수는 조건을 명확히 밝혀 주세요.", "Payment date, settlement method, test fees, etc. State terms clearly for revenue share or unpaid work.")}><textarea className={collabInput} rows={3} required minLength={5} maxLength={1000} value={input.details.compensation} onChange={(event) => detail("compensation", event.target.value)} /></CollabField>
      <div className="grid gap-5 sm:grid-cols-2"><CollabField label={bt("작업 방식", "Work mode")}><select className={collabInput} value={input.workMode} onChange={(event) => setInput({ ...input, workMode: event.target.value as CollaborationInput["workMode"] })}>{Object.entries(COLLABORATION_MODES).map(([key, label]) => <option key={key} value={key}>{optLabel(label)}</option>)}</select></CollabField><CollabField label={bt("모집 마감일", "Application deadline")} hint={bt("한국 시간 해당 날짜 23:59까지 · 비워두면 상시 접수", "Until 23:59 KST on that day · leave empty for always open")}><input type="date" className={collabInput} value={input.details.deadline} onChange={(event) => detail("deadline", event.target.value)} /></CollabField></div>
      <CollabField label={bt("작업 지역", "Work location")} hint={bt("대면·혼합 작업은 필수 · 상세 주소 대신 시·구 수준만 입력하세요.", "Required for on-site/hybrid · city/district level, not street address.")}><input className={collabInput} maxLength={80} required={input.workMode !== "remote"} value={input.details.location} onChange={(event) => detail("location", event.target.value)} /></CollabField>
      <CollabField label={bt("작업 분량·납품물·일정", "Scope · deliverables · schedule")}><textarea className={collabInput} rows={4} minLength={5} maxLength={1000} required value={input.details.deliverables} onChange={(event) => detail("deliverables", event.target.value)} /></CollabField>
    </fieldset>
    <fieldset disabled={busy} className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-7"><legend className="px-2 text-lg font-bold text-fg">{bt("03 · 함께 지킬 약속", "03 · Promises to keep together")}</legend>
      <CollabField label={bt("저작권·크레딧·수정 범위", "Rights · credits · revision scope")}><textarea className={collabInput} rows={4} minLength={5} maxLength={1000} required value={input.details.terms} onChange={(event) => detail("terms", event.target.value)} /></CollabField>
      <CollabField label={bt("공개 포트폴리오 주소 (선택)", "Public portfolio URL (optional)")} hint={bt("갤러리 작품 또는 외부 포트폴리오의 http/https 주소", "http/https address of your gallery work or external portfolio")}><input className={collabInput} type="url" maxLength={500} value={input.details.portfolioUrl} onChange={(event) => detail("portfolioUrl", event.target.value)} placeholder="https://" /></CollabField>
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-7 text-fg-2"><input className="mt-1.5 size-5 shrink-0" type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{bt("공개할 내용과 보수·권리 조건을 확인했습니다. 개인정보·타인의 미공개 자료를 게시하지 않으며, 실제 계약과 대금 지급은 당사자끼리 별도로 합의합니다.", "I've reviewed the content and pay/rights terms. I won't post personal data or others' unpublished materials; the actual contract and payment are agreed separately between the parties.")}</span></label>
    </fieldset>
    {error && <div ref={errorRef} tabIndex={-1} className="outline-none"><CollabNotice error>{error}</CollabNotice></div>}
    {conflict && <CollaborationConflictPanel inputWarning busy={conflictBusy} onReload={() => { setConflictBusy(true); onReloadLatest(); }} onKeepEditing={() => setConflict(false)} />}
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-panel p-5"><p role="status" className="inline-flex max-w-xl items-center gap-2 text-xs leading-6 text-fg-3"><Save size={15} className="shrink-0" aria-hidden="true" />{id ? bt("수정한 내용은 저장 버튼을 눌러야 반영돼요.", "You must press save for edits to apply.") : draftStatus || bt("초안 임시저장 준비 중", "Preparing draft autosave")}</p><button disabled={busy} type="submit" className={collabPrimary}><CheckCircle2 size={17} aria-hidden="true" />{busy ? bt("저장 중…", "Saving…") : id ? bt("수정 내용 저장", "Save changes") : bt("공고 공개 등록", "Publish post")}</button></div>
  </form>;
}
