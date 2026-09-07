import { describe, expect, it } from "vitest";

import type { StudioAssetReferenceV2 } from "./studio-asset-reference-v2";

import {
  compareStudioGenerationInputToCurrent,
  planStudioGenerationCandidateApplication,
  validateStudioGenerationCandidate,
  validateStudioGenerationCandidateLineage,
  validateStudioGenerationInputSnapshot,
  type StudioGenerationCandidateV1,
  type StudioGenerationCurrentContext,
  type StudioGenerationInputSnapshotV1,
} from "./studio-generation-candidate";

const NOW = "2026-09-07T00:00:00.000Z";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function asset(
  revisionId: string,
  contentHash = HASH_A,
): StudioAssetReferenceV2 {
  return {
    version: 2,
    assetId: "asset-image",
    revisionId,
    contentHash,
    mimeType: "image/png",
    byteLength: 100,
    width: 800,
    height: 1280,
    durationMs: null,
    origin: "generated",
    createdAt: NOW,
    licenseRevisionId: null,
  };
}

function snapshot(): StudioGenerationInputSnapshotV1 {
  return {
    version: 1,
    snapshotDigest: "generation-input-digest-1",
    workScope: "work:episode-1",
    localDocumentDigest: "document-digest-1",
    serverRevision: 7,
    semanticPanelId: "panel-1",
    targetElementId: "element-1",
    characterPins: [{
      characterId: "character-sua",
      characterVersionId: "character-sua:canon:2",
      variantIds: ["character-sua:variant:uniform"],
      promptReceiptDigest: "prompt-digest-1",
    }],
    styleVersionId: "style-3",
    references: [{
      role: "composition",
      asset: asset("asset-image:r1"),
      strength: 0.75,
    }],
    editMask: null,
    protectMask: null,
    createdAt: NOW,
  };
}

function current(input = snapshot()): StudioGenerationCurrentContext {
  return {
    localDocumentDigest: input.localDocumentDigest,
    serverRevision: input.serverRevision,
    semanticPanelId: input.semanticPanelId,
    targetElementId: input.targetElementId,
    characterPins: input.characterPins,
    styleVersionId: input.styleVersionId,
    references: input.references,
    editMask: input.editMask,
    protectMask: input.protectMask,
  };
}

function candidate(
  patch: Partial<StudioGenerationCandidateV1> = {},
): StudioGenerationCandidateV1 {
  return {
    version: 1,
    id: "candidate-1",
    requestId: "request-1",
    parentCandidateId: null,
    output: asset("asset-image:result-1", HASH_B),
    thumbnail: null,
    inputSnapshotDigest: "generation-input-digest-1",
    label: "구도 우수",
    favorite: false,
    selectedAsBase: false,
    state: "ready",
    createdAt: NOW,
    ...patch,
  };
}

describe("Studio generation candidate", () => {
  it("validates a candidate and its fully pinned input snapshot", () => {
    expect(validateStudioGenerationInputSnapshot(snapshot())).toEqual([]);
    expect(validateStudioGenerationCandidate(candidate())).toEqual([]);
  });

  it("detects document, character, style, reference, and mask drift", () => {
    const source = snapshot();
    const next: StudioGenerationCurrentContext = {
      ...current(source),
      localDocumentDigest: "document-digest-2",
      characterPins: [{
        ...source.characterPins[0],
        characterVersionId: "character-sua:canon:3",
        variantIds: [],
        promptReceiptDigest: "prompt-digest-2",
      }],
      styleVersionId: "style-4",
      references: [{
        role: "composition",
        asset: asset("asset-image:r2", HASH_B),
        strength: 0.5,
      }],
      editMask: asset("asset-image:mask-1"),
    };

    const result = compareStudioGenerationInputToCurrent(source, next);
    expect(result.stale).toBe(true);
    expect(result.reasons).toEqual(expect.arrayContaining([
      "document-digest",
      "character-version",
      "style-version",
      "reference-revision",
      "edit-mask",
    ]));
  });

  it("treats reference-strength and prompt-receipt changes as stale", () => {
    const source = snapshot();
    const next: StudioGenerationCurrentContext = {
      ...current(source),
      characterPins: [{
        ...source.characterPins[0],
        promptReceiptDigest: "prompt-digest-2",
      }],
      references: [{ ...source.references[0], strength: 0.25 }],
    };

    expect(compareStudioGenerationInputToCurrent(source, next).reasons).toEqual(
      expect.arrayContaining(["character-prompt", "reference-revision"]),
    );
  });

  it("plans a new-layer application without mutating the document", () => {
    const source = snapshot();
    const plan = planStudioGenerationCandidateApplication({
      candidate: candidate(),
      snapshot: source,
      current: current(source),
      mode: "new-layer",
    });

    expect(plan).toMatchObject({
      candidateId: "candidate-1",
      mode: "new-layer",
      targetElementId: "element-1",
      requiresExplicitStaleConfirmation: false,
    });
    expect(plan.commands).toEqual(expect.arrayContaining([
      "asset/attach-revision",
      "page-state/add-image-element",
      "ai/link-provenance",
    ]));
  });

  it("requires explicit confirmation before a stale candidate replaces a target", () => {
    const source = snapshot();
    const changed = { ...current(source), localDocumentDigest: "document-digest-2" };

    expect(() => planStudioGenerationCandidateApplication({
      candidate: candidate(),
      snapshot: source,
      current: changed,
      mode: "replace-target",
    })).toThrow(/without confirmation/u);

    const confirmed = planStudioGenerationCandidateApplication({
      candidate: candidate(),
      snapshot: source,
      current: changed,
      mode: "replace-target",
      confirmStale: true,
    });
    expect(confirmed.requiresExplicitStaleConfirmation).toBe(true);
    expect(confirmed.staleReasons).toContain("document-digest");
    expect(confirmed.commands).toContain("page-state/replace-element-source");
  });

  it("rejects a candidate whose input digest does not match the snapshot", () => {
    expect(() => planStudioGenerationCandidateApplication({
      candidate: candidate({ inputSnapshotDigest: "another-input" }),
      snapshot: snapshot(),
      current: current(),
      mode: "new-layer",
    })).toThrow(/digests do not match/u);
  });

  it("reports missing parents and cycles in candidate lineage", () => {
    const missingParent = candidate({ id: "candidate-missing", parentCandidateId: "no-parent" });
    const first = candidate({ id: "candidate-a", parentCandidateId: "candidate-b" });
    const second = candidate({ id: "candidate-b", parentCandidateId: "candidate-a" });

    expect(validateStudioGenerationCandidateLineage([missingParent]).map((issue) => issue.code)).toContain(
      "parent-missing",
    );
    expect(validateStudioGenerationCandidateLineage([first, second]).map((issue) => issue.code)).toContain(
      "candidate-cycle",
    );
  });
});
