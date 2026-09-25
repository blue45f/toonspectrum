import { useEffect, useRef, useState } from "react";
import type { OperationPolicyAdminView, OperationPolicyDraft, OperationPolicyPreview, OperatingMode } from "@toonspectrum/contracts/operation-policy";
import { api, getApiErrorMessage } from "@/infrastructure/api";
import { adminButtonClass } from "./admin-ui-utils";

const endpoint = "/admin/production/operation-policy";
const label = { free: "무료 운영", paid: "유료 운영" };
/** Compact launch controls for the existing console; full evidence management remains in apps/admin-web. */
export function AdminOperatingMode({ uid }: { readonly uid: string }) {
  return <OperatingModeControls key={uid} />;
}
function OperatingModeControls() {
  const [current, setCurrent] = useState<OperationPolicyAdminView | null>(null);
  const [draft, setDraft] = useState<OperationPolicyDraft | null>(null);
  const [impact, setImpact] = useState<OperationPolicyPreview | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const requestId = useRef("");
  useEffect(() => {
    let active = true;
    setCurrent(null); setDraft(null); setImpact(null); setBusy(true); setError("");
    void api.get<OperationPolicyAdminView>(endpoint).then((data) => {
      if (active) { setCurrent(data); setDraft(data.policy.draft); }
    }).catch(async (cause: unknown) => {
      const message = await getApiErrorMessage(cause, "운영 정책은 서비스 관리자만 확인할 수 있습니다.");
      if (active) setError(message);
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [reload]);
  async function prepare() {
    if (!draft || !current) return;
    setBusy(true); setError(""); setImpact(null);
    try {
      const result = await api.post<OperationPolicyPreview>(`${endpoint}/preview`, { expectedRevision: current.policy.revision, draft });
      requestId.current = crypto.randomUUID(); setImpact(result);
    } catch (cause) { setError(await getApiErrorMessage(cause, "미리보기에 실패했습니다.")); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!draft || !current || !impact) return;
    setBusy(true); setError("");
    try {
      await api.post(`${endpoint}/apply`, { expectedRevision: current.policy.revision, draft, previewDigest: impact.digest, reason, mutationId: requestId.current });
      setReload((value) => value + 1);
    } catch (cause) { setError(await getApiErrorMessage(cause, "저장에 실패했습니다. 최신 정책을 다시 확인해주세요.")); }
    finally { setBusy(false); }
  }
  const field = "min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-fg";
  return <section aria-labelledby="operating-mode-title" className="rounded-2xl border border-line bg-card p-5">
    <h2 id="operating-mode-title" className="text-base font-bold">제작 서비스 무료·유료 운영</h2>
    <p className="mt-2 text-sm text-fg-3">현재 수익화 노출 설정과 별도로 관리합니다. 운영 모드를 바꾸어도 기존 회원이 자동 유료 가입되거나 청구되지 않습니다.</p>
    {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
    {busy && <p role="status" className="mt-3">확인 중입니다.</p>}
    <button className="mt-3 text-sm underline" disabled={busy} onClick={() => setReload((value) => value + 1)}>최신 운영 정책 읽기</button>
    {current && draft && <fieldset className="mt-4 space-y-4" disabled={busy}>
      <legend>현재 {label[current.policy.draft.mode]} · 정책 {current.policy.revision} · 실제 결제 비활성</legend>
      <div className="flex gap-6">{(["free", "paid"] as const).map((mode: OperatingMode) => <label key={mode} className="flex min-h-11 items-center gap-2">
        <input name="production-mode" type="radio" checked={draft.mode === mode} onChange={() => { setDraft({ ...draft, mode }); setImpact(null); }} />{label[mode]}</label>)}</div>
      <p className="text-sm text-fg-3">유료 전환은 현재 배포물과 일치하는 라이선스 검토가 필요합니다. {current.runtimeFingerprint ? "배포물 식별값이 등록되어 있습니다." : "배포물 식별값 미등록으로 유료 전환이 차단됩니다."}</p>
      <div className="grid gap-3 sm:grid-cols-3">{([['ownedWorkspaces','소유 팀 한도',100],['projectsPerWorkspace','팀별 작품 한도',1000],['membersPerWorkspace','팀별 구성원·초대 한도',1000]] as const).map(([key,name,max]) =>
        <label key={key} className="space-y-2 text-sm">{label[draft.mode]} {name}<input type="number" min={1} max={max} className={field} value={draft.profiles[draft.mode].limits[key]} onChange={(event) => {
          setDraft({ ...draft, profiles: { ...draft.profiles, [draft.mode]: { ...draft.profiles[draft.mode], limits: { ...draft.profiles[draft.mode].limits, [key]: Number(event.target.value) } } } }); setImpact(null);
        }} /></label>)}</div>
      <label className="block text-sm">변경 사유<textarea rows={2} maxLength={500} className={`${field} mt-2`} value={reason} onChange={(event) => { setReason(event.target.value); setImpact(null); }} /></label>
      <button className={adminButtonClass()} onClick={() => { void prepare(); }}>운영 변경 미리보기</button>
      {impact && <div className="rounded-xl border border-line p-4"><ul className="space-y-1 text-sm">{impact.changes.map((item) => <li key={item}>{item}</li>)}</ul>
        {impact.blockedReasons.length > 0 && <p role="alert" className="mt-3 text-sm text-bad">{impact.blockedReasons.join(" ")}</p>}
        <button className={`${adminButtonClass()} mt-4`} disabled={impact.blockedReasons.length > 0 || reason.trim().length < 5} onClick={() => { void apply(); }}>확인한 운영 정책 적용</button></div>}
    </fieldset>}
  </section>;
}
