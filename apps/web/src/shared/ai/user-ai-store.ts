import { useSyncExternalStore } from "react";

import { decryptUserAiVault, encryptUserAiVault } from "./user-ai-crypto";
import { freeAiConnectionPolicyIssue } from "./free-ai-policy";
import {
  EMPTY_AI_CONFIGURATION,
  EMPTY_AI_CONNECTION,
  normalizeUserAiConfiguration,
  USER_AI_LOCK_KEY,
  USER_AI_VAULT_KEY,
  type UserAiCapability,
  type UserAiConfiguration,
  type UserAiConnection,
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
  notice: "API 키는 현재 브라우저 문서의 메모리에만 보관됩니다.",
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
    "무료 전용 연결을 메모리에 적용했습니다. 암호화 저장 전에는 디스크에 키를 기록하지 않습니다.",
    false,
  );
}

export function userAiConnection(
  capability: UserAiCapability,
): UserAiConnection | null {
  const id = snapshot.configuration.assignments[capability];
  return snapshot.configuration.connections.find((item) => item.id === id) ?? null;
}

function connectionQualityRank(connection: UserAiConnection): number {
  let host: string;
  try {
    host = new URL(connection.baseUrl).hostname.toLowerCase();
  } catch {
    return 10_000;
  }
  if (host === "generativelanguage.googleapis.com") return 10;
  if (host === "api.groq.com") return 20;
  if (host === "api.sambanova.ai") return 30;
  if (host === "api.mistral.ai") return 40;
  if (host === "openrouter.ai") return 50;
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) return 60;
  return connection.costPolicy === "self-hosted-zero-cost" ? 70 : 100;
}

/**
 * Returns every valid free connection in deterministic quality order. The explicit
 * capability assignment remains first; the remaining connections provide quota-only fallback.
 */
export function userAiConnectionsForCapability(
  capability: UserAiCapability,
): UserAiConnection[] {
  const assigned = snapshot.configuration.assignments[capability];
  return snapshot.configuration.connections
    .filter((connection) => freeAiConnectionPolicyIssue(connection, capability) === null)
    .sort((left, right) => {
      if (left.id === assigned && right.id !== assigned) return -1;
      if (right.id === assigned && left.id !== assigned) return 1;
      const rank = connectionQualityRank(left) - connectionQualityRank(right);
      return rank || left.id.localeCompare(right.id);
    });
}

export function requireUserAiConnection(
  capability: UserAiCapability,
): UserAiConnection {
  const connection = userAiConnection(capability);
  if (!connection) {
    throw new Error("통합 AI 설정에서 무료 연결과 기능 연결을 선택하세요. 운영측 AI나 유료 모델로 대체하지 않습니다.");
  }
  return connection;
}

export function userAiLegacySettings(configuration = snapshot.configuration) {
  return configuration.connections.find(
    (item) => item.id === configuration.assignments.text,
  ) ?? configuration.connections.find(
    (item) => item.id === configuration.assignments.image,
  ) ?? { ...EMPTY_AI_CONNECTION };
}

export function lockUserAi(broadcast = true) {
  publish(
    structuredClone(EMPTY_AI_CONFIGURATION),
    "보관함을 잠그고 진행 중인 요청을 취소했습니다. 앱은 요청을 자동 재전송하지 않습니다.",
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
    "이 기기에 암호화 저장했습니다. 비밀번호는 저장하지 않으며, 새 탭에서는 직접 잠금 해제해야 합니다.",
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

/** Migration is explicit: no code reads old plaintext credentials on page mount. */
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
      label: "기존 Studio 연결",
      costPolicy: "unverified",
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
    "이전 설정을 메모리로 가져왔습니다. 무료 여부를 재확인하기 전에는 요청하지 않습니다.",
    false,
  );
  for (const source of sources) source.removeItem(key);
  publish(
    configuration,
    "기존 평문 설정을 제거했습니다. 무료 프리셋 또는 비용 정책을 다시 확인하세요.",
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
