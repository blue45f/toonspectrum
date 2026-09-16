export const USER_AI_COST_POLICIES = [
  "unverified",
  "local-zero-cost",
  "self-hosted-zero-cost",
  "provider-free-tier",
  "openrouter-free",
] as const;

export type UserAiCostPolicy = (typeof USER_AI_COST_POLICIES)[number];
export type FreeAiCapability = "text" | "image" | "inference" | "three-d";

export interface FreeAiConnectionLike {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  costPolicy: UserAiCostPolicy;
}

export interface FreeAiPreset {
  id: "local-openai" | "ollama" | "openrouter-free" | "groq-free" | "gemini-free" | "qwen-beijing-free" | "sambanova-free" | "zai-free" | "mistral-free" | "siliconflow-free";
  label: string;
  description: string;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  costPolicy: Exclude<UserAiCostPolicy, "unverified" | "self-hosted-zero-cost">;
  requiresApiKey: boolean;
  docsUrl?: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Exact OpenAI-compatible base paths reviewed on 2026-09-15. */
const PROVIDER_FREE_TIER_ENDPOINTS: Readonly<Record<string, string>> = Object.freeze({
  "api.groq.com": "/openai/v1",
  "generativelanguage.googleapis.com": "/v1beta/openai",
  "api.sambanova.ai": "/v1",
  "api.mistral.ai": "/v1",
  "api.z.ai": "/api/paas/v4",
  "api.siliconflow.cn": "/v1",
});

/** Public managed APIs cannot be re-labelled as a user-operated zero-cost server. */
const KNOWN_PUBLIC_AI_PROVIDER_HOSTS = new Set([
  ...Object.keys(PROVIDER_FREE_TIER_ENDPOINTS),
  "api.anthropic.com",
  "api.cerebras.ai",
  "api.cohere.com",
  "api.deepgram.com",
  "api.deepseek.com",
  "api.fireworks.ai",
  "api.openai.com",
  "api.replicate.com",
  "api.sambanova.ai",
  "api.together.xyz",
  "api.voyageai.com",
  "api.z.ai",
  "api.siliconflow.cn",
  "openrouter.ai",
  "router.huggingface.co",
]);

export const FREE_AI_PRESETS: readonly FreeAiPreset[] = Object.freeze([
  {
    id: "local-openai",
    label: "내 컴퓨터 로컬 AI",
    description: "MLX·LiteLLM·Rapid-MLX 등 OpenAI 호환 로컬 서버. API 키와 토큰 요금이 필요 없습니다.",
    baseUrl: "http://localhost:8082/v1",
    textModel: "",
    imageModel: "",
    costPolicy: "local-zero-cost",
    requiresApiKey: false,
  },
  {
    id: "ollama",
    label: "Ollama 로컬 AI",
    description: "Ollama의 OpenAI 호환 API를 현재 기기에서 직접 사용합니다.",
    baseUrl: "http://localhost:11434/v1",
    textModel: "",
    imageModel: "",
    costPolicy: "local-zero-cost",
    requiresApiKey: false,
    docsUrl: "https://docs.ollama.com/api/openai-compatibility",
  },
  {
    id: "openrouter-free",
    label: "OpenRouter 무료 모델 라우터",
    description: "모델을 openrouter/free로 고정해 토큰 가격이 0인 텍스트 라우트만 사용합니다.",
    baseUrl: "https://openrouter.ai/api/v1",
    textModel: "openrouter/free",
    imageModel: "",
    costPolicy: "openrouter-free",
    requiresApiKey: true,
    docsUrl: "https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground",
  },
  {
    id: "groq-free",
    label: "Groq 무료 플랜",
    description: "본인 Groq 키를 사용합니다. 결제수단이 없는 무료 플랜 계정인지 먼저 확인해야 합니다.",
    baseUrl: "https://api.groq.com/openai/v1",
    textModel: "",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://console.groq.com/docs/openai",
  },
  {
    id: "gemini-free",
    label: "Gemini 무료 티어",
    description: "본인 Google AI Studio 키를 사용합니다. 무료 티어 프로젝트이며 유료 결제가 비활성화됐는지 확인해야 합니다.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    textModel: "",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
  },
  {
    id: "qwen-beijing-free",
    label: "Qwen 베이징 무료 할당량",
    description: "Alibaba Model Studio 베이징 워크스페이스에서 Free Quota Only를 켠 본인 키만 사용합니다. 90일 무료 할당량 소진 시 중단됩니다.",
    baseUrl: "https://YOUR_WORKSPACE_ID.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    textModel: "qwen3.7-plus",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://help.aliyun.com/en/model-studio/new-free-quota",
  },
  {
    id: "sambanova-free",
    label: "SambaNova 무카드 Free Tier",
    description: "결제수단이 연결되지 않은 Free Tier 계정의 본인 키만 사용합니다. 모델별 무료 일일 한도에서 중단됩니다.",
    baseUrl: "https://api.sambanova.ai/v1",
    textModel: "DeepSeek-V3.1",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://docs.sambanova.ai/docs/en/models/rate-limits",
  },
  {
    id: "zai-free",
    label: "Z.AI 무료 Flash",
    description: "가격표가 무료인 GLM-4.7-Flash 또는 GLM-4.5-Flash만 허용합니다. 유료 웹 검색·이미지·영상 도구는 사용하지 않습니다.",
    baseUrl: "https://api.z.ai/api/paas/v4",
    textModel: "glm-4.7-flash",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://docs.z.ai/guides/overview/pricing",
  },
  {
    id: "mistral-free",
    label: "Mistral 무료 모드",
    description: "카드 없는 Free mode 조직에서 만든 본인 키만 사용합니다. Pay-as-you-go가 비활성화됐는지 확인하세요.",
    baseUrl: "https://api.mistral.ai/v1",
    textModel: "",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key",
  },
  {
    id: "siliconflow-free",
    label: "SiliconFlow 무료 텍스트",
    description: "중국 리전 가격표에서 입력·출력이 무료인 THUDM/GLM-Z1-9B-0414만 허용합니다.",
    baseUrl: "https://api.siliconflow.cn/v1",
    textModel: "THUDM/GLM-Z1-9B-0414",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://siliconflow.cn/pricing",
  },
]);

export const USER_AI_COST_POLICY_LABELS: Readonly<Record<UserAiCostPolicy, string>> = Object.freeze({
  unverified: "무료 여부 재확인 필요",
  "local-zero-cost": "내 기기 로컬 실행",
  "self-hosted-zero-cost": "직접 운영하는 무과금 서버",
  "provider-free-tier": "결제 비활성 무료 티어",
  "openrouter-free": "OpenRouter 무료 모델 전용",
});

function parsedUrl(value: string): URL | null {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function normalizedApiPath(url: URL): string {
  return url.pathname.replace(/\/+$/u, "") || "/";
}

function unsafeManagedUrlPart(url: URL): boolean {
  return Boolean(
    url.username
    || url.password
    || url.search
    || url.hash
    || url.port,
  );
}

function capabilityModelIssue(
  connection: FreeAiConnectionLike,
  capability: FreeAiCapability | undefined,
): string | null {
  if (capability === "text" && !connection.textModel.trim()) {
    return "이 연결에 사용할 텍스트 모델 ID를 입력하세요.";
  }
  if (capability === "image" && !connection.imageModel.trim()) {
    return "이 연결에 사용할 이미지 모델 ID를 입력하세요.";
  }
  return null;
}

export function isLoopbackAiUrl(value: string): boolean {
  const url = parsedUrl(value);
  return Boolean(url && LOOPBACK_HOSTS.has(url.hostname));
}

export function isOpenRouterFreeModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized === "openrouter/free" || normalized.endsWith(":free");
}

export function inferLegacyUserAiCostPolicy(
  connection: Pick<FreeAiConnectionLike, "baseUrl" | "textModel" | "imageModel">,
): UserAiCostPolicy {
  if (isLoopbackAiUrl(connection.baseUrl)) return "local-zero-cost";
  const url = parsedUrl(connection.baseUrl);
  if (
    url?.protocol === "https:"
    && !unsafeManagedUrlPart(url)
    && url.hostname === "openrouter.ai"
    && normalizedApiPath(url) === "/api/v1"
    && isOpenRouterFreeModel(connection.textModel)
    && !connection.imageModel.trim()
  ) {
    return "openrouter-free";
  }
  return "unverified";
}

const QWEN_FREE_MODELS = new Set([
  "qwen3.8-max",
  "qwen3.8-max-0902",
  "qwen3.8-flash",
  "qwen3.7-max",
  "qwen3.7-max-2026-06-08",
  "qwen3.7-max-2026-05-20",
  "qwen3.7-max-preview",
  "qwen3.7-plus",
  "qwen3.7-plus-2026-05-26",
  "qwen3.6-plus",
  "qwen3.6-plus-2026-04-02",
  "qwen3.7-flash",
  "qwen3.7-flash-2026-07-15",
  "qwen3.6-flash",
  "qwen3.6-flash-2026-04-16",
  "qwen-turbo",
]);
const ZAI_FREE_MODELS = new Set(["glm-4.7-flash", "glm-4.5-flash"]);
const SILICONFLOW_FREE_MODELS = new Set(["thudm/glm-z1-9b-0414"]);

function qwenBeijingWorkspaceHost(hostname: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{5,127}\.cn-beijing\.maas\.aliyuncs\.com$/iu.test(hostname);
}

function reviewedProviderModelIssue(url: URL, model: string): string | null {
  const normalized = model.trim().toLowerCase();
  if (qwenBeijingWorkspaceHost(url.hostname) && !QWEN_FREE_MODELS.has(normalized)) {
    return "Qwen 개인 연결은 베이징 무료 할당량이 확인된 허용 모델만 사용할 수 있습니다.";
  }
  if (url.hostname === "api.z.ai" && !ZAI_FREE_MODELS.has(normalized)) {
    return "Z.AI 개인 연결은 GLM-4.7-Flash 또는 GLM-4.5-Flash만 사용할 수 있습니다.";
  }
  if (url.hostname === "api.siliconflow.cn" && !SILICONFLOW_FREE_MODELS.has(normalized)) {
    return "SiliconFlow 개인 연결은 가격표상 무료인 THUDM/GLM-Z1-9B-0414만 사용할 수 있습니다.";
  }
  return null;
}

export function freeAiConnectionPolicyIssue(
  connection: FreeAiConnectionLike,
  capability?: FreeAiCapability,
): string | null {
  const url = parsedUrl(connection.baseUrl);
  if (!url) return "AI 제공자 주소를 확인하세요.";

  if (connection.costPolicy === "unverified") {
    return "이 연결은 무료 전용 정책을 아직 확인하지 않았습니다. 무료 프리셋을 다시 선택하거나 비용 정책을 확인하세요.";
  }

  if (connection.costPolicy === "local-zero-cost") {
    if (!LOOPBACK_HOSTS.has(url.hostname)) {
      return "로컬 무과금 연결은 localhost 또는 루프백 주소만 사용할 수 있습니다.";
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) {
      return "로컬 AI 주소는 인증정보·쿼리·조각이 없는 HTTP 또는 HTTPS 주소여야 합니다.";
    }
    return capabilityModelIssue(connection, capability);
  }

  if (connection.costPolicy === "self-hosted-zero-cost") {
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      return "원격 개인 서버는 인증정보·쿼리·조각이 없는 HTTPS 주소만 사용할 수 있습니다.";
    }
    if (KNOWN_PUBLIC_AI_PROVIDER_HOSTS.has(url.hostname) || qwenBeijingWorkspaceHost(url.hostname)) {
      return "공개 AI 제공자 주소를 직접 운영하는 무과금 서버로 등록할 수 없습니다. 해당 무료 프리셋을 사용하세요.";
    }
    if (!connection.apiKey.trim()) {
      return "원격 개인 서버에는 본인 인증 토큰이 필요합니다.";
    }
    return capabilityModelIssue(connection, capability);
  }

  if (connection.costPolicy === "openrouter-free") {
    if (
      url.protocol !== "https:"
      || unsafeManagedUrlPart(url)
      || url.hostname !== "openrouter.ai"
      || normalizedApiPath(url) !== "/api/v1"
    ) {
      return "OpenRouter 무료 정책은 공식 https://openrouter.ai/api/v1 주소에서만 사용할 수 있습니다.";
    }
    if (!connection.apiKey.trim()) {
      return "OpenRouter 무료 연결에는 본인 API 키가 필요합니다.";
    }
    if (capability && capability !== "text") {
      return "OpenRouter 무료 라우터 연결은 현재 텍스트 기능에만 배정할 수 있습니다.";
    }
    if (connection.imageModel.trim()) {
      return "OpenRouter 무료 라우터 연결에는 이미지 모델을 등록하지 않습니다.";
    }
    if (connection.textModel.trim() && !isOpenRouterFreeModel(connection.textModel)) {
      return "OpenRouter 모델은 openrouter/free 또는 :free 접미사가 있는 모델만 사용할 수 있습니다.";
    }
    return capabilityModelIssue(connection, capability);
  }

  const requiredPath = qwenBeijingWorkspaceHost(url.hostname)
    ? "/compatible-mode/v1"
    : PROVIDER_FREE_TIER_ENDPOINTS[url.hostname];
  if (
    url.protocol !== "https:"
    || unsafeManagedUrlPart(url)
    || requiredPath === undefined
    || normalizedApiPath(url) !== requiredPath
  ) {
    return "무료 티어 정책은 검토된 외부 제공자의 공식 OpenAI 호환 API 주소에서만 사용할 수 있습니다.";
  }
  if (!connection.apiKey.trim()) {
    return "원격 무료 티어 연결에는 본인 API 키가 필요합니다.";
  }
  if (capability && capability !== "text") {
    return "외부 자동 무료 풀은 현재 실시간 텍스트 기능만 지원합니다.";
  }
  if (connection.imageModel.trim()) {
    return "외부 자동 무료 풀 연결에는 이미지 모델을 등록하지 않습니다.";
  }
  const modelIssue = reviewedProviderModelIssue(url, connection.textModel);
  if (modelIssue) return modelIssue;
  return capabilityModelIssue(connection, capability);
}

export function assertFreeAiConnection(
  connection: FreeAiConnectionLike,
  capability?: FreeAiCapability,
): void {
  const issue = freeAiConnectionPolicyIssue(connection, capability);
  if (issue) throw new Error(issue);
}

export function connectionFromFreeAiPreset(
  preset: FreeAiPreset,
): Omit<FreeAiConnectionLike, "apiKey"> & { apiKey: string } {
  return {
    baseUrl: preset.baseUrl,
    apiKey: "",
    textModel: preset.textModel,
    imageModel: preset.imageModel,
    costPolicy: preset.costPolicy,
  };
}
