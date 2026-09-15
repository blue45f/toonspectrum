import { useEffect, useState } from "react";

import { getFreeAiRuntimeBudgetSnapshot } from "./free-ai-runtime-budget";
import { getFreeAiPoolStatus, type FreeAiPoolStatus } from "./free-ai-pool-status";
import {
  assertFreeAiConnection,
  connectionFromFreeAiPreset,
  FREE_AI_PRESETS,
  freeAiConnectionPolicyIssue,
  USER_AI_COST_POLICIES,
  USER_AI_COST_POLICY_LABELS,
  type FreeAiPreset,
  type UserAiCostPolicy,
} from "./free-ai-policy";
import {
  deleteUserAiVault,
  hasPersistedUserAiVault,
  lockUserAi,
  migrateLegacyUserAi,
  persistUserAiVault,
  setUserAiConfiguration,
  unlockUserAiVault,
  useUserAi,
} from "./user-ai-store";
import {
  clearUnifiedAiSecrets,
  DEFAULT_UNIFIED_AI_AUX_SETTINGS,
  saveUnifiedAiAuxSettings,
  testCreatorRuntime,
  useUnifiedAiAuxSettings,
} from "./unified-ai-settings";
import { userAiJson } from "./user-ai-transport";
import {
  EMPTY_AI_CONNECTION,
  USER_AI_CAPABILITIES,
  type UserAiCapability,
  type UserAiConfiguration,
  type UserAiConnection,
} from "./user-ai-types";

const INPUT = "min-h-11 w-full rounded-lg border border-line bg-panel p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent";
const BUTTON = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
const LABELS: Record<UserAiCapability, string> = {
  text: "텍스트·번역·운세·학습",
  image: "이미지·배경·캐릭터·채색",
  inference: "영상·3D 개인 추론 서버",
  "three-d": "3D 생성",
};

type PoolState =
  | { mode: "loading" }
  | { mode: "ready"; status: FreeAiPoolStatus }
  | { mode: "error" };

export function UnifiedAiSettings() {
  const snapshot = useUserAi();
  const [pool, setPool] = useState<PoolState>({ mode: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void getFreeAiPoolStatus(controller.signal)
      .then((status) => setPool({ mode: "ready", status }))
      .catch(() => {
        if (!controller.signal.aborted) setPool({ mode: "error" });
      });
    return () => controller.abort();
  }, []);

  const configuredPool = pool.mode === "ready" && pool.status.configured;
  const providerOrder = pool.mode === "ready"
    ? pool.status.selection.order
        .map((id) => {
          const provider = pool.status.providers.find((item) => item.id === id);
          return provider
            ? `${provider.label}${provider.configured ? "" : " (비활성)"}`
            : id;
        })
        .join(" → ") || "준비된 공용 무료 제공자 없음"
    : "Gemini 무료 → Groq 무료 → SambaNova 무료 → Cloudflare Workers AI 무료 → Mistral 무료 모드 → OpenRouter 무료";

  return (
    <section
      aria-label="통합 AI 설정"
      className="space-y-5 text-fg"
      data-unified-ai-settings="true"
    >
      <header>
        <h2 className="text-xl font-bold">통합 AI 설정</h2>
        <p className="mt-2 text-sm leading-6 text-fg-2">
          토큰 키를 입력하지 않아도 자동 무료 AI를 먼저 사용합니다. 무료 제공자가 한도 또는 요청 제한으로 추론 전에 거절한 경우에만 다음 무료 제공자와 등록한 개인 무료 키 순서로 이동합니다.
        </p>
      </header>

      <section
        className={`rounded-xl border p-4 ${configuredPool ? "border-good/40 bg-good/10" : "border-line bg-panel"}`}
        aria-labelledby="automatic-free-ai-title"
        data-automatic-free-ai="true"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="automatic-free-ai-title" className="font-bold">자동 무료 AI · 키 입력 불필요</h3>
            <p className="mt-1 text-sm leading-6 text-fg-2">{providerOrder}</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-bold ${configuredPool ? "bg-good/15 text-good" : "bg-raised text-fg-2"}`}>
            {pool.mode === "loading"
              ? "상태 확인 중"
              : configuredPool
                ? "자동 사용 가능"
                : pool.mode === "error"
                  ? "상태 확인 불가"
                  : "공용 무료 풀 준비 중"}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-fg-3">
          공급자가 402·429로 무료 한도 또는 요청 제한을 추론 전에 거절한 경우에만 다음 순서로 넘어갑니다. 네트워크 오류·타임아웃·5xx에는 중복 호출하지 않으며 유료 모델로 전환하지 않습니다.
        </p>
        {!configuredPool && pool.mode !== "loading" ? (
          <p className="mt-2 text-xs font-semibold text-warn">
            자동 무료 풀이 준비되지 않았거나 현재 무료 한도·요청 제한으로 사용할 수 없으면 아래 개인 무료 API 키 또는 로컬 AI 연결을 사용합니다. 둘 다 없으면 해당 AI 기능은 사용 불가 안내를 표시합니다.
          </p>
        ) : null}
      </section>

      <div className="rounded-lg border border-line bg-panel p-4 text-sm leading-6">
        <strong>비용·개인정보 차단 원칙</strong>
        <p className="mt-1 text-fg-2">
          결제가 비활성화된 공용 무료 풀, 로컬 AI, 직접 운영하는 무과금 서버, 본인의 무료 티어와 OpenRouter 무료 모델만 사용합니다.
        </p>
        <p className="mt-2 text-xs leading-5 text-fg-3">
          자동 무료 텍스트 기능을 실행하면 입력한 문장이 선택된 외부 무료 제공자에 전송됩니다. 공개 전 원고·개인정보처럼 외부 전송이 곤란한 내용은 로컬 AI 또는 직접 운영하는 개인 서버를 사용하세요.
        </p>
      </div>
      <p className="text-sm text-fg-2" role="status">{snapshot.notice}</p>
      <AiSettingsEditor
        key={snapshot.revision}
        configuration={snapshot.configuration}
      />
    </section>
  );
}

function AiSettingsEditor({ configuration }: { configuration: UserAiConfiguration }) {
  const auxSnapshot = useUnifiedAiAuxSettings();
  const [draft, setDraft] = useState<UserAiConnection>({ ...EMPTY_AI_CONNECTION });
  const [auxDraft, setAuxDraft] = useState(() => ({ ...auxSnapshot.settings }));
  const [showSecrets, setShowSecrets] = useState(false);
  const [trustConsent, setTrustConsent] = useState(false);
  const [freeOnlyConsent, setFreeOnlyConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setAuxDraft({ ...auxSnapshot.settings });
  }, [auxSnapshot.revision, auxSnapshot.settings]);

  const patch = (value: Partial<UserAiConnection>) => {
    setDraft((current) => ({ ...current, ...value }));
  };

  const resetConsents = () => {
    setTrustConsent(false);
    setFreeOnlyConsent(false);
  };

  const run = async (action: () => unknown | Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "설정을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
      setPassword("");
    }
  };

  const applyPreset = (preset: FreeAiPreset) => {
    const presetConnection = connectionFromFreeAiPreset(preset);
    setDraft((current) => ({
      ...EMPTY_AI_CONNECTION,
      ...presetConnection,
      id: current.id,
      label: preset.label,
    }));
    resetConsents();
    setError("");
    setMessage(`${preset.label} 프리셋을 적용했습니다. 모델 ID와 필요한 경우 본인 키를 입력하세요.`);
  };

  const resolvedDraftConnection = (id: string): UserAiConnection => {
    const previous = configuration.connections.find((item) => item.id === draft.id);
    const canKeepPreviousKey = Boolean(
      previous
      && previous.baseUrl.trim() === draft.baseUrl.trim()
      && !draft.apiKey,
    );
    return {
      ...draft,
      apiKey: canKeepPreviousKey ? previous!.apiKey : draft.apiKey,
      id,
    };
  };

  const saveConnection = () => {
    if (!trustConsent) {
      throw new Error("외부 전송 대상이 신뢰할 수 있는 주소인지 확인하세요.");
    }
    if (!freeOnlyConsent) {
      throw new Error("결제 비활성·무료 전용 조건을 확인하세요.");
    }
    const connection = resolvedDraftConnection(draft.id || crypto.randomUUID());
    assertFreeAiConnection(connection);
    const connections = [
      ...configuration.connections.filter((item) => item.id !== connection.id),
      connection,
    ];
    const assignments = { ...configuration.assignments };
    if (!assignments.text && connection.textModel) assignments.text = connection.id;
    if (!assignments.image && connection.imageModel) assignments.image = connection.id;
    setUserAiConfiguration({ version: 1, connections, assignments });
  };

  const removeConnection = (id: string) => {
    const assignments = { ...configuration.assignments };
    for (const capability of USER_AI_CAPABILITIES) {
      if (assignments[capability] === id) assignments[capability] = null;
    }
    setUserAiConfiguration({
      ...configuration,
      connections: configuration.connections.filter((item) => item.id !== id),
      assignments,
    });
  };

  const field = (
    name: Exclude<keyof UserAiConnection, "costPolicy">,
    label: string,
    type = "text",
  ) => (
    <label className="block space-y-1" key={name}>
      <span className="text-sm text-fg-2">{label}</span>
      <input
        className={INPUT}
        type={type}
        autoComplete="off"
        spellCheck={false}
        value={draft[name]}
        maxLength={name === "apiKey" ? 4096 : 300}
        onChange={(event) => {
          const value = event.target.value;
          if (name === "baseUrl") {
            patch({ baseUrl: value, apiKey: "", costPolicy: "unverified" });
          } else {
            patch({ [name]: value });
          }
          resetConsents();
        }}
      />
    </label>
  );

  const draftPolicyIssue = freeAiConnectionPolicyIssue(
    resolvedDraftConnection(draft.id || "draft-preview"),
  );
  const assignedTextConnection = configuration.connections.find(
    (connection) => connection.id === configuration.assignments.text,
  );
  const assignedTextIssue = assignedTextConnection
    ? freeAiConnectionPolicyIssue(assignedTextConnection, "text")
    : "텍스트 연결이 선택되지 않았습니다.";

  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-labelledby="free-ai-presets-title">
        <div>
          <h3 id="free-ai-presets-title" className="font-semibold">선택 사항: 개인 무료 키·로컬 AI</h3>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            자동 무료 풀을 먼저 사용하고, 모든 공용 경로가 무료 한도 또는 요청 제한으로 거절된 경우에만 여기 등록한 개인 무료 연결을 사용합니다. 로컬 실행이 가장 확실한 무과금 방식입니다.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {FREE_AI_PRESETS.map((preset) => (
            <article key={preset.id} className="rounded-lg border border-line bg-panel p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{preset.label}</h4>
                  <p className="mt-1 text-xs leading-5 text-fg-2">{preset.description}</p>
                </div>
                <span className="shrink-0 rounded-full border border-line px-2 py-1 text-[11px] text-fg-2">
                  {preset.requiresApiKey ? "본인 키" : "키 불필요"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => applyPreset(preset)}
                >
                  적용
                </button>
                {preset.docsUrl && (
                  <a
                    href={preset.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center text-sm text-accent"
                  >
                    공식 안내
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {message && <p role="status" className="text-sm text-good">{message}</p>}

      <div className="divide-y divide-line" aria-label="등록된 AI 연결">
        {configuration.connections.map((connection) => {
          const issue = freeAiConnectionPolicyIssue(connection);
          const budget = getFreeAiRuntimeBudgetSnapshot(connection);
          return (
            <div
              key={connection.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div>
                <strong>{connection.label}</strong>
                <p className="break-all text-xs text-fg-2">
                  {connection.baseUrl} · {connection.apiKey ? "키 등록됨" : "키 없음"}
                </p>
                <p className={`mt-1 text-xs ${issue ? "text-bad" : "text-good"}`}>
                  {issue ?? USER_AI_COST_POLICY_LABELS[connection.costPolicy]}
                </p>
                {budget.guarded ? (
                  <p className={`mt-1 text-xs ${budget.blockedReason ? "text-warn" : "text-fg-3"}`}>
                    {budget.blockedReason
                      ? "이 연결은 무료 한도 또는 보호 정책으로 현재 중지됨"
                      : `오늘 남은 앱 안전 한도 ${budget.remainingRequests ?? 0}회 · 예약 토큰 ${(budget.remainingReservedTokens ?? 0).toLocaleString("ko-KR")}`}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => {
                    setDraft({ ...connection, apiKey: "" });
                    resetConsents();
                  }}
                >
                  수정·키 교체
                </button>
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => void run(() => removeConnection(connection.id))}
                >
                  연결 해제
                </button>
              </div>
            </div>
          );
        })}
        {!configuration.connections.length && (
          <p className="py-3 text-sm text-fg-2">
            등록된 연결이 없습니다. AI 없이 사용하는 편집·학습·검수 기능은 계속 사용할 수 있습니다.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {field("label", "연결 이름")}
        {field("baseUrl", "제공자 API baseURL", "url")}
        {field("apiKey", "개인 무료 API 키 (비워 두면 같은 주소의 기존 키 유지 · 로컬은 불필요)", showSecrets ? "text" : "password")}
        {field("textModel", "텍스트 모델 ID")}
        {field("imageModel", "이미지 모델 ID")}
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm text-fg-2">무료 비용 정책</span>
          <select
            className={INPUT}
            value={draft.costPolicy}
            onChange={(event) => {
              patch({ costPolicy: event.target.value as UserAiCostPolicy });
              resetConsents();
            }}
          >
            {USER_AI_COST_POLICIES.map((policy) => (
              <option key={policy} value={policy} disabled={policy === "unverified"}>
                {USER_AI_COST_POLICY_LABELS[policy]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {draftPolicyIssue && (
        <p className="rounded-lg border border-bad/40 bg-panel p-3 text-sm text-bad" role="alert">
          {draftPolicyIssue}
        </p>
      )}

      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">고급 API 경로</summary>
        <div className="grid gap-3">
          {field("chatCompletionsPath", "텍스트 요청 경로")}
          {field("imageGenerationPath", "이미지 생성 경로")}
          {field("imageEditPath", "이미지 편집 경로")}
        </div>
      </details>

      <div className="space-y-2">
        <label className="flex min-h-11 items-start gap-2 text-sm leading-6">
          <input
            type="checkbox"
            checked={trustConsent}
            onChange={(event) => setTrustConsent(event.target.checked)}
            className="mt-1.5 size-4"
          />
          이 주소가 내가 신뢰하는 제공자 또는 직접 운영하는 서버임을 확인했습니다.
        </label>
        <label className="flex min-h-11 items-start gap-2 text-sm leading-6">
          <input
            type="checkbox"
            checked={freeOnlyConsent}
            onChange={(event) => setFreeOnlyConsent(event.target.checked)}
            className="mt-1.5 size-4"
          />
          결제수단·유료 폴백·유료 모델이 비활성화된 무료 전용 연결임을 확인했습니다. 무료 한도 또는 요청 제한 시 다음 무료 경로가 없으면 요청이 실패하는 데 동의합니다.
        </label>
      </div>

      <button
        type="button"
        className={`${BUTTON} bg-accent text-on-accent`}
        disabled={busy || !trustConsent || !freeOnlyConsent || Boolean(draftPolicyIssue)}
        onClick={() => void run(saveConnection)}
      >
        무료 연결을 메모리에 적용
      </button>

      <fieldset className="space-y-3 border-t border-line pt-4">
        <legend className="font-semibold">자동 무료 풀이 소진되거나 제한될 때 사용할 개인 연결</legend>
        {USER_AI_CAPABILITIES.map((capability) => (
          <label key={capability} className="block space-y-1">
            <span className="text-sm">{LABELS[capability]}</span>
            <select
              className={INPUT}
              value={configuration.assignments[capability] ?? ""}
              onChange={(event) => void run(() => {
                const id = event.target.value || null;
                const connection = configuration.connections.find((item) => item.id === id);
                if (connection) assertFreeAiConnection(connection, capability);
                setUserAiConfiguration({
                  ...configuration,
                  assignments: {
                    ...configuration.assignments,
                    [capability]: id,
                  },
                });
              })}
            >
              <option value="">개인 폴백 사용 안 함</option>
              {configuration.connections.map((connection) => {
                const issue = freeAiConnectionPolicyIssue(connection, capability);
                return (
                  <option
                    key={connection.id}
                    value={connection.id}
                    disabled={Boolean(issue)}
                  >
                    {connection.label}{issue ? " (이 기능에 사용 불가)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        ))}
      </fieldset>

      <p className="text-sm leading-6 text-fg-2">
        외부 무료 티어와 OpenRouter 무료 라우터는 텍스트 기능에만 사용합니다. 여러 개인 연결이 있으면 선택한 연결을 먼저 사용하고, 무료 한도 또는 요청 제한이 확인될 때만 Gemini → Groq → SambaNova → Cloudflare Workers AI → Mistral → OpenRouter → 로컬·개인 서버 순으로 다음 유효 연결을 확인합니다. 이미지·영상·3D는 로컬 또는 직접 운영하는 개인 서버만 허용합니다.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={busy || !assignedTextConnection || Boolean(assignedTextIssue)}
          onClick={() => void run(async () => {
            await userAiJson("text", "/models", undefined, { maxBytes: 1024 * 1024 });
            setMessage("무료 연결의 모델 목록 요청에 성공했습니다. 실제 생성 모델 작동 여부는 별도 확인이 필요합니다.");
          })}
        >
          모델 목록 연결 확인
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={busy}
          onClick={() => void run(() => {
            if (!migrateLegacyUserAi()) {
              setMessage("가져올 기존 Studio 키 설정이 없습니다.");
            }
          })}
        >
          기존 Studio 설정 가져오기
        </button>
      </div>

      <details className="border-t border-line pt-4">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">고급 AI 토큰 · 3D와 개인 런타임</summary>
        <div className="mt-3 grid gap-4">
          <p className="text-sm leading-6 text-fg-2">
            Hyper3D/Rodin과 영상·2D↔3D 개인 런타임 토큰도 이 통합 화면에서만 관리합니다. 자동 무료 텍스트 풀과는 별도이며 입력하지 않아도 기본 Studio 기능은 계속 사용할 수 있습니다.
          </p>
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">Hyper3D / Rodin 개인 API 키</span>
            <input
              className={INPUT}
              type={showSecrets ? "text" : "password"}
              autoComplete="off"
              value={auxDraft.hyper3dApiKey}
              maxLength={4096}
              onChange={(event) => setAuxDraft((current) => ({
                ...current,
                hyper3dApiKey: event.target.value,
              }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">개인 Creator Runtime 주소</span>
            <input
              className={INPUT}
              type="url"
              value={auxDraft.creatorRuntimeBaseUrl}
              placeholder="https://my-runtime.example.com"
              onChange={(event) => setAuxDraft((current) => ({
                ...current,
                creatorRuntimeBaseUrl: event.target.value,
              }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">개인 Runtime 토큰</span>
            <input
              className={INPUT}
              type={showSecrets ? "text" : "password"}
              autoComplete="off"
              value={auxDraft.creatorRuntimeToken}
              maxLength={4096}
              onChange={(event) => setAuxDraft((current) => ({
                ...current,
                creatorRuntimeToken: event.target.value,
              }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">Runtime 작업 소유자 ID</span>
            <input
              className={INPUT}
              value={auxDraft.creatorRuntimeOwner}
              maxLength={128}
              onChange={(event) => setAuxDraft((current) => ({
                ...current,
                creatorRuntimeOwner: event.target.value,
              }))}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={BUTTON}
              disabled={busy}
              onClick={() => void run(() => {
                saveUnifiedAiAuxSettings(auxDraft);
                setMessage("3D 및 개인 런타임 토큰을 현재 탭에 적용했습니다.");
              })}
            >
              보조 AI 연결 적용
            </button>
            <button
              type="button"
              className={BUTTON}
              disabled={busy || !auxDraft.creatorRuntimeBaseUrl || !auxDraft.creatorRuntimeToken}
              onClick={() => void run(async () => {
                saveUnifiedAiAuxSettings(auxDraft);
                const result = await testCreatorRuntime();
                if (!result.ok) throw new Error(result.message);
                setMessage(result.message);
              })}
            >
              개인 런타임 연결 확인
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={() => setShowSecrets((current) => !current)}
            >
              {showSecrets ? "모든 비밀 값 숨기기" : "모든 비밀 값 보기"}
            </button>
            <button
              type="button"
              className={`${BUTTON} text-bad`}
              onClick={() => void run(() => {
                clearUnifiedAiSecrets();
                setAuxDraft({ ...DEFAULT_UNIFIED_AI_AUX_SETTINGS });
                setMessage("현재 탭의 3D·개인 런타임 토큰을 삭제했습니다.");
              })}
            >
              보조 토큰 삭제
            </button>
          </div>
        </div>
      </details>

      <fieldset className="space-y-3 border-t border-line pt-4">
        <legend className="font-semibold">선택 사항: 이 기기에 암호화 보관</legend>
        <p className="text-sm leading-6 text-fg-2">
          기본값은 메모리 전용입니다. 암호화 저장 시에도 비밀번호는 저장하지 않습니다. 브라우저 데이터 삭제 시 보관함이 사라지며 비밀번호 복구는 제공하지 않습니다. 잠금 해제 중 악성 확장 프로그램·사이트 스크립트에 의한 접근까지 막는 것은 아닙니다.
        </p>
        <label className="block space-y-1">
          <span className="text-sm">보관함 비밀번호 (12자 이상)</span>
          <input
            type="password"
            autoComplete="off"
            className={INPUT}
            value={password}
            minLength={12}
            maxLength={1024}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {hasPersistedUserAiVault() && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmDelete}
              onChange={(event) => setConfirmDelete(event.target.checked)}
            />
            기존 암호화 보관함의 덮어쓰기 또는 삭제를 확인합니다.
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={
              busy
              || !configuration.connections.length
              || password.length < 12
              || (hasPersistedUserAiVault() && !confirmDelete)
            }
            onClick={() => void run(() => persistUserAiVault(password))}
          >
            암호화 저장
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={busy || password.length < 12 || !hasPersistedUserAiVault()}
            onClick={() => void run(() => unlockUserAiVault(password))}
          >
            잠금 해제
          </button>
          <button type="button" className={BUTTON} onClick={() => lockUserAi()}>
            모든 연결 잠금
          </button>
          <button
            type="button"
            className={`${BUTTON} text-bad`}
            disabled={busy || !confirmDelete}
            onClick={() => void run(deleteUserAiVault)}
          >
            보관함 삭제
          </button>
        </div>
      </fieldset>
    </div>
  );
}
