/**
 * API 키 허브 순수 로직 — DOM/스토리지 의존 없음.
 *
 * 보안 원칙: 이 모듈은 키 값을 절대 로그·복사·외부 전송하지 않는다.
 * 마스킹된 표현만 UI에 노출한다.
 */
import {
  userAiConnectionApiKeys,
  USER_AI_CAPABILITIES,
  type UserAiCapability,
  type UserAiConfiguration,
} from "@/shared/ai/user-ai-types";

/** 마스킹 표시에서 노출하는 마지막 문자 수 — OpenAI·GitHub·Vercel 대시보드 관행과 동일. */
export const API_KEY_MASK_VISIBLE_TAIL = 4;

/** 키 형식 검증 최소 길이 — 실제 키는 이보다 훨씬 길지만, 빈 문자열·오타 입력만 거른다. */
export const API_KEY_MIN_LENGTH = 8;

/**
 * API 키를 마스킹한다. 예: "sk-abc...wxyz" → "••••wxyz".
 * 4자 이하는 전부 마스킹한다.
 */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= API_KEY_MASK_VISIBLE_TAIL) return "•".repeat(trimmed.length);
  return `••••${trimmed.slice(-API_KEY_MASK_VISIBLE_TAIL)}`;
}

export type ApiKeyFormatIssue = "empty" | "too_short";

/** 키 형식 검증 — 네트워크 호출 없이 형식만 확인한다. */
export function validateApiKeyFormat(key: string): ApiKeyFormatIssue | null {
  const trimmed = key.trim();
  if (!trimmed) return "empty";
  if (trimmed.length < API_KEY_MIN_LENGTH) return "too_short";
  return null;
}

/** 키 만료 상태 — GitHub PAT·OpenAI 키의 만료일 표시 관행을 따른다. */
export type ApiKeyExpiryStatus = "ok" | "expiring_soon" | "expired";

/** 만료까지 7일 이하면 사전 경고한다. */
export const API_KEY_EXPIRY_WARNING_DAYS = 7;

/**
 * ISO 날짜 문자열 기준 만료 상태를 계산한다.
 * `expiresAt`이 없으면 null(만료일 없음).
 */
export function apiKeyExpiryStatus(expiresAt: string | null | undefined, now = new Date()): ApiKeyExpiryStatus | null {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return "expired";
  if (daysLeft <= API_KEY_EXPIRY_WARNING_DAYS) return "expiring_soon";
  return "ok";
}

/**
 * 만료 상태를 사람이 읽기 쉬운 ko/en 문구로 변환한다.
 */
export function apiKeyExpiryLabel(
  status: ApiKeyExpiryStatus | null,
  expiresAt: string,
  ko: boolean,
): string | null {
  if (!status) return null;
  const date = expiresAt.slice(0, 10);
  if (status === "expired") return ko ? `만료됨 (${date})` : `Expired (${date})`;
  if (status === "expiring_soon") return ko ? `곧 만료 (${date})` : `Expiring soon (${date})`;
  return ko ? `만료일 ${date}` : `Expires ${date}`;
}

export interface AiKeyHubSummary {
  /** 키가 등록된 연결 수 */
  configuredConnections: number;
  /** 전체 연결 수 */
  totalConnections: number;
  /** 키가 있는 기능 */
  coveredCapabilities: UserAiCapability[];
  /** 연결 라벨 목록 (키 값 제외) */
  connectionLabels: string[];
}

/** AI 설정에서 허브 카드에 보여줄 요약만 추출한다 — 키 값은 절대 포함하지 않는다. */
export function summarizeAiKeyStatus(configuration: UserAiConfiguration): AiKeyHubSummary {
  const connections = configuration.connections ?? [];
  const configured = connections.filter(
    (connection) => userAiConnectionApiKeys(connection).length > 0,
  );
  const covered = new Set<UserAiCapability>();
  for (const connection of configured) {
    for (const capability of USER_AI_CAPABILITIES) {
      const assigned = configuration.assignments?.[capability];
      if (assigned === connection.id) covered.add(capability);
    }
  }
  return {
    configuredConnections: configured.length,
    totalConnections: connections.length,
    coveredCapabilities: USER_AI_CAPABILITIES.filter((capability) => covered.has(capability)),
    connectionLabels: configured.map((connection) => connection.label || connection.baseUrl),
  };
}
