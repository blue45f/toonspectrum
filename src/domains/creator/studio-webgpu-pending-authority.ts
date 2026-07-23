import type { StudioCommittedInkSurfaceHandoff } from "./studio-committed-ink-handoff-coordinator";
import type { DrawEl } from "./studio-element-model";

/** One document stroke can fan out to several GPU operations when symmetry is enabled. */
export interface StudioGpuPendingDrawAuthority {
  readonly element: DrawEl;
  readonly gpuStrokeCount: number;
}

export interface StudioGpuPendingAuthorityPromotionInput {
  readonly authorities: readonly StudioGpuPendingDrawAuthority[];
  readonly gpuStrokeCount: number;
  readonly handoffs: readonly StudioCommittedInkSurfaceHandoff[];
  readonly settledDrafts: readonly DrawEl[];
  readonly uncommittedOrderIds: readonly string[];
}

export type StudioGpuPendingAuthorityPromotion =
  | {
      readonly status: "promoted";
      readonly settledDrafts: readonly DrawEl[];
      readonly handoffs: readonly StudioCommittedInkSurfaceHandoff[];
      readonly promotedElementCount: number;
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "invalid-count"
        | "authority-count-mismatch"
        | "partial-authority-reservation"
        | "authority-reservation-element-mismatch"
        | "draft-reservation-element-mismatch"
        | "draft-reservation-overflow";
    };

export interface StudioGpuPendingAuthorityReleaseInput {
  readonly authorities: readonly StudioGpuPendingDrawAuthority[];
  readonly requestedGpuStrokeCount: number;
  readonly availableGpuStrokeCount: number;
  /** DrawEls already proven committed, tombstoned, or reparented by the handoff coordinator. */
  readonly completeElementIds: ReadonlySet<string>;
}

export type StudioGpuPendingAuthorityRelease =
  | {
      readonly status: "released";
      readonly remaining: readonly StudioGpuPendingDrawAuthority[];
      readonly releasedGpuStrokeCount: number;
      readonly normalizedToWholeGroup: boolean;
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "invalid-count"
        | "authority-count-mismatch"
        | "zero-count-authority-evidence"
        | "missing-complete-element-evidence";
    };

function normalizedCount(value: number): number | null {
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function authorityStrokeCount(authorities: readonly StudioGpuPendingDrawAuthority[]): number | null {
  let total = 0;
  for (const authority of authorities) {
    const count = normalizedCount(authority.gpuStrokeCount);
    if (count === null || count === 0) return null;
    total += count;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

function orderedUniqueElements(
  elements: readonly DrawEl[],
  order: readonly string[],
): readonly DrawEl[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  const seen = new Set<string>();
  const unique = elements.filter((element) => {
    if (seen.has(element.id)) return false;
    seen.add(element.id);
    return true;
  });
  return unique
    .map((element, index) => ({ element, index, rank: rank.get(element.id) }))
    .toSorted((left, right) => {
      if (left.rank === undefined && right.rank === undefined) return left.index - right.index;
      if (left.rank === undefined) return 1;
      if (right.rank === undefined) return -1;
      return left.rank - right.rank || left.index - right.index;
    })
    .map(({ element }) => element);
}

/**
 * Atomically converts every retained GPU authority into the settled Konva FIFO.
 *
 * Existing handoffs reserve independent draft/GPU prefixes. Rewriting only the arrays would make
 * a later draw receipt release the wrong surface, so this planner migrates those reservations too.
 * A symmetry group is indivisible: a partial reservation is rejected instead of showing only some
 * mirrored copies or double-compositing their opacity.
 */
export function promoteStudioGpuPendingAuthority(
  input: StudioGpuPendingAuthorityPromotionInput,
): StudioGpuPendingAuthorityPromotion {
  const gpuStrokeCount = normalizedCount(input.gpuStrokeCount);
  const actualGpuStrokeCount = authorityStrokeCount(input.authorities);
  if (gpuStrokeCount === null || actualGpuStrokeCount === null) {
    return { status: "rejected", reason: "invalid-count" };
  }
  if (gpuStrokeCount !== actualGpuStrokeCount) {
    return { status: "rejected", reason: "authority-count-mismatch" };
  }

  let authorityCursor = 0;
  const promotedByHandoff: DrawEl[][] = [];
  for (const handoff of input.handoffs) {
    const target = normalizedCount(handoff.gpuSettledCount);
    if (target === null) return { status: "rejected", reason: "invalid-count" };
    let consumed = 0;
    const promoted: DrawEl[] = [];
    while (consumed < target) {
      const authority = input.authorities[authorityCursor];
      if (!authority || consumed + authority.gpuStrokeCount > target) {
        return { status: "rejected", reason: "partial-authority-reservation" };
      }
      if (!handoff.strokeIds.includes(authority.element.id)) {
        return { status: "rejected", reason: "authority-reservation-element-mismatch" };
      }
      promoted.push(authority.element);
      consumed += authority.gpuStrokeCount;
      authorityCursor += 1;
    }
    promotedByHandoff.push(promoted);
  }

  let draftCursor = 0;
  const nextSettledDrafts: DrawEl[] = [];
  const nextHandoffs: StudioCommittedInkSurfaceHandoff[] = [];
  for (const [index, handoff] of input.handoffs.entries()) {
    const reservedDraftCount = normalizedCount(handoff.draftSettledCount);
    if (
      reservedDraftCount === null
      || draftCursor + reservedDraftCount > input.settledDrafts.length
    ) {
      return { status: "rejected", reason: "draft-reservation-overflow" };
    }
    const reservedDrafts = input.settledDrafts.slice(
      draftCursor,
      draftCursor + reservedDraftCount,
    );
    if (reservedDrafts.some((draft) => !handoff.strokeIds.includes(draft.id))) {
      return { status: "rejected", reason: "draft-reservation-element-mismatch" };
    }
    draftCursor += reservedDraftCount;
    const combined = orderedUniqueElements(
      [...reservedDrafts, ...(promotedByHandoff[index] ?? [])],
      handoff.strokeIds,
    );
    nextSettledDrafts.push(...combined);
    nextHandoffs.push({
      ...handoff,
      draftSettledCount: combined.length,
      gpuSettledCount: 0,
    });
  }

  const unreservedDrafts = input.settledDrafts.slice(draftCursor);
  const unreservedGpu = input.authorities
    .slice(authorityCursor)
    .map((authority) => authority.element);
  nextSettledDrafts.push(...orderedUniqueElements(
    [...unreservedDrafts, ...unreservedGpu],
    input.uncommittedOrderIds,
  ));

  return {
    status: "promoted",
    settledDrafts: nextSettledDrafts,
    handoffs: nextHandoffs,
    promotedElementCount: input.authorities.length,
  };
}

/**
 * Releases only complete document-stroke groups after a committed main-layer draw receipt.
 *
 * Coordinator counts are accounting hints, while completeElementIds are the semantic authority.
 * If an older/corrupt count lands inside a symmetry group, the whole proven DrawEl is released so
 * the authority queue and GPU operation prefix can never diverge. No evidence means no mutation.
 */
export function releaseStudioGpuPendingAuthorityPrefix(
  input: StudioGpuPendingAuthorityReleaseInput,
): StudioGpuPendingAuthorityRelease {
  const target = normalizedCount(input.requestedGpuStrokeCount);
  const available = normalizedCount(input.availableGpuStrokeCount);
  const actual = authorityStrokeCount(input.authorities);
  if (target === null || available === null || actual === null || target > available) {
    return { status: "rejected", reason: "invalid-count" };
  }
  if (actual !== available) {
    return { status: "rejected", reason: "authority-count-mismatch" };
  }
  if (
    target === 0
    && input.authorities.some((authority) => input.completeElementIds.has(authority.element.id))
  ) {
    // A zero-sized handoff cannot own an otherwise-complete GPU DrawEl. Reject without consuming
    // it so the caller can rebuild that mismatched authority on its exact Konva fallback surface.
    return { status: "rejected", reason: "zero-count-authority-evidence" };
  }
  let consumed = 0;
  let cursor = 0;
  while (consumed < target) {
    const authority = input.authorities[cursor];
    if (!authority) {
      return { status: "rejected", reason: "missing-complete-element-evidence" };
    }
    const provenComplete = input.completeElementIds.has(authority.element.id);
    if (!provenComplete) {
      return { status: "rejected", reason: "missing-complete-element-evidence" };
    }
    consumed += authority.gpuStrokeCount;
    cursor += 1;
  }
  if (consumed < target) {
    return { status: "rejected", reason: "missing-complete-element-evidence" };
  }
  return {
    status: "released",
    remaining: input.authorities.slice(cursor),
    releasedGpuStrokeCount: consumed,
    normalizedToWholeGroup: consumed !== target,
  };
}
