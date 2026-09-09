import { describe, expect, it } from "vitest";

import {
  applyStudioStructuredEditReview,
  createStudioStructuredEditReview,
  restoreStudioStructuredEditProposal,
  selectStudioStructuredEditArtifacts,
  serializeStudioStructuredEditProposal,
  validateStudioStructuredEditProposal,
} from "./studio-structured-edit-proposal";

const raw = {
  version: 1,
  id: "proposal-1",
  documentId: "doc-1",
  documentGeneration: 9,
  region: { x: 10, y: 20, width: 300, height: 400, maskHash: "mask-source" },
  references: [
    {
      id: "style-1",
      role: "style",
      sourceHash: "style-hash",
      private: true,
      externallyTransferred: false,
    },
    {
      id: "pose-1",
      role: "pose",
      sourceHash: "pose-hash",
      private: false,
      externallyTransferred: true,
    },
  ],
  variants: [
    {
      id: "variant-1",
      label: "보강안",
      previewHash: "preview-hash",
      artifacts: [
        {
          id: "layer-1",
          kind: "raster-layer",
          name: "빛 보강",
          mimeType: "image/png",
          byteLength: 1000,
          width: 300,
          height: 400,
          contentHash: "layer-hash",
          blendMode: "screen",
          opacity: 0.7,
        },
        {
          id: "mask-1",
          kind: "mask",
          name: "빛 마스크",
          mimeType: "image/png",
          byteLength: 500,
          width: 300,
          height: 400,
          contentHash: "mask-hash",
          parentArtifactId: "layer-1",
        },
      ],
    },
  ],
  provenance: {
    provider: "mock-provider",
    model: "structured-edit-v1",
    seed: 12,
    promptHash: "prompt-hash",
    sourceDocumentHash: "doc-hash",
    inputReferenceHashes: ["style-hash", "pose-hash"],
    processingRoute: "server",
    estimatedCostCategory: "low",
    actualCostUnits: 1,
    licenseConfirmed: true,
    commercialUseConfirmed: true,
    createdAtMs: 100,
  },
  expiresAtMs: 10_000,
};

describe("studio structured edit proposal", () => {
  it("validates and cold-restores a layered proposal", () => {
    const proposal = validateStudioStructuredEditProposal(raw);
    expect(proposal.variants[0]?.contentId).toHaveLength(16);
    expect(
      restoreStudioStructuredEditProposal(serializeStudioStructuredEditProposal(proposal)),
    ).toEqual(proposal);
  });

  it("rejects unconsented private transfer, MIME mismatches and oversized pixels", () => {
    expect(() =>
      validateStudioStructuredEditProposal({
        ...raw,
        references: [
          {
            ...raw.references[0],
            externallyTransferred: true,
          },
        ],
      }),
    ).toThrow(/consent/u);
    expect(() =>
      validateStudioStructuredEditProposal({
        ...raw,
        variants: [
          {
            ...raw.variants[0],
            artifacts: [{ ...raw.variants[0].artifacts[0], mimeType: "text/plain" }],
          },
        ],
      }),
    ).toThrow(/image MIME/u);
    expect(() =>
      validateStudioStructuredEditProposal(raw, {
        maxVariants: 4,
        maxArtifactsPerVariant: 32,
        maxArtifactBytes: 10_000,
        maxTotalBytes: 20_000,
        maxPixelsPerArtifact: 10,
      }),
    ).toThrow(/pixel budget/u);
  });

  it("selects a child artifact together with its required parent", () => {
    const proposal = validateStudioStructuredEditProposal(raw);
    const review = selectStudioStructuredEditArtifacts(
      createStudioStructuredEditReview(proposal),
      ["mask-1"],
    );
    expect([...review.selectedArtifactIds].sort()).toEqual(["layer-1", "mask-1"]);
  });

  it("applies selected artifacts as one stale-fenced transaction", () => {
    const proposal = validateStudioStructuredEditProposal(raw);
    const review = selectStudioStructuredEditArtifacts(
      createStudioStructuredEditReview(proposal),
      ["layer-1"],
    );
    const result = applyStudioStructuredEditReview(review, {
      transactionId: "tx-1",
      documentId: "doc-1",
      documentGeneration: 9,
      activeMutation: false,
      nowMs: 1_000,
    });
    expect(result.transaction.artifacts.map((artifact) => artifact.id)).toEqual(["layer-1"]);
    expect(result.review.status).toBe("applied");
    expect(() =>
      applyStudioStructuredEditReview(createStudioStructuredEditReview(proposal), {
        transactionId: "tx-stale",
        documentId: "doc-1",
        documentGeneration: 10,
        activeMutation: false,
        nowMs: 1_000,
      }),
    ).toThrow(/stale/u);
    expect(() =>
      applyStudioStructuredEditReview(createStudioStructuredEditReview(proposal), {
        transactionId: "tx-expired",
        documentId: "doc-1",
        documentGeneration: 9,
        activeMutation: false,
        nowMs: 10_000,
      }),
    ).toThrow(/expired/u);
  });
});
