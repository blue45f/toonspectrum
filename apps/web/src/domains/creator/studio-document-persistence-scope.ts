/**
 * Local project documents used their documentId in the work persistence namespace before the
 * remote-source routing fix. Keep those OPFS/SQLite/browser/checkpoint slots intact, while NEVER
 * treating this persistence-only id as a server work id. In particular, do not collapse all local
 * documents into the shared anonymous `new` slot when their remote workId becomes null.
 */
export function studioDocumentPersistenceWorkId(input: {
  readonly workId: string | null;
  readonly remixId: string | null;
  readonly projectId?: string | null;
  readonly documentId?: string | null;
  readonly draftId?: string | null;
}): string | null {
  if (input.workId !== null) return input.workId;
  if (input.remixId) return null;
  // Preserve main's explicit-draft isolation alongside the legacy local-document keys.
  return input.projectId && input.documentId
    ? input.documentId
    : input.draftId ? `draft:${input.draftId}` : null;
}
