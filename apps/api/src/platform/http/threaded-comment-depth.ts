export const MAX_THREADED_COMMENT_REPLY_DEPTH = 4;

/**
 * A reply's depth equals the number of ancestors above it. Four ancestors
 * therefore means a depth-4 reply and remains valid; the fifth is rejected.
 */
export function exceedsThreadedCommentReplyDepth(ancestorCount: number): boolean {
  return ancestorCount > MAX_THREADED_COMMENT_REPLY_DEPTH;
}
