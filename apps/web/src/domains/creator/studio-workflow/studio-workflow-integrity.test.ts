import { describe, expect, it } from "vitest";

import {
  createEmptyStudioIdentityIndex,
  upsertStudioIdentityLink,
} from "../studio-foundation/studio-semantic-identity";
import {
  createEmptyStudioVersionCoordinates,
  type StudioVersionCoordinates,
} from "../studio-foundation/studio-version-coordinates";

import type { StudioAssetLicenseRevisionV2, StudioAssetReferenceV2 } from "./studio-asset-reference-v2";
import type { StudioCharacterBibleV2 } from "./studio-character-bible-v2";

import {
  createStudioApproval,
  createStudioReviewCycle,
  type StudioReviewThreadV1,
} from "./studio-review-workflow";
import { evaluateStudioWorkflowIntegrity } from "./studio-workflow-integrity";

const NOW = "2026-09-07T00:00:00.000Z";
const LATER = "2026-09-08T00:00:00.000Z";
const HASH = `sha256:${"a".repeat(64)}`;

function approvedCoordinates(): StudioVersionCoordinates {
  return {
    local: {
      sequence: 10,
      durableState: "opfs",
      documentDigest: "digest-r42",
      baseServerRevision: 42,
      pendingServerMutations: 0,
    },
    server: { revision: 42, contentDigest: "digest-r42" },
    review: {
      cycleId: "review-cycle-1",
      snapshotId: "review-snapshot-1",
      sourceRevision: 42,
      sourceDigest: "digest-r42",
      status: "approved",
    },
    approval: {
      approvalId: "approval-1",
      reviewSnapshotId: "review-snapshot-1",
      sourceRevision: 42,
      sourceDigest: "digest-r42",
    },
    publish: null,
  };
}

function characterBible(): StudioCharacterBibleV2 {
  return {
    version: 2,
    characters: [{
      id: "character-sua",
      name: "수아",
      aliases: [],
      role: "주인공",
      canonicalVersionId: "character-sua:canon:1",
      versions: [{
        id: "character-sua:canon:1",
        characterId: "character-sua",
        label: "기본",
        status: "approved",
        effectiveFromEpisodeNo: null,
        effectiveToEpisodeNo: null,
        appearance: {
          summary: "짧은 검은 머리",
          face: "",
          hair: "",
          body: "",
          relativeHeight: null,
          distinctiveFeatures: [],
        },
        defaultCostume: "교복",
        palette: [],
        voice: "단정한 말투",
        goal: "친구를 지킨다",
        props: ["은색 반지"],
        locks: { appearance: "hard" },
        references: [],
        createdAt: NOW,
        changeReason: "초기 설정",
      }],
      variants: [],
      relationships: [],
      tags: [],
      status: "approved",
    }],
  };
}

function asset(): StudioAssetReferenceV2 {
  return {
    version: 2,
    assetId: "asset-1",
    revisionId: "asset-1:r1",
    contentHash: HASH,
    mimeType: "image/png",
    byteLength: 1024,
    width: 800,
    height: 1280,
    durationMs: null,
    origin: "marketplace",
    createdAt: NOW,
    licenseRevisionId: "license-1:r1",
  };
}

function license(): StudioAssetLicenseRevisionV2 {
  return {
    id: "license-1:r1",
    assetId: "asset-1",
    sourceName: "공식 마켓",
    sourceUrl: null,
    creator: "작가",
    commercialUse: "allowed",
    modification: "allowed",
    aiInput: "allowed",
    attributionRequired: false,
    attributionText: "",
    redistribution: "prohibited",
    effectiveFrom: NOW,
    capturedAt: NOW,
    evidenceAssetRevisionId: null,
  };
}

function reviewBundle(threads: readonly StudioReviewThreadV1[] = []) {
  const { cycle, snapshot } = createStudioReviewCycle({
    cycleId: "review-cycle-1",
    snapshotId: "review-snapshot-1",
    workId: "work-1",
    sourceServerRevision: 42,
    sourceContentDigest: "digest-r42",
    sourceArchiveSchemaVersion: 3,
    actorId: "user-producer",
    createdAt: NOW,
  });
  const approval = createStudioApproval({
    approvalId: "approval-1",
    cycle,
    snapshot,
    threads,
    approvedBy: "user-producer",
    approvedAt: LATER,
    statementDigest: "statement-digest",
  });
  return {
    cycle: { ...cycle, status: "approved" as const, updatedAt: LATER },
    snapshots: [snapshot],
    threads,
    approval,
  };
}

function identity() {
  return upsertStudioIdentityLink(
    createEmptyStudioIdentityIndex("work:episode-1"),
    {
      semanticId: "panel-1",
      kind: "panel",
      references: [{
        domain: "writer-room",
        entityType: "panel",
        entityId: "writer-panel-1",
      }],
      source: "native",
      createdAt: NOW,
    },
  );
}

describe("Studio workflow integrity", () => {
  it("allows review without requiring archive or review records to exist yet", () => {
    const report = evaluateStudioWorkflowIntegrity({
      versionCoordinates: createEmptyStudioVersionCoordinates(),
      identityIndex: identity(),
      characterBible: characterBible(),
    });

    expect(report.canRequestReview).toBe(true);
    expect(report.canApprove).toBe(false);
    expect(report.canPublish).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "archive", severity: "warning" }),
    ]));
  });

  it("allows publishing only when review, approval, asset rights, and source coordinates agree", () => {
    const review = reviewBundle();
    const report = evaluateStudioWorkflowIntegrity({
      versionCoordinates: approvedCoordinates(),
      identityIndex: identity(),
      characterBible: characterBible(),
      assets: [{
        reference: asset(),
        license: license(),
        usedAsAiReference: true,
        usedInPublish: true,
        modified: true,
        attributionIncluded: true,
      }],
      review,
      publishSource: { serverRevision: 42, contentDigest: "digest-r42" },
    });

    expect(report.canRequestReview).toBe(true);
    expect(report.canApprove).toBe(true);
    expect(report.canPublish).toBe(true);
    expect(report.blockingIssueIds.publish).toEqual([]);
  });

  it("blocks publish when the requested source differs from the immutable approval", () => {
    const report = evaluateStudioWorkflowIntegrity({
      versionCoordinates: approvedCoordinates(),
      identityIndex: identity(),
      characterBible: characterBible(),
      review: reviewBundle(),
      publishSource: { serverRevision: 43, contentDigest: "digest-r43" },
    });

    expect(report.canPublish).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.stringContaining("publish-source-not-approved") }),
    ]));
  });

  it("blocks publishing an otherwise approved work with a malformed render source pin", () => {
    const input: Parameters<typeof evaluateStudioWorkflowIntegrity>[0] = {
      versionCoordinates: approvedCoordinates(),
      identityIndex: identity(),
      characterBible: characterBible(),
      review: reviewBundle(),
      publishSource: { serverRevision: 42, contentDigest: "digest-r42" },
      sceneRenderReceipts: [{
        version: 1,
        id: "render-1",
        sourceSceneAssetId: "",
        sourceSceneRevisionId: "scene-1:r1",
        sourceSceneContentHash: HASH,
        engine: "three",
        cameraId: "camera-1",
        poseRevisionId: null,
        lightingRevisionId: null,
        renderPresetId: "preset-1",
        output: asset(),
        depth: null,
        normal: null,
        objectIdMask: null,
        renderedAt: NOW,
      }],
    };
    const report = evaluateStudioWorkflowIntegrity(input);

    expect(report.canPublish).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "sceneRenderReceipts[0].sceneReceipt.sourceSceneAssetId",
        blocks: ["publish"],
      }),
    ]));
    expect(evaluateStudioWorkflowIntegrity({
      ...input,
      sceneRenderReceipts: input.sceneRenderReceipts?.map((receipt) => ({
        ...receipt, sourceSceneAssetId: "scene-1",
      })),
    }).canPublish).toBe(true);
  });

  it("blocks publish on unknown commercial rights", () => {
    const report = evaluateStudioWorkflowIntegrity({
      versionCoordinates: approvedCoordinates(),
      identityIndex: identity(),
      characterBible: characterBible(),
      assets: [{
        reference: asset(),
        license: { ...license(), commercialUse: "unknown" },
        usedAsAiReference: false,
        usedInPublish: true,
        modified: false,
        attributionIncluded: true,
      }],
      review: reviewBundle(),
      publishSource: { serverRevision: 42, contentDigest: "digest-r42" },
    });

    expect(report.canPublish).toBe(false);
    expect(report.issues.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining([expect.stringContaining("commercial-use-unknown")]),
    );
  });

  it("blocks review when the semantic identity index is structurally invalid", () => {
    const valid = identity();
    const invalid = {
      ...valid,
      links: [
        ...valid.links,
        { ...valid.links[0], state: "orphaned" as const },
      ],
    };
    const report = evaluateStudioWorkflowIntegrity({
      versionCoordinates: createEmptyStudioVersionCoordinates(),
      identityIndex: invalid,
      characterBible: characterBible(),
    });

    expect(report.canRequestReview).toBe(false);
    expect(report.issues.some((candidate) => candidate.category === "identity")).toBe(true);
  });

  it("blocks approval and publishing for unresolved blocker threads", () => {
    const blocker: StudioReviewThreadV1 = {
      version: 1,
      id: "thread-blocker",
      reviewSnapshotId: "review-snapshot-1",
      sourceThreadId: null,
      anchor: { type: "semantic-entity", semanticId: "panel-1" },
      severity: "blocker",
      status: "open",
      assigneeId: null,
      dueAt: null,
      createdBy: "user-producer",
      createdAt: NOW,
      resolvedBy: null,
      resolvedAt: null,
    };
    const { cycle, snapshot } = createStudioReviewCycle({
      cycleId: "review-cycle-1",
      snapshotId: "review-snapshot-1",
      workId: "work-1",
      sourceServerRevision: 42,
      sourceContentDigest: "digest-r42",
      sourceArchiveSchemaVersion: 3,
      actorId: "user-producer",
      createdAt: NOW,
    });
    const report = evaluateStudioWorkflowIntegrity({
      versionCoordinates: approvedCoordinates(),
      identityIndex: identity(),
      characterBible: characterBible(),
      review: { cycle, snapshots: [snapshot], threads: [blocker], approval: null },
      publishSource: { serverRevision: 42, contentDigest: "digest-r42" },
    });

    expect(report.canApprove).toBe(false);
    expect(report.canPublish).toBe(false);
    expect(report.blockingIssueIds.approval.length).toBeGreaterThan(0);
  });
});
