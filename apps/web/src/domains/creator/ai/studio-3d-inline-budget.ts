export const STUDIO_3D_INLINE_RAW_INPUT_MAX_BYTES = 10 * 1024 * 1024;

export interface Studio3dInlineFileLike {
  readonly size: number;
}

export function studio3dInlineInputBytes(
  files: readonly Studio3dInlineFileLike[],
): number {
  return files.reduce((total, file) => {
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      throw new RangeError("3D 입력 파일 크기가 올바르지 않아요.");
    }
    return total + file.size;
  }, 0);
}

export function assertStudio3dInlineInputBudget(
  files: readonly Studio3dInlineFileLike[],
): number {
  const totalBytes = studio3dInlineInputBytes(files);
  if (totalBytes > STUDIO_3D_INLINE_RAW_INPUT_MAX_BYTES) {
    throw new RangeError(
      "3D 입력 파일 합계는 현재 인라인 전송 경로에서 10MB 이하여야 합니다. 파일을 줄이거나 나누어 다시 시도해 주세요.",
    );
  }
  return totalBytes;
}

export function formatStudio3dInlineBudget(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(bytes === 0 ? 0 : 1)} MB`;
}
