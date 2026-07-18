import {
  normalizeStudioCommentsDocument,
  type StudioCommentThread,
  type StudioCommentsDocument,
} from "./studio-comments";

export interface StudioTeamCommentMutablePartition {
  mutableDocument: StudioCommentsDocument;
  readOnlyThreads: StudioCommentThread[];
  mutableMessageCount: number;
  readOnlyMessageCount: number;
}

function countMessages(threads: readonly StudioCommentThread[]): number {
  return threads.reduce((count, thread) => count + 1 + thread.replies.length, 0);
}

/** Keeps pre-server archive rows visible without charging them against the live team quota. */
export function partitionStudioTeamCommentMutableDocument(
  document: StudioCommentsDocument,
  readOnlyThreadIds: ReadonlySet<string>
): StudioTeamCommentMutablePartition {
  const mutableThreads = document.threads.filter((thread) => !readOnlyThreadIds.has(thread.id));
  const readOnlyThreads = document.threads.filter((thread) => readOnlyThreadIds.has(thread.id));
  return {
    mutableDocument: { version: document.version, threads: mutableThreads },
    readOnlyThreads,
    mutableMessageCount: countMessages(mutableThreads),
    readOnlyMessageCount: countMessages(readOnlyThreads),
  };
}

/**
 * Live server rows are ordered before archive rows so the bounded local projection can trim old
 * archive entries without ever hiding the mutation the server just accepted.
 */
export function mergeStudioTeamCommentMutableDocument(
  nextMutableDocument: StudioCommentsDocument,
  readOnlyThreads: readonly StudioCommentThread[]
): StudioCommentsDocument {
  return normalizeStudioCommentsDocument({
    version: nextMutableDocument.version,
    threads: [...nextMutableDocument.threads, ...readOnlyThreads],
  });
}
