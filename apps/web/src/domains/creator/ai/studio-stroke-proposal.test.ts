import { describe, expect, it } from "vitest";

import {
  applyStudioStrokeProposalReview,
  buildBoundedStudioStrokeProposalContext,
  createStudioStrokeProposalReview,
  planStudioStrokeGhostPreview,
  restoreStudioStrokeProposal,
  serializeStudioStrokeProposal,
  setStudioStrokeProposalSelection,
  StudioStrokeProposalRequestFence,
  validateStudioStrokeProposalResponse,
} from "./studio-stroke-proposal";

const rawProposal = {
  schemaVersion: 1,
  documentId: "doc-1",
  documentGeneration: 7,
  variants: [
    {
      id: "variant-a",
      label: "선 정리",
      strokes: [
        {
          id: "stroke-a",
          brushId: "pen-g",
          color: "#112233",
          width: 8,
          opacity: 0.9,
          points: [
            { x: 10, y: 20, pressure: 0.4 },
            { x: 40, y: 60, pressure: 0.8 },
          ],
        },
        {
          id: "stroke-b",
          brushId: "pen-g",
          color: "#112233",
          width: 5,
          opacity: 1,
          points: [{ x: 100, y: 120, pressure: 0.5 }],
        },
      ],
      provenance: {
        provider: "local-test",
        model: "stroke-model-v1",
        seed: 42,
        promptHash: "prompt-hash",
        sourceHash: "source-hash",
        requestIdHash: "request-hash",
        generatedAtMs: 1000,
        transport: "local",
      },
    },
  ],
};

describe("studio stroke proposals", () => {
  it("validates, content-addresses and cold-restores a provider response", () => {
    const proposal = validateStudioStrokeProposalResponse(rawProposal);
    expect(proposal.variants[0]?.contentId).toHaveLength(16);
    expect(restoreStudioStrokeProposal(serializeStudioStrokeProposal(proposal))).toEqual(proposal);
  });

  it("rejects malformed, duplicate and over-budget provider output", () => {
    expect(() => validateStudioStrokeProposalResponse({ ...rawProposal, schemaVersion: 2 })).toThrow(
      /schema version/u,
    );
    const duplicate = {
      ...rawProposal,
      variants: [rawProposal.variants[0], { ...rawProposal.variants[0], id: "variant-b" }],
    };
    expect(() => validateStudioStrokeProposalResponse(duplicate)).toThrow(/duplicate proposal/u);
    expect(() =>
      validateStudioStrokeProposalResponse(rawProposal, {
        maxVariants: 4,
        maxStrokesPerVariant: 64,
        maxPointsPerStroke: 1,
        maxTotalPoints: 16,
        maxContextStrokes: 10,
        maxContextPoints: 10,
        maxCoordinate: 1_000,
      }),
    ).toThrow(/point budget/u);
  });

  it("builds a newest-first bounded context without leaking full documents", () => {
    const recentStrokes = Array.from({ length: 5 }, (_, index) => ({
      id: `s-${index}`,
      brushId: "pen",
      color: "#000000",
      width: 3,
      opacity: 1,
      points: [{ x: index, y: index, pressure: 0.5 }],
      committedAtMs: index,
    }));
    const context = buildBoundedStudioStrokeProposalContext({
      documentId: "doc-1",
      documentGeneration: 7,
      viewport: { x: 0, y: 0, width: 100, height: 200 },
      recentStrokes,
      limits: {
        maxVariants: 4,
        maxStrokesPerVariant: 64,
        maxPointsPerStroke: 100,
        maxTotalPoints: 100,
        maxContextStrokes: 2,
        maxContextPoints: 2,
        maxCoordinate: 1_000,
      },
    });
    expect(context.recentStrokes.map((stroke) => stroke.id)).toEqual(["s-3", "s-4"]);
  });

  it("plans rotation, zoom, DPR and edge clipping for retained ghost paths", () => {
    const proposal = validateStudioStrokeProposalResponse(rawProposal);
    const paths = planStudioStrokeGhostPreview(proposal.variants[0]!, {
      viewportWidthCss: 100,
      viewportHeightCss: 100,
      zoom: 2,
      dpr: 2,
      rotationDeg: 90,
      panXCss: 50,
      panYCss: 0,
    });
    expect(paths[0]?.widthCss).toBe(8);
    expect(paths.some((path) => path.clipped)).toBe(true);
  });

  it("applies only selected strokes as one generation-fenced transaction", () => {
    const proposal = validateStudioStrokeProposalResponse(rawProposal);
    const review = setStudioStrokeProposalSelection(createStudioStrokeProposalReview(proposal), [
      "stroke-b",
    ]);
    const result = applyStudioStrokeProposalReview(review, {
      documentId: "doc-1",
      documentGeneration: 7,
      activePointerStroke: false,
      transactionId: "tx-1",
    });
    expect(result.transaction.addedStrokes.map((stroke) => stroke.id)).toEqual(["stroke-b"]);
    expect(result.review.status).toBe("applied");
    expect(() =>
      applyStudioStrokeProposalReview(createStudioStrokeProposalReview(proposal), {
        documentId: "doc-1",
        documentGeneration: 8,
        activePointerStroke: false,
        transactionId: "tx-stale",
      }),
    ).toThrow(/stale/u);
    expect(() =>
      applyStudioStrokeProposalReview(createStudioStrokeProposalReview(proposal), {
        documentId: "doc-1",
        documentGeneration: 7,
        activePointerStroke: true,
        transactionId: "tx-pointer",
      }),
    ).toThrow(/active pointer/u);
  });

  it("blocks ambiguous-delivery retries and late responses", () => {
    const fence = new StudioStrokeProposalRequestFence("request-1", { prompt: "clean line" });
    const ticket = fence.begin(7);
    fence.markDeliveryUnknown(ticket);
    expect(fence.canRetry(false)).toBe(false);
    expect(fence.canRetry(true)).toBe(true);

    const second = new StudioStrokeProposalRequestFence("request-2", {});
    const lateTicket = second.begin(7);
    expect(second.settle(lateTicket, 8)).toBe(false);
    expect(second.state).toBe("cancelled");
  });
});
