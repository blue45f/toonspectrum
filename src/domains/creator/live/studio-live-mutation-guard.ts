import { studioLiveLockResourcesConflict } from "@/lib/studio-live-lock-resource";

/**
 * Soft-lock mutation guards for Studio live collaboration.
 *
 * Pure helpers over room leases: decide whether the local session may begin an edit on a
 * page/element resource. Does not call claimLock itself — callers claim after canBegin succeeds.
 */

export interface StudioLiveLockLike {
  resource: string;
  claimId: string;
  owner: { sessionId: string; displayName?: string };
  leaseUntil: number;
}

export type StudioLiveResourceKind = "page" | "element";

export function studioLivePageResource(pageId: string): string {
  return `page:${pageId}`;
}

export function studioLiveElementResource(pageId: string, elementId: string): string {
  return `element:${pageId}:${elementId}`;
}

/** Resources that must be free (or owned by self) before an edit on these targets. */
export function studioLiveMutationResources(input: {
  pageId: string;
  elementIds?: readonly string[] | null;
}): string[] {
  const pageId = typeof input.pageId === "string" ? input.pageId.trim() : "";
  if (!pageId) return [];
  const resources: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.elementIds ?? []) {
    if (typeof raw !== "string" || raw.trim().length === 0) continue;
    const resource = studioLiveElementResource(pageId, raw.trim());
    if (seen.has(resource)) continue;
    seen.add(resource);
    resources.push(resource);
  }
  // An element mutation claims only its concrete elements. The authoritative hierarchy makes a
  // page lease conflict with every child without turning sibling element edits into page-wide
  // contention. A page-only mutation still claims the page resource and blocks all descendants.
  return resources.length > 0 ? resources : [studioLivePageResource(pageId)];
}

function isActiveLock(lock: StudioLiveLockLike, now: number): boolean {
  return Number.isFinite(lock.leaseUntil) && lock.leaseUntil > now;
}

/** Active hierarchical lock held by someone other than self, if any. */
export function findConflictingStudioLiveLock(
  locks: readonly StudioLiveLockLike[],
  resource: string,
  selfSessionId: string,
  now = Date.now()
): StudioLiveLockLike | null {
  const self = typeof selfSessionId === "string" ? selfSessionId : "";
  for (const lock of locks) {
    if (!studioLiveLockResourcesConflict(lock.resource, resource)) continue;
    if (!isActiveLock(lock, now)) continue;
    if (lock.owner.sessionId === self) continue;
    return lock;
  }
  return null;
}

/**
 * Page lock blocks all element edits on that page; element lock blocks only that element.
 * Self-owned locks never conflict.
 */
export function findStudioLiveMutationConflict(input: {
  locks: readonly StudioLiveLockLike[];
  pageId: string;
  elementIds?: readonly string[] | null;
  selfSessionId: string;
  now?: number;
}): StudioLiveLockLike | null {
  const now = input.now ?? Date.now();
  const resources = studioLiveMutationResources({
    pageId: input.pageId,
    elementIds: input.elementIds,
  });
  for (const resource of resources) {
    const conflict = findConflictingStudioLiveLock(
      input.locks,
      resource,
      input.selfSessionId,
      now
    );
    if (conflict) return conflict;
  }
  return null;
}

export type StudioLiveMutationDecision =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      lock: StudioLiveLockLike;
    };

export function canBeginStudioLiveMutation(input: {
  locks: readonly StudioLiveLockLike[];
  pageId: string;
  elementIds?: readonly string[] | null;
  selfSessionId: string;
  now?: number;
}): StudioLiveMutationDecision {
  const conflict = findStudioLiveMutationConflict(input);
  if (!conflict) return { ok: true };
  const who = conflict.owner.displayName?.trim() || "다른 편집자";
  return {
    ok: false,
    reason: `${who}가 이 영역을 편집 중입니다. 잠금이 풀릴 때까지 기다려 주세요.`,
    lock: conflict,
  };
}

/** Whether self currently holds an active claim on the resource. */
export function selfHoldsStudioLiveLock(
  locks: readonly StudioLiveLockLike[],
  resource: string,
  selfSessionId: string,
  now = Date.now()
): boolean {
  const self = typeof selfSessionId === "string" ? selfSessionId : "";
  for (const lock of locks) {
    if (lock.resource !== resource) continue;
    if (!isActiveLock(lock, now)) continue;
    if (lock.owner.sessionId === self) return true;
  }
  return false;
}

/**
 * Plan the set difference for replacing locally tracked edit leases. Shared resources remain held;
 * superseded resources release and only new resources claim. The async coordinator decides the
 * safe operation order and re-confirms retained resources with the authoritative server.
 */
export function planStudioLiveHeldResourceReplace(
  previouslyHeld: readonly string[] | null | undefined,
  nextResources: readonly string[] | null | undefined
): {
  toRelease: readonly string[];
  toClaim: readonly string[];
  held: readonly string[];
} {
  const prev: string[] = [];
  const seenPrev = new Set<string>();
  for (const resource of previouslyHeld ?? []) {
    if (typeof resource !== "string" || resource.length === 0 || seenPrev.has(resource)) continue;
    seenPrev.add(resource);
    prev.push(resource);
  }
  const next: string[] = [];
  const seenNext = new Set<string>();
  for (const resource of nextResources ?? []) {
    if (typeof resource !== "string" || resource.length === 0 || seenNext.has(resource)) continue;
    seenNext.add(resource);
    next.push(resource);
  }
  return {
    toRelease: prev.filter((resource) => !seenNext.has(resource)),
    toClaim: next.filter((resource) => !seenPrev.has(resource)),
    held: next,
  };
}

/** Clear held set (release everything). Pure companion to endLiveResourceEdit. */
export function planStudioLiveHeldResourceClear(
  previouslyHeld: readonly string[] | null | undefined
): { toRelease: readonly string[]; held: readonly string[] } {
  const plan = planStudioLiveHeldResourceReplace(previouslyHeld, []);
  return { toRelease: plan.toRelease, held: plan.held };
}
