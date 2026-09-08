import { describe, expect, it } from "vitest";

import {
  buildStudioAssetRightsManifest,
  type StudioAssetRightsManifestResult,
} from "./studio-asset-rights-manifest";
import {
  buildStudio3dAssetQualityPassport,
  calculateStudio3dWeightedQualityScore,
  studio3dQualityGradeForScore,
  type Studio3dAssetQualityPassportBuildInput,
  type Studio3dQualityDimension,
  type Studio3dRuntimeMetrics,
} from "./studio-3d-asset-quality";
import {
  evaluateStudio3dAssetSupply,
  type Studio3dAssetSupplyEvidence,
} from "./studio-3d-asset-supply";
import {
  createStudio3dAssetRefineryReceipt,
  evaluateStudio3dAssetRelease,
  publishStudio3dAsset,
  transitionStudio3dAssetRefinery,
  type Studio3dAssetRefineryDiagnostic,
  type Studio3dAssetRefineryReceipt,
  type Studio3dAssetRefineryStage,
} from "./studio-3d-asset-refinery";

const ASSET_ID = "hero-character-001";
const ASSET_VERSION = "sha256:hero-character-001-v3";
const SHA256 = "a".repeat(64);
const REVIEWED_AT = "2026-09-07T04:00:00.000Z";

function scores(value: number): Record<Studio3dQualityDimension, number> {
  return {
    silhouetteAnatomy: value,
    faceExpression: value,
    rigDeformation: value,
    hairClothing: value,
    materialsRendering: value,
    editabilityCompatibility: value,
    runtimePerformance: value,
    rightsProvenance: value,
  };
}

function runtimeMetrics(
  overrides: Partial<Studio3dRuntimeMetrics> = {}
): Studio3dRuntimeMetrics {
  return {
    triangles: 72_000,
    drawCalls: 12,
    materialSlots: 10,
    transparentDrawCalls: 4,
    textureMemoryMiB: 80,
    maximumTextureDimension: 2_048,
    morphTargets: 96,
    skeletonBones: 142,
    maximumVertexInfluences: 4,
    ...overrides,
  };
}

function qualityInput(
  overrides: Partial<Studio3dAssetQualityPassportBuildInput> = {}
): Studio3dAssetQualityPassportBuildInput {
  return {
    assetId: ASSET_ID,
    assetVersion: ASSET_VERSION,
    runtimeProfile: "r2_standard",
    dimensionScores: scores(90),
    runtimeMetrics: runtimeMetrics(),
    stressPose: {
      tested: 32,
      passed: 32,
      deformationFailures: 0,
      penetrationFailures: 0,
    },
    renderQa: {
      expectedViews: 24,
      renderedViews: 24,
      browserRenderVerified: true,
      visualRegressionApproved: true,
    },
    evaluatedAt: REVIEWED_AT,
    evaluator: "3D 품질 검수자",
    ...overrides,
  };
}

function supplyEvidence(
  overrides: Partial<Studio3dAssetSupplyEvidence> = {}
): Studio3dAssetSupplyEvidence {
  return {
    assetId: ASSET_ID,
    assetVersion: ASSET_VERSION,
    source: "first_party",
    compatibilityMode: "canonical",
    licenseId: "creator-owned",
    proofReference: "rights-ledger:hero-character-001-v3",
    distributionAgreementReference: null,
    reviewedBy: "권리 검수자",
    reviewedAt: REVIEWED_AT,
    humanReviewApproved: true,
    ownershipConfirmed: true,
    cc0DedicationConfirmed: false,
    permissions: {
      commercialUse: "allowed",
      redistribution: "allowed",
      sublicensing: "allowed",
      derivatives: "allowed",
      publicCatalog: "allowed",
    },
    ...overrides,
  };
}

function approvedRefinery(
  diagnosticsByStage: Partial<Record<
    Studio3dAssetRefineryStage,
    readonly Studio3dAssetRefineryDiagnostic[]
  >> = {}
): Studio3dAssetRefineryReceipt {
  const receipt = createStudio3dAssetRefineryReceipt({
    assetId: ASSET_ID,
    assetVersion: ASSET_VERSION,
    inputSha256: SHA256,
    pipelineVersion: "asset-refinery-v1",
    receivedAt: REVIEWED_AT,
    actor: "asset-intake",
  });
  const stages = [
    "quarantined",
    "rights_checked",
    "analyzed",
    "normalized",
    ...(diagnosticsByStage.repaired ? ["repaired" as const] : []),
    "optimized",
    "technical_qa",
    "render_qa",
    "art_review",
    "approved",
  ] as const;
  return stages.reduce((current, stage) => transitionStudio3dAssetRefinery(current, {
    to: stage,
    at: REVIEWED_AT,
    actor: "asset-refinery",
    reason: "단계별 검사와 담당자 승인을 통과했습니다.",
    diagnostics: diagnosticsByStage[stage],
  }), receipt);
}

function rights(
  readyForPublishPreflight = true,
  assetVersion = ASSET_VERSION
): Pick<StudioAssetRightsManifestResult, "readyForPublishPreflight" | "assets"> {
  const result = buildStudioAssetRightsManifest({
    workId: "work-3d-governance",
    usages: [{
      assetId: ASSET_ID,
      assetVersion,
      source: { kind: "builtin", id: "catalog:hero-character-001" },
      scope: ["current-work"],
      licenseId: "creator-owned",
      attributionRequired: false,
      attributionText: "",
      commercialUse: true,
      aiTraining: "unknown",
      redistribution: "unknown",
      expiresAt: null,
      pageId: "page-01",
      elementId: "character-01",
    }],
    attestation: {
      status: "confirmed",
      reviewedAt: REVIEWED_AT,
      reviewer: "권리 검수자",
    },
    now: Date.parse(REVIEWED_AT),
  });
  return { readyForPublishPreflight, assets: result.assets };
}

describe("studio 3D asset quality passport", () => {
  it("calculates the weighted score and production grade deterministically", () => {
    const weighted = calculateStudio3dWeightedQualityScore({
      ...scores(100),
      rigDeformation: 50,
    });

    expect(weighted).toBe(90);
    expect(studio3dQualityGradeForScore(weighted)).toBe("a_production");
  });

  it("approves an A-grade standard asset with complete stress and render QA", () => {
    const passport = buildStudio3dAssetQualityPassport(qualityInput());

    expect(passport).toMatchObject({
      weightedScore: 90,
      grade: "a_production",
      minimumGrade: "a_production",
      readyForPublication: true,
      hardFailures: [],
      budgetViolations: [],
    });
    expect(Object.isFrozen(passport)).toBe(true);
    expect(Object.isFrozen(passport.dimensionScores)).toBe(true);
  });

  it("blocks runtime budget overruns and explicit deformation failures", () => {
    const passport = buildStudio3dAssetQualityPassport(qualityInput({
      runtimeMetrics: runtimeMetrics({ triangles: 80_001 }),
      hardFailures: ["invalid_bind_pose"],
    }));

    expect(passport.readyForPublication).toBe(false);
    expect(passport.hardFailures).toEqual(expect.arrayContaining([
      "invalid_bind_pose",
      "runtime_budget_exceeded",
    ]));
    expect(passport.budgetViolations).toContainEqual({
      metric: "triangles",
      actual: 80_001,
      limit: 80_000,
    });
  });

  it("keeps source masters and incomplete render QA out of the public catalog", () => {
    const passport = buildStudio3dAssetQualityPassport(qualityInput({
      runtimeProfile: "source_master",
      renderQa: {
        expectedViews: 24,
        renderedViews: 23,
        browserRenderVerified: true,
        visualRegressionApproved: false,
      },
    }));

    expect(passport.readyForPublication).toBe(false);
    expect(passport.hardFailures).toEqual(expect.arrayContaining([
      "source_master_not_publishable",
      "render_qa_incomplete",
    ]));
  });
});

describe("studio 3D asset supply policy", () => {
  it("allows reviewed first-party assets with explicit distribution rights", () => {
    const decision = evaluateStudio3dAssetSupply(supplyEvidence());

    expect(decision.allowedForPublicCatalog).toBe(true);
    expect(decision.diagnostics).toEqual([]);
  });

  it("blocks private imports and marketplace purchases without a distribution agreement", () => {
    const privateDecision = evaluateStudio3dAssetSupply(supplyEvidence({
      compatibilityMode: "private_import",
    }));
    const marketplaceDecision = evaluateStudio3dAssetSupply(supplyEvidence({
      source: "commercial_marketplace",
      ownershipConfirmed: false,
      distributionAgreementReference: null,
      permissions: {
        ...supplyEvidence().permissions,
        sublicensing: "unknown",
      },
    }));

    expect(privateDecision.diagnostics.map(({ code }) => code))
      .toContain("PRIVATE_IMPORT_NOT_DISTRIBUTABLE");
    expect(marketplaceDecision.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "DISTRIBUTION_AGREEMENT_REQUIRED",
        "SUBLICENSE_NOT_ALLOWED",
      ])
    );
  });

  it("requires AI provenance, input rights and quarantine approval", () => {
    const decision = evaluateStudio3dAssetSupply(supplyEvidence({
      source: "ai_assisted",
      ai: {
        modelId: null,
        modelVersion: null,
        generationReceiptReference: null,
        inputRightsConfirmed: false,
        quarantineCleared: false,
      },
    }));

    expect(decision.allowedForPublicCatalog).toBe(false);
    expect(decision.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "AI_PROVENANCE_INCOMPLETE",
        "AI_INPUT_RIGHTS_NOT_CONFIRMED",
        "AI_QUARANTINE_NOT_CLEARED",
      ])
    );
  });
});

describe("studio 3D asset refinery and release gate", () => {
  function repairableRefinery() {
    let receipt = createStudio3dAssetRefineryReceipt({
      assetId: ASSET_ID,
      assetVersion: ASSET_VERSION,
      inputSha256: SHA256,
      pipelineVersion: "asset-refinery-v1",
      receivedAt: REVIEWED_AT,
      actor: "asset-intake",
    });
    for (const to of ["quarantined", "rights_checked", "analyzed", "normalized"] as const) {
      receipt = transitionStudio3dAssetRefinery(receipt, {
        to, at: REVIEWED_AT, actor: "asset-refinery", reason: "Record the actual analysis result.",
        diagnostics: to === "analyzed" ? [
          { code: "MESH_INVALID", severity: "error", message: "The mesh requires repair." },
          { code: "TEXTURE_MISSING", severity: "error", message: "A texture requires replacement." },
          { code: "UV_NOTE", severity: "warning", message: "Keep this advisory visible." },
        ] : [],
      });
    }
    return receipt;
  }

  it.each([false, true])("only releases assets after every active error has been explicitly repaired (all: %s)", (resolveAll) => {
    const before = repairableRefinery();
    const codes = resolveAll ? ["MESH_INVALID", "TEXTURE_MISSING"] : ["MESH_INVALID"];
    let receipt = transitionStudio3dAssetRefinery(before, {
      to: "repaired", at: REVIEWED_AT, actor: "repairer", reason: "Replaced and rechecked the named defects.",
      resolvedDiagnosticCodes: codes,
    });
    expect(receipt.history.at(-1)?.resolvedDiagnosticCodes).toEqual(codes);
    expect(receipt.diagnostics.map(({ code }) => code)).toEqual(resolveAll ? ["UV_NOTE"] : ["TEXTURE_MISSING", "UV_NOTE"]);
    expect(before.diagnostics).toHaveLength(3);
    for (const to of ["optimized", "technical_qa", "render_qa", "art_review", "approved"] as const) {
      receipt = transitionStudio3dAssetRefinery(receipt, {
        to, at: REVIEWED_AT, actor: "reviewer", reason: "Passed the required downstream QA stage.",
      });
    }
    expect(receipt.history.find(({ to }) => to === "analyzed")?.diagnostics).toEqual(before.diagnostics);
    const gate = {
      refinery: receipt,
      quality: buildStudio3dAssetQualityPassport(qualityInput()),
      supply: evaluateStudio3dAssetSupply(supplyEvidence()),
      rights: rights(),
    };
    expect(evaluateStudio3dAssetRelease(gate).allowed).toBe(resolveAll);
    const publication = { at: REVIEWED_AT, actor: "publisher", reason: "Publish only resolved evidence." };
    if (resolveAll) expect(publishStudio3dAsset(gate, publication).stage).toBe("published");
    else expect(() => publishStudio3dAsset(gate, publication)).toThrow("REFINERY_ERRORS_PRESENT");
  });

  it("cannot erase unknown errors, advisories, or errors outside the repair stage", () => {
    const receipt = repairableRefinery();
    for (const code of ["UNKNOWN_ERROR", "UV_NOTE"]) {
      expect(() => transitionStudio3dAssetRefinery(receipt, {
        to: "repaired", at: REVIEWED_AT, actor: "repairer", reason: "Invalid resolution request.",
        resolvedDiagnosticCodes: [code],
      })).toThrow("No active refinery error");
    }
    expect(() => transitionStudio3dAssetRefinery(receipt, {
      to: "optimized", at: REVIEWED_AT, actor: "optimizer", reason: "Not a repair transition.",
      resolvedDiagnosticCodes: ["MESH_INVALID"],
    })).toThrow("only be resolved in the repaired stage");
    const repaired = transitionStudio3dAssetRefinery(receipt, {
      to: "repaired", at: REVIEWED_AT, actor: "repairer", reason: "The repair reported a new failure.",
      resolvedDiagnosticCodes: ["MESH_INVALID"],
      diagnostics: [{ code: "MESH_INVALID", severity: "error", message: "The new output is still invalid." }],
    });
    expect(repaired.diagnostics).toContainEqual(expect.objectContaining({ code: "MESH_INVALID", severity: "error" }));
  });

  it("normalizes and freezes explicit repair evidence without changing earlier receipts", () => {
    const before = repairableRefinery();
    const codes = [" MESH_INVALID ", "MESH_INVALID"];
    const repaired = transitionStudio3dAssetRefinery(before, {
      to: "repaired",
      at: REVIEWED_AT,
      actor: "repairer",
      reason: "Rechecked the repaired mesh.",
      resolvedDiagnosticCodes: codes,
    });
    codes.push("TEXTURE_MISSING");

    expect(repaired.history.at(-1)?.resolvedDiagnosticCodes).toEqual(["MESH_INVALID"]);
    expect(Object.isFrozen(repaired.history.at(-1)?.resolvedDiagnosticCodes)).toBe(true);
    expect(Object.isFrozen(repaired.history.at(-1))).toBe(true);
    expect(repaired.diagnostics.map(({ code }) => code)).toEqual(["TEXTURE_MISSING", "UV_NOTE"]);
    expect(before.diagnostics.map(({ code }) => code)).toEqual(["MESH_INVALID", "TEXTURE_MISSING", "UV_NOTE"]);
  });

  it("rejects explicit resolution after re-diagnosis has already cleared the error", () => {
    let receipt = createStudio3dAssetRefineryReceipt({
      assetId: ASSET_ID,
      assetVersion: ASSET_VERSION,
      inputSha256: SHA256,
      pipelineVersion: "asset-refinery-v1",
      receivedAt: REVIEWED_AT,
      actor: "asset-intake",
    });
    for (const to of ["quarantined", "rights_checked", "analyzed", "normalized"] as const) {
      receipt = transitionStudio3dAssetRefinery(receipt, {
        to,
        at: REVIEWED_AT,
        actor: "asset-refinery",
        reason: "Record the current mesh outcome.",
        diagnostics: to === "analyzed"
          ? [{ code: "MESH_INVALID", severity: "error", message: "Repair is required." }]
          : to === "normalized"
            ? [{ code: "MESH_INVALID", severity: "info", message: "Normalization repaired the mesh." }]
            : [],
      });
    }

    expect(() => transitionStudio3dAssetRefinery(receipt, {
      to: "repaired",
      at: REVIEWED_AT,
      actor: "repairer",
      reason: "A historical error is no longer active.",
      resolvedDiagnosticCodes: ["MESH_INVALID"],
    })).toThrow("No active refinery error");
  });

  it("allows explicitly repaired diagnostics while preserving the original error history", () => {
    const failure = { code: "OPEN_MESH", severity: "error", message: "Mesh has open edges." } as const;
    const repaired = { code: "OPEN_MESH", severity: "info", message: "Closed edges verified." } as const;
    const refinery = approvedRefinery({ analyzed: [failure], repaired: [repaired] });
    const gate = {
      refinery,
      quality: buildStudio3dAssetQualityPassport(qualityInput()),
      supply: evaluateStudio3dAssetSupply(supplyEvidence()),
      rights: rights(),
    };

    expect(refinery.diagnostics).toEqual([repaired]);
    expect(refinery.history.find(event => event.to === "analyzed")?.diagnostics).toEqual([failure]);
    expect(refinery.history.find(event => event.to === "repaired")?.diagnostics).toEqual([repaired]);
    expect(Object.isFrozen(refinery.diagnostics)).toBe(true);
    expect(evaluateStudio3dAssetRelease(gate).allowed).toBe(true);
    expect(publishStudio3dAsset(gate, {
      at: REVIEWED_AT,
      actor: "catalog-publisher",
      reason: "Repair and all release gates verified.",
    }).stage).toBe("published");
  });

  it("does not clear unresolved or newly recurring errors merely by completing QA", () => {
    const failure = { code: "OPEN_MESH", severity: "error", message: "Mesh has open edges." } as const;
    const repaired = { code: "OPEN_MESH", severity: "info", message: "Closed edges verified." } as const;
    const unrelated = { code: "QA_COMPLETE", severity: "info", message: "Other checks passed." } as const;
    const anotherFailure = { code: "BAD_WEIGHTS", severity: "error", message: "Weights still invalid." } as const;
    const receipts = [
      approvedRefinery({ analyzed: [failure], technical_qa: [unrelated] }),
      approvedRefinery({ analyzed: [failure, anotherFailure], repaired: [repaired] }),
      approvedRefinery({ analyzed: [failure], repaired: [repaired], technical_qa: [failure] }),
    ];

    for (const refinery of receipts) {
      const gate = {
        refinery,
        quality: buildStudio3dAssetQualityPassport(qualityInput()),
        supply: evaluateStudio3dAssetSupply(supplyEvidence()),
        rights: rights(),
      };
      expect(evaluateStudio3dAssetRelease(gate)).toMatchObject({ allowed: false });
      expect(evaluateStudio3dAssetRelease(gate).diagnostics.map(entry => entry.code))
        .toContain("REFINERY_ERRORS_PRESENT");
      expect(() => publishStudio3dAsset(gate, {
        at: REVIEWED_AT,
        actor: "catalog-publisher",
        reason: "Unresolved findings must remain blocked.",
      })).toThrow("REFINERY_ERRORS_PRESENT");
    }
  });

  it("rejects skipped states and preserves an immutable approval history", () => {
    const received = createStudio3dAssetRefineryReceipt({
      assetId: ASSET_ID,
      assetVersion: ASSET_VERSION,
      inputSha256: SHA256,
      pipelineVersion: "asset-refinery-v1",
      receivedAt: REVIEWED_AT,
      actor: "asset-intake",
    });

    expect(() => transitionStudio3dAssetRefinery(received, {
      to: "approved",
      at: REVIEWED_AT,
      actor: "reviewer",
      reason: "중간 검사를 건너뜁니다.",
    })).toThrow("전환할 수 없습니다");

    const approved = approvedRefinery();
    expect(approved.stage).toBe("approved");
    expect(approved.history.map(({ to }) => to)).toEqual([
      "received",
      "quarantined",
      "rights_checked",
      "analyzed",
      "normalized",
      "optimized",
      "technical_qa",
      "render_qa",
      "art_review",
      "approved",
    ]);
    expect(Object.isFrozen(approved.history)).toBe(true);
  });

  it("publishes only when quality, supply, refinery and exact rights version agree", () => {
    const quality = buildStudio3dAssetQualityPassport(qualityInput());
    const supply = evaluateStudio3dAssetSupply(supplyEvidence());
    const refinery = approvedRefinery();
    const gate = { refinery, quality, supply, rights: rights() };

    expect(evaluateStudio3dAssetRelease(gate)).toMatchObject({
      assetId: ASSET_ID,
      assetVersion: ASSET_VERSION,
      allowed: true,
      diagnostics: [],
    });
    expect(publishStudio3dAsset(gate, {
      at: REVIEWED_AT,
      actor: "catalog-publisher",
      reason: "검증된 불변 버전을 공개합니다.",
    }).stage).toBe("published");
  });

  it("fails closed when rights preflight or an exact asset version is missing", () => {
    const decision = evaluateStudio3dAssetRelease({
      refinery: approvedRefinery(),
      quality: buildStudio3dAssetQualityPassport(qualityInput()),
      supply: evaluateStudio3dAssetSupply(supplyEvidence()),
      rights: rights(false, "another-version"),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "RIGHTS_PREFLIGHT_NOT_APPROVED",
        "RIGHTS_ASSET_VERSION_MISSING",
      ])
    );
  });
});
