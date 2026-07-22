export type StudioAssetTransferLike = Pick<DataTransfer, "types" | "items" | "files">;

export function studioTransferHasFiles(dataTransfer: StudioAssetTransferLike): boolean {
  return Array.from(dataTransfer.types).includes("Files");
}

/**
 * Accept known Studio payloads and image files while rejecting known non-image files.
 * Some browsers hide file metadata during dragover; an empty file list is therefore
 * treated as undecided until drop, where the caller can issue a precise rejection.
 */
export function studioTransferCanInsert(dataTransfer: StudioAssetTransferLike): boolean {
  const types = new Set(Array.from(dataTransfer.types));
  if (types.has("application/json-asset") || types.has("application/json-insert")) return true;
  if (!types.has("Files")) return false;

  const fileItems = Array.from(dataTransfer.items).filter((item) => item.kind === "file");
  if (fileItems.length > 0) {
    return fileItems.some((item) => !item.type || item.type.startsWith("image/"));
  }

  const files = Array.from(dataTransfer.files);
  return files.length === 0 || files.some((file) => file.type.startsWith("image/"));
}
