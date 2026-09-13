// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyStudioStrokeProposalReview, createStudioStrokeProposalReview } from "./studio-stroke-proposal";
import {
  applyStudioStrokeProposalTransaction, cancelConnectedStudioStrokeProposal,
  requestStudioStrokeProposal, useStudioAiCanvasBridge, useStudioStrokeProposalBridgeSnapshot,
} from "./studio-stroke-proposal-bridge";

afterEach(cleanup);

function setup() {
  const original = Object.freeze({ id: "source-stroke", type: "draw", brushId: "pen",
    color: "#112233", width: 4, opacity: 1, points: Object.freeze([0, 0, 10, 12, 20, 20]),
  });
  const appendElement = vi.fn();
  const input = { ownerId: "qa-owner", documentId: "qa-document", elements: [original], appendElement };
  renderHook(() => useStudioAiCanvasBridge(input));
  const state = renderHook(useStudioStrokeProposalBridgeSnapshot);
  return { original, appendElement, state };
}

describe("shipped AI canvas append bridge", () => {
  it("does not modify the document merely by requesting or cancelling a proposal", async () => {
    const { appendElement, state } = setup();
    await act(requestStudioStrokeProposal);
    expect(state.result.current.proposal?.variants).toHaveLength(1);
    expect(appendElement).not.toHaveBeenCalled();
    act(cancelConnectedStudioStrokeProposal);
    expect(state.result.current.proposal).toBeNull();
    expect(appendElement).not.toHaveBeenCalled();
  });

  it("appends a reviewed copy through the real callback without overwriting its source", async () => {
    const { original, appendElement, state } = setup();
    const before = JSON.stringify(original);
    await act(requestStudioStrokeProposal);
    const proposal = state.result.current.proposal;
    if (!proposal) throw new Error("Expected a real local proposal");
    const { transaction } = applyStudioStrokeProposalReview(createStudioStrokeProposalReview(proposal), {
      documentId: state.result.current.documentId,
      documentGeneration: state.result.current.documentGeneration,
      activePointerStroke: false, transactionId: "qa-reviewed-transaction",
    });
    act(() => applyStudioStrokeProposalTransaction(transaction));
    expect(appendElement).toHaveBeenCalledTimes(1);
    const added = appendElement.mock.calls[0]?.[0];
    expect(added).not.toBe(original);
    expect(added.id).not.toBe(original.id);
    expect(added.type).toBe("draw");
    expect(added.aiProvenance.transactionId).toBe(transaction.id);
    expect(JSON.stringify(original)).toBe(before);
    expect(state.result.current.proposal).toBeNull();
  });
});
