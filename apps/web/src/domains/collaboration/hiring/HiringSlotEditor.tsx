import { useState } from "react";

import { CREATOR_HIRING_MODELS, CREATOR_HIRING_ROLES, HIRING_FORMATS, HIRING_TOOLS } from "../../../../../../packages/contracts/src/creator-hiring";
import { CollabField, collabButton, collabInput, collabPrimary } from "../collaboration-ui";

import { ChoiceSet } from "./ResumeEditor";
import { compensationLabels, dateInput, optionsOf, policyLabels, rateLabels } from "./hiring-form-values";

import type { HiringSlotTerms } from "../../../../../../packages/contracts/src/creator-hiring";

export function HiringSlotEditor({ initial, busy, onSave, onCancel }: { initial: HiringSlotTerms; busy: boolean; onSave: (terms: HiringSlotTerms) => void; onCancel: () => void }) {
  const [terms, setTerms] = useState(initial);
  const change = <K extends keyof HiringSlotTerms>(key: K, value: HiringSlotTerms[K]) => setTerms((v) => ({ ...v, [key]: value }));
  function select<K extends keyof HiringSlotTerms>(label: string, key: K, options: Record<string, string>) { return <CollabField label={label}><select className={collabInput} value={String(terms[key])} onChange={(e) => change(key, e.target.value as HiringSlotTerms[K])}>{Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></CollabField>; }
  return <form onSubmit={(e) => { e.preventDefault(); if (terms.compensation === "revenue-share" || (["employment", "freelance-task"].includes(terms.model) && terms.compensation !== "paid")) return; onSave(terms); }} className="space-y-4 rounded-xl border border-line p-5"><fieldset disabled={busy} className="space-y-4"><legend className="mb-3 text-lg font-bold">1명 모집 조건</legend>
    <p className="text-sm leading-6 text-fg-3">아래 조건은 공고 방문자에게 공개됩니다. 미공개 작품명·원고·내부 일정·연락처는 넣지 마세요. 한 자리는 한 명만 예약할 수 있습니다.</p>
    {select("협업 형태", "model", CREATOR_HIRING_MODELS)}{select("담당 역할", "role", CREATOR_HIRING_ROLES)}
    <CollabField label="공개 작업 범위"><textarea required maxLength={1200} className={collabInput} value={terms.publicScope} onChange={(e) => change("publicScope", e.target.value)} /></CollabField>
    <div className="grid gap-4 sm:grid-cols-2"><CollabField label="작업 수량"><input type="number" required min={1} max={100000} className={collabInput} value={terms.quantity} onChange={(e) => change("quantity", Number(e.target.value))} /></CollabField>{select("수량 단위", "quantityUnit", { cut: "컷", episode: "회차", page: "페이지", task: "작업" })}</div>
    <p className="text-xs text-fg-3">날짜 입력은 현재 기기의 시간대입니다. 저장 시 절대 시각으로 변환됩니다.</p>
    <div className="grid gap-4 sm:grid-cols-2">{(["startsAt", "dueAt"] as const).map((key) => <CollabField key={key} label={key === "startsAt" ? "시작 일시" : "마감 일시"}><input type="datetime-local" required className={collabInput} value={dateInput(terms[key])} onChange={(e) => { if (e.target.value && Number.isFinite(Date.parse(e.target.value))) change(key, new Date(e.target.value).toISOString()); }} /></CollabField>)}</div>
    <CollabField label="합의에 사용할 시간대"><input required maxLength={80} className={collabInput} value={terms.timeZone} onChange={(e) => change("timeZone", e.target.value)} placeholder="Asia/Seoul" /></CollabField>
    <CollabField label="보수 방식"><select className={collabInput} value={terms.compensation} onChange={(e) => { const compensation = e.target.value as HiringSlotTerms["compensation"]; setTerms({ ...terms, compensation, minRate: compensation === "paid" ? 10000 : 0, maxRate: compensation === "paid" ? 10000 : 0 }); }}>{Object.entries(compensationLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></CollabField>
    {["employment", "freelance-task"].includes(terms.model) && <p className="text-sm">고용과 작업 의뢰는 유급 조건만 저장할 수 있습니다.</p>}
    {terms.compensation === "paid" && <div className="grid gap-4 sm:grid-cols-2">{(["minRate", "maxRate"] as const).map((key) => <CollabField key={key} label={key === "minRate" ? "최소 단가 (원)" : "최대 단가 (원)"}><input type="number" required min={1} max={1000000000} className={collabInput} value={terms[key]} onChange={(e) => change(key, Number(e.target.value))} /></CollabField>)}</div>}
    {select("단가 기준", "rateUnit", rateLabels)}
    {terms.compensation === "revenue-share" && <p className="text-sm">수익 분배 조건의 배분율·정산 기준을 검증하는 기능은 아직 지원하지 않아 저장·확정할 수 없습니다.</p>}
    <ChoiceSet label="필요한 도구" options={optionsOf(HIRING_TOOLS)} value={terms.tools} onChange={(v) => change("tools", v)} />
    <ChoiceSet label="납품 형식" options={optionsOf(HIRING_FORMATS)} value={terms.formats} onChange={(v) => change("formats", v)} />
    <CollabField label="포함된 수정 횟수"><input type="number" required min={0} max={30} className={collabInput} value={terms.revisionRounds} onChange={(e) => change("revisionRounds", Number(e.target.value))} /></CollabField>
    <CollabField label="완료·검수·정산 기준"><textarea required maxLength={1500} rows={4} className={collabInput} value={terms.acceptanceCriteria} onChange={(e) => change("acceptanceCriteria", e.target.value)} /></CollabField>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={terms.ndaRequired} onChange={(e) => change("ndaRequired", e.target.checked)} />별도 비밀유지 합의가 필요합니다</label>
    <CollabField label="크레딧 표기 조건"><textarea required maxLength={500} className={collabInput} value={terms.creditPolicy} onChange={(e) => change("creditPolicy", e.target.value)} /></CollabField>
    {select("포트폴리오 공개 조건", "portfolioPolicy", policyLabels)}{select("AI 사용 조건", "aiPolicy", policyLabels)}
    <div className="flex gap-3"><button type="submit" disabled={terms.compensation === "revenue-share" || (["employment", "freelance-task"].includes(terms.model) && terms.compensation !== "paid")} className={collabPrimary}>모집 조건 저장</button><button type="button" className={collabButton} onClick={onCancel}>취소</button></div>
  </fieldset></form>;
}
export function HiringTermsView({ terms }: { terms: HiringSlotTerms }) {
  return <dl className="grid gap-2 text-sm leading-6"><dt className="font-semibold">{CREATOR_HIRING_MODELS[terms.model]} · {CREATOR_HIRING_ROLES[terms.role]}</dt><dd className="whitespace-pre-wrap">{terms.publicScope}</dd><dt className="font-semibold">분량·보수</dt><dd>{terms.quantity} {({ cut: "컷", episode: "회차", page: "페이지", task: "작업" })[terms.quantityUnit]} · {compensationLabels[terms.compensation]}{terms.compensation === "paid" ? ` · ${terms.minRate.toLocaleString()}~${terms.maxRate.toLocaleString()}원/${rateLabels[terms.rateUnit]}` : ""}</dd><dt className="font-semibold">일정 ({terms.timeZone})</dt><dd>{new Date(terms.startsAt).toLocaleString("ko-KR", { timeZone: terms.timeZone })} ~ {new Date(terms.dueAt).toLocaleString("ko-KR", { timeZone: terms.timeZone })}</dd><dt className="font-semibold">도구·납품 형식</dt><dd>{terms.tools.join(", ") || "지정 없음"} / {terms.formats.join(", ") || "협의"} · 수정 {terms.revisionRounds}회</dd><dt className="font-semibold">완료·검수·정산 기준</dt><dd className="whitespace-pre-wrap">{terms.acceptanceCriteria}</dd><dt className="font-semibold">권리·작업 정책</dt><dd>비밀유지 합의 {terms.ndaRequired ? "필요" : "필수 아님"} · 포트폴리오 {policyLabels[terms.portfolioPolicy]} · AI {policyLabels[terms.aiPolicy]}</dd><dt className="font-semibold">크레딧</dt><dd className="whitespace-pre-wrap">{terms.creditPolicy}</dd></dl>;
}
