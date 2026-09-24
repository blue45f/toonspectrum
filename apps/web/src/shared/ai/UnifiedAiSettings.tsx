import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cloud,
  ExternalLink,
  KeyRound,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  WalletCards,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import {
  connectionFromFreeAiPreset,
  FREE_AI_PRESETS,
  freeAiConnectionPolicyIssue,
  type FreeAiPreset,
} from "./free-ai-policy";
import { getFreeAiPoolStatus, type FreeAiPoolStatus } from "./free-ai-pool-status";
import {
  getUserAiSnapshot,
  setUserAiConfiguration,
  useUserAi,
} from "./user-ai-store";
import {
  isUserAiQuotaExhaustion,
  userAiJson,
  UserAiTransportError,
} from "./user-ai-transport";
import {
  EMPTY_AI_CONNECTION,
  resolvedUserAiRoutes,
  userAiConnectionApiKeys,
  userAiConnectionModels,
  userAiRoutingSettings,
  USER_AI_CAPABILITIES,
  type UserAiCapability,
  type UserAiConfiguration,
  type UserAiConnection,
  type UserAiRoutingMode,
  type UserAiServerProviderId,
} from "./user-ai-types";


const UnifiedAiAdvancedSettings = lazy(async () => {
  const module = await import("./UnifiedAiAdvancedSettings");
  return { default: module.UnifiedAiAdvancedSettings };
});

const INPUT = "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY_BUTTON = `${BUTTON} border-accent bg-accent text-on-accent hover:bg-accent/90`;
const QUIET_BUTTON = `${BUTTON} border-transparent px-3 text-fg-2 hover:border-line`;

const CAPABILITY_LABELS: Readonly<Record<UserAiCapability, string>> = Object.freeze({
  text: "글·대사·번역",
  image: "이미지 생성·편집",
  inference: "영상·미디어",
  "three-d": "2D↔3D",
});

const ROUTING_MODES: ReadonlyArray<{
  id: UserAiRoutingMode;
  title: string;
  description: string;
  recommended?: boolean;
}> = Object.freeze([
  {
    id: "automatic",
    title: "자동 추천",
    description: "작업 종류와 사용 가능 여부를 보고 무료 AI부터 자동으로 선택합니다.",
    recommended: true,
  },
  {
    id: "priority",
    title: "내가 정한 순서",
    description: "자동 무료 AI와 내 AI 연결을 정해 둔 순서대로 사용합니다.",
  },
  {
    id: "manual",
    title: "하나만 고정",
    description: "기능마다 지정한 AI·키·모델만 사용하고 다른 경로로 넘어가지 않습니다.",
  },
]);

type SettingsView = "start" | "order" | "advanced";
type WizardStep = "choose" | "credentials" | "done";
type PoolState =
  | { mode: "loading" }
  | { mode: "ready"; status: FreeAiPoolStatus }
  | { mode: "error" };

type PresetId = FreeAiPreset["id"];

const PRESET_DISPLAY: Readonly<Record<PresetId, {
  name: string;
  description: string;
  recommended?: boolean;
  badge?: string;
}>> = Object.freeze({
  "openrouter-free": {
    name: "OpenRouter",
    description: "여러 무료 텍스트 모델을 하나의 키로 간단히 사용해요.",
    recommended: true,
    badge: "가장 쉬움",
  },
  "gemini-free": {
    name: "Google Gemini",
    description: "Google AI Studio 키로 대사·요약·이미지 이해 작업을 연결해요.",
    recommended: true,
    badge: "추천",
  },
  "groq-free": {
    name: "Groq",
    description: "빠른 텍스트 생성과 대사 초안 작업에 적합해요.",
    recommended: true,
    badge: "빠름",
  },
  "mistral-free": {
    name: "Mistral",
    description: "글쓰기와 문서 이해에 사용할 무료 모드 키를 연결해요.",
  },
  "sambanova-free": {
    name: "SambaNova",
    description: "대형 오픈 모델의 무료 사용량을 활용해요.",
  },
  "zai-free": {
    name: "Z.AI",
    description: "무료 Flash 모델을 글·기획 작업에 연결해요.",
  },
  "qwen-beijing-free": {
    name: "Qwen",
    description: "Alibaba Model Studio 무료 할당량과 워크스페이스 주소를 연결해요.",
  },
  "siliconflow-free": {
    name: "SiliconFlow",
    description: "가격표상 무료인 텍스트 모델을 사용해요.",
  },
  "huggingface-free": {
    name: "Hugging Face",
    description: "계정에 포함된 소액 무료 추론 크레딧을 사용해요.",
  },
  "cerebras-free": {
    name: "Cerebras",
    description: "개발자 무료 범위의 빠른 텍스트 모델을 연결해요.",
  },
  "custom-cloud": {
    name: "기타 AI 서비스",
    description: "공개 HTTPS API 주소, 모델과 내 키를 직접 입력해요.",
    badge: "고급",
  },
});

const SERVER_PROVIDER_LABELS: Readonly<Record<UserAiServerProviderId, string>> = Object.freeze({
  gemini: "Google Gemini",
  qwen: "Qwen",
  groq: "Groq",
  sambanova: "SambaNova",
  zai: "Z.AI",
  mistral: "Mistral",
  cloudflare: "Cloudflare AI",
  openrouter: "OpenRouter",
  siliconflow: "SiliconFlow",
});

function useFreeAiPoolState(): PoolState {
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
  return pool;
}

function capabilityList(connection: UserAiConnection): UserAiCapability[] {
  return USER_AI_CAPABILITIES.filter((capability) =>
    userAiConnectionModels(connection, capability).length > 0,
  );
}

function connectionIsReady(connection: UserAiConnection): boolean {
  return capabilityList(connection).some((capability) =>
    freeAiConnectionPolicyIssue(connection, capability) === null,
  );
}

function connectionCostLabel(connection: UserAiConnection): string {
  if (connection.costPolicy === "user-funded-byok") return "내 계정 과금 가능";
  if (connection.costPolicy === "unverified") return "비용 정책 확인 필요";
  return "무료 범위";
}

function orderedConnections(configuration: UserAiConfiguration): UserAiConnection[] {
  return [...configuration.connections].sort((left, right) =>
    (left.priority ?? 100) - (right.priority ?? 100)
      || left.label.localeCompare(right.label),
  );
}

function poolProviderOrder(pool: PoolState, fallback: readonly UserAiServerProviderId[]): string[] {
  if (pool.mode !== "ready") return [...fallback];
  const labels = pool.status.selection.order.map((id) => {
    const provider = pool.status.providers.find((item) => item.id === id);
    return provider?.label ?? SERVER_PROVIDER_LABELS[id as UserAiServerProviderId] ?? id;
  });
  return labels.length ? labels : [...fallback].map((id) => SERVER_PROVIDER_LABELS[id]);
}

export interface UnifiedAiSettingsEntryCardProps {
  readonly source?: "studio" | "inference" | "account";
  readonly title?: string;
  readonly description?: string;
  readonly className?: string;
}

/** Compact status + one canonical entry point for embedded Studio surfaces. */
export function UnifiedAiSettingsEntryCard({
  source = "studio",
  title = "AI 연결과 사용 순서",
  description = "API 키, 무료 AI와 사용 순서는 통합 설정 한 곳에서 관리해요.",
  className = "",
}: UnifiedAiSettingsEntryCardProps) {
  const snapshot = useUserAi();
  const connections = snapshot.configuration.connections.filter((connection) => connection.enabled !== false);
  const configured = connections.filter(connectionIsReady).length;
  const routing = userAiRoutingSettings(snapshot.configuration);
  return (
    <section
      data-unified-ai-entry-card="true"
      className={`rounded-2xl border border-line bg-panel/70 p-4 text-fg ${className}`}
      aria-label={title}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
              <WandSparkles size={18} />
            </span>
            <div>
              <h3 className="font-bold">{title}</h3>
              <p className="mt-0.5 text-xs text-fg-3">
                {configured > 0
                  ? `내 AI ${configured}개 연결됨 · ${ROUTING_MODES.find((item) => item.id === routing.mode)?.title}`
                  : "개인 키 없이 자동 무료 AI부터 시작할 수 있어요"}
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-2">{description}</p>
        </div>
        <a
          href={`/settings/ai?source=${source}`}
          className={`${PRIMARY_BUTTON} shrink-0`}
        >
          AI 설정 열기 <ChevronRight size={16} aria-hidden />
        </a>
      </div>
    </section>
  );
}

export function UnifiedAiSettings() {
  const snapshot = useUserAi();
  const pool = useFreeAiPoolState();
  const configuration = snapshot.configuration;
  const routing = userAiRoutingSettings(configuration);
  const [view, setView] = useState<SettingsView>("start");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("choose");
  const [providerSearch, setProviderSearch] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<PresetId | null>(null);
  const [wizardLabel, setWizardLabel] = useState("");
  const [wizardBaseUrl, setWizardBaseUrl] = useState("");
  const [wizardApiKey, setWizardApiKey] = useState("");
  const [wizardModel, setWizardModel] = useState("");
  const [wizardCapability, setWizardCapability] = useState<UserAiCapability>("text");
  const [wizardConsent, setWizardConsent] = useState(false);
  const [showWizardSecret, setShowWizardSecret] = useState(false);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardError, setWizardError] = useState("");
  const [wizardResult, setWizardResult] = useState("");

  useEffect(() => {
    setWizardApiKey("");
    setShowWizardSecret(false);
  }, [snapshot.revision]);

  const connections = useMemo(() => orderedConnections(configuration), [configuration]);
  const readyConnections = useMemo(
    () => connections.filter((connection) => connection.enabled !== false && connectionIsReady(connection)),
    [connections],
  );
  const configuredPool = pool.mode === "ready" && pool.status.configured;
  const overallReady = configuredPool || readyConnections.length > 0;
  const hasPaidConnection = connections.some((connection) =>
    connection.enabled !== false && connection.costPolicy === "user-funded-byok",
  );

  const updateRouting = (patch: Partial<typeof routing>) => {
    setUserAiConfiguration({
      ...configuration,
      routing: { ...routing, ...patch },
    });
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardStep("choose");
    setProviderSearch("");
    setSelectedPresetId(null);
    setWizardLabel("");
    setWizardBaseUrl("");
    setWizardApiKey("");
    setWizardModel("");
    setWizardCapability("text");
    setWizardConsent(false);
    setShowWizardSecret(false);
    setWizardBusy(false);
    setWizardError("");
    setWizardResult("");
  };

  const openWizard = () => {
    closeWizard();
    setWizardOpen(true);
  };

  const selectPreset = (preset: FreeAiPreset) => {
    const base = connectionFromFreeAiPreset(preset);
    const capability: UserAiCapability = preset.imageModel ? "image" : "text";
    const needsWorkspaceUrl = preset.baseUrl.includes("YOUR_WORKSPACE_ID");
    setSelectedPresetId(preset.id);
    setWizardLabel(PRESET_DISPLAY[preset.id].name);
    setWizardBaseUrl(needsWorkspaceUrl || preset.id === "custom-cloud" ? "" : base.baseUrl);
    setWizardApiKey("");
    setWizardModel(base.imageModel || base.textModel);
    setWizardCapability(capability);
    setWizardConsent(false);
    setShowWizardSecret(false);
    setWizardError("");
    setWizardResult("");
    setWizardStep("credentials");
  };

  const saveWizardConnection = async () => {
    if (wizardBusy || !selectedPresetId) return;
    const startingRevision = getUserAiSnapshot().revision;
    setWizardBusy(true);
    setWizardError("");
    setWizardResult("");
    try {
      const preset = FREE_AI_PRESETS.find((item) => item.id === selectedPresetId);
      if (!preset) throw new Error("선택한 AI 서비스를 다시 선택해 주세요.");
      if (!wizardApiKey.trim()) throw new Error("API 키를 입력해 주세요.");
      if (!wizardModel.trim()) throw new Error("사용할 모델 이름을 입력해 주세요.");
      if (!wizardBaseUrl.trim()) throw new Error("공개 HTTPS API 주소를 입력해 주세요.");
      if (!wizardConsent) throw new Error("외부 전송과 비용 조건을 확인해 주세요.");

      const id = crypto.randomUUID();
      const apiKeyId = "key-1";
      const modelProfileId = "model-1";
      const connection: UserAiConnection = {
        ...structuredClone(EMPTY_AI_CONNECTION),
        ...connectionFromFreeAiPreset(preset),
        id,
        label: wizardLabel.trim() || PRESET_DISPLAY[preset.id].name,
        baseUrl: wizardBaseUrl.trim(),
        apiKey: wizardApiKey.trim(),
        textModel: wizardCapability === "text" ? wizardModel.trim() : "",
        imageModel: wizardCapability === "image" ? wizardModel.trim() : "",
        enabled: true,
        priority: Math.min(990, Math.max(10, (connections.length + 1) * 10)),
        apiKeys: [{
          id: apiKeyId,
          label: "기본 키",
          apiKey: wizardApiKey.trim(),
          enabled: true,
          priority: 10,
        }],
        models: [{
          id: modelProfileId,
          label: wizardModel.trim(),
          model: wizardModel.trim(),
          capability: wizardCapability,
          enabled: true,
          priority: 10,
        }],
      };
      const policyIssue = freeAiConnectionPolicyIssue(connection, wizardCapability);
      if (policyIssue) throw new Error(policyIssue);

      let verificationMessage = "연결 정보를 확인하고 안전하게 저장했어요.";
      if (wizardCapability === "text") {
        const route = resolvedUserAiRoutes(connection, "text")[0];
        if (route) {
          try {
            await userAiJson(
              "text",
              "/models",
              undefined,
              { connection: route, connectionId: connection.id, maxBytes: 1024 * 1024 },
            );
            verificationMessage = "API 키 확인까지 완료했어요.";
          } catch (error) {
            if (error instanceof UserAiTransportError && error.code === "authentication") {
              throw new Error("키를 확인해 주세요. 입력한 API 키로 인증할 수 없어요.", { cause: error });
            }
            if (isUserAiQuotaExhaustion(error)) {
              verificationMessage = "키는 저장했지만 현재 무료 사용량이 소진되어 있어요.";
            } else {
              verificationMessage = "키를 저장했어요. 공급자의 브라우저 연결 제한 때문에 자동 확인은 완료하지 못했어요.";
            }
          }
        }
      }

      if (getUserAiSnapshot().revision !== startingRevision) {
        throw new Error("연결 확인 중 AI 설정이 변경되었어요. 키를 다시 입력해 주세요.");
      }

      const assignments = { ...configuration.assignments };
      const routeAssignments = {
        text: configuration.routeAssignments?.text ?? null,
        image: configuration.routeAssignments?.image ?? null,
        inference: configuration.routeAssignments?.inference ?? null,
        "three-d": configuration.routeAssignments?.["three-d"] ?? null,
      };
      if (!assignments[wizardCapability]) {
        assignments[wizardCapability] = connection.id;
        routeAssignments[wizardCapability] = {
          connectionId: connection.id,
          apiKeyId,
          modelId: modelProfileId,
        };
      }
      setUserAiConfiguration({
        ...configuration,
        connections: [...configuration.connections, connection],
        assignments,
        routeAssignments,
      });
      setWizardApiKey("");
      setShowWizardSecret(false);
      setWizardResult(verificationMessage);
      setWizardStep("done");
    } catch (error) {
      setWizardError(error instanceof Error ? error.message : "AI 연결을 저장하지 못했어요.");
    } finally {
      setWizardBusy(false);
    }
  };

  const moveServerProvider = (id: UserAiServerProviderId, direction: -1 | 1) => {
    const order = [...routing.serverProviderOrder];
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    updateRouting({ serverProviderOrder: order });
  };

  const moveConnection = (id: string, direction: -1 | 1) => {
    const order = orderedConnections(configuration);
    const index = order.findIndex((connection) => connection.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    const priorities = new Map(order.map((connection, position) => [connection.id, (position + 1) * 10]));
    setUserAiConfiguration({
      ...configuration,
      connections: configuration.connections.map((connection) => ({
        ...connection,
        priority: priorities.get(connection.id) ?? connection.priority ?? 100,
      })),
    });
  };

  const presetResults = useMemo(() => {
    const query = providerSearch.trim().toLocaleLowerCase();
    const order = [...FREE_AI_PRESETS].sort((left, right) => {
      const leftRank = PRESET_DISPLAY[left.id].recommended ? 0 : left.id === "custom-cloud" ? 2 : 1;
      const rightRank = PRESET_DISPLAY[right.id].recommended ? 0 : right.id === "custom-cloud" ? 2 : 1;
      return leftRank - rightRank || PRESET_DISPLAY[left.id].name.localeCompare(PRESET_DISPLAY[right.id].name);
    });
    if (!query) return order;
    return order.filter((preset) => {
      const meta = PRESET_DISPLAY[preset.id];
      return `${meta.name} ${meta.description} ${preset.label}`.toLocaleLowerCase().includes(query);
    });
  }, [providerSearch]);

  const selectedPreset = selectedPresetId
    ? FREE_AI_PRESETS.find((preset) => preset.id === selectedPresetId) ?? null
    : null;
  const selectedMeta = selectedPreset ? PRESET_DISPLAY[selectedPreset.id] : null;
  const showEndpointField = selectedPreset?.id === "custom-cloud"
    || Boolean(selectedPreset?.baseUrl.includes("YOUR_WORKSPACE_ID"));
  const showModelField = selectedPreset?.id === "custom-cloud"
    || !selectedPreset?.textModel
    || !selectedPreset?.imageModel && wizardCapability === "image";

  return (
    <section
      data-unified-ai-settings="true"
      className="space-y-6 text-fg"
      aria-label="통합 AI 설정"
    >
      <header className="overflow-hidden rounded-3xl border border-line bg-panel/70">
        <div className="relative p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full bg-accent/10 blur-3xl" aria-hidden />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow flex items-center gap-2 text-accent">
                <Sparkles size={14} aria-hidden /> AI QUICK SETUP
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                {overallReady ? "AI를 사용할 준비가 되었어요" : "AI 연결을 시작해 볼까요?"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-fg-2">
                API 키 하나만 연결하면 나머지는 자동으로 설정해요. 모델과 경로 같은 기술 설정은 필요할 때만 열 수 있어요.
              </p>
            </div>
            <div className="grid min-w-[260px] grid-cols-2 gap-2 rounded-2xl border border-line bg-card/60 p-3">
              <div className="rounded-xl bg-panel p-3">
                <span className="text-xs text-fg-3">내 AI 연결</span>
                <strong className="mt-1 block text-xl">{readyConnections.length}개</strong>
              </div>
              <div className="rounded-xl bg-panel p-3">
                <span className="text-xs text-fg-3">사용 방식</span>
                <strong className="mt-1 block text-sm">{ROUTING_MODES.find((item) => item.id === routing.mode)?.title}</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-line" aria-label="AI 설정 메뉴" role="tablist">
          <SettingsTab active={view === "start"} icon={<WandSparkles size={16} />} label="시작하기" onClick={() => setView("start")} />
          <SettingsTab active={view === "order"} icon={<Zap size={16} />} label="AI 사용 순서" onClick={() => setView("order")} />
          <SettingsTab active={view === "advanced"} icon={<Settings2 size={16} />} label="고급 설정" onClick={() => setView("advanced")} />
        </div>
      </header>

      {snapshot.notice && (
        <p className="rounded-xl border border-line bg-panel/50 px-4 py-3 text-xs leading-5 text-fg-2" role="status">
          {snapshot.notice}
        </p>
      )}

      {view === "start" && (
        <div className="space-y-6">
          <section aria-labelledby="my-ai-connections-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="my-ai-connections-title" className="text-lg font-bold">내 AI 연결</h3>
                <p className="mt-1 text-sm text-fg-2">한 번 연결하면 ToonStudio의 글·이미지·영상·3D 기능에서 함께 사용해요.</p>
              </div>
              {!wizardOpen && (
                <button type="button" className={PRIMARY_BUTTON} onClick={openWizard}>
                  <KeyRound size={16} aria-hidden /> AI 연결하기
                </button>
              )}
            </div>

            {wizardOpen ? (
              <ConnectionWizard
                step={wizardStep}
                providerSearch={providerSearch}
                presetResults={presetResults}
                selectedPreset={selectedPreset}
                selectedMeta={selectedMeta}
                label={wizardLabel}
                baseUrl={wizardBaseUrl}
                apiKey={wizardApiKey}
                model={wizardModel}
                capability={wizardCapability}
                consent={wizardConsent}
                showSecret={showWizardSecret}
                busy={wizardBusy}
                error={wizardError}
                result={wizardResult}
                showEndpointField={showEndpointField}
                showModelField={showModelField}
                onClose={closeWizard}
                onSearchChange={setProviderSearch}
                onSelectPreset={selectPreset}
                onBack={() => {
                  setWizardStep("choose");
                  setWizardError("");
                  setWizardApiKey("");
                  setShowWizardSecret(false);
                }}
                onLabelChange={setWizardLabel}
                onBaseUrlChange={setWizardBaseUrl}
                onApiKeyChange={setWizardApiKey}
                onModelChange={setWizardModel}
                onCapabilityChange={(value) => {
                  setWizardCapability(value);
                  setWizardModel("");
                }}
                onConsentChange={setWizardConsent}
                onShowSecretChange={setShowWizardSecret}
                onSave={() => void saveWizardConnection()}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {connections.map((connection) => (
                  <ConnectionSummaryCard
                    key={connection.id}
                    connection={connection}
                    onManage={() => setView("advanced")}
                  />
                ))}
                {!connections.length && (
                  <div className="md:col-span-2 rounded-2xl border border-dashed border-line bg-panel/30 p-6 text-center">
                    <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent" aria-hidden>
                      <Cloud size={22} />
                    </span>
                    <h4 className="mt-3 font-bold">아직 연결한 개인 AI가 없어요</h4>
                    <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-fg-2">
                      로그인 상태에서는 자동 무료 AI를 먼저 사용할 수 있고, 내 API 키를 연결하면 선택 폭이 넓어져요.
                    </p>
                    <button type="button" className={`${PRIMARY_BUTTON} mt-4`} onClick={openWizard}>
                      첫 AI 연결하기
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <RoutingModeSection routingMode={routing.mode} onChange={(mode) => updateRouting({ mode })} />

          <section className="space-y-3 rounded-2xl border border-line bg-panel/50 p-4 sm:p-5" aria-labelledby="paid-ai-title">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warn/10 text-warn" aria-hidden>
                <WalletCards size={19} />
              </span>
              <div>
                <h3 id="paid-ai-title" className="font-bold">유료 AI 사용</h3>
                <p className="mt-1 text-sm leading-6 text-fg-2">예상하지 못한 비용이 생기지 않도록 기본값은 자동 사용 안 함이에요.</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="유료 AI 자동 사용">
              <label className={`cursor-pointer rounded-xl border p-3 ${!routing.allowPaidFallback ? "border-accent bg-accent/5" : "border-line"}`}>
                <span className="flex items-start gap-2">
                  <input type="radio" name="paid-ai-use" aria-label="자동으로 사용하지 않음" checked={!routing.allowPaidFallback} onChange={() => updateRouting({ allowPaidFallback: false })} className="mt-1" />
                  <span><strong className="block text-sm">자동으로 사용하지 않음</strong><span className="mt-1 block text-xs leading-5 text-fg-3">무료 경로가 끝나면 멈추고 알려줘요.</span></span>
                </span>
              </label>
              <label className={`rounded-xl border p-3 ${routing.allowPaidFallback ? "border-accent bg-accent/5" : "border-line"} ${hasPaidConnection ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                <span className="flex items-start gap-2">
                  <input type="radio" name="paid-ai-use" aria-label="무료 사용량 소진 후 내 유료 키 사용" disabled={!hasPaidConnection} checked={routing.allowPaidFallback} onChange={() => updateRouting({ allowPaidFallback: true })} className="mt-1" />
                  <span><strong className="block text-sm">무료 사용량 소진 후 내 유료 키 사용</strong><span className="mt-1 block text-xs leading-5 text-fg-3">내가 연결한 유료 BYOK 계정에 비용이 청구될 수 있어요.</span></span>
                </span>
              </label>
            </div>
            {!hasPaidConnection && <p className="text-xs text-fg-3">유료 사용이 가능한 내 AI 연결을 추가하면 두 번째 옵션을 선택할 수 있어요.</p>}
          </section>

          <section className="grid gap-3 sm:grid-cols-2" aria-label="AI 데이터와 보안 안내">
            <div className="rounded-2xl border border-line bg-panel/40 p-4">
              <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} className="text-good" aria-hidden /> 키 보관</div>
              <p className="mt-2 text-sm leading-6 text-fg-2">기본은 현재 문서 메모리 전용이며, 고급 설정에서 이 기기에 암호화 저장할 수 있어요.</p>
            </div>
            <div className="rounded-2xl border border-line bg-panel/40 p-4">
              <div className="flex items-center gap-2 font-semibold"><Cloud size={17} className="text-accent" aria-hidden /> 외부 전송</div>
              <p className="mt-2 text-sm leading-6 text-fg-2">AI를 실행할 때 프롬프트와 선택한 원고만 해당 공급자에 전송돼요. 결과 적용은 항상 사용자가 결정해요.</p>
            </div>
          </section>
        </div>
      )}

      {view === "order" && (
        <div className="space-y-6">
          <RoutingModeSection routingMode={routing.mode} onChange={(mode) => updateRouting({ mode })} />

          {routing.mode === "automatic" && (
            <section className="space-y-4 rounded-2xl border border-line bg-panel/50 p-5" aria-labelledby="automatic-order-title">
              <div>
                <h3 id="automatic-order-title" className="font-bold">현재 자동 선택 방식</h3>
                <p className="mt-1 text-sm leading-6 text-fg-2">무료 AI를 먼저 살펴보고, 명확한 한도 소진이나 키 오류일 때만 안전한 다음 경로로 이동해요.</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <OrderSummary title="자동 무료 AI" items={poolProviderOrder(pool, routing.serverProviderOrder)} empty="준비된 자동 무료 AI가 없어요" />
                <OrderSummary title="내 AI 연결" items={connections.filter((item) => item.enabled !== false).map((item) => item.label)} empty="연결된 개인 AI가 없어요" />
              </div>
              <p className="rounded-xl border border-line bg-card/60 px-3 py-2 text-xs leading-5 text-fg-3">
                네트워크 오류·시간 초과·서버 오류처럼 결과 생성 여부가 불확실한 경우에는 중복 생성과 중복 과금을 막기 위해 다른 AI로 자동 재전송하지 않아요.
              </p>
            </section>
          )}

          {routing.mode === "priority" && (
            <>
              <section className="space-y-3 rounded-2xl border border-line bg-panel/50 p-5" aria-labelledby="priority-group-title">
                <div>
                  <h3 id="priority-group-title" className="font-bold">어느 그룹을 먼저 사용할까요?</h3>
                  <p className="mt-1 text-sm text-fg-2">세부 숫자 대신 두 그룹의 앞뒤만 정하면 돼요.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="AI 그룹 사용 순서">
                  <SimpleChoice
                    name="priority-group"
                    checked={!readyConnections.length || (readyConnections[0]?.priority ?? 100) >= routing.managedPoolPriority}
                    title="자동 무료 AI 먼저"
                    description="공용 무료 경로를 먼저 사용하고 내 연결을 다음에 사용해요."
                    onChange={() => updateRouting({ managedPoolPriority: 1 })}
                  />
                  <SimpleChoice
                    name="priority-group"
                    checked={Boolean(readyConnections.length && (readyConnections[0]?.priority ?? 100) < routing.managedPoolPriority)}
                    title="내 AI 연결 먼저"
                    description="내가 등록한 무료·유료 연결을 먼저 사용해요."
                    onChange={() => updateRouting({ managedPoolPriority: 999 })}
                    disabled={!readyConnections.length}
                  />
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-line bg-panel/50 p-5" aria-labelledby="free-provider-order-title">
                <div>
                  <h3 id="free-provider-order-title" className="font-bold">자동 무료 AI 사용 순서</h3>
                  <p className="mt-1 text-sm text-fg-2">위에 있는 AI를 먼저 시도해요. 사용할 수 없는 공급자는 자동으로 건너뛰어요.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {routing.serverProviderOrder.map((id, index) => {
                    const status = pool.mode === "ready" ? pool.status.providers.find((item) => item.id === id) : undefined;
                    return (
                      <OrderRow
                        key={id}
                        index={index}
                        label={status?.label ?? SERVER_PROVIDER_LABELS[id]}
                        detail={status && !status.configured ? "현재 사용 준비 안 됨" : undefined}
                        first={index === 0}
                        last={index === routing.serverProviderOrder.length - 1}
                        onUp={() => moveServerProvider(id, -1)}
                        onDown={() => moveServerProvider(id, 1)}
                      />
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-line bg-panel/50 p-5" aria-labelledby="personal-provider-order-title">
                <div>
                  <h3 id="personal-provider-order-title" className="font-bold">내 AI 연결 사용 순서</h3>
                  <p className="mt-1 text-sm text-fg-2">첫 번째 연결이 안 되면 명확한 키·한도 오류일 때만 다음 연결을 사용해요.</p>
                </div>
                {connections.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {connections.map((connection, index) => (
                      <OrderRow
                        key={connection.id}
                        index={index}
                        label={connection.label}
                        detail={capabilityList(connection).map((item) => CAPABILITY_LABELS[item]).join(" · ")}
                        first={index === 0}
                        last={index === connections.length - 1}
                        onUp={() => moveConnection(connection.id, -1)}
                        onDown={() => moveConnection(connection.id, 1)}
                      />
                    ))}
                  </div>
                ) : <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-2">먼저 개인 AI를 연결해 주세요.</p>}
              </section>
            </>
          )}

          {routing.mode === "manual" && (
            <ManualRouteSettings configuration={configuration} />
          )}
        </div>
      )}

      {view === "advanced" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-warn/30 bg-warn/5 p-4">
            <div className="flex items-start gap-3">
              <CircleAlert size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
              <div>
                <h3 className="font-bold">전문가용 설정</h3>
                <p className="mt-1 text-sm leading-6 text-fg-2">여러 키·모델, 직접 API 주소, 세부 경로, 3D 런타임과 암호화 보관함을 관리해요. 일반적인 연결은 시작하기 화면을 권장해요.</p>
              </div>
            </div>
          </div>
          <Suspense fallback={<div className="rounded-2xl border border-line bg-panel/40 p-6 text-sm text-fg-2" role="status">고급 설정을 불러오는 중…</div>}>
            <UnifiedAiAdvancedSettings />
          </Suspense>
        </div>
      )}
    </section>
  );
}

function SettingsTab({
  active,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-label={label}
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex min-h-14 items-center justify-center gap-2 px-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-accent ${active ? "bg-accent/10 text-accent" : "text-fg-2 hover:bg-raised hover:text-fg"}`}
    >
      {icon}<span className="hidden sm:inline">{label}</span><span className="sm:hidden">{label.replace("AI ", "")}</span>
    </button>
  );
}

function ConnectionSummaryCard({
  connection,
  onManage,
}: {
  readonly connection: UserAiConnection;
  readonly onManage: () => void;
}) {
  const capabilities = capabilityList(connection);
  const ready = connection.enabled !== false && connectionIsReady(connection);
  return (
    <article className="rounded-2xl border border-line bg-panel/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`size-2 rounded-full ${ready ? "bg-good" : "bg-warn"}`} aria-hidden />
            <h4 className="truncate font-bold">{connection.label}</h4>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${connection.costPolicy === "user-funded-byok" ? "bg-warn/10 text-warn" : "bg-good/10 text-good"}`}>
              {connectionCostLabel(connection)}
            </span>
          </div>
          <p className="mt-2 text-sm text-fg-2">
            {capabilities.length ? capabilities.map((capability) => CAPABILITY_LABELS[capability]).join(" · ") : "사용 기능을 설정해 주세요"}
          </p>
          <p className="mt-1 text-xs text-fg-3">
            {ready ? "사용 가능" : connection.enabled === false ? "사용 안 함" : "키·모델 또는 비용 정책 확인 필요"}
          </p>
        </div>
        <button type="button" className={QUIET_BUTTON} onClick={onManage}>관리 <ChevronRight size={15} aria-hidden /></button>
      </div>
    </article>
  );
}

function RoutingModeSection({
  routingMode,
  onChange,
}: {
  readonly routingMode: UserAiRoutingMode;
  readonly onChange: (mode: UserAiRoutingMode) => void;
}) {
  return (
    <section className="space-y-3" aria-labelledby="ai-use-mode-title">
      <div>
        <h3 id="ai-use-mode-title" className="text-lg font-bold">AI 사용 방식</h3>
        <p className="mt-1 text-sm text-fg-2">잘 모르겠다면 자동 추천을 그대로 사용하세요.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="AI 사용 방식">
        {ROUTING_MODES.map((mode) => {
          const selected = routingMode === mode.id;
          return (
            <label key={mode.id} className={`relative cursor-pointer rounded-2xl border p-4 transition-colors ${selected ? "border-accent bg-accent/5" : "border-line bg-panel/40 hover:bg-panel"}`}>
              <span className="flex items-start gap-3">
                <input type="radio" name="ai-routing-mode" aria-label={mode.title} checked={selected} onChange={() => onChange(mode.id)} className="mt-1" />
                <span>
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{mode.title}</strong>
                    {mode.recommended && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">추천</span>}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-fg-3">{mode.description}</span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

interface ConnectionWizardProps {
  readonly step: WizardStep;
  readonly providerSearch: string;
  readonly presetResults: readonly FreeAiPreset[];
  readonly selectedPreset: FreeAiPreset | null;
  readonly selectedMeta: (typeof PRESET_DISPLAY)[PresetId] | null;
  readonly label: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly capability: UserAiCapability;
  readonly consent: boolean;
  readonly showSecret: boolean;
  readonly busy: boolean;
  readonly error: string;
  readonly result: string;
  readonly showEndpointField: boolean;
  readonly showModelField: boolean;
  readonly onClose: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onSelectPreset: (preset: FreeAiPreset) => void;
  readonly onBack: () => void;
  readonly onLabelChange: (value: string) => void;
  readonly onBaseUrlChange: (value: string) => void;
  readonly onApiKeyChange: (value: string) => void;
  readonly onModelChange: (value: string) => void;
  readonly onCapabilityChange: (value: UserAiCapability) => void;
  readonly onConsentChange: (value: boolean) => void;
  readonly onShowSecretChange: (value: boolean) => void;
  readonly onSave: () => void;
}

function ConnectionWizard(props: ConnectionWizardProps) {
  return (
    <section className="rounded-3xl border border-accent/30 bg-panel/80 p-4 shadow-sm sm:p-6" aria-labelledby="ai-connection-wizard-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-accent">{props.step === "choose" ? "1 / 2" : props.step === "credentials" ? "2 / 2" : "완료"}</p>
          <h4 id="ai-connection-wizard-title" className="mt-1 text-lg font-bold">
            {props.step === "choose" ? "어떤 AI를 연결할까요?" : props.step === "credentials" ? `${props.selectedMeta?.name ?? "AI"} 연결` : "AI가 연결되었어요"}
          </h4>
        </div>
        <button type="button" className="grid size-11 place-items-center rounded-xl text-fg-2 hover:bg-raised" aria-label="AI 연결 창 닫기" onClick={props.onClose}>
          <X size={18} />
        </button>
      </div>

      {props.step === "choose" && (
        <div className="mt-5 space-y-4">
          <label className="relative block">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden />
            <input className={`${INPUT} pl-10`} value={props.providerSearch} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="AI 서비스 검색" aria-label="AI 서비스 검색" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {props.presetResults.map((preset) => {
              const meta = PRESET_DISPLAY[preset.id];
              return (
                <button
                  key={preset.id}
                  type="button"
                  className="group min-h-32 rounded-2xl border border-line bg-card/60 p-4 text-left transition-colors hover:border-accent hover:bg-accent/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  onClick={() => props.onSelectPreset(preset)}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="grid size-10 place-items-center rounded-xl bg-accent/10 font-black text-accent" aria-hidden>{meta.name.slice(0, 1)}</span>
                    {meta.badge && <span className="rounded-full bg-raised px-2 py-1 text-[10px] font-bold text-fg-2">{meta.badge}</span>}
                  </span>
                  <strong className="mt-3 block text-sm">{meta.name}</strong>
                  <span className="mt-1 block text-xs leading-5 text-fg-3">{meta.description}</span>
                </button>
              );
            })}
          </div>
          {!props.presetResults.length && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-2">검색 결과가 없어요. 기타 AI 서비스를 선택해 직접 연결할 수 있어요.</p>}
        </div>
      )}

      {props.step === "credentials" && props.selectedPreset && (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-line bg-card/60 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 font-black text-accent" aria-hidden>{props.selectedMeta?.name.slice(0, 1)}</span>
              <div>
                <strong>{props.selectedMeta?.name}</strong>
                <p className="mt-1 text-xs leading-5 text-fg-3">{props.selectedMeta?.description}</p>
                {props.selectedPreset.docsUrl && (
                  <a href={props.selectedPreset.docsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-accent hover:underline">
                    API 키 만드는 방법 <ExternalLink size={12} aria-hidden />
                  </a>
                )}
              </div>
            </div>
          </div>

          {props.selectedPreset.id === "custom-cloud" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-semibold">연결 이름</span>
                <input className={INPUT} value={props.label} onChange={(event) => props.onLabelChange(event.target.value)} placeholder="예: 내 이미지 AI" />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-semibold">사용 기능</span>
                <select className={INPUT} value={props.capability} onChange={(event) => props.onCapabilityChange(event.target.value as UserAiCapability)}>
                  {USER_AI_CAPABILITIES.map((capability) => <option key={capability} value={capability}>{CAPABILITY_LABELS[capability]}</option>)}
                </select>
              </label>
            </div>
          )}

          {props.showEndpointField && (
            <label className="block space-y-1">
              <span className="text-sm font-semibold">공개 HTTPS API 주소</span>
              <input className={INPUT} type="url" value={props.baseUrl} onChange={(event) => props.onBaseUrlChange(event.target.value)} placeholder="https://api.example.com/v1" spellCheck={false} />
              <span className="block text-xs leading-5 text-fg-3">localhost와 사설망 주소는 보안을 위해 사용할 수 없어요.</span>
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-sm font-semibold">API Key</span>
            <span className="relative block">
              <input
                className={`${INPUT} pr-12`}
                type={props.showSecret ? "text" : "password"}
                value={props.apiKey}
                onChange={(event) => props.onApiKeyChange(event.target.value)}
                placeholder="발급받은 키를 붙여넣으세요"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="absolute right-0 top-0 grid size-11 place-items-center rounded-xl text-xs font-semibold text-fg-3 hover:bg-raised" onClick={() => props.onShowSecretChange(!props.showSecret)} aria-label={props.showSecret ? "API 키 숨기기" : "API 키 표시"}>
                {props.showSecret ? "숨김" : "보기"}
              </button>
            </span>
          </label>

          {props.showModelField ? (
            <label className="block space-y-1">
              <span className="text-sm font-semibold">사용할 모델</span>
              <input className={INPUT} value={props.model} onChange={(event) => props.onModelChange(event.target.value)} placeholder="공급자 콘솔에 표시된 모델 이름" spellCheck={false} />
              <span className="block text-xs leading-5 text-fg-3">무료로 사용할 모델 이름을 공급자 콘솔에서 확인해 주세요. 앱이 유료 모델을 임의로 고르지 않아요.</span>
            </label>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-line bg-card/60 px-3 py-3 text-sm">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-good" aria-hidden />
              <span><strong className="block">추천 모델 자동 설정</strong><span className="mt-1 block text-xs text-fg-3">이 서비스의 검토된 무료 모델 설정을 사용해요.</span></span>
            </div>
          )}

          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-line p-3 text-sm leading-6">
            <input type="checkbox" checked={props.consent} onChange={(event) => props.onConsentChange(event.target.checked)} className="mt-1.5" />
            <span>프롬프트와 선택한 작업물이 이 AI 서비스로 전송되며, 무료 한도 또는 내 공급자 계정의 비용 조건이 적용될 수 있음을 확인했어요.</span>
          </label>

          {props.error && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/5 p-3 text-sm text-bad">{props.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={QUIET_BUTTON} onClick={props.onBack} disabled={props.busy}>← 다른 AI 선택</button>
            <button type="button" className={PRIMARY_BUTTON} onClick={props.onSave} disabled={props.busy || !props.consent}>
              {props.busy ? "연결 확인 중…" : "연결하기"}
            </button>
          </div>
        </div>
      )}

      {props.step === "done" && (
        <div className="mt-6 rounded-2xl border border-good/30 bg-good/5 p-5 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-good/15 text-good" aria-hidden><Check size={23} /></span>
          <h5 className="mt-3 font-bold">{props.selectedMeta?.name} 연결 완료</h5>
          <p className="mt-2 text-sm leading-6 text-fg-2">{props.result}</p>
          <button type="button" className={`${PRIMARY_BUTTON} mt-4`} onClick={props.onClose}>완료</button>
        </div>
      )}
    </section>
  );
}

function SimpleChoice({
  name,
  checked,
  title,
  description,
  onChange,
  disabled = false,
}: {
  readonly name: string;
  readonly checked: boolean;
  readonly title: string;
  readonly description: string;
  readonly onChange: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <label className={`rounded-xl border p-3 ${checked ? "border-accent bg-accent/5" : "border-line"} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <span className="flex items-start gap-2">
        <input type="radio" name={name} aria-label={title} checked={checked} disabled={disabled} onChange={onChange} className="mt-1" />
        <span><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs leading-5 text-fg-3">{description}</span></span>
      </span>
    </label>
  );
}

function OrderSummary({
  title,
  items,
  empty,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly empty: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card/60 p-4">
      <h4 className="text-sm font-bold">{title}</h4>
      {items.length ? (
        <ol className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="flex items-center gap-2 text-sm text-fg-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-bold text-fg-3">{index + 1}</span>
              <span className="truncate">{item}</span>
            </li>
          ))}
        </ol>
      ) : <p className="mt-3 text-sm text-fg-3">{empty}</p>}
    </div>
  );
}

function OrderRow({
  index,
  label,
  detail,
  first,
  last,
  onUp,
  onDown,
}: {
  readonly index: number;
  readonly label: string;
  readonly detail?: string;
  readonly first: boolean;
  readonly last: boolean;
  readonly onUp: () => void;
  readonly onDown: () => void;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-card/60 p-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-raised text-xs font-bold text-fg-3">{index + 1}</span>
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{label}</strong>{detail && <span className="mt-0.5 block truncate text-xs text-fg-3">{detail}</span>}</span>
      <span className="flex shrink-0 gap-1">
        <button type="button" className="grid size-11 place-items-center rounded-xl border border-line text-fg-2 hover:bg-raised disabled:opacity-30" disabled={first} onClick={onUp} aria-label={`${label} 위로`}><ArrowUp size={15} /></button>
        <button type="button" className="grid size-11 place-items-center rounded-xl border border-line text-fg-2 hover:bg-raised disabled:opacity-30" disabled={last} onClick={onDown} aria-label={`${label} 아래로`}><ArrowDown size={15} /></button>
      </span>
    </div>
  );
}

function ManualRouteSettings({ configuration }: { readonly configuration: UserAiConfiguration }) {
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-panel/50 p-5" aria-labelledby="manual-route-title">
      <div>
        <h3 id="manual-route-title" className="font-bold">기능마다 사용할 AI 고정</h3>
        <p className="mt-1 text-sm leading-6 text-fg-2">선택한 AI·키·모델만 사용해요. 실패해도 다른 경로로 자동 전환하지 않아요.</p>
      </div>
      <div className="space-y-4">
        {USER_AI_CAPABILITIES.map((capability) => (
          <ManualCapabilityRoute key={capability} capability={capability} configuration={configuration} />
        ))}
      </div>
    </section>
  );
}

function ManualCapabilityRoute({
  capability,
  configuration,
}: {
  readonly capability: UserAiCapability;
  readonly configuration: UserAiConfiguration;
}) {
  const connectionId = configuration.routeAssignments?.[capability]?.connectionId
    ?? configuration.assignments[capability]
    ?? "";
  const connection = configuration.connections.find((item) => item.id === connectionId);
  const keys = connection ? userAiConnectionApiKeys(connection) : [];
  const models = connection ? userAiConnectionModels(connection, capability) : [];
  const assignment = configuration.routeAssignments?.[capability];
  const candidates = configuration.connections.filter((item) =>
    item.enabled !== false && userAiConnectionModels(item, capability).length > 0,
  );

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
    <fieldset className="rounded-2xl border border-line bg-card/60 p-4">
      <legend className="px-1 text-sm font-bold">{CAPABILITY_LABELS[capability]}</legend>
      <div className="mt-2 grid gap-3 lg:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-fg-2">AI 서비스</span>
          <select className={INPUT} value={connectionId} onChange={(event) => {
            const next = configuration.connections.find((item) => item.id === event.target.value);
            const nextKey = next ? userAiConnectionApiKeys(next)[0] : undefined;
            const nextModel = next ? userAiConnectionModels(next, capability)[0] : undefined;
            setAssignment(next && nextKey && nextModel ? { connectionId: next.id, apiKeyId: nextKey.id, modelId: nextModel.id } : null);
          }}>
            <option value="">사용하지 않음</option>
            {candidates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-fg-2">키</span>
          <select className={INPUT} disabled={!connection} value={assignment?.apiKeyId ?? keys[0]?.id ?? ""} onChange={(event) => connection && setAssignment({ connectionId: connection.id, apiKeyId: event.target.value || null, modelId: assignment?.modelId ?? models[0]?.id ?? null })}>
            {keys.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-fg-2">모델</span>
          <select className={INPUT} disabled={!connection} value={assignment?.modelId ?? models[0]?.id ?? ""} onChange={(event) => connection && setAssignment({ connectionId: connection.id, apiKeyId: assignment?.apiKeyId ?? keys[0]?.id ?? null, modelId: event.target.value || null })}>
            {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
