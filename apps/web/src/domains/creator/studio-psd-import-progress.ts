export interface StudioPsdImportProgress {
  readonly stage: "read" | "decode" | "layers" | "complete";
  readonly completedLayers: number;
  readonly totalLayers: number;
}

export interface StudioPsdImportOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: StudioPsdImportProgress) => void;
}

export function throwIfStudioPsdImportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("PSD 가져오기를 취소했어요.", "AbortError");
}

export function reportStudioPsdImportProgress(
  options: StudioPsdImportOptions,
  stage: StudioPsdImportProgress["stage"],
  completedLayers: number,
  totalLayers: number,
): void {
  throwIfStudioPsdImportAborted(options.signal);
  // Presentation callbacks must not damage a successfully decoded document.
  try { options.onProgress?.({ stage, completedLayers, totalLayers }); } catch { /* advisory */ }
  throwIfStudioPsdImportAborted(options.signal);
}

export function studioPsdImportProgressMessage(progress: StudioPsdImportProgress): string {
  switch (progress.stage) {
    case "read": return "PSD 원본 파일을 읽는 중…";
    case "decode": return "PSD 구조와 원본 레이어를 해석하는 중…";
    case "layers": return `원본 화질로 레이어 준비 중 · ${progress.completedLayers.toLocaleString("ko-KR")} / ${progress.totalLayers.toLocaleString("ko-KR")}`;
    case "complete": return "원본 레이어 준비 완료 · 적용 전 손실과 배치를 확인해 주세요.";
  }
}
