import { describe, expect, it } from "vitest";

import {
  promoteStudioGpuPendingAuthority,
  reconcileStudioGpuPendingAuthorityToCanvas,
  releaseStudioGpuPendingAuthorityPrefix,
  type StudioGpuPendingDrawAuthority,
} from "./studio-webgpu-pending-authority";

import type { StudioCommittedInkSurfaceHandoff } from "../studio-committed-ink-handoff-coordinator";
import type { DrawEl } from "../studio-element-model";

function draw(id: string): DrawEl {
  return {
    id,
    mode: "pen",
    points: [0, 0, 10, 10],
    stroke: "#111111",
    strokeWidth: 4,
    type: "draw",
  };
}

function authority(element: DrawEl, gpuStrokeCount = 1): StudioGpuPendingDrawAuthority {
  return { element, gpuStrokeCount };
}

function handoff(
  strokeIds: readonly string[],
  draftSettledCount: number,
  gpuSettledCount: number,
): StudioCommittedInkSurfaceHandoff {
  return {
    pageId: "page-1",
    strokeIds,
    draftSettledCount,
    gpuSettledCount,
    overlaySettledCount: 0,
    queuedRevision: 1,
    missingPasses: 0,
    drawFailures: 0,
    drawAttemptRevision: 1,
  };
}

describe("GPU pending authority promotion", () => {
  it("keeps two rapid deferred strokes visible exactly once when the second receipt is missing", () => {
    const first = draw("first");
    const second = draw("second");

    const promotion = promoteStudioGpuPendingAuthority({
      authorities: [authority(first), authority(second)],
      gpuStrokeCount: 2,
      handoffs: [],
      settledDrafts: [],
      uncommittedOrderIds: [first.id, second.id],
    });

    expect(promotion).toMatchObject({
      status: "promoted",
      promotedElementCount: 2,
      settledDrafts: [first, second],
      handoffs: [],
    });
    if (promotion.status !== "promoted") throw new Error("promotion rejected");
    expect(new Set(promotion.settledDrafts.map((element) => element.id)).size).toBe(2);

    const third = draw("third");
    const nextPromotion = promoteStudioGpuPendingAuthority({
      authorities: [authority(third)],
      gpuStrokeCount: 1,
      handoffs: [],
      settledDrafts: promotion.settledDrafts,
      uncommittedOrderIds: [first.id, second.id, third.id],
    });
    expect(nextPromotion).toMatchObject({
      status: "promoted",
      settledDrafts: [first, second, third],
    });
  });

  it("migrates symmetry counts and existing handoff reservations to the Konva FIFO", () => {
    const first = draw("first");
    const second = draw("second");
    const laterDraft = draw("later-draft");
    const laterGpu = draw("later-gpu");
    const queued = handoff([first.id, second.id], 1, 2);

    const promotion = promoteStudioGpuPendingAuthority({
      authorities: [authority(first, 2), authority(laterGpu, 4)],
      gpuStrokeCount: 6,
      handoffs: [queued],
      settledDrafts: [second, laterDraft],
      uncommittedOrderIds: [laterDraft.id, laterGpu.id],
    });

    expect(promotion).toMatchObject({
      status: "promoted",
      settledDrafts: [first, second, laterDraft, laterGpu],
      handoffs: [{ draftSettledCount: 2, gpuSettledCount: 0 }],
    });
  });

  it("does not migrate a different DrawEl under a corrupt handoff count", () => {
    const first = draw("first");
    expect(promoteStudioGpuPendingAuthority({
      authorities: [authority(first, 2)],
      gpuStrokeCount: 2,
      handoffs: [handoff(["different"], 0, 2)],
      settledDrafts: [],
      uncommittedOrderIds: [first.id],
    })).toEqual({
      status: "rejected",
      reason: "authority-reservation-element-mismatch",
    });
  });

  it("fails closed instead of splitting a mirrored promotion reservation", () => {
    const first = draw("first");
    expect(promoteStudioGpuPendingAuthority({
      authorities: [authority(first, 2)],
      gpuStrokeCount: 2,
      handoffs: [handoff([first.id], 0, 1)],
      settledDrafts: [],
      uncommittedOrderIds: [],
    })).toEqual({
      status: "rejected",
      reason: "partial-authority-reservation",
    });
  });

  it("rejects a reserved draft that belongs to a different handoff element", () => {
    const expected = draw("expected");
    const wrong = draw("wrong");

    expect(promoteStudioGpuPendingAuthority({
      authorities: [],
      gpuStrokeCount: 0,
      handoffs: [handoff([expected.id], 1, 0)],
      settledDrafts: [wrong],
      uncommittedOrderIds: [expected.id, wrong.id],
    })).toEqual({
      status: "rejected",
      reason: "draft-reservation-element-mismatch",
    });
  });

  it("rejects a stale draft prefix instead of releasing a later handoff element", () => {
    const first = draw("first");
    const second = draw("second");

    expect(promoteStudioGpuPendingAuthority({
      authorities: [],
      gpuStrokeCount: 0,
      handoffs: [
        handoff([first.id], 1, 0),
        handoff([second.id], 1, 0),
      ],
      settledDrafts: [second, first],
      uncommittedOrderIds: [first.id, second.id],
    })).toEqual({
      status: "rejected",
      reason: "draft-reservation-element-mismatch",
    });
  });

  it("reconciles corrupt numeric reservations from exact DrawEl identities before a newer stroke", () => {
    const first = draw("first");
    const second = draw("second");
    const unrelated = draw("unrelated");
    const corrupt = handoff([first.id, second.id], 99, 1);

    expect(reconcileStudioGpuPendingAuthorityToCanvas({
      authorities: [authority(first, 2), authority(second, 4)],
      gpuStrokeCount: 6,
      handoffs: [corrupt],
      settledDrafts: [unrelated],
      uncommittedOrderIds: [unrelated.id],
    }, "authority-count-mismatch")).toEqual({
      status: "promoted",
      settledDrafts: [first, second, unrelated],
      handoffs: [{
        ...corrupt,
        draftSettledCount: 2,
        gpuSettledCount: 0,
      }],
      promotedElementCount: 2,
      recoveredFrom: "authority-count-mismatch",
    });
  });

  it("does not claim a Canvas recovery when retained GPU pixels have no DrawEl authority", () => {
    expect(reconcileStudioGpuPendingAuthorityToCanvas({
      authorities: [],
      gpuStrokeCount: 1,
      handoffs: [],
      settledDrafts: [],
      uncommittedOrderIds: [],
    }, "authority-count-mismatch")).toEqual({
      status: "rejected",
      reason: "missing-draw-authority",
    });
  });

  it("preserves every retained GPU operation when only part has exact DrawEl authority", () => {
    const first = draw("first");

    expect(reconcileStudioGpuPendingAuthorityToCanvas({
      authorities: [authority(first)],
      gpuStrokeCount: 2,
      handoffs: [],
      settledDrafts: [],
      uncommittedOrderIds: [first.id],
    }, "authority-count-mismatch")).toEqual({
      status: "rejected",
      reason: "missing-draw-authority",
    });
  });

  it("normalizes a stale partial release count to the proven complete symmetry group", () => {
    const first = authority(draw("first"), 2);
    const second = authority(draw("second"), 4);
    expect(releaseStudioGpuPendingAuthorityPrefix({
      authorities: [first, second],
      requestedGpuStrokeCount: 1,
      availableGpuStrokeCount: 6,
      completeElementIds: new Set([first.element.id]),
    })).toEqual({
      status: "released",
      remaining: [second],
      releasedGpuStrokeCount: 2,
      normalizedToWholeGroup: true,
    });
  });

  it("preserves the complete queue when semantic release evidence is missing", () => {
    const first = authority(draw("first"), 2);
    expect(releaseStudioGpuPendingAuthorityPrefix({
      authorities: [first],
      requestedGpuStrokeCount: 1,
      availableGpuStrokeCount: 2,
      completeElementIds: new Set(),
    })).toEqual({
      status: "rejected",
      reason: "missing-complete-element-evidence",
    });
  });

  it("releases complete authority groups in GPU operation units", () => {
    const first = authority(draw("first"), 2);
    const second = authority(draw("second"), 4);
    expect(releaseStudioGpuPendingAuthorityPrefix({
      authorities: [first, second],
      requestedGpuStrokeCount: 2,
      availableGpuStrokeCount: 6,
      completeElementIds: new Set([first.element.id]),
    })).toEqual({
      status: "released",
      remaining: [second],
      releasedGpuStrokeCount: 2,
      normalizedToWholeGroup: false,
    });
  });

  it("does not consume the next complete authority after an exact target boundary", () => {
    const first = authority(draw("first"), 2);
    const second = authority(draw("second"), 4);

    expect(releaseStudioGpuPendingAuthorityPrefix({
      authorities: [first, second],
      requestedGpuStrokeCount: 2,
      availableGpuStrokeCount: 6,
      completeElementIds: new Set([first.element.id, second.element.id]),
    })).toEqual({
      status: "released",
      remaining: [second],
      releasedGpuStrokeCount: 2,
      normalizedToWholeGroup: false,
    });
  });

  it("releases zero authorities for a zero target without semantic evidence", () => {
    const first = authority(draw("first"), 2);

    expect(releaseStudioGpuPendingAuthorityPrefix({
      authorities: [first],
      requestedGpuStrokeCount: 0,
      availableGpuStrokeCount: 2,
      completeElementIds: new Set(),
    })).toEqual({
      status: "released",
      remaining: [first],
      releasedGpuStrokeCount: 0,
      normalizedToWholeGroup: false,
    });
  });

  it("rejects zero-count ownership evidence so the caller can promote the mismatched authority", () => {
    const first = authority(draw("first"), 2);

    expect(releaseStudioGpuPendingAuthorityPrefix({
      authorities: [first],
      requestedGpuStrokeCount: 0,
      availableGpuStrokeCount: 2,
      completeElementIds: new Set([first.element.id]),
    })).toEqual({
      status: "rejected",
      reason: "zero-count-authority-evidence",
    });
  });

  it("rejects a corrupted operation map without consuming any authority", () => {
    const first = authority(draw("first"), 2);
    expect(releaseStudioGpuPendingAuthorityPrefix({
      authorities: [first],
      requestedGpuStrokeCount: 1,
      availableGpuStrokeCount: 3,
      completeElementIds: new Set([first.element.id]),
    })).toEqual({
      status: "rejected",
      reason: "authority-count-mismatch",
    });
  });
});
