import {
  sameStudioAssetRevision,
  validateStudioAssetReferenceV2,
  type StudioAssetReferenceV2,
} from "./studio-asset-reference-v2";

export const STUDIO_GENERATION_REFERENCE_ROLES = [
  "character-identity",
  "outfit",
  "pose",
  "composition",
  "style",
  "location",
  "color",
  "lighting",
  "depth",
] as const;

export type StudioGenerationReferenceRole =
  (typeof STUDIO_GENERATION_REFERENCE_ROLES)[number];

export interface StudioGenerationReferenceV1 {
  readonly role: StudioGenerationReferenceRole;
  readonly asset: StudioAssetReferenceV2;
  readonly strength: number;
}

export interface StudioGenerationCharacterPinV1 {
  readonly characterId: string;
  readonly characterVersionId: string;
  readonly variantIds: readonly string[];
  readonly promptReceiptDigest: string;
}

export interface StudioGenerationInputSnapshotV1 {
  readonly version: 1;
  readonly workScope: string;
  readonly localDocumentDigest: string;
  readonly serverRevision: number | null;
  readonly semanticPanelId: string | null;
  readonly targetElementId: string | null;
  readonly characterPins: readonly StudioGenerationCharacterPinV1[];
  readonly styleVersionId: string | null;
  readonly references: readonly StudioGenerationReferenceV1[];
  readonly editMask: StudioAssetReferenceV2 | null;
  readonly protectMask: StudioAssetReferenceV2 | null;
  readonly createdAt: string;
}

export type StudioGenerationCandidateState =
  | "ready"
  | "inserted"
  | "rejected"
  | "archived";

export interface StudioGenerationCandidateV1 {
  readonly version: 1;
  readonly id: string;
  readonly requestId: string;
  readonly parentCandidateId: string | null;
  readonly output: StudioAssetReferenceV2;
  readonly thumbnail: StudioAssetReferenceV2 | null;
  readonly inputSnapshotDigest: string;
  readonly label: string;
  readonly favorite: boolean;
  readonly selectedAsBase: boolean;
  readonly state: StudioGenerationCandidateState;
  readonly createdAt: string;
}

export type StudioGenerationStaleReason =
  | "document-digest"
  | "server-revision"
  | "target-panel"
  | "target-element"
  | "character-version"
  | "character-variant"
  | "style-version"
  | "reference-revision"
  | "edit-mask"
  | "protect-mask";

export interface StudioGenerationStaleness {
  readonly stale: boolean;
  readonly reasons: readonly StudioGenerationStaleReason[];
}

export interface StudioGenerationCurrentContext {
  readonly localDocumentDigest: string;
  readonly serverRevision: number | null;
  readonly semanticPanelId: string | null;
  readonly targetElementId: string | null;
  readonly characterPins: readonly Pick<
    StudioGenerationCharacterPinV1,
    "characterId" | "characterVersionId" | "variantIds"
  >[];
  readonly styleVersionId: string | null;
  readonly references: readonly StudioGenerationReferenceV1[];
  readonly editMask: StudioAssetReferenceV2 | null;
  readonly protectMask: StudioAssetReferenceV2 | null;
}

export type StudioGenerationApplicationMode =
  | "new-layer"
  | "replace-target";

export interface StudioGenerationApplicationPlan {
  readonly candidateId: string;
  readonly mode: StudioGenerationApplicationMode;
  readonly semanticPanelId: string | null;
  readonly targetElementId: string | null;
  readonly outputAssetRevisionId: string;
  readonly inputSnapshotDigest: string;
  readonly requiresExplicitStaleConfirmation: boolean;
  readonly commands: readonly string[];
}

export type StudioGenerationCandidateIssueCode =
  | "invalid-id"
  | "invalid-timestamp"
  | "invalid-strength"
  | "invalid-output-asset"
  | "invalid-thumbnail-asset"
  | "duplicate-character-pin"
  | "duplicate-reference-role-revision"
  | "missing-document-digest"
  | "missing-input-snapshot-digest"
  | "candidate-cycle"
  | "parent-missing";

export interface StudioGenerationCandidateIssue {
  readonly code: StudioGenerationCandidateIssueCode;
  readonly entityId?: string;
  readonly message: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function referenceKey(reference: StudioGenerationReferenceV1): string {
  return `${reference.role}:${reference.asset.assetId}:${reference.asset.revisionId}`;
}

function sameNullableAsset(
  left: StudioAssetReferenceV2 | null,
  right: StudioAssetReferenceV2 | null,
): boolean {
  if (left === null || right === null) return left === right;
  return sameStudioAssetRevision(left, right);
}

function characterPinMap(
  pins: StudioGenerationCurrentContext["characterPins"],
): Map<string, StudioGenerationCurrentContext["characterPins"][number]> {
  return new Map(pins.map((pin) => [pin.characterId, pin]));
}

export function validateStudioGenerationInputSnapshot(
  snapshot: StudioGenerationInputSnapshotV1,
): readonly StudioGenerationCandidateIssue[] {
  const issues: StudioGenerationCandidateIssue[] = [];
  if (!snapshot.localDocumentDigest.trim()) {
    issues.push({
      code: "missing-document-digest",
      message: "A generation input snapshot must pin the local document digest.",
    });
  }
  if (!validTimestamp(snapshot.createdAt)) {
    issues.push({
      code: "invalid-timestamp",
      message: "Generation input snapshot timestamp is invalid.",
    });
  }
  const characterIds = new Set<string>();
  for (const pin of snapshot.characterPins) {
    if (characterIds.has(pin.characterId)) {
      issues.push({
        code: "duplicate-character-pin",
        entityId: pin.characterId,
        message: `Character ${pin.characterId} is pinned more than once.`,
      });
    }
    characterIds.add(pin.characterId);
  }
  const referenceKeys = new Set<string>();
  for (const reference of snapshot.references) {
    if (!Number.isFinite(reference.strength) || reference.strength < 0 || reference.strength > 1) {
      issues.push({
        code: "invalid-strength",
        entityId: reference.asset.revisionId,
        message: "Generation reference strength must be between zero and one.",
      });
    }
    const key = referenceKey(reference);
    if (referenceKeys.has(key)) {
      issues.push({
        code: "duplicate-reference-role-revision",
        entityId: reference.asset.revisionId,
        message: `Duplicate generation reference: ${key}`,
      });
    }
    referenceKeys.add(key);
    issues.push(...validateStudioAssetReferenceV2(reference.asset).map((issue) => ({
      code: "invalid-output-asset" as const,
      entityId: reference.asset.revisionId,
      message: issue.message,
    })));
  }
  for (const mask of [snapshot.editMask, snapshot.protectMask]) {
    if (mask === null) continue;
    issues.push(...validateStudioAssetReferenceV2(mask).map((issue) => ({
      code: "invalid-output-asset" as const,
      entityId: mask.revisionId,
      message: issue.message,
    })));
  }
  return issues;
}

export function validateStudioGenerationCandidate(
  candidate: StudioGenerationCandidateV1,
): readonly StudioGenerationCandidateIssue[] {
  const issues: StudioGenerationCandidateIssue[] = [];
  if (!SAFE_ID.test(candidate.id) || !SAFE_ID.test(candidate.requestId)) {
    issues.push({
      code: "invalid-id",
      entityId: candidate.id,
      message: "Generation candidate or request ID is invalid.",
    });
  }
  if (!candidate.inputSnapshotDigest.trim()) {
    issues.push({
      code: "missing-input-snapshot-digest",
      entityId: candidate.id,
      message: "Generation candidate must pin its input snapshot digest.",
    });
  }
  if (!validTimestamp(candidate.createdAt)) {
    issues.push({
      code: "invalid-timestamp",
      entityId: candidate.id,
      message: "Generation candidate timestamp is invalid.",
    });
  }
  issues.push(...validateStudioAssetReferenceV2(candidate.output).map((issue) => ({
    code: "invalid-output-asset" as const,
    entityId: candidate.id,
    message: issue.message,
  })));
  if (candidate.thumbnail !== null) {
    issues.push(...validateStudioAssetReferenceV2(candidate.thumbnail).map((issue) => ({
      code: "invalid-thumbnail-asset" as const,
      entityId: candidate.id,
      message: issue.message,
    })));
  }
  return issues;
}

export function compareStudioGenerationInputToCurrent(
  snapshot: StudioGenerationInputSnapshotV1,
  current: StudioGenerationCurrentContext,
): StudioGenerationStaleness {
  const reasons = new Set<StudioGenerationStaleReason>();
  if (snapshot.localDocumentDigest !== current.localDocumentDigest) {
    reasons.add("document-digest");
  }
  if (snapshot.serverRevision !== current.serverRevision) {
    reasons.add("server-revision");
  }
  if (snapshot.semanticPanelId !== current.semanticPanelId) {
    reasons.add("target-panel");
  }
  if (snapshot.targetElementId !== current.targetElementId) {
    reasons.add("target-element");
  }
  const currentCharacters = characterPinMap(current.characterPins);
  if (snapshot.characterPins.length !== current.characterPins.length) {
    reasons.add("character-version");
  }
  for (const pin of snapshot.characterPins) {
    const next = currentCharacters.get(pin.characterId);
    if (!next || next.characterVersionId !== pin.characterVersionId) {
      reasons.add("character-version");
      continue;
    }
    if (!sameStringSet(next.variantIds, pin.variantIds)) {
      reasons.add("character-variant");
    }
  }
  if (snapshot.styleVersionId !== current.styleVersionId) {
    reasons.add("style-version");
  }
  const currentReferenceKeys = new Set(current.references.map(referenceKey));
  const snapshotReferenceKeys = new Set(snapshot.references.map(referenceKey));
  if (
    currentReferenceKeys.size !== snapshotReferenceKeys.size
    || [...snapshotReferenceKeys].some((key) => !currentReferenceKeys.has(key))
  ) {
    reasons.add("reference-revision");
  }
  if (!sameNullableAsset(snapshot.editMask, current.editMask)) {
    reasons.add("edit-mask");
  }
  if (!sameNullableAsset(snapshot.protectMask, current.protectMask)) {
    reasons.add("protect-mask");
  }
  return { stale: reasons.size > 0, reasons: [...reasons] };
}

export function planStudioGenerationCandidateApplication(input: {
  readonly candidate: StudioGenerationCandidateV1;
  readonly snapshot: StudioGenerationInputSnapshotV1;
  readonly current: StudioGenerationCurrentContext;
  readonly mode: StudioGenerationApplicationMode;
  readonly confirmStale?: boolean;
}): StudioGenerationApplicationPlan {
  const candidateIssues = validateStudioGenerationCandidate(input.candidate);
  const snapshotIssues = validateStudioGenerationInputSnapshot(input.snapshot);
  if (candidateIssues.length > 0 || snapshotIssues.length > 0) {
    throw new Error("Cannot apply an invalid Studio generation candidate.");
  }
  if (input.candidate.inputSnapshotDigest !== input.snapshot.localDocumentDigest) {
    throw new Error("Candidate and generation input snapshot digests do not match.");
  }
  if (input.candidate.state !== "ready") {
    throw new Error(`Candidate ${input.candidate.id} is not ready for application.`);
  }
  const staleness = compareStudioGenerationInputToCurrent(input.snapshot, input.current);
  if (staleness.stale && input.mode === "replace-target" && input.confirmStale !== true) {
    throw new Error("A stale generation candidate cannot replace the current target without confirmation.");
  }
  if (input.mode === "replace-target" && input.snapshot.targetElementId === null) {
    throw new Error("Replacing a target requires a pinned target element.");
  }
  return {
    candidateId: input.candidate.id,
    mode: input.mode,
    semanticPanelId: input.snapshot.semanticPanelId,
    targetElementId: input.snapshot.targetElementId,
    outputAssetRevisionId: input.candidate.output.revisionId,
    inputSnapshotDigest: input.candidate.inputSnapshotDigest,
    requiresExplicitStaleConfirmation: staleness.stale,
    commands: input.mode === "new-layer"
      ? [
          "asset/attach-revision",
          "page-state/add-image-element",
          "ai/link-provenance",
          "continuity/mark-dirty",
          "publish/mark-validation-dirty",
        ]
      : [
          "asset/attach-revision",
          "page-state/replace-element-source",
          "ai/link-provenance",
          "continuity/mark-dirty",
          "publish/mark-validation-dirty",
        ],
  };
}

export function validateStudioGenerationCandidateLineage(
  candidates: readonly StudioGenerationCandidateV1[],
): readonly StudioGenerationCandidateIssue[] {
  const issues: StudioGenerationCandidateIssue[] = [];
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const candidate of candidates) {
    if (candidate.parentCandidateId !== null && !byId.has(candidate.parentCandidateId)) {
      issues.push({
        code: "parent-missing",
        entityId: candidate.id,
        message: `Candidate ${candidate.id} references a missing parent.`,
      });
      continue;
    }
    const visited = new Set<string>();
    let cursor: StudioGenerationCandidateV1 | undefined = candidate;
    while (cursor) {
      if (visited.has(cursor.id)) {
        issues.push({
          code: "candidate-cycle",
          entityId: candidate.id,
          message: `Candidate lineage contains a cycle at ${cursor.id}.`,
        });
        break;
      }
      visited.add(cursor.id);
      cursor = cursor.parentCandidateId === null
        ? undefined
        : byId.get(cursor.parentCandidateId);
    }
  }
  return issues;
}
