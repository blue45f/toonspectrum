export interface CreatorReaderPreviewMode {
  readonly readerView: boolean;
  readonly publicPreview: boolean;
}

export function resolveCreatorReaderPreviewMode(
  search: string | URLSearchParams,
): CreatorReaderPreviewMode {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : search;
  const readerView = params.get("view") === "reader";
  const publicPreviewValue = params.get("publicPreview");
  return {
    readerView,
    publicPreview: readerView && (publicPreviewValue === "1" || publicPreviewValue === "true"),
  };
}

export function buildCreatorPublicReaderPreviewHref(workId: string): string {
  return `/create/${encodeURIComponent(workId)}?view=reader&publicPreview=1`;
}

export function buildCreatorReaderManagementHref(workId: string): string {
  return `/create/${encodeURIComponent(workId)}`;
}
