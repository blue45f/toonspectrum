import { productionScopeKey } from "./scope";

import type {
  ProcurementRequirementsGate,
  ScopePackage,
  ScopePackageAddendum,
} from "./types";

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableObject(entry)]));
  }
  return value;
}

export function stableProductionFingerprint(value: unknown): string {
  const text = JSON.stringify(stableObject(value));
  let hash = BigInt("14695981039346656037");
  const prime = BigInt("1099511628211");
  const mask = BigInt("0xffffffffffffffff");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

export function scopePackageDigestInput(scopePackage: Omit<ScopePackage, "digest">): unknown {
  return {
    ...scopePackage,
    scopes: scopePackage.scopes.map(productionScopeKey),
    inputRevisionRefs: scopePackage.inputRevisionRefs.map((revision) => revision.digest),
  };
}

export function createImmutableScopePackage(
  input: Omit<ScopePackage, "digest">,
): ScopePackage {
  if (input.scopes.length === 0) throw new Error("Scope package requires at least one production scope.");
  if (input.deliverableSpecifications.length === 0) throw new Error("Scope package requires deliverable specifications.");
  if (input.acceptanceCriteria.length === 0) throw new Error("Scope package requires acceptance criteria.");
  if (input.status === "published" && input.inputRevisionRefs.length === 0) {
    throw new Error("Published scope package requires pinned input revisions.");
  }
  return Object.freeze({
    ...input,
    scopes: Object.freeze([...input.scopes]),
    inputRevisionRefs: Object.freeze([...input.inputRevisionRefs]),
    deliverableSpecifications: Object.freeze([...input.deliverableSpecifications]),
    acceptanceCriteria: Object.freeze([...input.acceptanceCriteria]),
    digest: stableProductionFingerprint(scopePackageDigestInput(input)),
  });
}

export function verifyScopePackageIntegrity(scopePackage: ScopePackage): boolean {
  const { digest: _digest, ...input } = scopePackage;
  return stableProductionFingerprint(scopePackageDigestInput(input)) === scopePackage.digest;
}

export function createScopePackageAddendum(input: {
  readonly previous: ScopePackage;
  readonly replacement: ScopePackage;
  readonly reason: string;
  readonly createdAt: string;
  readonly id: string;
  readonly previousAddenda: readonly ScopePackageAddendum[];
}): ScopePackageAddendum {
  if (input.previous.id !== input.replacement.id) throw new Error("Scope package addendum cannot change package identity.");
  if (input.replacement.revision !== input.previous.revision + 1) throw new Error("Scope package addendum requires the next revision.");
  if (!input.reason.trim()) throw new Error("Scope package addendum requires a reason.");
  const previousValue = JSON.parse(JSON.stringify(input.previous)) as Record<string, unknown>;
  const replacementValue = JSON.parse(JSON.stringify(input.replacement)) as Record<string, unknown>;
  const changedFields = Object.keys(replacementValue).filter(
    (key) => JSON.stringify(previousValue[key]) !== JSON.stringify(replacementValue[key]),
  );
  return Object.freeze({
    id: input.id,
    scopePackageId: input.previous.id,
    sequence: input.previousAddenda.filter((addendum) => addendum.scopePackageId === input.previous.id).length + 1,
    reason: input.reason.trim(),
    changedFields: Object.freeze(changedFields),
    replacementScopePackageRevision: input.replacement.revision,
    createdAt: input.createdAt,
  });
}

export function evaluateProcurementRequirementsGate(
  gate: Omit<ProcurementRequirementsGate, "blockingReasons">,
): ProcurementRequirementsGate {
  const reasons: string[] = [];
  if (!gate.approvedScope) reasons.push("발주 범위가 승인되지 않았습니다.");
  if (!gate.sourceMaterialsAvailable) reasons.push("원본 자료가 준비되지 않았습니다.");
  if (!gate.styleReferencesAvailable) reasons.push("스타일·캐릭터 기준 자료가 없습니다.");
  if (!gate.accessProvisioned) reasons.push("제한된 작업 접근권이 발급되지 않았습니다.");
  if (!gate.fileSpecificationConfirmed) reasons.push("파일·레이어 규격이 확인되지 않았습니다.");
  if (!gate.ndaConfirmed) reasons.push("비밀유지 조건이 확인되지 않았습니다.");
  if (!gate.paymentConditionConfirmed) reasons.push("착수·지급 조건이 확인되지 않았습니다.");
  return Object.freeze({ ...gate, blockingReasons: Object.freeze(reasons) });
}
