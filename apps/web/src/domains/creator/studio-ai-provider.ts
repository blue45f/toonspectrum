import type { StudioAiSkillId } from "./studio-ai-job";

export type StudioAiProviderMode = "local" | "cloud-private" | "cloud-provider";
export type StudioAiPreference = "fast" | "balanced" | "quality" | "device-only";

export interface StudioAiProviderDefinition {
  readonly id: string;
  readonly name: string;
  readonly mode: StudioAiProviderMode;
  readonly skills: readonly StudioAiSkillId[];
  readonly qualityScore: number;
  readonly latencyScore: number;
  readonly costPerCredit: number;
  readonly supportsReferences: boolean;
  readonly supportsSeed: boolean;
  readonly available: boolean;
}

export interface StudioAiProviderRequest {
  readonly skill: StudioAiSkillId;
  readonly preference: StudioAiPreference;
  readonly referenceCount: number;
  readonly seedRequired: boolean;
  readonly estimatedCredits: number;
  readonly maximumCost: number | null;
  readonly externalTransferConfirmed: boolean;
  readonly paidUseConfirmed: boolean;
}

export interface StudioAiProviderPlan {
  readonly status: "ready" | "confirmation" | "blocked";
  readonly providerId: string | null;
  readonly estimatedCost: number;
  readonly requiresExternalTransfer: boolean;
  readonly confirmationCodes: readonly string[];
  readonly blockingCodes: readonly string[];
}

export function validateStudioAiProviders(
  providers: readonly StudioAiProviderDefinition[],
): readonly string[] {
  const issues: string[] = [];
  const ids = providers.map((provider) => provider.id);
  if (new Set(ids).size !== ids.length) issues.push("provider-id-duplicate");
  for (const provider of providers) {
    if (!provider.id.trim() || !provider.name.trim() || provider.skills.length === 0) {
      issues.push("provider-required");
    }
    if (new Set(provider.skills).size !== provider.skills.length) issues.push("skill-duplicate");
    if (!Number.isFinite(provider.qualityScore) || provider.qualityScore < 0 || provider.qualityScore > 1) {
      issues.push("quality-score");
    }
    if (!Number.isFinite(provider.latencyScore) || provider.latencyScore < 0 || provider.latencyScore > 1) {
      issues.push("latency-score");
    }
    if (!Number.isFinite(provider.costPerCredit) || provider.costPerCredit < 0) {
      issues.push("provider-cost");
    }
  }
  return Object.freeze([...new Set(issues)]);
}

function providerScore(
  provider: StudioAiProviderDefinition,
  preference: StudioAiPreference,
): number {
  if (preference === "fast") return provider.latencyScore * 0.7 + provider.qualityScore * 0.3;
  if (preference === "quality") return provider.qualityScore * 0.85 + provider.latencyScore * 0.15;
  return provider.qualityScore * 0.55 + provider.latencyScore * 0.45;
}

export function planStudioAiProvider(
  providers: readonly StudioAiProviderDefinition[],
  request: StudioAiProviderRequest,
): StudioAiProviderPlan {
  if (validateStudioAiProviders(providers).length > 0) {
    throw new Error("AI providers must be valid before planning.");
  }
  if (!Number.isSafeInteger(request.referenceCount) || request.referenceCount < 0
    || !Number.isFinite(request.estimatedCredits) || request.estimatedCredits < 0
    || (request.maximumCost !== null && (!Number.isFinite(request.maximumCost) || request.maximumCost < 0))) {
    throw new Error("AI provider request values are invalid.");
  }
  const candidates = providers
    .filter((provider) => provider.available)
    .filter((provider) => provider.skills.includes(request.skill))
    .filter((provider) => request.preference !== "device-only" || provider.mode === "local")
    .filter((provider) => request.referenceCount === 0 || provider.supportsReferences)
    .filter((provider) => !request.seedRequired || provider.supportsSeed)
    .sort((left, right) => providerScore(right, request.preference) - providerScore(left, request.preference)
      || left.id.localeCompare(right.id));
  const selected = candidates[0] ?? null;
  if (!selected) {
    return Object.freeze({
      status: "blocked",
      providerId: null,
      estimatedCost: 0,
      requiresExternalTransfer: false,
      confirmationCodes: Object.freeze([]),
      blockingCodes: Object.freeze(["provider-unavailable"]),
    });
  }
  const estimatedCost = selected.costPerCredit * request.estimatedCredits;
  const blockingCodes: string[] = [];
  if (request.maximumCost !== null && estimatedCost > request.maximumCost) {
    blockingCodes.push("cost-limit-exceeded");
  }
  const confirmationCodes: string[] = [];
  const requiresExternalTransfer = selected.mode !== "local";
  if (requiresExternalTransfer && !request.externalTransferConfirmed) {
    confirmationCodes.push("external-transfer");
  }
  if (estimatedCost > 0 && !request.paidUseConfirmed) confirmationCodes.push("paid-use");
  return Object.freeze({
    status: blockingCodes.length > 0
      ? "blocked"
      : confirmationCodes.length > 0 ? "confirmation" : "ready",
    providerId: selected.id,
    estimatedCost,
    requiresExternalTransfer,
    confirmationCodes: Object.freeze(confirmationCodes),
    blockingCodes: Object.freeze(blockingCodes),
  });
}
