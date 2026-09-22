/**
 * Painting an already-authorized local draft does not require a remote CRDT frontier.
 * ACL-backed and joined documents continue to use the existing document-lock projection.
 * This function grants no mutation, lease, synchronization or server-save permission.
 */
export function isStudioSkiaDocumentFrontierReady(input: {
  readonly operationSyncReady: boolean;
  readonly documentLocked: boolean;
}): boolean {
  return input.operationSyncReady === true || input.documentLocked === false;
}
