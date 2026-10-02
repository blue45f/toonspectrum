/**
 * paywall-store.ts
 *
 * 얼리 액세스 정책의 브라우저 저장소.
 */
import type { EarlyAccessPolicy } from "./paywall-model";

const POLICY_STORAGE_KEY = "toonspectrum:monetization:early-access-policies";
export const PAYWALL_STORE_EVENT = "toonspectrum:monetization:paywall-changed";

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function isPolicy(item: unknown): item is EarlyAccessPolicy {
  const r = item as Record<string, unknown>;
  return (
    typeof item === "object" && item !== null &&
    typeof r.id === "string" && typeof r.titleId === "string" &&
    typeof r.creatorId === "string" && typeof r.earlyAccessDays === "number"
  );
}

function readPolicies(): EarlyAccessPolicy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(POLICY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPolicy);
  } catch {
    return [];
  }
}

function writePolicies(policies: readonly EarlyAccessPolicy[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(policies));
    window.dispatchEvent(new CustomEvent(PAYWALL_STORE_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** 작품의 얼리 액세스 정책을 조회한다. */
export function getEarlyAccessPolicy(titleId: string): EarlyAccessPolicy | null {
  return readPolicies().find((policy) => policy.titleId === titleId) ?? null;
}

/** 창작자의 정책 목록을 조회한다. */
export function listEarlyAccessPolicies(creatorId: string): EarlyAccessPolicy[] {
  return readPolicies()
    .filter((policy) => policy.creatorId === creatorId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 정책을 생성하거나 갱신한다 (작품당 1개). */
export function upsertEarlyAccessPolicy(input: {
  creatorId: string;
  titleId: string;
  titleName: string;
  enabled: boolean;
  earlyAccessDays: number;
}): EarlyAccessPolicy {
  const now = new Date().toISOString();
  const policies = readPolicies();
  const existing = policies.find((policy) => policy.titleId === input.titleId);
  if (existing) {
    const updated: EarlyAccessPolicy = {
      ...existing,
      titleName: input.titleName.trim(),
      enabled: input.enabled,
      earlyAccessDays: Math.round(input.earlyAccessDays),
      updatedAt: now,
    };
    writePolicies(policies.map((policy) => (policy.id === existing.id ? updated : policy)));
    return updated;
  }
  const created: EarlyAccessPolicy = {
    id: createId("eap"),
    creatorId: input.creatorId,
    titleId: input.titleId.trim(),
    titleName: input.titleName.trim(),
    enabled: input.enabled,
    earlyAccessDays: Math.round(input.earlyAccessDays),
    createdAt: now,
    updatedAt: now,
  };
  policies.push(created);
  writePolicies(policies);
  return created;
}

/** 정책을 삭제한다. */
export function deleteEarlyAccessPolicy(policyId: string): boolean {
  const policies = readPolicies();
  if (!policies.some((policy) => policy.id === policyId)) return false;
  return writePolicies(policies.filter((policy) => policy.id !== policyId));
}

/** 스토어 변경을 구독한다. 반환값으로 구독을 해제한다. */
export function subscribePaywallStore(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PAYWALL_STORE_EVENT, listener);
  return () => window.removeEventListener(PAYWALL_STORE_EVENT, listener);
}
