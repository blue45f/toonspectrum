export const USER_AI_COST_POLICIES = [
  "unverified",
  "provider-free-tier",
  "openrouter-free",
  "user-funded-byok",
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
  id:
    | "openrouter-free"
    | "groq-free"
    | "gemini-free"
    | "qwen-beijing-free"
    | "sambanova-free"
    | "zai-free"
    | "mistral-free"
    | "siliconflow-free"
    | "huggingface-free"
    | "cerebras-free"
    | "custom-cloud";
  label: string;
  description: string;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  costPolicy: Exclude<UserAiCostPolicy, "unverified">;
  requiresApiKey: true;
  docsUrl?: string;
}

/** Exact OpenAI-compatible base paths reviewed on 2026-09-16. */
const PROVIDER_FREE_TIER_ENDPOINTS: Readonly<Record<string, string>> = Object.freeze({
  "api.groq.com": "/openai/v1",
  "generativelanguage.googleapis.com": "/v1beta/openai",
  "api.sambanova.ai": "/v1",
  "api.mistral.ai": "/v1",
  "api.z.ai": "/api/paas/v4",
  "api.siliconflow.cn": "/v1",
  "router.huggingface.co": "/v1",
  "api.cerebras.ai": "/v1",
});

export const FREE_AI_PRESETS: readonly FreeAiPreset[] = Object.freeze([
  {
    id: "openrouter-free",
    label: "OpenRouter 무료 모델 라우터",
    description: "openrouter/free 또는 :free 모델만 사용합니다. 하나의 키로 여러 무료 모델을 구성할 수 있습니다.",
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
    description: "본인 Groq 키를 사용합니다. 결제수단이 없는 무료 플랜인지 공급자 콘솔에서 확인하세요.",
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
    description: "Google AI Studio 무료 티어 프로젝트의 키를 사용합니다. 유료 결제 연결 여부를 확인하세요.",
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
    description: "Alibaba Model Studio 베이징 워크스페이스의 Free Quota Only 키를 사용합니다.",
    baseUrl: "https://YOUR_WORKSPACE_ID.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    textModel: "qwen3.7-plus",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://help.aliyun.com/en/model-studio/new-free-quota",
  },
  {
    id: "sambanova-free",
    label: "SambaNova Free Tier",
    description: "결제수단이 없는 Free Tier 계정의 키를 사용하며 모델별 무료 한도에서 중단합니다.",
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
    description: "가격표상 무료인 GLM Flash 모델만 자동 무료 경로에서 허용합니다.",
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
    description: "카드 없는 Free mode 조직의 키를 사용합니다. Pay-as-you-go를 비활성화하세요.",
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
    description: "가격표상 무료 모델만 자동 무료 경로에서 허용합니다.",
    baseUrl: "https://api.siliconflow.cn/v1",
    textModel: "THUDM/GLM-Z1-9B-0414",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://siliconflow.cn/pricing",
  },
  {
    id: "huggingface-free",
    label: "Hugging Face Inference Providers",
    description: "Hugging Face 계정의 월 무료 추론 크레딧을 사용합니다. 크레딧 소진 시 자동 유료 전환하지 않습니다.",
    baseUrl: "https://router.huggingface.co/v1",
    textModel: "",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://huggingface.co/docs/inference-providers/index",
  },
  {
    id: "cerebras-free",
    label: "Cerebras 무료 개발자 티어",
    description: "Cerebras Cloud의 무료 개발자 한도에서 OpenAI 호환 API를 사용합니다.",
    baseUrl: "https://api.cerebras.ai/v1",
    textModel: "",
    imageModel: "",
    costPolicy: "provider-free-tier",
    requiresApiKey: true,
    docsUrl: "https://inference-docs.cerebras.ai/api-reference",
  },
  {
    id: "custom-cloud",
    label: "기타 관리형 클라우드 API",
    description: "공개 HTTPS API의 본인 키를 사용합니다. 호출 비용은 공급자 계정에 청구될 수 있습니다.",
    baseUrl: "https://api.example.com/v1",
    textModel: "",
    imageModel: "",
    costPolicy: "user-funded-byok",
    requiresApiKey: true,
  },
]);

export const USER_AI_COST_POLICY_LABELS: Readonly<Record<UserAiCostPolicy, string>> = Object.freeze({
  unverified: "비용 정책 재확인 필요",
  "provider-free-tier": "공급자 무료 티어",
  "openrouter-free": "OpenRouter 무료 모델 전용",
  "user-funded-byok": "사용자 결제 BYOK",
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

function privateOrLocalHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/gu, "");
  if (
    hostname === "localhost"
    || hostname === "0.0.0.0"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".lan")
    || hostname.endsWith(".internal")
    || hostname === "::1"
    || hostname === "::"
    || hostname.startsWith("fc")
    || hostname.startsWith("fd")
    || /^fe[89ab]/u.test(hostname)
  ) {
    return true;
  }
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)) return false;
  const [a, b] = hostname.split(".").map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224;
}

function unsafeCloudUrl(url: URL): boolean {
  return Boolean(
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || privateOrLocalHostname(url.hostname),
  );
}

function capabilityModelIssue(
  connection: FreeAiConnectionLike,
  capability: FreeAiCapability | undefined,
): string | null {
  if (capability === "text" && !connection.textModel.trim()) {
    return "이 경로에 사용할 텍스트 모델 ID를 입력하세요.";
  }
  if (capability === "image" && !connection.imageModel.trim()) {
    return "이 경로에 사용할 이미지 모델 ID를 입력하세요.";
  }
  return null;
}

export function isLoopbackAiUrl(value: string): boolean {
  const url = parsedUrl(value);
  return Boolean(url && privateOrLocalHostname(url.hostname));
}

export function isOpenRouterFreeModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized === "openrouter/free" || normalized.endsWith(":free");
}

export function inferLegacyUserAiCostPolicy(
  connection: Pick<FreeAiConnectionLike, "baseUrl" | "textModel" | "imageModel">,
): UserAiCostPolicy {
  const url = parsedUrl(connection.baseUrl);
  if (
    url
    && !unsafeCloudUrl(url)
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
    return "Qwen 무료 경로는 베이징 무료 할당량이 확인된 모델만 사용할 수 있습니다.";
  }
  if (url.hostname === "api.z.ai" && !ZAI_FREE_MODELS.has(normalized)) {
    return "Z.AI 무료 경로는 GLM-4.7-Flash 또는 GLM-4.5-Flash만 사용할 수 있습니다.";
  }
  if (url.hostname === "api.siliconflow.cn" && !SILICONFLOW_FREE_MODELS.has(normalized)) {
    return "SiliconFlow 무료 경로는 가격표상 무료인 THUDM/GLM-Z1-9B-0414만 사용할 수 있습니다.";
  }
  return null;
}

export function freeAiConnectionPolicyIssue(
  connection: FreeAiConnectionLike,
  capability?: FreeAiCapability,
): string | null {
  const url = parsedUrl(connection.baseUrl);
  if (!url || unsafeCloudUrl(url)) {
    return "공개 HTTPS 클라우드 AI 주소를 입력하세요. localhost와 사설망 주소는 사용할 수 없습니다.";
  }
  if (connection.costPolicy === "unverified") {
    return "이 연결의 비용 정책을 확인하세요. 무료 티어 또는 사용자 결제 BYOK를 명시해야 합니다.";
  }
  if (!connection.apiKey.trim()) {
    return "클라우드 AI 연결에는 본인 API 키가 필요합니다.";
  }
  if (connection.costPolicy === "user-funded-byok") {
    return capabilityModelIssue(connection, capability);
  }
  if (connection.costPolicy === "openrouter-free") {
    if (url.hostname !== "openrouter.ai" || normalizedApiPath(url) !== "/api/v1") {
      return "OpenRouter 무료 정책은 공식 https://openrouter.ai/api/v1 주소에서만 사용할 수 있습니다.";
    }
    if (capability && capability !== "text") {
      return "OpenRouter 무료 라우터는 현재 텍스트 기능에만 배정할 수 있습니다.";
    }
    if (connection.imageModel.trim()) {
      return "OpenRouter 무료 라우터 연결에는 이미지 모델을 등록하지 않습니다.";
    }
    if (connection.textModel.trim() && !isOpenRouterFreeModel(connection.textModel)) {
      return "OpenRouter 무료 모델은 openrouter/free 또는 :free 접미사를 사용해야 합니다.";
    }
    return capabilityModelIssue(connection, capability);
  }

  const requiredPath = qwenBeijingWorkspaceHost(url.hostname)
    ? "/compatible-mode/v1"
    : PROVIDER_FREE_TIER_ENDPOINTS[url.hostname];
  if (requiredPath === undefined || normalizedApiPath(url) !== requiredPath || url.port) {
    return "무료 티어 정책은 검토된 공급자의 공식 OpenAI 호환 API 주소에서만 사용할 수 있습니다.";
  }
  if (capability && capability !== "text") {
    return "검토된 자동 무료 경로는 현재 텍스트 기능만 지원합니다. 이미지·영상·3D는 명시적 BYOK 경로를 사용하세요.";
  }
  if (connection.imageModel.trim()) {
    return "자동 무료 텍스트 연결에는 이미지 모델을 등록하지 않습니다.";
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
