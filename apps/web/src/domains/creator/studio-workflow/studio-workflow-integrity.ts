import {
  validateStudioIdentityIndex,
  type StudioIdentityIndexV1,
} from "../studio-foundation/studio-semantic-identity";
import {
  validateStudioVersionCoordinates,
  type StudioVersionCoordinates,
} from "../studio-foundation/studio-version-coordinates";

import {
  decideStudioAssetAiReferenceUse,
  decideStudioAssetPublishUse,
  type StudioAssetLicenseRevisionV2,
  type StudioAssetReferenceV2,
} from "./studio-asset-reference-v2";
import {
  validateStudioCharacterBibleV2,
  type StudioCharacterBibleV2,
} from "./studio-character-bible-v2";
import {
  validateStudioGenerationCandidate,
  validateStudioGenerationCandidateLineage,
  validateStudioGenerationInputSnapshot,
  type StudioGenerationCandidateV1,
  type StudioGenerationInputSnapshotV1,
} from "./studio-generation-candidate";
import {
  validateStudioProjectArchiveV3,
  type StudioProjectArchiveV3,
} from "./studio-project-archive-v3";
import {
  validateStudioMotionRenderReceipt,
  validateStudioRenderedSceneReceipt,
  type StudioMotionRenderReceiptV1,
  type StudioRenderedSceneReceiptV1,
} from "./studio-render-source-pin";
import {
  canPublishStudioApproval,
  evaluateStudioReviewApproval,
  validateStudioReviewWorkflow,
  type StudioApprovalV1,
  type StudioReviewCycleV1,
  type StudioReviewSnapshotV1,
  type StudioReviewThreadV1,
} from "./studio-review-workflow";
import {
  validateStudioRuntimeOwnership,
  type StudioRuntimeOwnerSpec,
} from "./studio-runtime-ownership";

export type StudioWorkflowGate = "review" | "approval" | "publish";
export type StudioWorkflowIntegritySeverity = "info" | "warning" | "error" | "blocker";
export type StudioWorkflowIntegrityCategory =
  | "architecture"
  | "version"
  | "archive"
  | "identity"
  | "character"
  | "asset"
  | "generation"
  | "review"
  | "render";

export interface StudioWorkflowIntegrityIssue {
  readonly id: string;
  readonly category: StudioWorkflowIntegrityCategory;
  readonly severity: StudioWorkflowIntegritySeverity;
  readonly message: string;
  readonly path: string;
  readonly blocks: readonly StudioWorkflowGate[];
}

export interface StudioWorkflowAssetUseInput {
  readonly reference: StudioAssetReferenceV2;
  readonly license: StudioAssetLicenseRevisionV2 | null;
  readonly usedAsAiReference: boolean;
  readonly usedInPublish: boolean;
  readonly modified: boolean;
  readonly attributionIncluded: boolean;
}

export interface StudioWorkflowReviewInput {
  readonly cycle: StudioReviewCycleV1;
  readonly snapshots: readonly StudioReviewSnapshotV1[];
  readonly threads: readonly StudioReviewThreadV1[];
  readonly approval: StudioApprovalV1 | null;
}

export interface StudioWorkflowIntegrityInput {
  readonly versionCoordinates: StudioVersionCoordinates;
  readonly runtimeOwners?: readonly StudioRuntimeOwnerSpec[];
  readonly archive?: StudioProjectArchiveV3 | null;
  readonly identityIndex?: StudioIdentityIndexV1 | null;
  readonly characterBible?: StudioCharacterBibleV2 | null;
  readonly assets?: readonly StudioWorkflowAssetUseInput[];
  readonly generationSnapshots?: readonly StudioGenerationInputSnapshotV1[];
  readonly generationCandidates?: readonly StudioGenerationCandidateV1[];
  readonly review?: StudioWorkflowReviewInput | null;
  readonly sceneRenderReceipts?: readonly StudioRenderedSceneReceiptV1[];
  readonly motionRenderReceipts?: readonly StudioMotionRenderReceiptV1[];
  readonly publishSource?: {
    readonly serverRevision: number;
    readonly contentDigest: string;
  } | null;
}

export interface StudioWorkflowIntegrityReport {
  readonly issues: readonly StudioWorkflowIntegrityIssue[];
  readonly counts: Readonly<Record<StudioWorkflowIntegritySeverity, number>>;
  readonly canRequestReview: boolean;
  readonly canApprove: boolean;
  readonly canPublish: boolean;
  readonly blockingIssueIds: Readonly<Record<StudioWorkflowGate, readonly string[]>>;
}

function issue(input: Omit<StudioWorkflowIntegrityIssue, "id"> & { readonly code: string }): StudioWorkflowIntegrityIssue {
  return {
    id: `${input.category}:${input.code}:${input.path}`,
    category: input.category,
    severity: input.severity,
    message: input.message,
    path: input.path,
    blocks: input.blocks,
  };
}

function blocksGate(
  candidate: StudioWorkflowIntegrityIssue,
  gate: StudioWorkflowGate,
): boolean {
  return candidate.blocks.includes(gate)
    && (candidate.severity === "error" || candidate.severity === "blocker");
}

export function evaluateStudioWorkflowIntegrity(
  input: StudioWorkflowIntegrityInput,
): StudioWorkflowIntegrityReport {
  const issues: StudioWorkflowIntegrityIssue[] = [];

  for (const runtimeIssue of validateStudioRuntimeOwnership(input.runtimeOwners)) {
    issues.push(issue({
      code: runtimeIssue.code,
      category: "architecture",
      severity: "blocker",
      message: runtimeIssue.message,
      path: runtimeIssue.ownerId ?? runtimeIssue.domain ?? "runtime",
      blocks: ["review", "approval", "publish"],
    }));
  }

  for (const versionIssue of validateStudioVersionCoordinates(input.versionCoordinates)) {
    const approvalRelated = versionIssue.code.startsWith("review-")
      || versionIssue.code.startsWith("approval-");
    issues.push(issue({
      code: versionIssue.code,
      category: "version",
      severity: "blocker",
      message: versionIssue.message,
      path: "versionCoordinates",
      blocks: approvalRelated
        ? ["approval", "publish"]
        : ["publish"],
    }));
  }

  if (input.archive) {
    for (const archiveIssue of validateStudioProjectArchiveV3(input.archive)) {
      issues.push(issue({
        code: archiveIssue.code,
        category: "archive",
        severity: "blocker",
        message: archiveIssue.message,
        path: archiveIssue.path,
        blocks: ["review", "approval", "publish"],
      }));
    }
  } else {
    issues.push(issue({
      code: "archive-missing",
      category: "archive",
      severity: "warning",
      message: "검수와 출판에 사용할 Archive v3가 아직 준비되지 않았습니다.",
      path: "archive",
      blocks: [],
    }));
  }

  if (input.identityIndex) {
    for (const identityIssue of validateStudioIdentityIndex(input.identityIndex)) {
      issues.push(issue({
        code: identityIssue.code,
        category: "identity",
        severity: "error",
        message: identityIssue.message,
        path: identityIssue.semanticId ?? identityIssue.referenceKey ?? "identity",
        blocks: ["review", "approval", "publish"],
      }));
    }
  }

  if (input.characterBible) {
    for (const characterIssue of validateStudioCharacterBibleV2(input.characterBible)) {
      issues.push(issue({
        code: characterIssue.code,
        category: "character",
        severity: "error",
        message: characterIssue.message,
        path: characterIssue.entityId ?? characterIssue.characterId,
        blocks: ["review", "approval", "publish"],
      }));
    }
  }

  for (const [index, assetInput] of (input.assets ?? []).entries()) {
    if (assetInput.usedAsAiReference) {
      const decision = decideStudioAssetAiReferenceUse(assetInput.reference, assetInput.license);
      for (const assetIssue of decision.issues) {
        issues.push(issue({
          code: assetIssue.code,
          category: "asset",
          severity: assetIssue.blocking ? "blocker" : "warning",
          message: assetIssue.message,
          path: `assets[${index}]`,
          blocks: assetIssue.blocking ? ["review", "approval", "publish"] : [],
        }));
      }
    }
    if (assetInput.usedInPublish) {
      const decision = decideStudioAssetPublishUse(
        assetInput.reference,
        assetInput.license,
        {
          commercial: true,
          modified: assetInput.modified,
          attributionIncluded: assetInput.attributionIncluded,
        },
      );
      for (const assetIssue of decision.issues) {
        issues.push(issue({
          code: assetIssue.code,
          category: "asset",
          severity: assetIssue.blocking ? "blocker" : "warning",
          message: assetIssue.message,
          path: `assets[${index}]`,
          blocks: assetIssue.blocking ? ["publish"] : [],
        }));
      }
    }
  }

  const generationSnapshots = input.generationSnapshots ?? [];
  const suppliedSnapshotDigests = new Set(generationSnapshots.map((snapshot) => snapshot.snapshotDigest));
  for (const [index, snapshot] of generationSnapshots.entries()) {
    for (const candidateIssue of validateStudioGenerationInputSnapshot(snapshot)) {
      issues.push(issue({
        code: candidateIssue.code,
        category: "generation",
        severity: "error",
        message: candidateIssue.message,
        path: `generationSnapshots[${index}]`,
        blocks: ["review", "approval", "publish"],
      }));
    }
  }
  const candidates = input.generationCandidates ?? [];
  for (const [index, candidate] of candidates.entries()) {
    if (!suppliedSnapshotDigests.has(candidate.inputSnapshotDigest)) {
      issues.push(issue({
        code: "candidate-input-snapshot-missing",
        category: "generation",
        severity: "error",
        message: "Generation candidate input digest must reference a supplied generation snapshot.",
        path: `generationCandidates[${index}].inputSnapshotDigest`,
        blocks: ["review", "approval", "publish"],
      }));
    }
    for (const candidateIssue of validateStudioGenerationCandidate(candidate)) {
      issues.push(issue({
        code: candidateIssue.code,
        category: "generation",
        severity: "error",
        message: candidateIssue.message,
        path: `generationCandidates[${index}]`,
        blocks: ["review", "approval", "publish"],
      }));
    }
  }
  for (const lineageIssue of validateStudioGenerationCandidateLineage(candidates)) {
    issues.push(issue({
      code: lineageIssue.code,
      category: "generation",
      severity: "error",
      message: lineageIssue.message,
      path: lineageIssue.entityId ?? "generationCandidates",
      blocks: ["review", "approval", "publish"],
    }));
  }

  if (input.review) {
    const reviewIssues = validateStudioReviewWorkflow(input.review);
    for (const reviewIssue of reviewIssues) {
      issues.push(issue({
        code: reviewIssue.code,
        category: "review",
        severity: "blocker",
        message: reviewIssue.message,
        path: reviewIssue.entityId,
        blocks: ["approval", "publish"],
      }));
    }
    const currentSnapshot = input.review.snapshots.find((snapshot) =>
      snapshot.id === input.review?.cycle.currentSnapshotId
    );
    if (currentSnapshot) {
      const approvalDecision = evaluateStudioReviewApproval({
        cycle: input.review.cycle,
        snapshot: currentSnapshot,
        threads: input.review.threads,
      });
      for (const threadId of approvalDecision.blockingThreadIds) {
        issues.push(issue({
          code: "unresolved-blocker",
          category: "review",
          severity: "blocker",
          message: "미해결 Blocker 댓글이 있어 승인할 수 없습니다.",
          path: threadId,
          blocks: ["approval", "publish"],
        }));
      }
    }
  }

  for (const [index, receipt] of (input.sceneRenderReceipts ?? []).entries()) {
    for (const renderIssue of validateStudioRenderedSceneReceipt(receipt)) {
      issues.push(issue({
        code: renderIssue.code,
        category: "render",
        severity: "error",
        message: renderIssue.message,
        path: `sceneRenderReceipts[${index}].${renderIssue.path}`,
        blocks: ["publish"],
      }));
    }
  }
  for (const [index, receipt] of (input.motionRenderReceipts ?? []).entries()) {
    for (const renderIssue of validateStudioMotionRenderReceipt(receipt)) {
      issues.push(issue({
        code: renderIssue.code,
        category: "render",
        severity: "error",
        message: renderIssue.message,
        path: `motionRenderReceipts[${index}].${renderIssue.path}`,
        blocks: ["publish"],
      }));
    }
  }

  const blockingIssueIds = {
    review: issues.filter((candidate) => blocksGate(candidate, "review")).map((candidate) => candidate.id),
    approval: issues.filter((candidate) => blocksGate(candidate, "approval")).map((candidate) => candidate.id),
    publish: issues.filter((candidate) => blocksGate(candidate, "publish")).map((candidate) => candidate.id),
  } as const;

  let publishSourceApproved = false;
  if (input.review?.approval && input.publishSource) {
    publishSourceApproved = canPublishStudioApproval(
      input.review.approval,
      input.publishSource.serverRevision,
      input.publishSource.contentDigest,
    );
    if (!publishSourceApproved) {
      const mismatch = issue({
        code: "publish-source-not-approved",
        category: "review",
        severity: "blocker",
        message: "출판 원본이 승인 기록의 정확한 서버 리비전과 다릅니다.",
        path: "publishSource",
        blocks: ["publish"],
      });
      issues.push(mismatch);
      blockingIssueIds.publish.push(mismatch.id);
    }
  }

  const counts = {
    info: issues.filter((candidate) => candidate.severity === "info").length,
    warning: issues.filter((candidate) => candidate.severity === "warning").length,
    error: issues.filter((candidate) => candidate.severity === "error").length,
    blocker: issues.filter((candidate) => candidate.severity === "blocker").length,
  } as const;

  return {
    issues,
    counts,
    canRequestReview: blockingIssueIds.review.length === 0,
    canApprove:
      blockingIssueIds.approval.length === 0
      && input.review !== null
      && input.review !== undefined,
    canPublish:
      blockingIssueIds.publish.length === 0
      && publishSourceApproved,
    blockingIssueIds,
  };
}
