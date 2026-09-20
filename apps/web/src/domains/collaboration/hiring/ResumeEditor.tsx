import { useState } from "react";

import { CREATOR_HIRING_ROLES, HIRING_FORMATS, HIRING_TOOLS } from "../../../../../../packages/contracts/src/creator-hiring";
import { CollabField, collabButton, collabInput, collabPrimary } from "../collaboration-ui";

import { optionsOf } from "./hiring-form-values";

import { ResumePreview } from "./ResumePreview";

import type { CreatorHiringRole, HiringResumeContent, HiringResumeInput } from "../../../../../../packages/contracts/src/creator-hiring";

export function ChoiceSet({ label, options, value, onChange, max = 12 }: { label: string; options: Record<string, string>; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  return <fieldset className="space-y-2"><legend className="font-semibold">{label} (최대 {max}개)</legend><div className="flex flex-wrap gap-3">{Object.entries(options).map(([key, name]) => <label key={key} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm"><input type="checkbox" checked={value.includes(key)} disabled={!value.includes(key) && value.length >= max} onChange={() => onChange(value.includes(key) ? value.filter((x) => x !== key) : [...value, key])} />{name}</label>)}</div></fieldset>;
}
export function ResumeEditor({ initial, busy, onSave, onCancel }: { initial: HiringResumeInput; busy: boolean; onSave: (input: HiringResumeInput) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [preview, setPreview] = useState(false);
  const content = draft.content;
  function change<K extends keyof HiringResumeContent>(key: K, value: HiringResumeContent[K]) { setDraft((d) => ({ ...d, content: { ...d.content, [key]: value } })); }
  return <section className="space-y-5 rounded-2xl border border-line bg-panel p-5">
    <div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold">{initial.expectedRevision ? "이력서 수정" : "새 이력서"}</h2><button type="button" className={collabButton} onClick={() => setPreview(!preview)}>{preview ? "작성으로 돌아가기" : "미리보기"}</button>{preview && <button type="button" className={collabButton} onClick={() => globalThis.print()}>인쇄·PDF 저장</button>}</div>
    <p className="text-sm leading-6 text-fg-3">이력서는 비공개입니다. 저장할 때마다 별도 버전이 생기며, 이전에 제출한 내용은 바뀌지 않아요. 생년월일·성별·운세와 비공개 원고는 입력하지 마세요.</p>
    {preview ? <ResumePreview content={content} /> : <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}><fieldset disabled={busy} className="space-y-5">
      <CollabField label="이력서 이름"><input className={collabInput} required maxLength={100} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="선화·채색 지원용" /></CollabField>
      <CollabField label="활동명"><input className={collabInput} required maxLength={60} value={content.penName} onChange={(e) => change("penName", e.target.value)} /></CollabField>
      <CollabField label="작업 소개"><textarea className={collabInput} maxLength={1500} rows={5} value={content.summary} onChange={(e) => change("summary", e.target.value)} /></CollabField>
      <ChoiceSet label="지원 분야" options={CREATOR_HIRING_ROLES} value={content.roles} max={6} onChange={(v) => change("roles", v as CreatorHiringRole[])} />
      <ChoiceSet label="작업 도구" options={optionsOf(HIRING_TOOLS)} value={content.tools} onChange={(v) => change("tools", v)} />
      <ChoiceSet label="납품 형식" options={optionsOf(HIRING_FORMATS)} value={content.formats} onChange={(v) => change("formats", v)} />
      <CollabField label="사용 언어" hint="쉼표로 구분, 최대 8개 · 각 30자"><input className={collabInput} maxLength={247} value={content.languages.join(",")} onChange={(e) => change("languages", e.target.value ? e.target.value.split(",") : [])} placeholder="한국어,영어" /></CollabField>
      <h3 className="font-bold">작업 경험</h3>
      {content.experiences.map((item, i) => {
        const edit = (next: Partial<typeof item>) => change("experiences", content.experiences.map((v, j) => j === i ? { ...v, ...next } : v));
        return <fieldset key={i} className="space-y-3 rounded-xl border border-line p-4"><legend>경험 {i + 1}</legend>
          <CollabField label="작품·프로젝트 이름"><input className={collabInput} required maxLength={100} value={item.title} onChange={(e) => edit({ title: e.target.value })} /></CollabField>
          <CollabField label="담당 역할"><select className={collabInput} value={item.role} onChange={(e) => edit({ role: e.target.value as CreatorHiringRole })}>{Object.entries(CREATOR_HIRING_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></CollabField>
          <div className="grid gap-3 sm:grid-cols-2"><CollabField label="시작 월"><input className={collabInput} type="month" min="1900-01" max="2200-12" required value={item.startMonth} onChange={(e) => edit({ startMonth: e.target.value })} /></CollabField><CollabField label="종료 월 (진행 중이면 비우기)"><input className={collabInput} type="month" min={item.startMonth || "1900-01"} max="2200-12" value={item.endMonth ?? ""} onChange={(e) => edit({ endMonth: e.target.value || null })} /></CollabField></div>
          <div className="grid gap-3 sm:grid-cols-2">{(["episodeFrom", "episodeTo"] as const).map((key) => <CollabField key={key} label={key === "episodeFrom" ? "시작 회차 (선택)" : "종료 회차 (선택)"}><input className={collabInput} type="number" min={0} max={100000} value={item[key] ?? ""} onChange={(e) => edit({ [key]: e.target.value === "" ? null : Number(e.target.value) })} /></CollabField>)}</div>
          <CollabField label="직접 기여한 작업"><textarea className={collabInput} required maxLength={800} value={item.contribution} onChange={(e) => edit({ contribution: e.target.value })} /></CollabField>
          <button type="button" className={collabButton} onClick={() => change("experiences", content.experiences.filter((_, j) => i !== j))}>경험 {i + 1} 삭제</button>
        </fieldset>;
      })}
      <button type="button" className={collabButton} disabled={content.experiences.length >= 20} onClick={() => change("experiences", [...content.experiences, { title: "", role: "lineart", startMonth: "", endMonth: null, episodeFrom: null, episodeTo: null, contribution: "" }])}>작업 경험 추가</button>
      <h3 className="font-bold">공유 가능한 포트폴리오 링크</h3>
      {content.portfolio.map((item, i) => {
        const edit = (next: Partial<typeof item>) => change("portfolio", content.portfolio.map((v, j) => j === i ? { ...v, ...next } : v));
        return <fieldset key={i} className="space-y-3 rounded-xl border border-line p-4"><legend>포트폴리오 {i + 1}</legend>
          <CollabField label="자료 이름"><input className={collabInput} required maxLength={100} value={item.title} onChange={(e) => edit({ title: e.target.value })} /></CollabField>
          <CollabField label="공개 HTTPS 주소"><input className={collabInput} type="url" required maxLength={500} value={item.url} onChange={(e) => edit({ url: e.target.value })} placeholder="https://" /></CollabField>
          <CollabField label="내 기여 설명"><textarea className={collabInput} required maxLength={500} value={item.contribution} onChange={(e) => edit({ contribution: e.target.value })} /></CollabField>
          <CollabField label="공유 권리"><select className={collabInput} value={item.permission} onChange={(e) => edit({ permission: e.target.value as typeof item.permission })}><option value="owned">직접 소유한 자료</option><option value="authorized">권리자의 공유 허락을 받은 자료</option></select></CollabField>
          <button type="button" className={collabButton} onClick={() => change("portfolio", content.portfolio.filter((_, j) => i !== j))}>포트폴리오 {i + 1} 삭제</button>
        </fieldset>;
      })}
      <button type="button" className={collabButton} disabled={content.portfolio.length >= 12} onClick={() => change("portfolio", [...content.portfolio, { title: "", url: "", contribution: "", permission: "owned" }])}>포트폴리오 추가</button>
      <div className="flex gap-3"><button type="submit" className={collabPrimary}>{busy ? "저장 중…" : "새 버전으로 저장"}</button><button type="button" className={collabButton} onClick={onCancel}>닫기</button></div>
    </fieldset></form>}
  </section>;
}
