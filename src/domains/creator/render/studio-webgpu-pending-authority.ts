import type { DrawEl } from "../studio-element-model";

/** One document stroke can fan out to several GPU operations when symmetry is enabled. */
export interface StudioGpuPendingDrawAuthority {
  readonly element: DrawEl;
  readonly gpuStrokeCount: number;
}

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
    // it so the caller can reject the mismatched receipt without changing renderer authority.
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
