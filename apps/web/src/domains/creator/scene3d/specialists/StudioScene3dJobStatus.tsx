import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { SpecialistJobProgress } from "./specialist-job-progress";

export function StudioScene3dJobStatus({
  progress,
}: {
  readonly progress: SpecialistJobProgress | null;
}) {
  const t = useBilingual("scene3d-specialists");
  const labels = {
    queued: t(
      "다른 3D 가공 작업이 끝나기를 기다리는 중",
      "Waiting for another 3D processing job",
    ),
    starting: t(
      "격리된 처리기 준비 중",
      "Preparing an isolated processing worker",
    ),
    validating: t("입력 계약 확인 중", "Validating the input contract"),
    decoding: t(
      "원본 검사·모델 디코딩 중",
      "Inspecting and decoding the source model",
    ),
    processing: t(
      "선택한 가공·인코딩 작업 실행 중",
      "Running the selected processing and encoding operation",
    ),
    verifying: t(
      "출력 크기·해시·결과 확인 중",
      "Verifying output size, hashes and results",
    ),
    "reuse-check": t("원본·옵션이 같은 검증 결과 확인 중", "Checking verified results for the same source and options"),
    reused: t("이 탭에서 검증한 가공 결과를 재사용했습니다", "Reused a verified result from this tab"),
    ready: t("검증된 파생본 준비 완료", "Verified derivative ready"),
    cancelled: t("작업을 취소했습니다", "Job cancelled"),
    "timed-out": t("작업 제한 시간을 초과했습니다", "Job timed out"),
    rejected: t(
      "지원 범위·안전 예산을 확인하세요",
      "Check the supported inputs and safety budgets",
    ),
    failed: t(
      "가공 작업을 완료하지 못했습니다",
      "Processing could not be completed",
    ),
  };
  return (
    <span data-scene3d-job-phase={progress?.phase ?? "starting"}>
      {labels[progress?.phase ?? "starting"]}
      {progress?.phase === "queued" && progress.queuePosition !== undefined
        ? ` · ${t("대기 순서", "Queue position")} ${progress.queuePosition}`
        : ""}
    </span>
  );
}
