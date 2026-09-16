import { useSyncExternalStore } from "react";

import { decryptUserAiVault, encryptUserAiVault } from "./user-ai-crypto";
import { freeAiConnectionPolicyIssue } from "./free-ai-policy";
import {
  EMPTY_AI_CONFIGURATION,
  EMPTY_AI_CONNECTION,
  normalizeUserAiConfiguration,
  resolvedUserAiRoutes,
  userAiConnectionApiKeys,
  userAiConnectionModels,
  userAiRoutingSettings,
  USER_AI_LOCK_KEY,
  USER_AI_VAULT_KEY,
  type UserAiCapability,
  type UserAiConfiguration,
  type UserAiConnection,
  type UserAiResolvedConnection,
} from "./user-ai-types";

interface AiSnapshot {
  configuration: UserAiConfiguration;
  revision: number;
  persisted: boolean;
  notice: string;
}

let snapshot: AiSnapshot = {
  configuration: structuredClone(EMPTY_AI_CONFIGURATION),
  revision: 0,
  persisted: false,
  notice: "클라우드 API 키는 현재 브라우저 문서의 메모리에만 보관됩니다.",
};
const listeners = new Set<() => void>();
const activeRequests = new Set<AbortController>();

function publish(
  configuration: UserAiConfiguration,
  notice: string,
  persisted = snapshot.persisted,
) {
  for (const controller of activeRequests) controller.abort();
  activeRequests.clear();
  snapshot = {
    configuration,
    revision: snapshot.revision + 1,
    notice,
    persisted,
  };
  for (const listener of listeners) listener();
}

function storage(): Storage {
  return globalThis.localStorage;
}

export const getUserAiSnapshot = () => snapshot;

export function subscribeUserAi(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUserAi() {
  return useSyncExternalStore(
    subscribeUserAi,
    getUserAiSnapshot,
    getUserAiSnapshot,
  );
}

export function setUserAiConfiguration(configuration: UserAiConfiguration) {
  publish(
    normalizeUserAiConfiguration(configuration),
    "클라우드 AI 라우팅을 메모리에 적용했습니다. 암호화 저장 전에는 디스크에 키를 기록하지 않습니다.",
    false,
  );
}

function connectionQualityRank(connection: UserAiConnection): number {
  let host: string;
  try {
    host = new URL(connection.baseUrl).hostname.toLowerCase();
  } catch {
    return 10_000;
  }
  if (host === "generativelanguage.googleapis.com") return 10;
  if (host.endsWith(".cn-beijing.maas.aliyuncs.com")) return 20;
  if (host === "api.groq.com") return 30;
  if (host === "api.cerebras.ai") return 35;
  if (host === "api.sambanova.ai") return 40;
  if (host === "api.z.ai") return 50;
  if (host === "api.mistral.ai") return 60;
  if (host === "router.huggingface.co") return 65;
  if (host === "openrouter.ai") return 70;
  if (host === "api.siliconflow.cn") return 80;
  return 100;
}

function routePriority(route: UserAiResolvedConnection): number {
  const connectionPriority = route.priority ?? 100;
  const keyPriority = userAiConnectionApiKeys(route)
    .find((item) => item.id === route.apiKeyProfileId)?.priority ?? 100;
  const modelPriority = userAiConnectionModels(route)
    .find((item) => item.id === route.modelProfileId)?.priority ?? 100;
  return connectionPriority * 1_000_000 + modelPriority * 1_000 + keyPriority;
}

function assignedRoute(
  configuration: UserAiConfiguration,
  capability: UserAiCapability,
): UserAiResolvedConnection | null {
  const assignment = configuration.routeAssignments?.[capability];
  const connectionId = assignment?.connectionId ?? configuration.assignments[capability];
  if (!connectionId) return null;
  const connection = configuration.connections.find((item) => item.id === connectionId);
  if (!connection) return null;
  const candidates = resolvedUserAiRoutes(connection, capability);
  return candidates.find((route) => (
    (!assignment?.apiKeyId || route.apiKeyProfileId === assignment.apiKeyId)
    && (!assignment?.modelId || route.modelProfileId === assignment.modelId)
  )) ?? candidates[0] ?? null;
}

function validRoutes(
  configuration: UserAiConfiguration,
  capability: UserAiCapability,
): UserAiResolvedConnection[] {
  return configuration.connections
    .flatMap((connection) => resolvedUserAiRoutes(connection, capability))
    .filter((route) => freeAiConnectionPolicyIssue(route, capability) === null);
}

/** Returns cloud routes in the selected automatic, priority, or manual order. */
export function userAiConnectionsForCapability(
  capability: UserAiCapability,
): UserAiResolvedConnection[] {
  const configuration = snapshot.configuration;
  const routing = userAiRoutingSettings(configuration);
  const assigned = assignedRoute(configuration, capability);
  if (routing.mode === "manual") return assigned ? [assigned] : [];
  return validRoutes(configuration, capability).sort((left, right) => {
    if (routing.mode === "automatic") {
      const quality = connectionQualityRank(left) - connectionQualityRank(right);
      if (quality) return quality;
    }
    const priority = routePriority(left) - routePriority(right);
    if (priority) return priority;
    if (left.routeId === assigned?.routeId) return -1;
    if (right.routeId === assigned?.routeId) return 1;
    return left.routeId.localeCompare(right.routeId);
  });
}

export function userAiConnection(
  capability: UserAiCapability,
): UserAiResolvedConnection | null {
  return userAiConnectionsForCapability(capability)[0] ?? null;
}

/**
 * Automatic personal-cloud fallback. Free routes are always eligible; explicitly billed BYOK
 * routes join the chain only after the user enables paid fallback. Manual mode uses one exact route.
 */
export function userAiAutomaticExternalConnectionsForCapability(
  capability: UserAiCapability,
): UserAiResolvedConnection[] {
  const configuration = snapshot.configuration;
  const routing = userAiRoutingSettings(configuration);
  return userAiConnectionsForCapability(capability).filter((connection) => (
    connection.costPolicy === "provider-free-tier"
    || connection.costPolicy === "openrouter-free"
    || (connection.costPolicy === "user-funded-byok" && (
      routing.allowPaidFallback || routing.mode === "manual"
    ))
  ));
}

export function requireUserAiConnection(
  capability: UserAiCapability,
): UserAiResolvedConnection {
  const connection = userAiConnection(capability);
  if (!connection) {
    throw new Error("통합 AI 설정에서 사용할 클라우드 공급자·API 키·모델 경로를 구성하세요.");
  }
  return connection;
}

export function userAiLegacySettings(configuration = snapshot.configuration) {
  const previous = snapshot.configuration;
  if (configuration !== previous) {
    const normalized = normalizeUserAiConfiguration(configuration);
    const capability = normalized.assignments.image ? "image" : "text";
    const connectionId = normalized.assignments[capability];
    const connection = normalized.connections.find((item) => item.id === connectionId);
    return connection
      ? resolvedUserAiRoutes(connection, capability)[0] ?? { ...EMPTY_AI_CONNECTION }
      : { ...EMPTY_AI_CONNECTION };
  }
  return userAiConnection("image")
    ?? userAiConnection("text")
    ?? { ...EMPTY_AI_CONNECTION };
}

export function lockUserAi(broadcast = true) {
  publish(
    structuredClone(EMPTY_AI_CONFIGURATION),
    "클라우드 AI 보관함을 잠그고 진행 중인 요청을 취소했습니다. 요청은 자동 재전송하지 않습니다.",
  );
  if (broadcast) {
    try {
      storage().setItem(USER_AI_LOCK_KEY, crypto.randomUUID());
    } catch {
      // Memory lock remains effective.
    }
  }
}

export function hasPersistedUserAiVault(): boolean {
  try {
    return Boolean(storage().getItem(USER_AI_VAULT_KEY));
  } catch {
    return false;
  }
}

export async function persistUserAiVault(passphrase: string) {
  const revision = snapshot.revision;
  const configuration = snapshot.configuration;
  const ciphertext = await encryptUserAiVault(configuration, passphrase);
  if (revision !== snapshot.revision) {
    throw new Error("암호화 중 설정이 변경되었습니다. 다시 저장하세요.");
  }
  storage().setItem(USER_AI_VAULT_KEY, ciphertext);
  publish(
    configuration,
    "이 기기에 암호화 저장했습니다. 비밀번호는 저장하지 않으며 새 탭에서는 직접 잠금 해제해야 합니다.",
    true,
  );
}

export async function unlockUserAiVault(passphrase: string) {
  const revision = snapshot.revision;
  const ciphertext = storage().getItem(USER_AI_VAULT_KEY);
  if (!ciphertext) throw new Error("이 기기에 저장된 보관함이 없습니다.");
  const configuration = await decryptUserAiVault(ciphertext, passphrase);
  if (
    revision !== snapshot.revision
    || storage().getItem(USER_AI_VAULT_KEY) !== ciphertext
  ) {
    throw new Error("잠금 해제 중 설정이 변경되었습니다. 다시 시도하세요.");
  }
  publish(
    configuration,
    "보관함 잠금을 해제했습니다. 키는 현재 문서의 메모리에서만 사용됩니다.",
    true,
  );
}

export function deleteUserAiVault() {
  storage().removeItem(USER_AI_VAULT_KEY);
  lockUserAi();
  publish(
    structuredClone(EMPTY_AI_CONFIGURATION),
    "이 기기의 보관함을 삭제했습니다. 공급자 측 키 폐기는 공급자 콘솔에서 진행하세요.",
    false,
  );
}

export function registerUserAiRequest(controller: AbortController): () => void {
  activeRequests.add(controller);
  return () => {
    activeRequests.delete(controller);
  };
}

/** Migration is explicit: local and private-network endpoints are rejected instead of retained. */
export function migrateLegacyUserAi(): boolean {
  if (snapshot.configuration.connections.length) {
    throw new Error("기존 통합 연결을 자동 덮어쓰지 않습니다. 연결을 먼저 보관하세요.");
  }
  const key = "toonspectrum-studio-ai-settings";
  const sources = [globalThis.sessionStorage, storage()];
  const raw = sources.map((source) => source.getItem(key)).find(Boolean);
  if (!raw) return false;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("기존 AI 설정을 확인할 수 없습니다.");
  }
  const configuration = normalizeUserAiConfiguration({
    version: 1,
    connections: [{
      ...EMPTY_AI_CONNECTION,
      ...parsed,
      id: "migrated",
      label: "기존 클라우드 Studio 연결",
      costPolicy: "unverified",
      apiKeys: undefined,
      models: undefined,
    }],
    assignments: {
      text: "migrated",
      image: "migrated",
      inference: null,
      "three-d": null,
    },
  });
  publish(
    configuration,
    "이전 클라우드 설정을 메모리로 가져왔습니다. 비용 정책을 확인하기 전에는 요청하지 않습니다.",
    false,
  );
  for (const source of sources) source.removeItem(key);
  publish(
    configuration,
    "기존 평문 설정을 제거했습니다. 클라우드 비용 정책과 모델 우선순위를 다시 확인하세요.",
    false,
  );
  return true;
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("storage", (event: StorageEvent) => {
    if (
      event.key === USER_AI_LOCK_KEY
      || event.key === USER_AI_VAULT_KEY
      || event.key === null
    ) {
      lockUserAi(false);
    }
  });
  globalThis.addEventListener("pagehide", () => lockUserAi(false));
  globalThis.addEventListener("toonspectrum:session-ended", () => lockUserAi());
}
