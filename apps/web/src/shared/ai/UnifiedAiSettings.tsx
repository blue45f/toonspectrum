import { useState } from "react";

import { deleteUserAiVault, hasPersistedUserAiVault, lockUserAi, migrateLegacyUserAi, persistUserAiVault, setUserAiConfiguration, unlockUserAiVault, useUserAi } from "./user-ai-store";
import { userAiJson } from "./user-ai-transport";
import { EMPTY_AI_CONNECTION, USER_AI_CAPABILITIES, type UserAiConfiguration, type UserAiConnection } from "./user-ai-types";

const INPUT = "min-h-11 w-full rounded-lg border border-line bg-panel p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent";
const BUTTON = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
const LABELS = { text: "텍스트·번역·운세·학습", image: "이미지·배경·캐릭터·채색", inference: "영상·3D 개인 추론 서버", "three-d": "Hyper3D/Rodin 3D 생성" };
export function UnifiedAiSettings() {
  const snapshot = useUserAi();
  return <section aria-label="통합 AI 설정" className="space-y-5 text-fg" data-unified-ai-settings="true">
    <header><h2 className="text-xl font-bold">통합 AI 설정</h2>
      <p className="mt-2 text-sm leading-6 text-fg-2">모든 AI 기능이 이 설정을 함께 사용합니다. 운영측 키·자동 유료 폴백·자동 재시도는 사용하지 않습니다.</p>
    </header>
    <p className="text-sm text-fg-2" role="status">{snapshot.notice}</p>
    <AiSettingsEditor key={snapshot.revision} configuration={snapshot.configuration} />
  </section>;
}
function AiSettingsEditor({ configuration }: { configuration: UserAiConfiguration }) {
  const [draft, setDraft] = useState<UserAiConnection>({ ...EMPTY_AI_CONNECTION });
  const [consent, setConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const patch = (value: Partial<UserAiConnection>) => setDraft(current => ({ ...current, ...value }));
  const run = async (action: () => unknown | Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "설정을 처리하지 못했습니다."); }
    finally { setBusy(false); setPassword(""); }
  };
  const saveConnection = () => {
    if (!consent) throw new Error("외부 전송과 본인 API 비용 부담 안내를 확인하세요.");
    const connection = { ...draft, id: draft.id || crypto.randomUUID() };
    const connections = [...configuration.connections.filter(item => item.id !== connection.id), connection];
    const assignments = { ...configuration.assignments };
    if (!assignments.text && connection.textModel) assignments.text = connection.id;
    if (!assignments.image && connection.imageModel) assignments.image = connection.id;
    setUserAiConfiguration({ version: 1, connections, assignments });
  };
  const removeConnection = (id: string) => {
    const assignments = { ...configuration.assignments };
    for (const capability of USER_AI_CAPABILITIES) if (assignments[capability] === id) assignments[capability] = null;
    setUserAiConfiguration({ ...configuration, connections: configuration.connections.filter(item => item.id !== id), assignments });
  };
  const field = (name: keyof UserAiConnection, label: string, type = "text") => <label className="block space-y-1" key={name}>
    <span className="text-sm text-fg-2">{label}</span>
    <input className={INPUT} type={type} autoComplete="off" spellCheck={false} value={draft[name]} maxLength={name === "apiKey" ? 4096 : 300}
      onChange={event => { patch({ [name]: event.target.value, ...(name === "baseUrl" ? { apiKey: "" } : {}) }); setConsent(false); }} />
  </label>;
  return <div className="space-y-5">
    <p className="text-sm leading-6 text-fg-2">텍스트·이미지는 브라우저에서 제공자로, 개인 추론 작업은 등록한 서버로 직접 전송됩니다. Hyper3D/Rodin 키는 작업 중 앱 API가 일시 전달하지만 저장·로그하지 않습니다. 모든 API·GPU 비용은 연결 소유자가 부담합니다.</p>
    {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    {message && <p role="status" className="text-sm text-good">{message}</p>}
    <div className="divide-y divide-line" aria-label="등록된 AI 연결">
      {configuration.connections.map(connection => <div key={connection.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div><strong>{connection.label}</strong><p className="break-all text-xs text-fg-2">{connection.baseUrl} · 키 등록됨</p></div>
        <div className="flex gap-2"><button type="button" className={BUTTON} onClick={() => { setDraft({ ...connection, apiKey: "" }); setConsent(false); }}>수정·키 교체</button>
          <button type="button" className={BUTTON} onClick={() => void run(() => removeConnection(connection.id))}>연결 해제</button></div>
      </div>)}
      {!configuration.connections.length && <p className="py-3 text-sm text-fg-2">등록된 연결이 없습니다. AI 없이 사용하는 편집·학습·검수 기능은 계속 사용할 수 있습니다.</p>}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {field("label", "연결 이름")}{field("baseUrl", "제공자 API baseURL", "url")}
      {field("apiKey", "사용자 API 키 (변경 시 다시 입력)", "password")}
      {field("textModel", "텍스트 모델 ID")}{field("imageModel", "이미지 모델 ID")}
    </div>
    <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">고급 API 경로</summary>
      <div className="grid gap-3">{field("chatCompletionsPath", "텍스트 요청 경로")}{field("imageGenerationPath", "이미지 생성 경로")}{field("imageEditPath", "이미지 편집 경로")}</div>
    </details>
    <label className="flex min-h-11 items-start gap-2 text-sm leading-6">
      <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1.5 size-4" />
      이 주소가 내가 신뢰하는 제공자임을 확인했으며, 자료 전송과 내 API 계정의 비용 부담에 동의합니다.
    </label>
    <button type="button" className={`${BUTTON} bg-accent text-on-accent`} disabled={busy || !consent} onClick={() => void run(saveConnection)}>연결을 메모리에 적용</button>
    <fieldset className="space-y-3 border-t border-line pt-4"><legend className="font-semibold">기능별 연결 선택</legend>
      {USER_AI_CAPABILITIES.map(capability => <label key={capability} className="block space-y-1"><span className="text-sm">{LABELS[capability]}</span>
        <select className={INPUT} value={configuration.assignments[capability] ?? ""} onChange={event => void run(() => setUserAiConfiguration({ ...configuration, assignments: { ...configuration.assignments, [capability]: event.target.value || null } }))}>
          <option value="">AI 사용 안 함</option>{configuration.connections.map(connection => <option key={connection.id} value={connection.id}>{connection.label}</option>)}
        </select></label>)}
    </fieldset>
    <p className="text-sm leading-6 text-fg-2">텍스트·이미지는 OpenAI 호환 API를 사용합니다. 영상·3D는 호환 프로토콜을 제공하는 개인 서버 연결이 필요합니다. CORS를 허용하지 않는 제공자는 본인이 운영하는 게이트웨이를 사용하세요.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={BUTTON} disabled={busy || !configuration.assignments.text} onClick={() => void run(async () => {
        await userAiJson("text", "/models", undefined, { maxBytes: 1024 * 1024 });
        setMessage("모델 목록 요청에 성공했습니다. 생성·편집 모델의 실제 작동을 검증한 것은 아닙니다.");
      })}>모델 목록 연결 확인</button>
      <button type="button" className={BUTTON} disabled={busy} onClick={() => void run(() => { if (!migrateLegacyUserAi()) setMessage("가져올 기존 Studio 키 설정이 없습니다."); })}>기존 Studio 설정 가져오기</button>
    </div>
    <fieldset className="space-y-3 border-t border-line pt-4"><legend className="font-semibold">선택 사항: 이 기기에 암호화 보관</legend>
      <p className="text-sm leading-6 text-fg-2">기본값은 메모리 전용입니다. 암호화 저장 시에도 비밀번호는 저장하지 않습니다. 브라우저 데이터 삭제 시 보관함이 사라지며 비밀번호 복구는 제공하지 않습니다. 잠금 해제 중 악성 확장 프로그램·사이트 스크립트에 의한 접근까지 막는 것은 아닙니다.</p>
      <label className="block space-y-1"><span className="text-sm">보관함 비밀번호 (12자 이상)</span>
        <input type="password" autoComplete="off" className={INPUT} value={password} minLength={12} maxLength={1024} onChange={event => setPassword(event.target.value)} /></label>
      {hasPersistedUserAiVault() && <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={confirmDelete} onChange={event => setConfirmDelete(event.target.checked)} />기존 암호화 보관함의 덮어쓰기 또는 삭제를 확인합니다.</label>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} disabled={busy || !configuration.connections.length || password.length < 12 || (hasPersistedUserAiVault() && !confirmDelete)} onClick={() => void run(() => persistUserAiVault(password))}>암호화 저장</button>
        <button type="button" className={BUTTON} disabled={busy || password.length < 12 || !hasPersistedUserAiVault()} onClick={() => void run(() => unlockUserAiVault(password))}>잠금 해제</button>
        <button type="button" className={BUTTON} onClick={() => lockUserAi()}>모든 연결 잠금</button>
        <button type="button" className={`${BUTTON} text-bad`} disabled={busy || !confirmDelete} onClick={() => void run(deleteUserAiVault)}>보관함 삭제</button>
      </div>
    </fieldset>
  </div>;
}
