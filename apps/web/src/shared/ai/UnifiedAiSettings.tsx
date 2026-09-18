import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useMemo, useState } from "react";

import { getFreeAiRuntimeBudgetSnapshot } from "./free-ai-runtime-budget";
import { getFreeAiPoolStatus, type FreeAiPoolStatus } from "./free-ai-pool-status";
import {
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
  userAiConnectionApiKeys,
  userAiConnectionModels,
  userAiRoutingSettings,
  type UserAiCapability,
  type UserAiConfiguration,
  type UserAiConnection,
  type UserAiRoutingMode,
  type UserAiServerProviderId,
} from "./user-ai-types";

const INPUT = "min-h-11 w-full rounded-lg border border-line bg-panel p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent";
const BUTTON = "min-h-11 min-w-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";
const ORDER_BUTTON = `${BUTTON} shrink-0 px-0`;
const ORDER_BUTTON_STYLE = { flex: "0 0 48px", minWidth: 48, width: 48 } as const;
const LABELS: Record<UserAiCapability, string> = {
  text: "텍스트·번역·기획",
  image: "이미지·배경·캐릭터·채색",
  inference: "영상·미디어 추론",
  "three-d": "2D↔3D 생성",
};
const ROUTING_LABELS: Record<UserAiRoutingMode, string> = {
  automatic: "자동 최적 선택",
  priority: "내 우선순위",
  manual: "수동 고정",
};
const SERVER_PROVIDER_LABELS: Record<UserAiServerProviderId, string> = {
  gemini: "Gemini 무료",
  qwen: "Qwen 무료 할당량",
  groq: "Groq 무료",
  sambanova: "SambaNova 무료",
  zai: "Z.AI 무료 Flash",
  mistral: "Mistral 무료",
  cloudflare: "Cloudflare Workers AI 무료",
  openrouter: "OpenRouter 무료",
  siliconflow: "SiliconFlow 무료",
};

type PoolState =
  | { mode: "loading" }
  | { mode: "ready"; status: FreeAiPoolStatus }
  | { mode: "error" };

type DraftStringField =
  | "label"
  | "baseUrl"
  | "imageGenerationPath"
  | "imageEditPath"
  | "chatCompletionsPath";

function routeOrderText(pool: PoolState): string {
  if (pool.mode !== "ready") {
    return "Gemini → Qwen → Groq → SambaNova → Z.AI → Mistral → Cloudflare → OpenRouter → SiliconFlow";
  }
  return pool.status.selection.order
    .map((id) => {
      const provider = pool.status.providers.find((item) => item.id === id);
      return provider ? `${provider.label}${provider.configured ? "" : " (비활성)"}` : id;
    })
    .join(" → ") || "준비된 공용 무료 제공자 없음";
}

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
  return (
    <section
      aria-label={translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "통합 AI 설정")}
      className="space-y-5 text-fg"
      data-unified-ai-settings="true"
    >
      <header>
        <h2 className="text-xl font-bold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "통합 클라우드 AI 설정")}</h2>
        <p className="mt-2 text-sm leading-6 text-fg-2">
          {translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "로컬 모델이나 자체 GPU 없이 관리형 클라우드 API만 사용합니다. 기본 자동 모드는 공용 무료 풀을 먼저 사용하고, 안전하게 거절된 경우에만 다음 무료 경로로 이동합니다.")}</p>
      </header>

      <section
        className={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "rounded-xl border p-4 {v0}"), { v0: String(configuredPool ? "border-good/40 bg-good/10" : "border-line bg-panel") })}
        aria-labelledby="automatic-free-ai-title"
        data-automatic-free-ai="true"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="automatic-free-ai-title" className="font-bold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "자동 무료 AI · 키 입력 불필요")}</h3>
            <p className="mt-1 text-sm leading-6 text-fg-2">{routeOrderText(pool)}</p>
          </div>
          <span className={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "rounded-full px-2 py-1 text-xs font-bold {v0}"), { v0: String(configuredPool ? "bg-good/15 text-good" : "bg-raised text-fg-2") })}>
            {pool.mode === "loading"
              ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "상태 확인 중")
              : configuredPool
                ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "자동 사용 가능")
                : pool.mode === "error"
                  ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "상태 확인 불가")
                  : translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "무료 풀 준비 중")}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-fg-3">
          {translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "402·429처럼 추론 전에 무료 한도 소진이 확정된 경우에만 다음 공급자로 이동합니다. 네트워크 오류·타임아웃·5xx에는 중복 생성을 막기 위해 자동 재전송하지 않습니다.")}</p>
      </section>

      <div className="rounded-lg border border-line bg-panel p-4 text-sm leading-6">
        <strong>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "클라우드 전용·비용 보호 원칙")}</strong>
        <p className="mt-1 text-fg-2">
          {translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "localhost·사설망·Ollama·ComfyUI 로컬 서버는 등록할 수 없습니다. 자동 모드는 무료 경로만 사용하며, 유료 BYOK 폴백은 사용자가 별도로 켜야 합니다.")}</p>
        <p className="mt-2 text-xs leading-5 text-fg-3">
          {translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "프롬프트와 원고는 선택된 외부 공급자에 전송됩니다. 미공개 원고는 데이터 보존·학습 제외 조건이 확인된 공급자와 전용 계정만 사용하세요.")}</p>
      </div>
      <p className="text-sm text-fg-2" role="status">{snapshot.notice}</p>
      <AiSettingsEditor
        key={snapshot.revision}
        configuration={snapshot.configuration}
        poolStatus={pool.mode === "ready" ? pool.status : null}
      />
    </section>
  );
}

function AiSettingsEditor({
  configuration,
  poolStatus,
}: {
  configuration: UserAiConfiguration;
  poolStatus: FreeAiPoolStatus | null;
}) {
  const auxSnapshot = useUnifiedAiAuxSettings();
  const routing = userAiRoutingSettings(configuration);
  const [draft, setDraft] = useState<UserAiConnection>(structuredClone(EMPTY_AI_CONNECTION));
  const [auxDraft, setAuxDraft] = useState(() => ({ ...auxSnapshot.settings }));
  const [showSecrets, setShowSecrets] = useState(false);
  const [trustConsent, setTrustConsent] = useState(false);
  const [costConsent, setCostConsent] = useState(false);
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
    setCostConsent(false);
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

  const draftKeys = draft.apiKeys ?? [];
  const draftModels = draft.models ?? [];
  const previousConnection = configuration.connections.find((item) => item.id === draft.id);

  const resolvedDraftConnection = (id: string): UserAiConnection => {
    const canKeepPreviousKeys = Boolean(
      previousConnection
      && previousConnection.baseUrl.trim() === draft.baseUrl.trim(),
    );
    const previousKeys = new Map(
      (previousConnection?.apiKeys ?? []).map((item) => [item.id, item.apiKey]),
    );
    const apiKeys = draftKeys.map((item) => ({
      ...item,
      apiKey: item.apiKey || (canKeepPreviousKeys ? previousKeys.get(item.id) ?? "" : ""),
    }));
    const firstKey = [...apiKeys]
      .filter((item) => item.enabled)
      .sort((left, right) => left.priority - right.priority)[0];
    const firstText = [...draftModels]
      .filter((item) => item.enabled && item.capability === "text")
      .sort((left, right) => left.priority - right.priority)[0];
    const firstImage = [...draftModels]
      .filter((item) => item.enabled && item.capability === "image")
      .sort((left, right) => left.priority - right.priority)[0];
    return {
      ...draft,
      id,
      apiKeys,
      models: draftModels,
      apiKey: firstKey?.apiKey ?? "",
      textModel: firstText?.model ?? "",
      imageModel: firstImage?.model ?? "",
    };
  };

  const draftPolicyIssue = (() => {
    const connection = resolvedDraftConnection(draft.id || "draft-preview");
    const key = connection.apiKeys?.find((item) => item.enabled)?.apiKey ?? "";
    if (!key) return "활성 API 키를 하나 이상 입력하세요.";
    const models = connection.models?.filter((item) => item.enabled) ?? [];
    if (!models.length) return "활성 모델을 하나 이상 입력하세요.";
    for (const model of models) {
      if (!model.model.trim()) return "각 모델 프로필의 모델 ID를 입력하세요.";
      const route = {
        ...connection,
        apiKey: key,
        textModel: model.capability === "text" ? model.model : "",
        imageModel: model.capability === "image" ? model.model : "",
      };
      const issue = freeAiConnectionPolicyIssue(route, model.capability);
      if (issue) return `${model.label || model.model}: ${issue}`;
    }
    return null;
  })();

  const applyPreset = (preset: FreeAiPreset) => {
    const base = connectionFromFreeAiPreset(preset);
    const capability: UserAiCapability = preset.imageModel ? "image" : "text";
    const model = preset.imageModel || preset.textModel;
    setDraft({
      ...EMPTY_AI_CONNECTION,
      ...base,
      id: draft.id,
      label: preset.label,
      apiKeys: [{ id: "key-1", label: "기본 키", apiKey: "", enabled: true, priority: 100 }],
      models: [{
        id: `${capability}-1`,
        label: model || "모델 1",
        model,
        capability,
        enabled: true,
        priority: 100,
      }],
      priority: draft.priority ?? 100,
    });
    resetConsents();
    setError("");
    setMessage(`${preset.label} 프리셋을 적용했습니다. API 키와 모델 ID를 확인하세요.`);
  };

  const saveConnection = () => {
    if (!trustConsent) throw new Error("외부 전송 대상이 신뢰할 수 있는 공식 클라우드 주소인지 확인하세요.");
    if (!costConsent) throw new Error("무료 한도 또는 사용자 결제 조건을 확인하세요.");
    if (draftPolicyIssue) throw new Error(draftPolicyIssue);
    const connection = resolvedDraftConnection(draft.id || crypto.randomUUID());
    const connections = [
      ...configuration.connections.filter((item) => item.id !== connection.id),
      connection,
    ];
    const assignments = { ...configuration.assignments };
    const routeAssignments = {
      text: configuration.routeAssignments?.text ?? null,
      image: configuration.routeAssignments?.image ?? null,
      inference: configuration.routeAssignments?.inference ?? null,
      "three-d": configuration.routeAssignments?.["three-d"] ?? null,
    };
    for (const capability of USER_AI_CAPABILITIES) {
      if (!assignments[capability] && userAiConnectionModels(connection, capability).length) {
        assignments[capability] = connection.id;
        routeAssignments[capability] = { connectionId: connection.id, apiKeyId: null, modelId: null };
      }
    }
    setUserAiConfiguration({
      ...configuration,
      connections,
      assignments,
      routeAssignments,
    });
  };

  const removeConnection = (id: string) => {
    const assignments = { ...configuration.assignments };
    const routeAssignments = {
      text: configuration.routeAssignments?.text ?? null,
      image: configuration.routeAssignments?.image ?? null,
      inference: configuration.routeAssignments?.inference ?? null,
      "three-d": configuration.routeAssignments?.["three-d"] ?? null,
    };
    for (const capability of USER_AI_CAPABILITIES) {
      if (assignments[capability] === id) assignments[capability] = null;
      if (routeAssignments[capability]?.connectionId === id) routeAssignments[capability] = null;
    }
    setUserAiConfiguration({
      ...configuration,
      connections: configuration.connections.filter((item) => item.id !== id),
      assignments,
      routeAssignments,
    });
  };

  const updateRouting = (value: Partial<typeof routing>) => {
    setUserAiConfiguration({
      ...configuration,
      routing: { ...routing, ...value },
    });
  };

  const moveServerProvider = (id: UserAiServerProviderId, direction: -1 | 1) => {
    const order = [...routing.serverProviderOrder];
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    updateRouting({ serverProviderOrder: order });
  };

  const field = (name: DraftStringField, label: string, type = "text") => (
    <label className="block space-y-1" key={name}>
      <span className="text-sm text-fg-2">{label}</span>
      <input
        className={INPUT}
        type={type}
        autoComplete="off"
        spellCheck={false}
        value={draft[name]}
        maxLength={300}
        onChange={(event) => {
          const value = event.target.value;
          if (name === "baseUrl") {
            patch({
              baseUrl: value,
              apiKey: "",
              apiKeys: draftKeys.map((item) => ({ ...item, apiKey: "" })),
              costPolicy: "unverified",
            });
          } else {
            patch({ [name]: value });
          }
          resetConsents();
        }}
      />
    </label>
  );

  const orderedConnections = useMemo(
    () => [...configuration.connections].sort((left, right) =>
      (left.priority ?? 100) - (right.priority ?? 100) || left.label.localeCompare(right.label)),
    [configuration.connections],
  );

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-bad/40 p-3 text-sm text-bad">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-good/40 p-3 text-sm text-good">{message}</p>}

      <section className="space-y-3 rounded-xl border border-line bg-panel p-4" aria-labelledby="routing-policy-title">
        <div>
          <h3 id="routing-policy-title" className="font-semibold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "라우팅 모드와 우선순위")}</h3>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            {translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "자동은 품질·가용성을 우선하고, 내 우선순위는 숫자가 작은 연결·모델·키부터 사용합니다. 수동 고정은 기능별로 선택한 정확한 경로만 사용합니다.")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "라우팅 모드")}</span>
            <select
              className={INPUT}
              value={routing.mode}
              onChange={(event) => updateRouting({ mode: event.target.value as UserAiRoutingMode })}
            >
              {Object.entries(ROUTING_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "공용 무료 풀 우선순위")}</span>
            <input
              className={INPUT}
              type="number"
              min={1}
              max={999}
              value={routing.managedPoolPriority}
              onChange={(event) => updateRouting({ managedPoolPriority: Number(event.target.value) })}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={routing.allowPaidFallback}
              onChange={(event) => updateRouting({ allowPaidFallback: event.target.checked })}
            />
            {translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "무료 경로 소진 후 사용자 결제 BYOK 허용")}</label>
        </div>
        <div className="space-y-2">
          <strong className="text-sm">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "공용 무료 공급자 순서")}</strong>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {routing.serverProviderOrder.map((id, index) => {
              const status = poolStatus?.providers.find((item) => item.id === id);
              return (
                <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="min-w-0 break-words text-sm">
                    {index + 1}. {status?.label ?? SERVER_PROVIDER_LABELS[id]}
                    {status && !status.configured ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", " · 비활성") : ""}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button type="button" className={ORDER_BUTTON} style={ORDER_BUTTON_STYLE} disabled={index === 0} onClick={() => moveServerProvider(id, -1)} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "{v0} 위로"), { v0: String(id) })}>↑</button>
                    <button type="button" className={ORDER_BUTTON} style={ORDER_BUTTON_STYLE} disabled={index === routing.serverProviderOrder.length - 1} onClick={() => moveServerProvider(id, 1)} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "{v0} 아래로"), { v0: String(id) })}>↓</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="cloud-ai-presets-title">
        <div>
          <h3 id="cloud-ai-presets-title" className="font-semibold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "클라우드 공급자 프리셋")}</h3>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            {translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "한 공급자에 여러 키와 여러 모델을 등록할 수 있습니다. 무료 자동 모드는 무료 정책으로 표시된 경로만 사용합니다.")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {FREE_AI_PRESETS.map((preset) => (
            <article key={preset.id} className="rounded-lg border border-line bg-panel p-3">
              <h4 className="font-semibold">{preset.label}</h4>
              <p className="mt-1 text-xs leading-5 text-fg-2">{preset.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className={BUTTON} onClick={() => applyPreset(preset)}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "적용")}</button>
                {preset.docsUrl && (
                  <a href={preset.docsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm text-accent">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "공식 안내")}</a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="registered-cloud-routes-title">
        <h3 id="registered-cloud-routes-title" className="font-semibold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "등록된 클라우드 연결")}</h3>
        <div className="divide-y divide-line rounded-xl border border-line px-4">
          {orderedConnections.map((connection) => {
            const issue = freeAiConnectionPolicyIssue(connection, connection.textModel ? "text" : undefined);
            const budget = getFreeAiRuntimeBudgetSnapshot(connection);
            const keyCount = userAiConnectionApiKeys(connection).length;
            const modelCount = userAiConnectionModels(connection).length;
            return (
              <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{connection.label}</strong>
                    <span className="rounded-full border border-line px-2 py-0.5 text-[11px]">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "우선순위 ")}{connection.priority ?? 100}</span>
                    {connection.enabled === false && <span className="text-xs text-warn">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "비활성")}</span>}
                  </div>
                  <p className="break-all text-xs text-fg-2">{connection.baseUrl}</p>
                  <p className="mt-1 text-xs text-fg-3">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "키 ")}{keyCount}{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "개 · 모델 ")}{modelCount}{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "개 · ")}{USER_AI_COST_POLICY_LABELS[connection.costPolicy]}</p>
                  {issue && <p className="mt-1 text-xs text-bad">{issue}</p>}
                  {budget.guarded && (
                    <p className={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "mt-1 text-xs {v0}"), { v0: String(budget.blockedReason ? "text-warn" : "text-fg-3") })}>
                      {budget.blockedReason
                        ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "이 무료 경로는 한도 또는 보호 정책으로 현재 중지됨")
                        : formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "오늘 남은 앱 안전 한도 {v0}회"), { v0: String(budget.remainingRequests ?? 0) })}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() => {
                      setDraft({
                        ...structuredClone(connection),
                        apiKey: "",
                        apiKeys: (connection.apiKeys ?? []).map((item) => ({ ...item, apiKey: "" })),
                      });
                      resetConsents();
                    }}
                  >{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "수정·키 교체")}</button>
                  <button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "{v0} text-bad"), { v0: String(BUTTON) })} onClick={() => void run(() => removeConnection(connection.id))}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "연결 해제")}</button>
                </div>
              </div>
            );
          })}
          {!configuration.connections.length && (
            <p className="py-4 text-sm text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "등록된 클라우드 연결이 없습니다. 공용 무료 AI가 준비된 기능은 키 없이 사용할 수 있습니다.")}</p>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-line bg-panel p-4" aria-labelledby="connection-editor-title">
        <div>
          <h3 id="connection-editor-title" className="font-semibold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "클라우드 연결 편집")}</h3>
          <p className="mt-1 text-xs leading-5 text-fg-3">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "숫자가 작을수록 먼저 사용합니다. 같은 모델에 여러 키를 두면 무료 한도·인증 오류 시 다음 키로 안전하게 이동할 수 있습니다.")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("label", "연결 이름")}
          {field("baseUrl", "공개 HTTPS API baseURL", "url")}
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "연결 우선순위")}</span>
            <input className={INPUT} type="number" min={1} max={999} value={draft.priority ?? 100} onChange={(event) => patch({ priority: Number(event.target.value) })} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "비용 정책")}</span>
            <select className={INPUT} value={draft.costPolicy} onChange={(event) => { patch({ costPolicy: event.target.value as UserAiCostPolicy }); resetConsents(); }}>
              {USER_AI_COST_POLICIES.map((policy) => (
                <option key={policy} value={policy} disabled={policy === "unverified"}>{USER_AI_COST_POLICY_LABELS[policy]}</option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.enabled !== false} onChange={(event) => patch({ enabled: event.target.checked })} />
            {translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "이 연결 활성화")}</label>
        </div>

        <fieldset className="space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="font-semibold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "API 키 프로필")}</legend>
            <button
              type="button"
              className={BUTTON}
              onClick={() => patch({ apiKeys: [...draftKeys, { id: `key-${crypto.randomUUID().slice(0, 8)}`, label: `키 ${draftKeys.length + 1}`, apiKey: "", enabled: true, priority: (draftKeys.length + 1) * 100 }] })}
            >{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "키 추가")}</button>
          </div>
          {draftKeys.map((key, index) => (
            <div key={key.id} className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-[1fr_2fr_8rem_auto_auto]">
              <input className={INPUT} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "키 {v0} 이름"), { v0: String(index + 1) })} value={key.label} onChange={(event) => patch({ apiKeys: draftKeys.map((item) => item.id === key.id ? { ...item, label: event.target.value } : item) })} />
              <input className={INPUT} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "키 {v0} 값"), { v0: String(index + 1) })} type={showSecrets ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "text") : translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "password")} autoComplete="off" placeholder={previousConnection ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "비워 두면 기존 키 유지") : translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "API 키")} value={key.apiKey} onChange={(event) => patch({ apiKeys: draftKeys.map((item) => item.id === key.id ? { ...item, apiKey: event.target.value } : item) })} />
              <input className={INPUT} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "키 {v0} 우선순위"), { v0: String(index + 1) })} type="number" min={1} max={999} value={key.priority} onChange={(event) => patch({ apiKeys: draftKeys.map((item) => item.id === key.id ? { ...item, priority: Number(event.target.value) } : item) })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={key.enabled} onChange={(event) => patch({ apiKeys: draftKeys.map((item) => item.id === key.id ? { ...item, enabled: event.target.checked } : item) })} />{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "활성")}</label>
              <button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "{v0} text-bad"), { v0: String(BUTTON) })} disabled={draftKeys.length <= 1} onClick={() => patch({ apiKeys: draftKeys.filter((item) => item.id !== key.id) })}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "삭제")}</button>
            </div>
          ))}
        </fieldset>

        <fieldset className="space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="font-semibold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "모델 프로필")}</legend>
            <button
              type="button"
              className={BUTTON}
              onClick={() => patch({ models: [...draftModels, { id: `model-${crypto.randomUUID().slice(0, 8)}`, label: `모델 ${draftModels.length + 1}`, model: "", capability: "text", enabled: true, priority: (draftModels.length + 1) * 100 }] })}
            >{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "모델 추가")}</button>
          </div>
          {draftModels.map((model, index) => (
            <div key={model.id} className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-[1fr_2fr_10rem_8rem_auto_auto]">
              <input className={INPUT} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "모델 {v0} 이름"), { v0: String(index + 1) })} value={model.label} onChange={(event) => patch({ models: draftModels.map((item) => item.id === model.id ? { ...item, label: event.target.value } : item) })} />
              <input className={INPUT} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "모델 {v0} ID"), { v0: String(index + 1) })} value={model.model} onChange={(event) => patch({ models: draftModels.map((item) => item.id === model.id ? { ...item, model: event.target.value } : item) })} />
              <select className={INPUT} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "모델 {v0} 기능"), { v0: String(index + 1) })} value={model.capability} onChange={(event) => patch({ models: draftModels.map((item) => item.id === model.id ? { ...item, capability: event.target.value as UserAiCapability } : item) })}>
                {USER_AI_CAPABILITIES.map((capability) => <option key={capability} value={capability}>{LABELS[capability]}</option>)}
              </select>
              <input className={INPUT} aria-label={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "모델 {v0} 우선순위"), { v0: String(index + 1) })} type="number" min={1} max={999} value={model.priority} onChange={(event) => patch({ models: draftModels.map((item) => item.id === model.id ? { ...item, priority: Number(event.target.value) } : item) })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={model.enabled} onChange={(event) => patch({ models: draftModels.map((item) => item.id === model.id ? { ...item, enabled: event.target.checked } : item) })} />{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "활성")}</label>
              <button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "{v0} text-bad"), { v0: String(BUTTON) })} disabled={draftModels.length <= 1} onClick={() => patch({ models: draftModels.filter((item) => item.id !== model.id) })}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "삭제")}</button>
            </div>
          ))}
        </fieldset>

        <details>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "고급 API 경로")}</summary>
          <div className="grid gap-3">
            {field("chatCompletionsPath", "텍스트 요청 경로")}
            {field("imageGenerationPath", "이미지 생성 경로")}
            {field("imageEditPath", "이미지 편집 경로")}
          </div>
        </details>

        {draftPolicyIssue && <p className="rounded-lg border border-bad/40 p-3 text-sm text-bad" role="alert">{draftPolicyIssue}</p>}
        <div className="space-y-2">
          <label className="flex min-h-11 items-start gap-2 text-sm leading-6">
            <input type="checkbox" checked={trustConsent} onChange={(event) => setTrustConsent(event.target.checked)} className="mt-1.5 size-4" />
            {translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "이 주소가 신뢰할 수 있는 공식 관리형 클라우드 API이며 입력 데이터가 외부로 전송됨을 확인했습니다.")}</label>
          <label className="flex min-h-11 items-start gap-2 text-sm leading-6">
            <input type="checkbox" checked={costConsent} onChange={(event) => setCostConsent(event.target.checked)} className="mt-1.5 size-4" />
            {draft.costPolicy === "user-funded-byok"
              ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "이 BYOK 경로의 사용료가 내 공급자 계정에 청구될 수 있음을 확인했습니다.")
              : translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "무료 플랜·모델·자동 유료 전환 비활성 조건을 공급자 콘솔에서 확인했습니다.")}
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "{v0} bg-accent text-on-accent"), { v0: String(BUTTON) })} disabled={busy || !trustConsent || !costConsent || Boolean(draftPolicyIssue)} onClick={() => void run(saveConnection)}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "클라우드 연결 적용")}</button>
          <button type="button" className={BUTTON} onClick={() => setShowSecrets((current) => !current)}>{showSecrets ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "비밀 값 숨기기") : translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "비밀 값 보기")}</button>
          <button type="button" className={BUTTON} onClick={() => { setDraft(structuredClone(EMPTY_AI_CONNECTION)); resetConsents(); }}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "새 연결 초기화")}</button>
        </div>
      </section>

      <fieldset className="space-y-4 rounded-xl border border-line p-4">
        <legend className="font-semibold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "기능별 수동 경로")}</legend>
        <p className="text-sm leading-6 text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "수동 고정 모드에서는 아래 공급자·키·모델만 사용합니다. 자동/우선순위 모드에서는 선택값을 동률 해소와 호환 경로로 사용합니다.")}</p>
        {USER_AI_CAPABILITIES.map((capability) => {
          const connectionId = configuration.routeAssignments?.[capability]?.connectionId
            ?? configuration.assignments[capability]
            ?? "";
          const connection = configuration.connections.find((item) => item.id === connectionId);
          const keys = connection ? userAiConnectionApiKeys(connection) : [];
          const models = connection ? userAiConnectionModels(connection, capability) : [];
          const assignment = configuration.routeAssignments?.[capability];
          const setAssignment = (value: { connectionId: string; apiKeyId: string | null; modelId: string | null } | null) => {
            setUserAiConfiguration({
              ...configuration,
              assignments: { ...configuration.assignments, [capability]: value?.connectionId ?? null },
              routeAssignments: {
                text: configuration.routeAssignments?.text ?? null,
                image: configuration.routeAssignments?.image ?? null,
                inference: configuration.routeAssignments?.inference ?? null,
                "three-d": configuration.routeAssignments?.["three-d"] ?? null,
                [capability]: value,
              },
            });
          };
          return (
            <div key={capability} className="grid gap-2 md:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-sm">{LABELS[capability]} {translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "공급자")}</span>
                <select className={INPUT} value={connectionId} onChange={(event) => {
                  const nextId = event.target.value;
                  const next = configuration.connections.find((item) => item.id === nextId);
                  const nextKey = next ? userAiConnectionApiKeys(next)[0] : undefined;
                  const nextModel = next ? userAiConnectionModels(next, capability)[0] : undefined;
                  setAssignment(next && nextKey && nextModel ? { connectionId: next.id, apiKeyId: nextKey.id, modelId: nextModel.id } : null);
                }}>
                  <option value="">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "개인 경로 사용 안 함")}</option>
                  {configuration.connections.filter((item) => userAiConnectionModels(item, capability).length).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "API 키")}</span>
                <select className={INPUT} disabled={!connection} value={assignment?.apiKeyId ?? keys[0]?.id ?? ""} onChange={(event) => connection && setAssignment({ connectionId: connection.id, apiKeyId: event.target.value || null, modelId: assignment?.modelId ?? models[0]?.id ?? null })}>
                  {keys.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.priority}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "모델")}</span>
                <select className={INPUT} disabled={!connection} value={assignment?.modelId ?? models[0]?.id ?? ""} onChange={(event) => connection && setAssignment({ connectionId: connection.id, apiKeyId: assignment?.apiKeyId ?? keys[0]?.id ?? null, modelId: event.target.value || null })}>
                  {models.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.priority}</option>)}
                </select>
              </label>
            </div>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} disabled={busy || !configuration.assignments.text} onClick={() => void run(async () => {
          await userAiJson("text", "/models", undefined, { maxBytes: 1024 * 1024 });
          setMessage("선택한 클라우드 텍스트 경로의 모델 목록 요청에 성공했습니다.");
        })}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "모델 목록 연결 확인")}</button>
        <button type="button" className={BUTTON} disabled={busy} onClick={() => void run(() => {
          if (!migrateLegacyUserAi()) setMessage("가져올 기존 Studio 클라우드 키 설정이 없습니다.");
        })}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "기존 Studio 설정 가져오기")}</button>
      </div>

      <details className="rounded-xl border border-line p-4">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "고급 클라우드 AI 토큰 · 3D와 영상 런타임")}</summary>
        <div className="mt-3 grid gap-4">
          <p className="text-sm leading-6 text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "Hyper3D/Rodin과 2D↔3D·영상용 관리형 클라우드 런타임 토큰을 현재 탭에서 관리합니다. localhost와 사설망 주소는 허용하지 않습니다.")}</p>
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "Hyper3D / Rodin API 키")}</span>
            <input className={INPUT} type={showSecrets ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "text") : translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "password")} autoComplete="off" value={auxDraft.hyper3dApiKey} maxLength={4096} onChange={(event) => setAuxDraft((current) => ({ ...current, hyper3dApiKey: event.target.value }))} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "관리형 Creator Runtime HTTPS 주소")}</span>
            <input className={INPUT} type="url" value={auxDraft.creatorRuntimeBaseUrl} placeholder="https://runtime.example.com" onChange={(event) => setAuxDraft((current) => ({ ...current, creatorRuntimeBaseUrl: event.target.value }))} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "클라우드 Runtime 토큰")}</span>
            <input className={INPUT} type={showSecrets ? translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "text") : translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "password")} autoComplete="off" value={auxDraft.creatorRuntimeToken} maxLength={4096} onChange={(event) => setAuxDraft((current) => ({ ...current, creatorRuntimeToken: event.target.value }))} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "Runtime 작업 소유자 ID")}</span>
            <input className={INPUT} value={auxDraft.creatorRuntimeOwner} maxLength={128} onChange={(event) => setAuxDraft((current) => ({ ...current, creatorRuntimeOwner: event.target.value }))} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} disabled={busy} onClick={() => void run(() => { saveUnifiedAiAuxSettings(auxDraft); setMessage("3D·영상 클라우드 토큰을 현재 탭에 적용했습니다."); })}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "보조 클라우드 연결 적용")}</button>
            <button type="button" className={BUTTON} disabled={busy || !auxDraft.creatorRuntimeBaseUrl || !auxDraft.creatorRuntimeToken} onClick={() => void run(async () => { saveUnifiedAiAuxSettings(auxDraft); const result = await testCreatorRuntime(); if (!result.ok) throw new Error(result.message); setMessage(result.message); })}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "클라우드 런타임 확인")}</button>
            <button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "{v0} text-bad"), { v0: String(BUTTON) })} onClick={() => void run(() => { clearUnifiedAiSecrets(); setAuxDraft({ ...DEFAULT_UNIFIED_AI_AUX_SETTINGS }); setMessage("현재 탭의 3D·영상 클라우드 토큰을 삭제했습니다."); })}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "보조 토큰 삭제")}</button>
          </div>
        </div>
      </details>

      <fieldset className="space-y-3 rounded-xl border border-line p-4">
        <legend className="font-semibold">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "선택 사항: 이 기기에 암호화 보관")}</legend>
        <p className="text-sm leading-6 text-fg-2">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "기본값은 메모리 전용입니다. 암호화 저장 시에도 비밀번호는 저장하지 않으며, 새 탭에서는 다시 잠금 해제해야 합니다.")}</p>
        <label className="block space-y-1">
          <span className="text-sm">{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "보관함 비밀번호 (12자 이상)")}</span>
          <input type="password" autoComplete="off" className={INPUT} value={password} minLength={12} maxLength={1024} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {hasPersistedUserAiVault() && (
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={confirmDelete} onChange={(event) => setConfirmDelete(event.target.checked)} />{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "기존 암호화 보관함의 덮어쓰기 또는 삭제를 확인합니다.")}</label>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} disabled={busy || !configuration.connections.length || password.length < 12 || (hasPersistedUserAiVault() && !confirmDelete)} onClick={() => void run(() => persistUserAiVault(password))}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "암호화 저장")}</button>
          <button type="button" className={BUTTON} disabled={busy || password.length < 12 || !hasPersistedUserAiVault()} onClick={() => void run(() => unlockUserAiVault(password))}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "잠금 해제")}</button>
          <button type="button" className={BUTTON} onClick={() => lockUserAi()}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "모든 연결 잠금")}</button>
          <button type="button" className={formatI18nTemplate(translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "en", "{v0} text-bad"), { v0: String(BUTTON) })} disabled={busy || !confirmDelete} onClick={() => void run(deleteUserAiVault)}>{translateCurrentStaticSourceText("shared.ai.UnifiedAiSettings", "ko", "보관함 삭제")}</button>
        </div>
      </fieldset>
    </div>
  );
}
