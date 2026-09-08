import { describe, expect, it } from "vitest";

import type { StudioAssetReferenceV2 } from "./studio-asset-reference-v2";

import {
  compareStudioGenerationInputToCurrent,
  computeStudioGenerationInputSnapshotDigest,
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
  const input: Omit<StudioGenerationInputSnapshotV1, "snapshotDigest"> = {
    version: 1,
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
  return { ...input, snapshotDigest: computeStudioGenerationInputSnapshotDigest(input) };
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
    inputSnapshotDigest: snapshot().snapshotDigest,
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

  it("keeps canonical digests stable across JSON round trips and nested object key ordering", () => {
    const source = snapshot();
    const roundTrip = JSON.parse(JSON.stringify(source)) as StudioGenerationInputSnapshotV1;
    const reordered = Object.fromEntries(Object.entries({
      ...roundTrip,
      references: roundTrip.references.map((reference) => ({
        ...reference,
        asset: Object.fromEntries(Object.entries(reference.asset).reverse()),
      })),
    }).reverse()) as unknown as StudioGenerationInputSnapshotV1;

    expect(computeStudioGenerationInputSnapshotDigest(roundTrip)).toBe(source.snapshotDigest);
    expect(computeStudioGenerationInputSnapshotDigest(reordered)).toBe(source.snapshotDigest);
    expect(validateStudioGenerationInputSnapshot(reordered)).toEqual([]);
    const withAnotherRecordedDigest = { ...source, snapshotDigest: "not-part-of-the-preimage" };
    expect(computeStudioGenerationInputSnapshotDigest(withAnotherRecordedDigest)).toBe(source.snapshotDigest);
  });

  it("rejects missing and arbitrary legacy digest strings instead of grandfathering them", () => {
    const source = snapshot();
    expect(validateStudioGenerationInputSnapshot({ ...source, snapshotDigest: " " })).toEqual([
      expect.objectContaining({ code: "missing-snapshot-digest" }),
    ]);
    expect(validateStudioGenerationInputSnapshot({ ...source, snapshotDigest: "generation-input-digest-1" })).toEqual([
      expect.objectContaining({ code: "snapshot-digest-mismatch" }),
    ]);
  });

  const mutations: ReadonlyArray<{
    name: string;
    mutate: (source: StudioGenerationInputSnapshotV1) => StudioGenerationInputSnapshotV1;
  }> = [
    { name: "character version", mutate: (source) => ({ ...source, characterPins: source.characterPins.map((pin) => ({ ...pin, characterVersionId: "character-sua:canon:3" })) }) },
    { name: "character variant", mutate: (source) => ({ ...source, characterPins: source.characterPins.map((pin) => ({ ...pin, variantIds: [] })) }) },
    { name: "prompt receipt", mutate: (source) => ({ ...source, characterPins: source.characterPins.map((pin) => ({ ...pin, promptReceiptDigest: "changed-prompt" })) }) },
    { name: "reference content", mutate: (source) => ({ ...source, references: source.references.map((reference) => ({ ...reference, asset: { ...reference.asset, contentHash: HASH_B } })) }) },
    { name: "reference strength", mutate: (source) => ({ ...source, references: source.references.map((reference) => ({ ...reference, strength: 0.25 })) }) },
    { name: "edit mask", mutate: (source) => ({ ...source, editMask: asset("asset-image:edit-mask") }) },
    { name: "protect mask", mutate: (source) => ({ ...source, protectMask: asset("asset-image:protect-mask") }) },
    { name: "target panel", mutate: (source) => ({ ...source, semanticPanelId: "panel-changed" }) },
    { name: "target element", mutate: (source) => ({ ...source, targetElementId: "element-changed" }) },
    { name: "work scope", mutate: (source) => ({ ...source, workScope: "work:other" }) },
    { name: "document digest", mutate: (source) => ({ ...source, localDocumentDigest: "document-changed" }) },
    { name: "server revision", mutate: (source) => ({ ...source, serverRevision: 8 }) },
    { name: "style version", mutate: (source) => ({ ...source, styleVersionId: "style-changed" }) },
    { name: "creation timestamp", mutate: (source) => ({ ...source, createdAt: "2026-09-08T00:00:00.000Z" }) },
  ];

  it.each(mutations)("rejects a changed $name retaining the original recorded digest", ({ mutate }) => {
    const source = snapshot();
    const changed = mutate(JSON.parse(JSON.stringify(source)) as StudioGenerationInputSnapshotV1);
    expect(changed.snapshotDigest).toBe(source.snapshotDigest);
    expect(computeStudioGenerationInputSnapshotDigest(changed)).not.toBe(source.snapshotDigest);
    expect(validateStudioGenerationInputSnapshot(changed)).toEqual([
      expect.objectContaining({ code: "snapshot-digest-mismatch" }),
    ]);
    for (const mode of ["new-layer", "replace-target"] as const) {
      expect(() => planStudioGenerationCandidateApplication({
        candidate: candidate(), snapshot: changed, current: current(changed), mode, confirmStale: true,
      })).toThrow(/invalid Studio generation candidate/u);
    }
  });

  it("accepts deliberately recomputed new input only when the candidate pins the new digest", () => {
    const source = { ...snapshot(), targetElementId: "element-new" };
    const updated = { ...source, snapshotDigest: computeStudioGenerationInputSnapshotDigest(source) };
    expect(validateStudioGenerationInputSnapshot(updated)).toEqual([]);
    expect(() => planStudioGenerationCandidateApplication({
      candidate: candidate(), snapshot: updated, current: current(updated), mode: "new-layer",
    })).toThrow(/digests do not match/u);
    expect(planStudioGenerationCandidateApplication({
      candidate: candidate({ inputSnapshotDigest: updated.snapshotDigest }),
      snapshot: updated, current: current(updated), mode: "new-layer",
    }).inputSnapshotDigest).toBe(updated.snapshotDigest);
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
