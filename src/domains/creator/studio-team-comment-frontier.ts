export interface StudioTeamCommentFrontierMerge {
  activitySequence: bigint;
  readSequence: bigint;
  /** The receipt predates activity already accepted from a poll or another mutation. */
  stale: boolean;
  /** Whether the merged read frontier covers every accepted activity for this thread. */
  fullyRead: boolean;
}

function advanceSequence(
  frontier: Map<string, bigint>,
  threadId: string,
  incomingSequence: bigint
): bigint {
  const current = frontier.get(threadId);
  const next = current === undefined || incomingSequence > current
    ? incomingSequence
    : current;
  frontier.set(threadId, next);
  return next;
}

/**
 * Mutation receipts can be replayed after a lost response. Merge their clocks monotonically so
 * an old idempotency receipt never opens the door for a stale poll to replace newer UI state.
 */
export function mergeStudioTeamCommentMutationReceipt(
  activityFrontier: Map<string, bigint>,
  readFrontier: Map<string, bigint>,
  threadId: string,
  incomingSequence: bigint
): StudioTeamCommentFrontierMerge {
  const previousActivity = activityFrontier.get(threadId);
  const activitySequence = advanceSequence(
    activityFrontier,
    threadId,
    incomingSequence
  );
  const readSequence = advanceSequence(readFrontier, threadId, incomingSequence);
  return {
    activitySequence,
    readSequence,
    stale: previousActivity !== undefined && incomingSequence < previousActivity,
    fullyRead: readSequence >= activitySequence,
  };
}

/** A read response is also a server-observed activity clock and must be merged, never assigned. */
export function mergeStudioTeamCommentReadReceipt(
  activityFrontier: Map<string, bigint>,
  readFrontier: Map<string, bigint>,
  threadId: string,
  incomingSequence: bigint
): StudioTeamCommentFrontierMerge {
  const previousActivity = activityFrontier.get(threadId);
  const activitySequence = advanceSequence(
    activityFrontier,
    threadId,
    incomingSequence
  );
  const readSequence = advanceSequence(readFrontier, threadId, incomingSequence);
  return {
    activitySequence,
    readSequence,
    stale: previousActivity !== undefined && incomingSequence < previousActivity,
    fullyRead: readSequence >= activitySequence,
  };
}
