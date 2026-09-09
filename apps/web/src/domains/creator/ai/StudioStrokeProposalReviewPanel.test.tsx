// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validateStudioStrokeProposalResponse } from "./studio-stroke-proposal";
import { StudioStrokeProposalReviewPanel } from "./StudioStrokeProposalReviewPanel";

const proposal = validateStudioStrokeProposalResponse({
  schemaVersion: 1,
  documentId: "doc-1",
  documentGeneration: 3,
  variants: [
    {
      id: "variant-1",
      label: "보강안",
      strokes: [
        {
          id: "stroke-1",
          brushId: "pen",
          color: "#000000",
          width: 4,
          opacity: 1,
          points: [
            { x: 1, y: 1, pressure: 0.5 },
            { x: 10, y: 10, pressure: 0.5 },
          ],
        },
      ],
      provenance: {
        provider: "local",
        model: "test",
        seed: 1,
        promptHash: "prompt",
        sourceHash: "source",
        requestIdHash: "request",
        generatedAtMs: 1,
        transport: "local",
      },
    },
  ],
});

const transform = {
  viewportWidthCss: 100,
  viewportHeightCss: 100,
  zoom: 1,
  dpr: 1,
  rotationDeg: 0,
  panXCss: 0,
  panYCss: 0,
};

afterEach(cleanup);

describe("StudioStrokeProposalReviewPanel", () => {
  it("renders a keyboard-accessible ghost review and applies a selected transaction", () => {
    const onApply = vi.fn();
    render(
      <StudioStrokeProposalReviewPanel
        proposal={proposal}
        transform={transform}
        documentId="doc-1"
        documentGeneration={3}
        activePointerStroke={false}
        onRequestProposal={vi.fn()}
        onApplyTransaction={onApply}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "AI 획 제안 검토" })).not.toBeNull();
    expect(screen.getByRole("img", { name: /1개 제안 획/u })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "선택 획 적용" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0].addedStrokes[0]?.id).toBe("stroke-1");
  });

  it("blocks stale and active-pointer application", () => {
    const { rerender } = render(
      <StudioStrokeProposalReviewPanel
        proposal={proposal}
        transform={transform}
        documentId="doc-1"
        documentGeneration={4}
        activePointerStroke={false}
        onRequestProposal={vi.fn()}
        onApplyTransaction={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/문서가 변경/u)).not.toBeNull();
    expect(screen.getByRole("button", { name: "선택 획 적용" })).toBeDisabled();
    rerender(
      <StudioStrokeProposalReviewPanel
        proposal={proposal}
        transform={transform}
        documentId="doc-1"
        documentGeneration={3}
        activePointerStroke
        onRequestProposal={vi.fn()}
        onApplyTransaction={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/진행 중인 획/u)).not.toBeNull();
    expect(screen.getByRole("button", { name: "선택 획 적용" })).toBeDisabled();
  });
});
