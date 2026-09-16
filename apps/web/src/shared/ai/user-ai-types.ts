import {
  inferLegacyUserAiCostPolicy,
  USER_AI_COST_POLICIES,
  type UserAiCostPolicy,
} from "./free-ai-policy";

export type { UserAiCostPolicy } from "./free-ai-policy";

/** Cloud AI capabilities share one vault and one deterministic routing policy. */
export type UserAiCapability = "text" | "image" | "inference" | "three-d";
export type UserAiRoutingMode = "automatic" | "priority" | "manual";
export type UserAiServerProviderId =
  | "gemini"
  | "qwen"
  | "groq"
  | "sambanova"
  | "zai"
  | "mistral"
  | "cloudflare"
  | "openrouter"
  | "siliconflow";

export const USER_AI_SERVER_PROVIDER_IDS: readonly UserAiServerProviderId[] = Object.freeze([
  "gemini",
  "qwen",
  "groq",
  "sambanova",
  "zai",
  "mistral",
  "cloudflare",
  "openrouter",
  "siliconflow",
]);

export interface UserAiApiKeyProfile {
  id: string;
  label: string;
  apiKey: string;
  enabled: boolean;
  priority: number;
}

export interface UserAiModelProfile {
  id: string;
  label: string;
  model: string;
  capability: UserAiCapability;
  enabled: boolean;
  priority: number;
}

export interface UserAiRouteAssignment {
  connectionId: string;
  apiKeyId: string | null;
  modelId: string | null;
}

export interface UserAiRoutingSettings {
  mode: UserAiRoutingMode;
  allowPaidFallback: boolean;
  managedPoolPriority: number;
  serverProviderOrder: UserAiServerProviderId[];
}

export interface UserAiConnection {
  id: string;
  label: string;
  baseUrl: string;
  /** Compatibility projection of the highest-priority enabled key. */
  apiKey: string;
  /** Compatibility projection of the highest-priority enabled text model. */
  textModel: string;
  /** Compatibility projection of the highest-priority enabled image model. */
  imageModel: string;
  imageGenerationPath: string;
  imageEditPath: string;
  chatCompletionsPath: string;
  costPolicy: UserAiCostPolicy;
  enabled?: boolean;
  priority?: number;
  apiKeys?: UserAiApiKeyProfile[];
  models?: UserAiModelProfile[];
}

export interface UserAiResolvedConnection extends UserAiConnection {
  apiKeyProfileId: string;
  modelProfileId: string;
  routeId: string;
}

export interface UserAiConfiguration {
  version: 1;
  connections: UserAiConnection[];
  assignments: Record<UserAiCapability, string | null>;
  routeAssignments?: Record<UserAiCapability, UserAiRouteAssignment | null>;
  routing?: UserAiRoutingSettings;
}

export const USER_AI_SETTINGS_HREF = "/settings/ai";
export const USER_AI_VAULT_KEY = "toonstudio:user-ai:encrypted:v1";
export const USER_AI_LOCK_KEY = "toonstudio:user-ai:lock:v1";
export const USER_AI_CAPABILITIES: readonly UserAiCapability[] = ["text", "image", "inference", "three-d"];

export const DEFAULT_USER_AI_ROUTING: UserAiRoutingSettings = Object.freeze({
  mode: "automatic",
  allowPaidFallback: false,
  managedPoolPriority: 50,
  serverProviderOrder: [...USER_AI_SERVER_PROVIDER_IDS],
});

const EMPTY_ASSIGNMENTS: Record<UserAiCapability, null> = {
  text: null,
  image: null,
  inference: null,
  "three-d": null,
};

export const EMPTY_AI_CONFIGURATION: UserAiConfiguration = {
  version: 1,
  connections: [],
  assignments: { ...EMPTY_ASSIGNMENTS },
  routeAssignments: { ...EMPTY_ASSIGNMENTS },
  routing: { ...DEFAULT_USER_AI_ROUTING, serverProviderOrder: [...USER_AI_SERVER_PROVIDER_IDS] },
};

export const EMPTY_AI_CONNECTION: UserAiConnection = {
  id: "",
  label: "새 클라우드 AI 연결",
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "",
  textModel: "openrouter/free",
  imageModel: "",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
  costPolicy: "openrouter-free",
  enabled: true,
  priority: 100,
  apiKeys: [{ id: "key-1", label: "기본 키", apiKey: "", enabled: true, priority: 100 }],
  models: [{
    id: "text-1",
    label: "OpenRouter 무료 자동",
    model: "openrouter/free",
    capability: "text",
    enabled: true,
    priority: 100,
  }],
};

function privateIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)) return false;
  const octets = hostname.split(".").map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

export function isPrivateOrLocalAiHostname(value: string): boolean {
  const hostname = value.trim().toLowerCase().replace(/^\[|\]$/gu, "");
  if (!hostname) return true;
  if (
    hostname === "localhost"
    || hostname === "0.0.0.0"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".lan")
    || hostname.endsWith(".internal")
  ) {
    return true;
  }
  if (privateIpv4(hostname)) return true;
  if (!hostname.includes(":")) return false;
  return hostname === "::"
    || hostname === "::1"
    || hostname.startsWith("fc")
    || hostname.startsWith("fd")
    || /^fe[89ab]/u.test(hostname)
    || hostname.startsWith("::ffff:0:")
    || hostname.startsWith("::ffff:10.")
    || hostname.startsWith("::ffff:127.")
    || hostname.startsWith("::ffff:169.254.")
    || hostname.startsWith("::ffff:172.")
    || hostname.startsWith("::ffff:192.168.");
}

export function validateUserAiBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || isPrivateOrLocalAiHostname(url.hostname)
    || /(?:^|\.)toonstudio\.cloud$/u.test(url.hostname)
    || (typeof location !== "undefined" && url.origin === location.origin)
  ) {
    throw new Error("공개 HTTPS 클라우드 AI 주소를 입력하세요. localhost·사설망·사이트 자체 주소는 사용할 수 없습니다.");
  }
  return url.href.replace(/\/+$/u, "");
}

export function validateUserAiPath(path: string): string {
  if (
    !/^\/[A-Za-z0-9_./-]+$/u.test(path)
    || path.includes("//")
    || path.split("/").some((part) => part === "." || part === "..")
    || path.length > 160
  ) {
    throw new Error("API 경로는 /로 시작하는 상대 경로여야 합니다.");
  }
  return path;
}

function integerPriority(value: unknown, fallback = 100): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 999
    ? value
    : fallback;
}

function cleanId(value: unknown, message: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,80}$/u.test(value)) {
    throw new Error(message);
  }
  return value;
}

function cleanText(value: unknown, maximum: number, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) {
    throw new Error(message);
  }
  return value.trim();
}

function cleanSecret(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096) {
    throw new Error("AI API 키 형식을 확인하세요.");
  }
  const secret = value.trim();
  const hasControl = Array.from(secret).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!secret || hasControl) throw new Error("각 클라우드 연결에는 유효한 API 키가 필요합니다.");
  return secret;
}

function normalizedCostPolicy(
  source: Record<string, unknown>,
  connection: Pick<UserAiConnection, "baseUrl" | "textModel" | "imageModel">,
): UserAiCostPolicy {
  const value = source.costPolicy;
  if (typeof value === "string" && USER_AI_COST_POLICIES.includes(value as UserAiCostPolicy)) {
    return value as UserAiCostPolicy;
  }
  return inferLegacyUserAiCostPolicy(connection);
}

function normalizeApiKeys(source: Record<string, unknown>): UserAiApiKeyProfile[] {
  const raw = Array.isArray(source.apiKeys)
    ? source.apiKeys
    : typeof source.apiKey === "string" && source.apiKey.trim()
      ? [{ id: "key-1", label: "기본 키", apiKey: source.apiKey, enabled: true, priority: 100 }]
      : [];
  if (raw.length === 0 || raw.length > 12) {
    throw new Error("클라우드 연결마다 1~12개의 API 키를 등록하세요.");
  }
  const result = raw.map((item, index): UserAiApiKeyProfile => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("API 키 프로필 형식을 확인하세요.");
    }
    const value = item as Record<string, unknown>;
    return {
      id: cleanId(value.id ?? `key-${index + 1}`, "API 키 프로필 ID를 확인하세요."),
      label: cleanText(value.label ?? `키 ${index + 1}`, 120, "API 키 프로필 이름을 확인하세요."),
      apiKey: cleanSecret(value.apiKey),
      enabled: value.enabled !== false,
      priority: integerPriority(value.priority, (index + 1) * 100),
    };
  });
  if (new Set(result.map((item) => item.id)).size !== result.length) {
    throw new Error("중복된 API 키 프로필 ID입니다.");
  }
  if (!result.some((item) => item.enabled)) throw new Error("활성 API 키가 하나 이상 필요합니다.");
  return result;
}

function normalizeModels(source: Record<string, unknown>): UserAiModelProfile[] {
  const legacy: UserAiModelProfile[] = [];
  if (typeof source.textModel === "string" && source.textModel.trim()) {
    legacy.push({ id: "text-1", label: source.textModel.trim(), model: source.textModel.trim(), capability: "text", enabled: true, priority: 100 });
  }
  if (typeof source.imageModel === "string" && source.imageModel.trim()) {
    legacy.push({ id: "image-1", label: source.imageModel.trim(), model: source.imageModel.trim(), capability: "image", enabled: true, priority: 100 });
  }
  const raw = Array.isArray(source.models) ? source.models : legacy;
  if (raw.length === 0 || raw.length > 32) {
    throw new Error("클라우드 연결마다 1~32개의 모델을 등록하세요.");
  }
  const result = raw.map((item, index): UserAiModelProfile => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("AI 모델 프로필 형식을 확인하세요.");
    }
    const value = item as Record<string, unknown>;
    const capability = value.capability;
    if (!USER_AI_CAPABILITIES.includes(capability as UserAiCapability)) {
      throw new Error("AI 모델의 기능 유형을 확인하세요.");
    }
    const model = cleanText(value.model, 300, "AI 모델 ID를 확인하세요.");
    return {
      id: cleanId(value.id ?? `model-${index + 1}`, "AI 모델 프로필 ID를 확인하세요."),
      label: cleanText(value.label ?? model, 120, "AI 모델 프로필 이름을 확인하세요."),
      model,
      capability: capability as UserAiCapability,
      enabled: value.enabled !== false,
      priority: integerPriority(value.priority, (index + 1) * 100),
    };
  });
  if (new Set(result.map((item) => item.id)).size !== result.length) {
    throw new Error("중복된 AI 모델 프로필 ID입니다.");
  }
  if (!result.some((item) => item.enabled)) throw new Error("활성 AI 모델이 하나 이상 필요합니다.");
  return result;
}

function sortByPriority<T extends { priority: number; id: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

export function userAiConnectionApiKeys(connection: UserAiConnection): UserAiApiKeyProfile[] {
  if (connection.apiKeys?.length) return sortByPriority(connection.apiKeys.filter((item) => item.enabled));
  return connection.apiKey.trim()
    ? [{ id: "key-1", label: "기본 키", apiKey: connection.apiKey, enabled: true, priority: 100 }]
    : [];
}

export function userAiConnectionModels(
  connection: UserAiConnection,
  capability?: UserAiCapability,
): UserAiModelProfile[] {
  const profiles = connection.models?.length
    ? connection.models
    : [
        ...(connection.textModel.trim() ? [{ id: "text-1", label: connection.textModel, model: connection.textModel, capability: "text" as const, enabled: true, priority: 100 }] : []),
        ...(connection.imageModel.trim() ? [{ id: "image-1", label: connection.imageModel, model: connection.imageModel, capability: "image" as const, enabled: true, priority: 100 }] : []),
      ];
  return sortByPriority(profiles.filter((item) => item.enabled && (!capability || item.capability === capability)));
}

export function resolvedUserAiRoutes(
  connection: UserAiConnection,
  capability: UserAiCapability,
): UserAiResolvedConnection[] {
  if (connection.enabled === false) return [];
  const keys = userAiConnectionApiKeys(connection);
  const models = userAiConnectionModels(connection, capability);
  const routes: UserAiResolvedConnection[] = [];
  for (const model of models) {
    for (const key of keys) {
      routes.push({
        ...connection,
        apiKey: key.apiKey,
        textModel: capability === "text" ? model.model : connection.textModel,
        imageModel: capability === "image" ? model.model : connection.imageModel,
        apiKeyProfileId: key.id,
        modelProfileId: model.id,
        routeId: `${connection.id}:${model.id}:${key.id}`,
      });
      if (routes.length >= 64) return routes;
    }
  }
  return routes;
}

function normalizeRouting(value: unknown): UserAiRoutingSettings {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const mode = source.mode === "priority" || source.mode === "manual" ? source.mode : "automatic";
  const requestedOrder = Array.isArray(source.serverProviderOrder)
    ? source.serverProviderOrder.filter((item): item is UserAiServerProviderId =>
        typeof item === "string" && USER_AI_SERVER_PROVIDER_IDS.includes(item as UserAiServerProviderId))
    : [];
  return {
    mode,
    allowPaidFallback: source.allowPaidFallback === true,
    managedPoolPriority: integerPriority(source.managedPoolPriority, 50),
    serverProviderOrder: [...new Set([...requestedOrder, ...USER_AI_SERVER_PROVIDER_IDS])],
  };
}

export function userAiRoutingSettings(configuration: UserAiConfiguration): UserAiRoutingSettings {
  return normalizeRouting(configuration.routing);
}

function normalizeRouteAssignments(
  value: unknown,
  connections: readonly UserAiConnection[],
  assignments: Record<UserAiCapability, string | null>,
): Record<UserAiCapability, UserAiRouteAssignment | null> {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const result = { ...EMPTY_ASSIGNMENTS } as Record<UserAiCapability, UserAiRouteAssignment | null>;
  for (const capability of USER_AI_CAPABILITIES) {
    const raw = source[capability];
    const legacyConnectionId = assignments[capability];
    const candidate = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : legacyConnectionId
        ? { connectionId: legacyConnectionId, apiKeyId: null, modelId: null }
        : null;
    if (!candidate) continue;
    const connectionId = typeof candidate.connectionId === "string" ? candidate.connectionId : "";
    const connection = connections.find((item) => item.id === connectionId);
    if (!connection) throw new Error("AI 기능의 연결 대상을 확인하세요.");
    const keys = userAiConnectionApiKeys(connection);
    const models = userAiConnectionModels(connection, capability);
    const apiKeyId = typeof candidate.apiKeyId === "string" ? candidate.apiKeyId : null;
    const modelId = typeof candidate.modelId === "string" ? candidate.modelId : null;
    if (apiKeyId && !keys.some((item) => item.id === apiKeyId)) throw new Error("AI 기능의 API 키 대상을 확인하세요.");
    if (modelId && !models.some((item) => item.id === modelId)) throw new Error("AI 기능의 모델 대상을 확인하세요.");
    result[capability] = { connectionId, apiKeyId, modelId };
  }
  return result;
}

export function normalizeUserAiConfiguration(value: unknown): UserAiConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI 설정 형식이 올바르지 않습니다.");
  }
  const raw = value as Record<string, unknown>;
  if (
    raw.version !== 1
    || !Array.isArray(raw.connections)
    || raw.connections.length > 24
    || !raw.assignments
    || typeof raw.assignments !== "object"
  ) {
    throw new Error("AI 설정 버전을 확인하세요.");
  }
  const connections = raw.connections.map((item): UserAiConnection => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("잘못된 AI 연결입니다.");
    const source = item as Record<string, unknown>;
    const id = cleanId(source.id, "AI 연결 ID를 확인하세요.");
    const label = cleanText(source.label, 300, "AI 연결 이름을 확인하세요.");
    const baseUrl = validateUserAiBaseUrl(cleanText(source.baseUrl, 300, "AI 제공자 주소를 확인하세요."));
    const apiKeys = normalizeApiKeys(source);
    const models = normalizeModels(source);
    const firstKey = sortByPriority(apiKeys.filter((entry) => entry.enabled))[0];
    const firstText = sortByPriority(models.filter((entry) => entry.enabled && entry.capability === "text"))[0];
    const firstImage = sortByPriority(models.filter((entry) => entry.enabled && entry.capability === "image"))[0];
    const compatibility = {
      baseUrl,
      textModel: firstText?.model ?? "",
      imageModel: firstImage?.model ?? "",
    };
    return {
      id,
      label,
      baseUrl,
      apiKey: firstKey?.apiKey ?? "",
      textModel: compatibility.textModel,
      imageModel: compatibility.imageModel,
      imageGenerationPath: validateUserAiPath(cleanText(source.imageGenerationPath, 160, "이미지 생성 경로를 확인하세요.")),
      imageEditPath: validateUserAiPath(cleanText(source.imageEditPath, 160, "이미지 편집 경로를 확인하세요.")),
      chatCompletionsPath: validateUserAiPath(cleanText(source.chatCompletionsPath, 160, "텍스트 요청 경로를 확인하세요.")),
      costPolicy: normalizedCostPolicy(source, compatibility),
      enabled: source.enabled !== false,
      priority: integerPriority(source.priority, 100),
      apiKeys,
      models,
    };
  });
  if (new Set(connections.map((item) => item.id)).size !== connections.length) {
    throw new Error("중복된 AI 연결 ID입니다.");
  }
  const sourceAssignments = raw.assignments as Record<string, unknown>;
  const assignments = { ...EMPTY_ASSIGNMENTS } as Record<UserAiCapability, string | null>;
  for (const capability of USER_AI_CAPABILITIES) {
    const id = sourceAssignments[capability] ?? null;
    if (id !== null && (typeof id !== "string" || !connections.some((item) => item.id === id))) {
      throw new Error("AI 기능의 연결 대상을 확인하세요.");
    }
    assignments[capability] = id as string | null;
  }
  return {
    version: 1,
    connections,
    assignments,
    routeAssignments: normalizeRouteAssignments(raw.routeAssignments, connections, assignments),
    routing: normalizeRouting(raw.routing),
  };
}
