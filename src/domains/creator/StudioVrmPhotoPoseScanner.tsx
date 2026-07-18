import { Check, FlipHorizontal2, ImageUp, Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  StudioVrmPhotoPoseError,
  type StudioVrmPhotoPoseConfidenceSummary,
  type StudioVrmPhotoPoseLandmark,
  type StudioVrmPhotoPoseRotation,
} from "./studio-vrm-photo-pose";
import {
  inferStudioVrmPhotoPoseFromImage,
  waitForStudioVrmPhotoPosePhase,
} from "./studio-vrm-photo-pose-inference";
import {
  StudioVrmPhotoPosePreprocessor,
  type StudioVrmPhotoPosePreprocessJob,
  type StudioVrmPhotoPoseProgressStage,
} from "./studio-vrm-photo-pose-worker-client";
import {
  disposePhotoPoseLandmarker,
  initPhotoPoseLandmarker,
} from "./studio-vrm-webcam-tracking";

import type { BoneEulerMap } from "./studio-vrm-pose-solver";

export interface StudioVrmPhotoPoseScannerProps {
  readonly disabled?: boolean;
  readonly onApply: (
    bones: BoneEulerMap,
    confidence: StudioVrmPhotoPoseConfidenceSummary,
  ) => boolean;
}

interface PhotoPoseCandidate {
  readonly sourceName: string;
  readonly bones: BoneEulerMap;
  readonly landmarks: readonly StudioVrmPhotoPoseLandmark[];
  readonly confidence: StudioVrmPhotoPoseConfidenceSummary;
}

const SKELETON_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
] as const;

const PROGRESS_LABELS: Readonly<Record<StudioVrmPhotoPoseProgressStage | "inference", string>> = {
  admission: "파일 확인",
  reading: "사진 읽기",
  inspecting: "형식 검사",
  decoding: "Worker 디코드",
  transforming: "회전·리사이즈",
  ready: "전처리 완료",
  inference: "로컬 포즈 인식",
};

const LOW_CONFIDENCE_LABELS: Readonly<Record<string, string>> = {
  torso: "몸통",
  leftArm: "왼팔",
  rightArm: "오른팔",
  leftLeg: "왼다리",
  rightLeg: "오른다리",
};

const STUDIO_VRM_PHOTO_POSE_SCAN_TIMEOUT_MS = 45_000;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value * 100));
}

function confidenceLabel(summary: StudioVrmPhotoPoseConfidenceSummary): string {
  if (summary.quality === "high") return "높음";
  if (summary.quality === "medium") return "보통";
  return "낮음";
}

function SkeletonPreview({ landmarks }: { readonly landmarks: readonly StudioVrmPhotoPoseLandmark[] }) {
  return (
    <svg
      aria-label="인식한 사진 포즈 골격 미리보기"
      className="h-32 w-full rounded-lg border border-line bg-[linear-gradient(180deg,oklch(0.22_0.02_250/0.75),oklch(0.12_0.015_250/0.9))]"
      role="img"
      viewBox="0 0 100 100"
    >
      {SKELETON_CONNECTIONS.map(([fromIndex, toIndex]) => {
        const from = landmarks[fromIndex];
        const to = landmarks[toIndex];
        if (!from || !to) return null;
        const opacity = Math.max(0.2, Math.min(from.visibility ?? 1, to.visibility ?? 1));
        return (
          <line
            key={`${fromIndex}-${toIndex}`}
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
            style={{ opacity }}
            x1={clampPercent(from.x)}
            x2={clampPercent(to.x)}
            y1={clampPercent(from.y)}
            y2={clampPercent(to.y)}
          />
        );
      })}
      {landmarks.map((landmark, index) => {
        if (![11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].includes(index)) return null;
        return (
          <circle
            key={index}
            cx={clampPercent(landmark.x)}
            cy={clampPercent(landmark.y)}
            fill="currentColor"
            r="2.1"
            style={{ opacity: Math.max(0.25, landmark.visibility ?? 1) }}
          />
        );
      })}
    </svg>
  );
}

export function StudioVrmPhotoPoseScanner({ disabled = false, onApply }: StudioVrmPhotoPoseScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preprocessorRef = useRef<StudioVrmPhotoPosePreprocessor | null>(null);
  const jobRef = useRef<StudioVrmPhotoPosePreprocessJob | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);
  const [rotation, setRotation] = useState<StudioVrmPhotoPoseRotation>(0);
  const [mirrorHorizontal, setMirrorHorizontal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState<StudioVrmPhotoPoseProgressStage | "inference">("admission");
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState<PhotoPoseCandidate | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      scanAbortRef.current?.abort();
      scanAbortRef.current = null;
      jobRef.current?.cancel();
      jobRef.current = null;
      preprocessorRef.current?.dispose();
      preprocessorRef.current = null;
      disposePhotoPoseLandmarker();
    };
  }, []);

  async function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || disabled) return;

    setBusy(true);
    setCandidate(null);
    setError("");
    setProgress(0);
    setProgressStage("admission");
    scanAbortRef.current?.abort();
    const scanController = new AbortController();
    scanAbortRef.current = scanController;
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      scanController.abort();
    }, STUDIO_VRM_PHOTO_POSE_SCAN_TIMEOUT_MS);
    let bitmap: ImageBitmap | null = null;
    let generationId: number;
    try {
      const preprocessor = preprocessorRef.current ?? new StudioVrmPhotoPosePreprocessor();
      preprocessorRef.current = preprocessor;
      const job = preprocessor.start(
        file,
        { exifMode: "apply", rotation, mirrorHorizontal },
        {
          signal: scanController.signal,
          onProgress: (next) => {
            if (
              !aliveRef.current ||
              scanController.signal.aborted ||
              scanAbortRef.current !== scanController ||
              next.generationId !== preprocessor.currentGenerationId
            ) return;
            setProgress(next.progress);
            setProgressStage(next.stage);
          },
        },
      );
      jobRef.current = job;
      generationId = job.generationId;
      const preprocessed = await job.result;
      bitmap = preprocessed.bitmap;
      if (
        !aliveRef.current ||
        scanController.signal.aborted ||
        scanAbortRef.current !== scanController ||
        generationId !== preprocessor.currentGenerationId
      ) {
        throw new StudioVrmPhotoPoseError("stale-generation");
      }

      setProgress(0.94);
      setProgressStage("inference");
      const landmarker = await waitForStudioVrmPhotoPosePhase(
        initPhotoPoseLandmarker(),
        scanController.signal,
      );
      if (
        !aliveRef.current ||
        scanAbortRef.current !== scanController ||
        generationId !== preprocessor.currentGenerationId
      ) {
        throw new StudioVrmPhotoPoseError("stale-generation");
      }
      await waitForStudioVrmPhotoPosePhase(
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        scanController.signal,
      );
      // Ownership of the transferred bitmap moves into the inference boundary, which closes it in
      // every success/error path after copying numeric landmarks.
      bitmap = null;
      const scan = inferStudioVrmPhotoPoseFromImage(preprocessed, landmarker, {
        expectedGenerationId: generationId,
        isGenerationCurrent: (candidateGenerationId) =>
          aliveRef.current &&
          scanAbortRef.current === scanController &&
          candidateGenerationId === preprocessor.currentGenerationId,
        signal: scanController.signal,
        mirrorPose: false,
        minimumVisibility: 0.35,
      });
      const inference = scan.inference;
      if (
        !aliveRef.current ||
        scanController.signal.aborted ||
        scanAbortRef.current !== scanController ||
        generationId !== preprocessor.currentGenerationId
      ) {
        throw new StudioVrmPhotoPoseError("stale-generation");
      }
      setCandidate({
        sourceName: file.name,
        bones: inference.bones,
        landmarks: inference.normalizedLandmarks,
        confidence: inference.confidence,
      });
      setProgress(1);
    } catch (caughtError: unknown) {
      if (!aliveRef.current) return;
      const displayedError = timedOut
        ? new StudioVrmPhotoPoseError("timeout")
        : caughtError;
      setError(
        displayedError instanceof Error
          ? displayedError.message
          : "사진 포즈를 인식하지 못했습니다.",
      );
    } finally {
      globalThis.clearTimeout(timeout);
      bitmap?.close();
      if (aliveRef.current && scanAbortRef.current === scanController) {
        setBusy(false);
        jobRef.current = null;
        scanAbortRef.current = null;
      }
    }
  }

  function cancelScan() {
    scanAbortRef.current?.abort();
    jobRef.current?.cancel();
  }

  return (
    <section className="mb-3 rounded-xl border border-line bg-card/45 p-3" aria-label="사진 포즈 스캐너">
      <input
        ref={inputRef}
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="sr-only"
        disabled={disabled || busy}
        onChange={handlePhotoSelected}
        type="file"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <ImageUp size={13} className="text-accent" aria-hidden /> 사진 포즈 스캔
          </h4>
          <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
            사진은 서버로 보내지 않고, Worker 전처리 후 브라우저 안에서 한 사람의 전신 포즈를 분석합니다.
          </p>
        </div>
        {busy ? (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-[0.66rem] font-bold text-fg-2 hover:bg-raised"
            onClick={cancelScan}
          >
            <X size={11} aria-hidden /> 취소
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-accent/50 bg-accent-soft px-2 py-1 text-[0.66rem] font-bold text-accent hover:bg-accent-soft/80 disabled:opacity-45"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <ImageUp size={11} aria-hidden /> 사진 선택
          </button>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[0.65rem] font-semibold text-fg-2">
          <span className="mb-1 flex items-center gap-1"><RotateCcw size={10} aria-hidden /> 회전</span>
          <select
            aria-label="사진 회전"
            className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[0.68rem] text-fg"
            disabled={busy || disabled}
            value={rotation}
            onChange={(event) => setRotation(Number(event.target.value) as StudioVrmPhotoPoseRotation)}
          >
            <option value={0}>자동 방향</option>
            <option value={90}>오른쪽 90°</option>
            <option value={180}>180°</option>
            <option value={270}>왼쪽 90°</option>
          </select>
        </label>
        <label className="flex min-h-8 cursor-pointer items-end gap-2 rounded-md border border-line bg-panel px-2 py-1.5 text-[0.66rem] font-semibold text-fg-2">
          <input
            type="checkbox"
            checked={mirrorHorizontal}
            disabled={busy || disabled}
            onChange={(event) => setMirrorHorizontal(event.target.checked)}
            className="size-3.5 accent-accent"
          />
          <span className="inline-flex items-center gap-1"><FlipHorizontal2 size={10} aria-hidden /> 좌우 반전</span>
        </label>
      </div>

      {busy ? (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-[0.65rem] text-fg-3">
            <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" aria-hidden /> {PROGRESS_LABELS[progressStage]}</span>
            <span className="numeral">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 rounded-md border border-danger/30 bg-danger-soft p-2 text-[0.66rem] text-danger">{error}</p> : null}

      {candidate ? (
        <div className="mt-3 grid gap-2">
          <SkeletonPreview landmarks={candidate.landmarks} />
          <div className="flex items-center justify-between gap-2 text-[0.66rem] text-fg-2">
            <span className="min-w-0 truncate" title={candidate.sourceName}>{candidate.sourceName}</span>
            <span className="shrink-0 font-bold">
              신뢰도 {confidenceLabel(candidate.confidence)} · {Math.round(candidate.confidence.overall * 100)}%
            </span>
          </div>
          {candidate.confidence.lowConfidenceGroups.length > 0 ? (
            <p className="text-[0.64rem] leading-relaxed text-warning">
              확인 권장: {candidate.confidence.lowConfidenceGroups.map((group) => LOW_CONFIDENCE_LABELS[group] ?? group).join(", ")}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-lg border border-line bg-card py-1.5 text-[0.68rem] font-bold text-fg-2 hover:bg-raised"
              onClick={() => setCandidate(null)}
            >
              다시 선택
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-accent/60 bg-accent py-1.5 text-[0.68rem] font-bold text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                const applied = onApply(candidate.bones, candidate.confidence);
                if (applied) setCandidate(null);
              }}
            >
              <Check size={11} aria-hidden /> 포즈 적용
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
