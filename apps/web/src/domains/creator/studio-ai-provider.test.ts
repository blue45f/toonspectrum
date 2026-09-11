import { describe, expect, it } from "vitest";

import { planStudioAiProvider, type StudioAiProviderDefinition } from "./studio-ai-provider";

const PROVIDERS: readonly StudioAiProviderDefinition[] = [
  {
    id: "local-fast",
    name: "On-device Fast",
    mode: "local",
    skills: ["line-cleanup", "flat-color"],
    qualityScore: 0.72,
    latencyScore: 0.95,
    costPerCredit: 0,
    supportsReferences: false,
    supportsSeed: true,
    available: true,
  },
  {
    id: "cloud-quality",
    name: "Cloud Quality",
    mode: "cloud-provider",
    skills: ["line-cleanup", "flat-color", "character-consistency"],
    qualityScore: 0.96,
    latencyScore: 0.65,
    costPerCredit: 0.5,
    supportsReferences: true,
    supportsSeed: true,
    available: true,
  },
];

describe("Studio AI provider planning", () => {
  it("automatically chooses a local provider for device-only work", () => {
    expect(planStudioAiProvider(PROVIDERS, {
      skill: "line-cleanup",
      preference: "device-only",
      referenceCount: 0,
      seedRequired: false,
      estimatedCredits: 10,
      maximumCost: null,
      externalTransferConfirmed: false,
      paidUseConfirmed: false,
    })).toMatchObject({
      status: "ready",
      providerId: "local-fast",
      estimatedCost: 0,
      requiresExternalTransfer: false,
    });
  });

  it("asks for data-transfer and paid-use confirmation for cloud quality", () => {
    expect(planStudioAiProvider(PROVIDERS, {
      skill: "character-consistency",
      preference: "quality",
      referenceCount: 2,
      seedRequired: true,
      estimatedCredits: 20,
      maximumCost: 20,
      externalTransferConfirmed: false,
      paidUseConfirmed: false,
    })).toMatchObject({
      status: "confirmation",
      providerId: "cloud-quality",
      estimatedCost: 10,
      confirmationCodes: ["external-transfer", "paid-use"],
    });
  });

  it("blocks use above the user's cost limit", () => {
    expect(planStudioAiProvider(PROVIDERS, {
      skill: "character-consistency",
      preference: "quality",
      referenceCount: 1,
      seedRequired: false,
      estimatedCredits: 20,
      maximumCost: 5,
      externalTransferConfirmed: true,
      paidUseConfirmed: true,
    })).toMatchObject({ status: "blocked", blockingCodes: ["cost-limit-exceeded"] });
  });

  it("blocks when no provider can satisfy references and privacy", () => {
    expect(planStudioAiProvider(PROVIDERS, {
      skill: "character-consistency",
      preference: "device-only",
      referenceCount: 1,
      seedRequired: false,
      estimatedCredits: 1,
      maximumCost: null,
      externalTransferConfirmed: false,
      paidUseConfirmed: false,
    })).toMatchObject({ status: "blocked", providerId: null, blockingCodes: ["provider-unavailable"] });
  });
});
