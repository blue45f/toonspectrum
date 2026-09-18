import { describe, expect, it } from "vitest";

import {
  addStudioArtifactToGraph,
  appendStudioRevisionToGraph,
  assertStudioAssetLockfilePublishable,
  assertStudioCompatibilityCommitAllowed,
  assertStudioRevisionWritable,
  createInMemoryStudioDocumentAuthority,
  createStudioArtifact,
  createStudioArtifactRevision,
  createStudioProjectGraph,
  createStudioScopeRef,
  deriveStudioArtifactRevision,
  evaluateStudioCapabilityLedger,
  STUDIO_COMPETITOR_CAPABILITY_CATALOG,
  studioScopeContains,
  studioScopeKey,
  summarizeStudioCompatibilityReport,
  validateStudioAssetLockfile,
  validateStudioCompatibilityReport,
  validateStudioProjectGraph,
  validateStudioScopeRef,
} from "../index";

import type {
  StudioCapabilityRecord,
  StudioCompatibilityReportV1,
  StudioTransactionEnvelope,
} from "../index";

const NOW = "2026-09-17T09:00:00.000Z";
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const DIGEST_C = `sha256:${"c".repeat(64)}`;

describe("Studio product graph foundation", () => {
  it("keeps one canonical scope identity across project workflows", () => {
    const episode = createStudioScopeRef({ projectId: "project-1", episodeId: "episode-12" });
    const panel = createStudioScopeRef({
      projectId: "project-1",
      episodeId: "episode-12",
      sceneId: "scene-4",
      panelId: "panel-37",
    });
    expect(studioScopeContains(episode, panel)).toBe(true);
    expect(studioScopeKey(panel)).toContain("episode:episode-12");
    expect(validateStudioScopeRef({
      version: 1,
      projectId: "project-1",
      panelId: "panel-37",
    })).toContainEqual(expect.objectContaining({ code: "missing-episode-parent" }));
  });

  it("separates mutable work from immutable checkpoints, review and release states", () => {
    const working = createStudioArtifactRevision({
      id: "revision-working-1",
      artifactId: "artifact-canvas-1",
      kind: "working",
      parentRevisionIds: [],
      contentDigest: DIGEST_A,
      manifestDigest: null,
      createdBy: "user-1",
      createdAt: NOW,
      label: null,
      sourceFormat: "toon2d",
      sourceBlobDigest: DIGEST_A,
    });
    expect(() => assertStudioRevisionWritable(working)).not.toThrow();
    const checkpoint = deriveStudioArtifactRevision(working, {
      id: "revision-checkpoint-1",
      kind: "named-checkpoint",
      createdBy: "user-1",
      createdAt: "2026-09-17T09:01:00.000Z",
      contentDigest: DIGEST_B,
      label: "선화 완료",
    });
    expect(checkpoint.immutable).toBe(true);
    expect(() => assertStudioRevisionWritable(checkpoint)).toThrow("immutable");
  });

  it("appends revisions through the graph transaction boundary", () => {
    const scope = createStudioScopeRef({ projectId: "project-1", episodeId: "episode-1" });
    const artifact = createStudioArtifact({
      id: "artifact-canvas-1",
      projectId: "project-1",
      kind: "canvas-2d",
      scope,
      title: "1화 원고",
      revisionIds: [],
      workingRevisionId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    let graph = addStudioArtifactToGraph(
      createStudioProjectGraph({ projectId: "project-1", title: "작품", createdAt: NOW }),
      artifact,
    );
    const working = createStudioArtifactRevision({
      id: "revision-working-1",
      artifactId: artifact.id,
      kind: "working",
      parentRevisionIds: [],
      contentDigest: DIGEST_A,
      manifestDigest: null,
      createdBy: "user-1",
      createdAt: NOW,
      label: null,
      sourceFormat: null,
      sourceBlobDigest: null,
    });
    graph = appendStudioRevisionToGraph(graph, working);
    const submission = deriveStudioArtifactRevision(working, {
      id: "revision-submission-1",
      kind: "submission",
      createdBy: "user-1",
      createdAt: "2026-09-17T09:02:00.000Z",
      contentDigest: DIGEST_B,
    });
    graph = appendStudioRevisionToGraph(graph, submission);
    expect(validateStudioProjectGraph(graph)).toEqual([]);
    expect(graph.artifacts[0]?.workingRevisionId).toBe(working.id);
    expect(graph.revisions.map((revision) => revision.kind)).toEqual(["working", "submission"]);
  });
});

describe("Studio document authority", () => {
  it("commits atomically, rejects stale work and replays idempotently", () => {
    const authority = createInMemoryStudioDocumentAuthority({
      initialState: { value: 0 },
      digest: (state) => `value:${state.value}`,
      reduce: (state, command: { readonly type: string; readonly payload: number }) => ({
        value: command.type === "increment" ? state.value + command.payload : state.value,
      }),
      now: () => NOW,
    });
    const envelope: StudioTransactionEnvelope<number> = {
      version: 1,
      id: "transaction-1",
      idempotencyKey: "mutation-1",
      baseSequence: 0,
      baseDigest: "value:0",
      actorId: "user-1",
      createdAt: NOW,
      commands: [{ id: "command-1", type: "increment", payload: 2 }],
    };
    const prepared = authority.prepare(envelope);
    const receipt = authority.commit(prepared);
    expect(receipt).toMatchObject({ status: "committed", sequence: 1, digest: "value:2" });
    expect(authority.transact(envelope).status).toBe("idempotent-replay");

    const stale: StudioTransactionEnvelope<number> = {
      ...envelope,
      id: "transaction-2",
      idempotencyKey: "mutation-2",
      commands: [{ id: "command-2", type: "increment", payload: 1 }],
    };
    expect(() => authority.prepare(stale)).toThrow("base no longer matches");
  });
});

describe("Studio capability and claim ledger", () => {
  function records(externalStatus: "pending" | "verified"): StudioCapabilityRecord[] {
    return STUDIO_COMPETITOR_CAPABILITY_CATALOG.map((definition) => ({
      ...definition,
      evidence: [
        ...definition.requiredDimensions
          .filter((dimension) => dimension !== "external-validation")
          .map((dimension) => ({
            dimension,
            status: "verified" as const,
            reference: `evidence/${definition.id}/${dimension}`,
          })),
        ...(definition.externalValidationRequired
          ? [{
              dimension: "external-validation" as const,
              status: externalStatus,
              reference: `external/${definition.id}`,
            }]
          : []),
      ],
    }));
  }

  it("distinguishes completed repository work from pending external proof", () => {
    const evaluation = evaluateStudioCapabilityLedger(records("pending"));
    expect(evaluation.incompleteCount).toBe(0);
    expect(evaluation.repositoryImplementationComplete).toBe(true);
    expect(evaluation.externalValidationPendingCount).toBeGreaterThan(0);
    expect(evaluation.replacementClaimAllowed).toBe(false);
  });

  it("allows replacement claims only when every required proof is verified", () => {
    const evaluation = evaluateStudioCapabilityLedger(records("verified"));
    expect(evaluation.verifiedCount).toBe(57);
    expect(evaluation.replacementClaimAllowed).toBe(true);
  });
});

describe("Studio interchange compatibility", () => {
  const report: StudioCompatibilityReportV1 = {
    version: 1,
    id: "compatibility-1",
    sourceFormat: "clip",
    sourceDigest: DIGEST_C,
    preservedOriginalBlobDigest: DIGEST_C,
    parserId: "clip-safe-probe",
    parserVersion: "1.0.0",
    createdAt: NOW,
    committed: false,
    items: [
      {
        version: 1,
        id: "item-layer-1",
        category: "layer",
        sourcePath: "layers/0",
        outcome: "preserved",
        targetObjectType: "raster-layer",
        reason: "Pixel layer maps without loss.",
      },
      {
        version: 1,
        id: "item-filter-1",
        category: "filter",
        sourcePath: "layers/0/filter/0",
        outcome: "blocked",
        targetObjectType: null,
        reason: "Native filter semantics are not documented.",
      },
    ],
  };

  it("reports every loss class and blocks silent destructive conversion", () => {
    const summary = summarizeStudioCompatibilityReport(report);
    expect(summary.byOutcome.preserved).toBe(1);
    expect(summary.blockingCount).toBe(1);
    expect(summary.canCommit).toBe(false);
    expect(validateStudioCompatibilityReport({ ...report, committed: true })).toContain(
      "blocked-report-committed",
    );
    expect(() => assertStudioCompatibilityCommitAllowed({ ...report, committed: true }))
      .toThrow("cannot be committed");
  });
});

describe("Studio asset license lockfile", () => {
  it("pins asset bytes, license evidence and project usage before publish", () => {
    const lockfile = {
      version: 1 as const,
      projectId: "project-1",
      generatedAt: NOW,
      entries: [{
        version: 1 as const,
        assetId: "asset-1",
        sellerId: "seller-1",
        assetVersion: "1.2.0",
        contentDigest: DIGEST_A,
        licenseGrantId: "license-1",
        seatCount: 3,
        allowedUses: ["commercial-webtoon"],
        prohibitedUses: ["asset-redistribution"],
        projectUses: [createStudioScopeRef({
          projectId: "project-1",
          episodeId: "episode-1",
          panelId: "panel-1",
        })],
        creditRequirement: "Background by Studio Asset Seller",
        receiptReference: "receipt:order-1",
        lockedAt: NOW,
      }],
    };
    expect(validateStudioAssetLockfile(lockfile)).toEqual([]);
    expect(() => assertStudioAssetLockfilePublishable(lockfile)).not.toThrow();
    expect(validateStudioAssetLockfile({
      ...lockfile,
      entries: [{ ...lockfile.entries[0]!, prohibitedUses: ["commercial-webtoon"] }],
    })).toContainEqual(expect.objectContaining({ code: "conflicting-use-policy" }));
  });
});
