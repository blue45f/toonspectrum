import { useEffect, useState } from "react";

import { CREATOR_HIRING_ROLES, HIRING_FORMATS, HIRING_TOOLS } from "../../../../../../packages/contracts/src/creator-hiring";
import { CollabField, CollabNotice, collabInput, collabPrimary } from "../collaboration-ui";

import { hiringMatchingClient } from "./hiring-matching-client";
import { dateInput, rateLabels, optionsOf  } from "./hiring-form-values";
import { ChoiceSet } from "./ResumeEditor";

import type { CreatorHiringRole, HiringAvailability, HiringAvailabilityInput } from "../../../../../../packages/contracts/src/creator-hiring";

import { getApiErrorMessage } from "@/platform/api";

const initial = (): HiringAvailabilityInput => ({ startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), roles: [], tools: [], formats: [], capacity: 1, minRate: 10000, rateUnit: "cut", discoverable: false, notificationOptIn: false, expectedRevision: 0 });
export function HiringAvailabilityPanel() {
  const [draft, setDraft] = useState<HiringAvailabilityInput | null>(null), [saved, setSaved] = useState<HiringAvailability | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  useEffect(() => { const c = new AbortController(); void hiringMatchingClient.availability(c.signal).then((v) => { if (!c.signal.aborted) { setSaved(v); setDraft(v ? { startsAt: v.startsAt, endsAt: v.endsAt, roles: v.roles, tools: v.tools, formats: v.formats, capacity: v.capacity, minRate: v.minRate, rateUnit: v.rateUnit, discoverable: v.discoverable, notificationOptIn: v.notificationOptIn, expectedRevision: v.revision } : initial()); } }).catch(async (e) => { const m = await getApiErrorMessage(e, "작업 가능 정보를 불러오지 못했어요."); if (!c.signal.aborted) setError(m); }); return () => c.abort(); }, []);
  const change = <K extends keyof HiringAvailabilityInput>(key: K, value: HiringAvailabilityInput[K]) => setDraft((d) => d ? { ...d, [key]: value } : d);
  async function save() {
    if (!draft || busy) return; setBusy(true); setError(""); setNote("");
    try {
      const input = { ...draft, startsAt: new Date().toISOString() };
      const result = await hiringMatchingClient.confirm(input);
      setDraft({ ...input, expectedRevision: result.revision }); setSaved({ ...input, ...result, userId: "", valid: true });
      setNote(`직접 확인한 작업 가능 정보는 ${new Date(result.expiresAt).toLocaleString("ko-KR")}에 만료됩니다.`);
    } catch (e) { setError(await getApiErrorMessage(e, "저장하지 못했어요. 다른 화면에서 수정했다면 새로 불러와 주세요.")); } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-2xl border border-line bg-panel p-5"><h2 className="text-xl font-bold">지금 작업 가능</h2><p className="text-sm leading-6 text-fg-3">직접 확인한 시점부터 최대 2시간 동안만 후보 검색에 표시됩니다. 접속 중이거나 화면을 열어 두어도 연장되지 않아요. 작업 가능 기간은 별도로 최대 31일까지 입력합니다.</p>
    {saved && <p className="text-sm">마지막 확인 {new Date(saved.confirmedAt).toLocaleString("ko-KR")} · 만료 {new Date(saved.expiresAt).toLocaleString("ko-KR")}</p>}{error && <CollabNotice error>{error}</CollabNotice>}{note && <CollabNotice>{note}</CollabNotice>}
    {!draft && !error && <p role="status">불러오는 중…</p>}{draft && <form onSubmit={(e) => { e.preventDefault(); void save(); }}><fieldset disabled={busy} className="space-y-4">
      <ChoiceSet label="가능 역할" options={CREATOR_HIRING_ROLES} value={draft.roles} max={6} onChange={(v) => change("roles", v as CreatorHiringRole[])} />
      <ChoiceSet label="사용 도구" options={optionsOf(HIRING_TOOLS)} value={draft.tools} onChange={(v) => change("tools", v)} /><ChoiceSet label="납품 형식" options={optionsOf(HIRING_FORMATS)} value={draft.formats} onChange={(v) => change("formats", v)} />
      <CollabField label="작업 가능한 마지막 일시 (현재 기기 시간대)"><input required className={collabInput} type="datetime-local" value={dateInput(draft.endsAt)} onChange={(e) => { if (e.target.value) change("endsAt", new Date(e.target.value).toISOString()); }} /></CollabField>
      <CollabField label="같은 시간에 맡을 수 있는 작업 수"><input required className={collabInput} type="number" min={1} max={24} value={draft.capacity} onChange={(e) => change("capacity", Number(e.target.value))} /></CollabField>
      <CollabField label="최소 희망 단가 (원, 무급·수익 분배 가능 시 0)"><input required className={collabInput} type="number" min={0} max={1000000000} value={draft.minRate} onChange={(e) => change("minRate", Number(e.target.value))} /></CollabField>
      <CollabField label="희망 단가 기준"><select className={collabInput} value={draft.rateUnit} onChange={(e) => change("rateUnit", e.target.value as HiringAvailabilityInput["rateUnit"])}>{Object.entries(rateLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></CollabField>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.discoverable} onChange={(e) => change("discoverable", e.target.checked)} />모집자에게 활동명·역할·도구·형식·시간·단가·여력을 검색 결과로 공개합니다. 이력서·연락처는 공개하지 않습니다.</label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.notificationOptIn} onChange={(e) => change("notificationOptIn", e.target.checked)} />이 조건에 맞는 사이트 내 초대와 제안을 받겠습니다.</label>
      <button className={collabPrimary} type="submit">지금 직접 확인하고 저장 (최대 2시간)</button>
    </fieldset></form>}
  </section>;
}
