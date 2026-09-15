import type { StudioPsdImportProgress } from "../studio-psd-import-progress";

/** Presentation-only copy; the PSD decoder remains behind loadStudioPsdImportModule. */
export function studioDocumentImportProgressMessage(
  progress: StudioPsdImportProgress,
): string {
  switch (progress.stage) {
    case "read":
      return "PSD 원본 파일을 읽는 중…";
    case "decode":
      return "PSD 구조와 원본 레이어를 해석하는 중…";
    case "layers":
      return `원본 화질로 레이어 준비 중 · ${progress.completedLayers.toLocaleString("ko-KR")} / ${progress.totalLayers.toLocaleString("ko-KR")}`;
    case "complete":
      return "원본 레이어 준비 완료 · 적용 전 손실과 배치를 확인해 주세요.";
  }
}
