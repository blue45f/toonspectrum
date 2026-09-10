import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clapperboard,
  ImagePlus,
  Layers3,
  Loader2,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
} from "../studio-panel-ui";
import { SCENARIO_BEAT_LABELS, SCENARIO_BEAT_TYPES, type ScenarioBeatType } from "../studio-story-beats";
import { StudioContinuityMetadataEditor } from "../StudioContinuityMetadataEditor";
import { activateStudioModalSheet } from "../useStudioModalSheet";
import { StudioAiImageReferencePackEditor, STUDIO_AI_IMAGE_REFERENCE_PROVIDER_SAFE_MAX, type StudioAiImageReferenceAssetOption } from "./StudioAiImageReferencePackEditor";
import {
  appendScenarioImageCandidate,
  scenarioImageCandidates,
  scenarioImageInputFingerprint,
  scenarioImageReferenceSignature,
  selectScenarioImageCandidate,
  type StudioScenarioImageGenerationRequest,
} from "./studio-scenario-candidate-workflow";
import {
  analyzeStudioAiComicCandidate,
  decomposeStudioAiComicCandidate,
  inspectStudioAiComicRepairCapabilities,
  repairStudioAiComicImageRegion,
  singleLayerStudioAiComicManifest,
  type StudioAiComicRepairTarget,
} from "./studio-ai-comic-director-media";
import {
  createStudioAiComicDirectorApiClient,
  type StudioAiComicDirectorApiClient,
} from "./studio-ai-comic-director-api";
import {
  createStudioAiComicApplyDiff,
  createStudioAiComicDirectorId,
  createStudioAiComicDirectorSession,
  saveStudioAiComicDirectorSession,
  studioAiComicDirectorCandidateDigest,
  updateStudioAiComicDirectorSession,
  type StudioAiComicDirectorJob,
  type StudioAiComicDirectorSessionDocument,
  type StudioAiComicDirectorStage,
} from "./studio-ai-comic-director-session";

import type { StudioAiImageReferenceDocument } from "./studio-ai-image-reference-roles";
import type { StudioAiSettings, StudioTextAiProvenance } from "./studio-ai-client";
import type { ScenarioImageCandidate, ScenarioPreviewItem } from "../studio-scenario-layout";

import { cn } from "@/shared/lib/utils";

const STORY_TEXT_MAX = 12_000;
const STAGES: readonly {
  readonly id: StudioAiComicDirectorStage;
  readonly number: string;
  readonly label: string;
  readonly description: string;
}[] = [
  { id: "brief", number: "01", label: "이야기·기준", description: "대본과 작품 바이블" },
  { id: "direction", number: "02", label: "컷 연출", description: "샷과 스크롤 리듬" },
  { id: "production", number: "03", label: "제작·수리", description: "후보·품질·부분 수리" },
  { id: "finish", number: "04", label: "마감·추가", description: "검수 revision과 인계" },
];

const DIRECTIONS = {
  faithful: {
    label: "기준 충실형",
    directive: "AI 코믹 디렉터 제작 방향: 기준 충실형. 작품 바이블, 현재 카메라, 인물 정체성, 의상, 장소와 소품 상태를 가장 엄격하게 유지합니다.",
  },
  expressive: {
    label: "감정 표현형",
    directive: "AI 코믹 디렉터 제작 방향: 감정 표현형. 인물 정체성과 사건은 유지하면서 표정, 시선, 몸짓과 감정 전달을 강화합니다.",
  },
  cinematic: {
    label: "시네마틱형",
    directive: "AI 코믹 디렉터 제작 방향: 시네마틱형. 이야기와 연속성은 유지하면서 카메라 높이, 전경, 광원과 공간 깊이를 강화합니다.",
  },
  alternate: {
    label: "대안 구도형",
    directive: "AI 코믹 디렉터 제작 방향: 대안 구도형. 같은 이야기 비트를 유지하면서 다른 프레이밍과 네거티브 스페이스를 탐색합니다.",
  },
} as const;
type DirectorDirection = keyof typeof DIRECTIONS;

const REPAIR_TARGETS: readonly { readonly id: StudioAiComicRepairTarget; readonly label: string }[] = [
  { id: "face", label: "얼굴" },
  { id: "expression", label: "표정" },
  { id: "hands", label: "손·손가락" },
  { id: "anatomy", label: "해부·포즈" },
  { id: "costume", label: "의상" },
  { id: "prop", label: "소품" },
  { id: "background", label: "배경" },
  { id: "lighting", label: "광원·색" },
  { id: "composition", label: "구도" },
  { id: "text-artifact", label: "불필요한 글자" },
  { id: "outpaint", label: "영역 확장" },
];

export interface StudioAiComicDirectorPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly textConfigured: boolean;
  readonly imageConfigured: boolean;
  readonly aiSettings?: StudioAiSettings;
  readonly sessionId?: string;
  readonly baseDocumentRevision?: string | null;
  readonly currentDocumentRevision?: string | null;
  readonly sessionApiClient?: StudioAiComicDirectorApiClient;
  readonly imageReferenceDocument: StudioAiImageReferenceDocument;
  readonly imageReferenceAssetOptions: readonly StudioAiImageReferenceAssetOption[];
  readonly imageReferencesLoading: boolean;
  readonly imageReferenceMissingCount: number;
  readonly onImageReferenceDocumentChange: (value: StudioAiImageReferenceDocument) => void;
  readonly storyText: string;
  readonly onStoryTextChange: (value: string) => void;
  readonly sceneCountHint: number | undefined;
  readonly onSceneCountHintChange: (value: number | undefined) => void;
  readonly applyTarget: "current-page" | "new-page";
  readonly onApplyTargetChange: (value: "current-page" | "new-page") => void;
  readonly busy: boolean;
  readonly stageLabel: string | null;
  readonly progress: { done: number; total: number } | null;
  readonly error: string | null;
  readonly preview: ScenarioPreviewItem[] | null;
  readonly textProvenance: StudioTextAiProvenance | null;
  readonly onGenerate: () => void;
  readonly onGenerateImages: (request?: StudioScenarioImageGenerationRequest) => void;
  readonly onChangeScene: (index: number, patch: Partial<ScenarioPreviewItem>) => void;
  readonly onRemoveScene: (index: number) => void;
  readonly onRegenerateScene: (index: number) => void;
  readonly regeneratingIndex: number | null;
  readonly onCancel: () => void;
  readonly onApply: () => void;
  readonly onDiscard: () => void;
}

function uid(prefix: string): string {
  return createStudioAiComicDirectorId(prefix);
}

function stripDirectorDirective(prompt: string): string {
  return prompt
    .split("\n")
    .filter((line) => !line.trim().startsWith("AI 코믹 디렉터 제작 방향:"))
    .join("\n")
    .trim();
}

function selectedCandidate(item: ScenarioPreviewItem | undefined): ScenarioImageCandidate | null {
  if (!item) return null;
  const candidates = scenarioImageCandidates(item);
  return candidates.find((candidate) => candidate.id === item.selectedImageCandidateId)
    ?? candidates.find((candidate) => candidate.imageDataUrl === item.imageDataUrl)
    ?? candidates.at(-1)
    ?? null;
}

function MaskEditor({
  source,
  onChange,
}: {
  readonly source: string;
  readonly onChange: (maskDataUrl: string) => void;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [brush, setBrush] = useState(48);

  const emit = () => {
    const canvas = canvasRef.current;
    if (canvas?.width && canvas.height) onChange(canvas.toDataURL("image/png"));
  };

  const configure = () => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !image.naturalWidth || !image.naturalHeight) return;
    if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      emit();
    }
  };

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * canvas.width,
      y: (event.clientY - rect.top) / rect.height * canvas.height,
    };
  };

  const stroke = (canvas: HTMLCanvasElement, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = "white";
    context.fillStyle = "white";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brush;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  };

  const fillPreset = (preset: "center" | "lower" | "all" | "clear") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (preset !== "clear") {
      context.fillStyle = "white";
      if (preset === "all") context.fillRect(0, 0, canvas.width, canvas.height);
      else if (preset === "center") {
        context.beginPath();
        context.ellipse(canvas.width / 2, canvas.height / 2, canvas.width * 0.2, canvas.height * 0.28, 0, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(0, canvas.height * 0.52, canvas.width, canvas.height * 0.48);
      }
    }
    emit();
  };

  return (
    <div className="space-y-2">
      <div className="relative mx-auto aspect-video max-h-72 overflow-hidden rounded-xl border border-line bg-canvas">
        <img
          ref={imageRef}
          src={source}
          alt="수리 마스크를 그릴 현재 후보"
          onLoad={configure}
          className="absolute inset-0 size-full object-contain"
        />
        <canvas
          ref={canvasRef}
          aria-label="수리하거나 전경으로 분리할 영역을 칠하는 마스크"
          onPointerDown={(event) => {
            drawingRef.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            const next = point(event);
            lastRef.current = next;
            stroke(event.currentTarget, next, next);
          }}
          onPointerMove={(event) => {
            if (!drawingRef.current || !lastRef.current) return;
            const next = point(event);
            stroke(event.currentTarget, lastRef.current, next);
            lastRef.current = next;
          }}
          onPointerUp={(event) => {
            drawingRef.current = false;
            lastRef.current = null;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            emit();
          }}
          onPointerCancel={() => {
            drawingRef.current = false;
            lastRef.current = null;
          }}
          className={cn(
            "absolute inset-0 size-full touch-none cursor-crosshair opacity-55",
            STUDIO_FOCUS_RING,
          )}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="text-[0.67rem] font-semibold text-fg-2">
          브러시
          <input
            type="range"
            min={12}
            max={180}
            value={brush}
            onChange={(event) => setBrush(Number(event.target.value))}
            className="ml-2 align-middle accent-accent"
          />
        </label>
        <button type="button" onClick={() => fillPreset("center")} className="min-h-11 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2 hover:bg-raised">가운데 선택</button>
        <button type="button" onClick={() => fillPreset("lower")} className="min-h-11 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2 hover:bg-raised">아래쪽 선택</button>
        <button type="button" onClick={() => fillPreset("all")} className="min-h-11 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2 hover:bg-raised">전체 선택</button>
        <button type="button" onClick={() => fillPreset("clear")} className="min-h-11 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2 hover:bg-raised">마스크 지우기</button>
      </div>
    </div>
  );
}

function StageThumbnail({ item }: { readonly item: ScenarioPreviewItem }): ReactElement {
  return item.imageDataUrl
    ? <img src={item.imageDataUrl} alt="" className="size-full object-cover" />
    : <div className="grid size-full place-items-center text-fg-3"><ImagePlus size={20} aria-hidden /></div>;
}

export function StudioAiComicDirectorPanel({
  open,
  onClose,
  textConfigured,
  imageConfigured,
  aiSettings,
  sessionId,
  baseDocumentRevision = null,
  currentDocumentRevision = null,
  sessionApiClient,
  imageReferenceDocument,
  imageReferenceAssetOptions,
  imageReferencesLoading,
  imageReferenceMissingCount,
  onImageReferenceDocumentChange,
  storyText,
  onStoryTextChange,
  sceneCountHint,
  onSceneCountHintChange,
  applyTarget,
  onApplyTargetChange,
  busy,
  stageLabel,
  progress,
  error,
  preview,
  textProvenance,
  onGenerate,
  onGenerateImages,
  onChangeScene,
  onRemoveScene,
  onRegenerateScene,
  regeneratingIndex,
  onCancel,
  onApply,
  onDiscard,
}: StudioAiComicDirectorPanelProps): ReactElement | null {
  const items = preview ?? [];
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [stage, setStage] = useState<StudioAiComicDirectorStage>(() => items.length ? "direction" : "brief");
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>(() => items.map((_, index) => index));
  const [activeIndex, setActiveIndex] = useState(0);
  const [directions, setDirections] = useState<Record<number, DirectorDirection>>({});
  const [maskDataUrl, setMaskDataUrl] = useState("");
  const [repairTarget, setRepairTarget] = useState<StudioAiComicRepairTarget>("hands");
  const [repairPrompt, setRepairPrompt] = useState("선택 영역만 자연스럽게 수정하고 얼굴, 의상, 배경과 구도는 유지합니다.");
  const [mediaBusy, setMediaBusy] = useState<"quality" | "repair" | "layers" | null>(null);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);
  const [localJobs, setLocalJobs] = useState<StudioAiComicDirectorJob[]>([]);
  const [session, setSession] = useState<StudioAiComicDirectorSessionDocument>(() =>
    createStudioAiComicDirectorSession({
      id: sessionId,
      baseDocumentRevision,
      storyText,
      scenes: items,
    }),
  );
  const operationIdRef = useRef(uid("apply"));
  const api = useMemo(
    () => sessionApiClient ?? (sessionId ? createStudioAiComicDirectorApiClient() : null),
    [sessionApiClient, sessionId],
  );

  useEffect(() => {
    setSelectedIndexes((current) => {
      const valid = current.filter((index) => index >= 0 && index < items.length);
      return valid.length || current.length ? valid : items.map((_, index) => index);
    });
    setActiveIndex((current) => Math.min(Math.max(0, current), Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    setSession((current) => ({
      ...current,
      storyText,
      scenes: items,
      stage,
      status: busy ? "generating" : items.length ? "review" : "draft",
      jobs: localJobs,
      baseDocumentRevision,
      updatedAt: new Date().toISOString(),
    }));
  }, [baseDocumentRevision, busy, items, localJobs, stage, storyText]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      returnFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : returnFocusRef.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || !dialogRef.current || typeof document === "undefined") return;
    return activateStudioModalSheet({
      dialog: dialogRef.current,
      document,
      root: document.body,
      onDismiss: onClose,
      returnFocus: returnFocusRef.current,
      initialFocus: dialogRef.current.querySelector<HTMLElement>("[data-autofocus]"),
    });
  }, [onClose, open]);

  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;
    saveStudioAiComicDirectorSession(window.localStorage, session);
  }, [session, sessionId]);

  if (!open || typeof document === "undefined") return null;

  const referenceBlocked =
    imageReferenceMissingCount > 0
    || imageReferenceDocument.references.length > STUDIO_AI_IMAGE_REFERENCE_PROVIDER_SAFE_MAX;
  const activeItem = items[activeIndex];
  const activeCandidate = selectedCandidate(activeItem);
  const repairCapabilities = inspectStudioAiComicRepairCapabilities(aiSettings);
  const selected = new Set(selectedIndexes);
  const applyDiff = createStudioAiComicApplyDiff({
    session: { ...session, storyText, scenes: items, jobs: localJobs },
    target: applyTarget,
    operationId: operationIdRef.current,
  });
  const revisionConflict = Boolean(
    baseDocumentRevision
    && currentDocumentRevision
    && baseDocumentRevision !== currentDocumentRevision,
  );

  const mutateLocalSession = (patch: Partial<Omit<StudioAiComicDirectorSessionDocument, "version" | "id" | "revision">>) => {
    setSession((current) => updateStudioAiComicDirectorSession(current, patch));
  };

  const persistJob = async (input: {
    readonly operationId: string;
    readonly kind: StudioAiComicDirectorJob["kind"];
    readonly progressTotal: number;
    readonly payload?: Readonly<Record<string, unknown>>;
  }): Promise<StudioAiComicDirectorJob | null> => {
    if (!api || !sessionId) return null;
    const result = await api.createJob(sessionId, input);
    if (!result.ok) {
      setMediaMessage(result.message);
      return null;
    }
    setLocalJobs((current) => [result.data, ...current.filter((job) => job.id !== result.data.id)]);
    return result.data;
  };

  const finishJob = async (
    job: StudioAiComicDirectorJob | null,
    patch: Partial<StudioAiComicDirectorJob> & { readonly eventType?: string },
  ) => {
    if (!job || !api || !sessionId) return;
    const result = await api.updateJob(sessionId, job.id, patch);
    if (result.ok) {
      setLocalJobs((current) => current.map((candidate) => candidate.id === result.data.id ? result.data : candidate));
    }
  };

  const generateSelected = () => {
    if (!selectedIndexes.length || busy) return;
    const operationId = uid("generation");
    void persistJob({
      operationId,
      kind: "generation",
      progressTotal: selectedIndexes.length * 2,
      payload: { indexes: selectedIndexes, variants: 2 },
    });
    onGenerateImages({ indexes: [...selectedIndexes], variants: 2 });
    setStage("production");
  };

  const updateDirection = (index: number, direction: DirectorDirection) => {
    const item = items[index];
    if (!item) return;
    setDirections((current) => ({ ...current, [index]: direction }));
    onChangeScene(index, {
      imagePrompt: [stripDirectorDirective(item.imagePrompt), DIRECTIONS[direction].directive]
        .filter(Boolean)
        .join("\n"),
      approvedImageCandidateId: undefined,
      approvalRevision: undefined,
    });
    mutateLocalSession({ scenes: items, approval: null });
  };

  const chooseCandidate = (candidateId: string) => {
    if (!activeItem) return;
    const next = selectScenarioImageCandidate(activeItem, candidateId);
    onChangeScene(activeIndex, {
      imageCandidates: next.imageCandidates,
      selectedImageCandidateId: next.selectedImageCandidateId,
      imageDataUrl: next.imageDataUrl,
      imageProvenance: next.imageProvenance,
      approvedImageCandidateId: undefined,
      approvalRevision: undefined,
      layerManifest: next.layerManifest,
      qualityReport: next.qualityReport,
    });
    mutateLocalSession({ scenes: items, approval: null });
  };

  const analyzeCandidate = async () => {
    if (!activeItem || !activeCandidate) return;
    setMediaBusy("quality");
    setMediaMessage(null);
    const operationId = uid("quality");
    const job = await persistJob({
      operationId,
      kind: "quality",
      progressTotal: 1,
      payload: { panelIndex: activeIndex, candidateId: activeCandidate.id },
    });
    try {
      const report = await analyzeStudioAiComicCandidate(activeCandidate.imageDataUrl);
      const candidates = scenarioImageCandidates(activeItem).map((candidate) =>
        candidate.id === activeCandidate.id ? { ...candidate, qualityReport: report } : candidate,
      );
      onChangeScene(activeIndex, { imageCandidates: candidates, qualityReport: report });
      setMediaMessage(`픽셀 품질 분석 완료 · ${report.width}×${report.height}px · 확인 ${report.findings.filter((finding) => finding.severity === "review").length}개`);
      void api?.createArtifact(sessionId ?? "", {
        panelId: String(activeIndex),
        parentArtifactId: activeCandidate.id,
        kind: "quality-report",
        payload: report,
      });
      await finishJob(job, {
        status: "succeeded",
        progressDone: 1,
        progressTotal: 1,
        result: report as unknown as Record<string, unknown>,
        eventType: "quality.completed",
      });
    } catch (qualityError) {
      const message = qualityError instanceof Error ? qualityError.message : "후보 품질을 분석하지 못했습니다.";
      setMediaMessage(message);
      await finishJob(job, { status: "failed", error: message, eventType: "quality.failed" });
    } finally {
      setMediaBusy(null);
    }
  };

  const repairCandidate = async () => {
    if (!activeItem || !activeCandidate || !aiSettings || !maskDataUrl) return;
    setMediaBusy("repair");
    setMediaMessage(null);
    const operationId = uid("repair");
    const job = await persistJob({
      operationId,
      kind: "repair",
      progressTotal: 1,
      payload: { panelIndex: activeIndex, candidateId: activeCandidate.id, target: repairTarget },
    });
    const controller = new AbortController();
    const result = await repairStudioAiComicImageRegion({
      settings: aiSettings,
      sourceImageDataUrl: activeCandidate.imageDataUrl,
      maskDataUrl,
      prompt: repairPrompt,
      target: repairTarget,
      parentCandidateId: activeCandidate.id,
      signal: controller.signal,
    });
    if (!result.ok) {
      setMediaMessage(result.error);
      await finishJob(job, { status: "failed", error: result.error, eventType: "repair.failed" });
      setMediaBusy(null);
      return;
    }
    const appended = appendScenarioImageCandidate(activeItem, {
      id: operationId,
      imageDataUrl: result.data.imageDataUrl,
      inputFingerprint: scenarioImageInputFingerprint(
        activeItem,
        scenarioImageReferenceSignature(imageReferenceDocument.references),
      ),
      createdAt: result.data.repair.createdAt,
    });
    const candidates = (appended.imageCandidates ?? []).map((candidate) =>
      candidate.id === operationId ? { ...candidate, repair: result.data.repair } : candidate,
    );
    onChangeScene(activeIndex, {
      imageCandidates: candidates,
      selectedImageCandidateId: operationId,
      imageDataUrl: result.data.imageDataUrl,
      imageError: undefined,
      approvedImageCandidateId: undefined,
      approvalRevision: undefined,
      layerManifest: undefined,
    });
    setMediaMessage(`${REPAIR_TARGETS.find((target) => target.id === repairTarget)?.label ?? "선택 영역"} 수리 결과를 새 후보로 추가했습니다.`);
    void api?.createArtifact(sessionId ?? "", {
      panelId: String(activeIndex),
      parentArtifactId: activeCandidate.id,
      kind: "repair",
      payload: result.data.repair,
    });
    await finishJob(job, {
      status: "succeeded",
      progressDone: 1,
      progressTotal: 1,
      result: { candidateId: operationId },
      eventType: "repair.completed",
    });
    setMediaBusy(null);
  };

  const decomposeCandidate = async () => {
    if (!activeItem || !activeCandidate) return;
    setMediaBusy("layers");
    setMediaMessage(null);
    const operationId = uid("decomposition");
    const job = await persistJob({
      operationId,
      kind: "decomposition",
      progressTotal: 1,
      payload: { panelIndex: activeIndex, candidateId: activeCandidate.id },
    });
    try {
      const manifest = maskDataUrl
        ? await decomposeStudioAiComicCandidate({
            sourceImageDataUrl: activeCandidate.imageDataUrl,
            maskDataUrl,
            sourceCandidateId: activeCandidate.id,
          })
        : singleLayerStudioAiComicManifest(activeCandidate.id, activeCandidate.imageDataUrl);
      const candidates = scenarioImageCandidates(activeItem).map((candidate) =>
        candidate.id === activeCandidate.id ? { ...candidate, layerManifest: manifest } : candidate,
      );
      onChangeScene(activeIndex, { imageCandidates: candidates, layerManifest: manifest });
      setMediaMessage(
        manifest.editable
          ? "검토한 마스크로 전경과 배경을 실제 PNG 레이어로 분리했습니다."
          : manifest.limitation ?? "단일 장면 레이어로 유지합니다.",
      );
      void api?.createArtifact(sessionId ?? "", {
        panelId: String(activeIndex),
        parentArtifactId: activeCandidate.id,
        kind: "layer-manifest",
        payload: {
          method: manifest.method,
          editable: manifest.editable,
          layers: manifest.layers.map((layer) => ({ id: layer.id, name: layer.name, role: layer.role })),
        },
      });
      await finishJob(job, {
        status: "succeeded",
        progressDone: 1,
        progressTotal: 1,
        result: { method: manifest.method, layerCount: manifest.layers.length },
        eventType: "decomposition.completed",
      });
    } catch (layerError) {
      const message = layerError instanceof Error ? layerError.message : "레이어를 분리하지 못했습니다.";
      setMediaMessage(message);
      await finishJob(job, { status: "failed", error: message, eventType: "decomposition.failed" });
    } finally {
      setMediaBusy(null);
    }
  };

  const approveAndApply = async () => {
    if (revisionConflict) return;
    const storageKey = `toonspectrum:studio-ai-comic-director:apply:${applyDiff.operationId}`;
    if (sessionStorage.getItem(storageKey)) {
      setMediaMessage("같은 적용 작업은 이미 실행했습니다. 중복 추가를 막았습니다.");
      return;
    }
    let approvedSession = session;
    if (api && sessionId) {
      const candidateDigest = studioAiComicDirectorCandidateDigest(items);
      const result = await api.createApproval(sessionId, session.revision, candidateDigest);
      if (!result.ok) {
        setMediaMessage(result.message);
        return;
      }
      approvedSession = { ...session, approval: result.data };
      setSession(approvedSession);
    }
    sessionStorage.setItem(storageKey, new Date().toISOString());
    onApply();
    mutateLocalSession({ status: "applied", stage: "finish", approval: approvedSession.approval });
  };

  const modal = (
    <div className="fixed inset-0 z-[90] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI 코믹 디렉터"
        tabIndex={-1}
        className="mx-auto grid h-full w-full max-w-[96rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl border border-line bg-canvas shadow-2xl"
      >
        <header className="flex min-h-16 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 sm:px-4">
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-on-accent"><Clapperboard size={17} aria-hidden /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-black">AI 코믹 디렉터</h2>
            <p className="text-[0.65rem] text-fg-3">이야기·기준 → 컷 연출 → 제작·수리 → 마감·추가</p>
          </div>
          {sessionId ? <span className="rounded-full border border-good/35 bg-good/10 px-2 py-1 text-[0.62rem] font-semibold text-good">세션 자동 저장</span> : null}
          <button type="button" onClick={onClose} aria-label="닫기" title="닫기 (Esc)" className={cn("ml-auto grid size-11 place-items-center rounded-lg border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg", STUDIO_FOCUS_RING)}><X size={16} aria-hidden /></button>
        </header>

        <div className="grid min-h-0 md:grid-cols-[12.5rem_minmax(0,1fr)]">
          <nav aria-label="AI 코믹 디렉터 제작 단계" className="overflow-x-auto border-b border-line bg-panel p-2 md:overflow-y-auto md:border-b-0 md:border-r">
            <ol className="grid min-w-[35rem] grid-cols-4 gap-1 md:min-w-0 md:grid-cols-1">
              {STAGES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-autofocus={item.id === stage ? "true" : undefined}
                    aria-current={item.id === stage ? "step" : undefined}
                    onClick={() => setStage(item.id)}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-2 rounded-xl border px-2.5 text-left",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                      item.id === stage
                        ? "border-accent/45 bg-accent-soft text-fg"
                        : "border-transparent text-fg-3 hover:bg-card hover:text-fg",
                    )}
                  >
                    <span className={cn("font-mono text-sm font-black", item.id === stage ? "text-accent" : "text-fg-3")}>{item.number}</span>
                    <span><strong className="block text-xs">{item.label}</strong><span className="hidden text-[0.58rem] text-fg-3 md:block">{item.description}</span></span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <main className="min-h-0 overflow-y-auto px-3 py-3 [scroll-padding-block:5rem] sm:px-5 sm:py-4">
            {stage === "brief" ? (
              <div className="mx-auto max-w-5xl space-y-4">
                <section className="border-b border-line pb-4">
                  <div className="mb-2 flex items-start justify-between gap-2"><div><h3 className="text-sm font-bold">이야기와 제작 기준</h3><p className="text-[0.68rem] text-fg-3">이미지 비용이 발생하기 전에 대본과 반복 기준을 정합니다.</p></div><span className="rounded-full border border-line bg-card px-2 py-1 text-[0.62rem] text-fg-3">이미지 생성 없음</span></div>
                  <label className="block text-xs font-semibold text-fg-2" htmlFor="comic-director-story">이야기 또는 회차 대본</label>
                  <textarea id="comic-director-story" value={storyText} onChange={(event) => onStoryTextChange(event.target.value.slice(0, STORY_TEXT_MAX))} disabled={busy} rows={8} className="mt-1 w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent disabled:opacity-60" />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.65rem] text-fg-3"><span>{storyText.length.toLocaleString("ko-KR")} / {STORY_TEXT_MAX.toLocaleString("ko-KR")}자</span><label className="ml-auto flex items-center gap-1.5">컷 수<select value={sceneCountHint ?? ""} onChange={(event) => onSceneCountHintChange(event.target.value ? Number(event.target.value) : undefined)} disabled={busy} className="min-h-11 rounded-lg border border-line bg-card px-2"><option value="">자동</option>{Array.from({ length: 9 }, (_, index) => index + 2).map((count) => <option key={count} value={count}>{count}컷</option>)}</select></label><button type="button" onClick={onGenerate} disabled={!textConfigured || busy || !storyText.trim()} className="min-h-11 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent disabled:opacity-45"><Sparkles size={13} className="mr-1 inline" aria-hidden />컷 구성 만들기</button></div>
                </section>
                <section>
                  <h3 className="text-xs font-bold">작품 바이블 · AI 이미지 참조 팩</h3>
                  <p className="mb-2 text-[0.65rem] text-fg-3">캐릭터 정체성, 구도·연출, 화풍 참조를 역할별로 버전 관리합니다.</p>
                  <StudioAiImageReferencePackEditor document={imageReferenceDocument} assetOptions={imageReferenceAssetOptions} loading={imageReferencesLoading} disabled={busy} onChange={(next) => { onImageReferenceDocumentChange(next); mutateLocalSession({ approval: null }); }} />
                  {imageReferenceMissingCount > 0 ? <p role="alert" className="mt-2 rounded-lg border border-bad/30 bg-bad/10 p-2 text-xs text-bad">참조 에셋 {imageReferenceMissingCount}개를 찾을 수 없습니다.</p> : null}
                  {sessionId && api ? <button type="button" onClick={() => void api.appendVisualBibleRevision(sessionId, session.visualBible).then((result) => setMediaMessage(result.ok ? `작품 바이블 revision ${result.data.revision} 저장 완료` : result.message))} className="mt-2 min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised">현재 작품 바이블 revision 저장</button> : null}
                </section>
              </div>
            ) : null}

            {stage === "direction" ? (
              <div className="mx-auto max-w-6xl">
                <div className="mb-3 flex flex-wrap items-center gap-2"><div><h3 className="text-sm font-bold">AI가 이해한 컷과 연출 확인</h3><p className="text-[0.65rem] text-fg-3">체크박스가 실제 제작 대상을 결정합니다.</p></div><button type="button" onClick={() => setSelectedIndexes(items.map((_, index) => index))} disabled={busy || !items.length} className="ml-auto min-h-11 rounded-lg border border-line bg-card px-3 text-xs hover:bg-raised">전체 선택</button><button type="button" onClick={() => setSelectedIndexes([])} disabled={busy || !selectedIndexes.length} className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs hover:bg-raised">선택 해제</button></div>
                {!items.length ? <div className="rounded-xl border border-dashed border-line p-8 text-center"><p className="text-sm font-semibold">아직 컷 구성이 없습니다.</p><button type="button" onClick={() => setStage("brief")} className="mt-3 min-h-11 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent">이야기 입력으로 이동</button></div> : (
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_23rem]">
                    <ul aria-label="컷 구성" className="grid gap-2 sm:grid-cols-2">
                      {items.map((item, index) => (
                        <li key={index} className={cn("rounded-xl border bg-card p-2", activeIndex === index ? "border-accent" : "border-line")}>
                          <div className="flex gap-2"><label className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-panel"><span className="sr-only">컷 {index + 1} 제작 선택</span><input type="checkbox" checked={selected.has(index)} onChange={() => setSelectedIndexes((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort((left, right) => left - right))} disabled={busy} className="size-4 accent-accent" /></label><button type="button" onClick={() => setActiveIndex(index)} className={cn("min-h-11 min-w-0 flex-1 rounded-lg text-left", STUDIO_FOCUS_RING)}><strong className="block truncate text-xs">컷 {index + 1} · {item.summary}</strong><span className="block truncate text-[0.62rem] text-fg-3">{SCENARIO_BEAT_LABELS[item.beatType]} · 대사 {item.bubbles.length}개</span></button><div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-raised"><StageThumbnail item={item} /></div></div>
                          <label className="mt-2 block text-[0.64rem] font-semibold text-fg-3">제작 방향<select aria-label={`${index + 1}번 장면 제작 방향`} value={directions[index] ?? "faithful"} onChange={(event) => updateDirection(index, event.target.value as DirectorDirection)} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg">{Object.entries(DIRECTIONS).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label>
                        </li>
                      ))}
                    </ul>
                    {activeItem ? <aside className="rounded-xl border border-line bg-panel p-3"><h3 className="text-xs font-bold">컷 {activeIndex + 1} 연출</h3><label className="mt-2 block text-[0.64rem] font-semibold text-fg-3">비트 역할<select value={activeItem.beatType} onChange={(event) => onChangeScene(activeIndex, { beatType: event.target.value as ScenarioBeatType })} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2 text-xs">{SCENARIO_BEAT_TYPES.map((beat) => <option key={beat} value={beat}>{SCENARIO_BEAT_LABELS[beat]}</option>)}</select></label><label className="mt-2 block text-[0.64rem] font-semibold text-fg-3">장면 요약<textarea value={activeItem.summary} onChange={(event) => onChangeScene(activeIndex, { summary: event.target.value.slice(0, 240) })} disabled={busy} rows={2} className="mt-1 w-full rounded-lg border border-line bg-card p-2 text-xs" /></label><label className="mt-2 block text-[0.64rem] font-semibold text-fg-3">그림 프롬프트<textarea aria-label={`${activeIndex + 1}번 장면 그림 프롬프트`} value={activeItem.imagePrompt} onChange={(event) => onChangeScene(activeIndex, { imagePrompt: event.target.value.slice(0, 4_000), approvedImageCandidateId: undefined, approvalRevision: undefined })} disabled={busy} rows={6} className="mt-1 w-full rounded-lg border border-line bg-card p-2 text-xs leading-relaxed" /></label><label className="mt-2 block text-[0.64rem] font-semibold text-fg-3">대사·지문<textarea value={activeItem.dialogue} onChange={(event) => onChangeScene(activeIndex, { dialogue: event.target.value.slice(0, 4_000) })} disabled={busy} rows={4} className="mt-1 w-full rounded-lg border border-line bg-card p-2 text-xs" /></label><details className="mt-2 rounded-lg border border-line bg-card p-2"><summary className="min-h-11 cursor-pointer text-xs font-semibold">연속성 기준</summary><StudioContinuityMetadataEditor value={activeItem.continuity ?? {}} onChange={(continuity) => onChangeScene(activeIndex, { continuity, approvedImageCandidateId: undefined, approvalRevision: undefined })} disabled={busy} compact /></details><button type="button" onClick={() => onRemoveScene(activeIndex)} disabled={busy || items.length <= 1} className="mt-2 min-h-11 rounded-lg border border-bad/30 bg-bad/10 px-3 text-xs text-bad disabled:opacity-45">이 컷 삭제</button></aside> : null}
                  </div>
                )}
                <div className="sticky bottom-2 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-raised/95 p-2 shadow-xl backdrop-blur"><strong className="px-2 text-xs">{selectedIndexes.length}컷 선택됨</strong><span className="text-[0.62rem] text-fg-3">제작용 · 후보 2개씩 · 최대 {selectedIndexes.length * 2}결과</span><button type="button" onClick={generateSelected} disabled={!imageConfigured || referenceBlocked || busy || !selectedIndexes.length} className="ml-auto min-h-11 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent disabled:opacity-45">선택한 {selectedIndexes.length}컷 제작하기</button></div>
              </div>
            ) : null}

            {stage === "production" ? (
              <div className="mx-auto max-w-6xl space-y-3">
                <div className="flex flex-wrap items-center gap-2"><div><h3 className="text-sm font-bold">후보를 만들고 사용할 결과 선택</h3><p className="text-[0.65rem] text-fg-3">완료된 컷부터 검토하고, 틀린 영역만 수리하거나 레이어로 분리합니다.</p></div>{busy ? <button type="button" onClick={onCancel} className="ml-auto min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised">취소</button> : null}</div>
                {busy ? <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft p-3 text-xs"><Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden />{stageLabel ?? "제작 중…"}{progress ? ` (${progress.done}/${progress.total})` : ""}</div> : null}
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_25rem]">
                  <section><div className="mb-2 flex gap-1 overflow-x-auto pb-1">{items.map((item, index) => <button key={index} type="button" onClick={() => { setActiveIndex(index); setMaskDataUrl(""); }} className={cn("min-h-11 shrink-0 rounded-lg border px-3 text-xs", activeIndex === index ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-3")}>컷 {index + 1}{item.imageCandidates?.length ? ` · ${item.imageCandidates.length}` : ""}</button>)}</div>{activeItem ? <><div className="grid gap-2 sm:grid-cols-2">{scenarioImageCandidates(activeItem).map((candidate, candidateIndex) => { const chosen = candidate.id === activeCandidate?.id; return <label key={candidate.id} className={cn("overflow-hidden rounded-xl border bg-card", chosen ? "border-accent" : "border-line")}><span className="block aspect-[4/3] bg-raised"><img src={candidate.imageDataUrl} alt={`컷 ${activeIndex + 1} 후보 ${candidateIndex + 1}`} className="size-full object-cover" /></span><span className="flex min-h-11 items-center gap-2 px-2"><input type="radio" name={`candidate-${activeIndex}`} checked={chosen} onChange={() => chooseCandidate(candidate.id)} className="size-4 accent-accent" /><strong className="text-xs">후보 {candidateIndex + 1}</strong>{candidate.repair ? <span className="rounded-full bg-good/10 px-2 py-0.5 text-[0.58rem] text-good">부분 수리</span> : null}{candidate.qualityReport ? <span className="ml-auto text-[0.58rem] text-fg-3">분석됨</span> : null}</span></label>; })}</div>{!scenarioImageCandidates(activeItem).length ? <div className="rounded-xl border border-dashed border-line p-8 text-center"><p className="text-sm font-semibold">아직 이미지 후보가 없습니다.</p><button type="button" onClick={() => onRegenerateScene(activeIndex)} disabled={!imageConfigured || busy || regeneratingIndex !== null} className="mt-3 min-h-11 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent disabled:opacity-45">이 컷 이미지 생성</button></div> : null}</> : null}</section>
                  <aside className="space-y-3 rounded-xl border border-line bg-panel p-3"><section><h3 className="flex items-center gap-1.5 text-xs font-bold"><ScanSearch size={14} className="text-accent" aria-hidden />후보 품질 분석</h3><p className="mt-1 text-[0.62rem] text-fg-3">해상도·투명도·가장자리·명암을 실제 픽셀로 측정합니다. 정체성과 해부는 모르는 상태로 남깁니다.</p><button type="button" onClick={() => void analyzeCandidate()} disabled={!activeCandidate || mediaBusy !== null} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-card text-xs font-semibold hover:bg-raised disabled:opacity-45">{mediaBusy === "quality" ? "분석 중…" : "현재 후보 픽셀 품질 분석"}</button>{activeCandidate?.qualityReport ? <ul className="mt-2 space-y-1 text-[0.62rem] text-fg-2">{activeCandidate.qualityReport.findings.map((finding) => <li key={finding.id} className={cn("rounded-lg border p-2", finding.severity === "review" ? "border-warn/30 bg-warn/10" : "border-line bg-card")}>{finding.message}</li>)}</ul> : null}</section><section className="border-t border-line pt-3"><h3 className="flex items-center gap-1.5 text-xs font-bold"><WandSparkles size={14} className="text-accent" aria-hidden />마스크 영역 수리</h3>{!repairCapabilities.maskEdit ? <><p className="mt-1 rounded-lg border border-warn/30 bg-warn/10 p-2 text-[0.64rem] text-warn">마스크 영역 수리를 연결하지 않았습니다. {repairCapabilities.reason}</p><button type="button" onClick={() => onRegenerateScene(activeIndex)} disabled={!activeItem || busy} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-card text-xs font-semibold hover:bg-raised disabled:opacity-45">이 컷 전체 다시 제작</button></> : activeCandidate ? <><MaskEditor source={activeCandidate.imageDataUrl} onChange={setMaskDataUrl} /><label className="mt-2 block text-[0.64rem] font-semibold text-fg-3">수리 대상<select value={repairTarget} onChange={(event) => setRepairTarget(event.target.value as StudioAiComicRepairTarget)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2 text-xs">{REPAIR_TARGETS.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label><label className="mt-2 block text-[0.64rem] font-semibold text-fg-3">수리 지시<textarea value={repairPrompt} onChange={(event) => setRepairPrompt(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-line bg-card p-2 text-xs" /></label><button type="button" onClick={() => void repairCandidate()} disabled={!maskDataUrl || mediaBusy !== null} className="mt-2 min-h-11 w-full rounded-lg bg-accent px-3 text-xs font-bold text-on-accent disabled:opacity-45">{mediaBusy === "repair" ? "선택 영역 수리 중…" : "선택 영역만 수리"}</button></> : <p className="mt-1 text-[0.64rem] text-fg-3">먼저 사용할 후보를 선택하세요.</p>}</section><section className="border-t border-line pt-3"><h3 className="flex items-center gap-1.5 text-xs font-bold"><Layers3 size={14} className="text-accent" aria-hidden />레이어 분리</h3><p className="mt-1 text-[0.62rem] text-fg-3">검토한 마스크가 있으면 실제 전경·배경 PNG를 만들고, 없으면 단일 레이어 폴백을 명시합니다.</p><button type="button" onClick={() => void decomposeCandidate()} disabled={!activeCandidate || mediaBusy !== null} className="mt-2 min-h-11 w-full rounded-lg border border-line bg-card text-xs font-semibold hover:bg-raised disabled:opacity-45">{mediaBusy === "layers" ? "레이어 분리 중…" : maskDataUrl ? "마스크로 전경·배경 분리" : "단일 레이어로 유지"}</button>{activeItem?.layerManifest ? <p className={cn("mt-2 rounded-lg border p-2 text-[0.62rem]", activeItem.layerManifest.editable ? "border-good/30 bg-good/10 text-good" : "border-line bg-card text-fg-3")}>{activeItem.layerManifest.editable ? `${activeItem.layerManifest.layers.length}개 편집 레이어 준비됨` : activeItem.layerManifest.limitation}</p> : null}</section>{mediaMessage ? <p role="status" className="rounded-lg border border-line bg-card p-2 text-[0.65rem] text-fg-2">{mediaMessage}</p> : null}</aside>
                </div>
              </div>
            ) : null}

            {stage === "finish" ? (
              <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]"><section><h3 className="text-sm font-bold">독자 흐름과 적용 차이</h3><p className="mb-3 text-[0.65rem] text-fg-3">이미지, 네이티브 대사·말풍선과 준비된 전경·배경 레이어를 확인합니다.</p><div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-line-strong bg-[oklch(0.94_0.012_83)] p-2">{items.map((item, index) => <div key={index} className="mb-6 overflow-hidden rounded-lg bg-raised"><div className="aspect-[4/3]"><StageThumbnail item={item} /></div>{item.dialogue ? <p className="m-3 rounded-full bg-[oklch(0.96_0.01_85)] px-4 py-2 text-center text-xs font-semibold text-[oklch(0.2_0.01_70)]">{item.dialogue.split("\n")[0]}</p> : null}</div>)}</div></section><aside className="rounded-xl border border-line bg-panel p-3"><h3 className="text-xs font-bold">추가 위치</h3><label className="mt-2 flex min-h-14 items-center gap-2 rounded-xl border border-line bg-card p-2"><input type="radio" name="apply-target" checked={applyTarget === "current-page"} onChange={() => onApplyTargetChange("current-page")} /><span><strong className="block text-xs">현재 페이지 아래</strong><span className="text-[0.6rem] text-fg-3">기존 레이어를 바꾸지 않음</span></span></label><label className="mt-2 flex min-h-14 items-center gap-2 rounded-xl border border-line bg-card p-2"><input type="radio" name="apply-target" checked={applyTarget === "new-page"} onChange={() => onApplyTargetChange("new-page")} aria-label="다음 새 페이지" /><span><strong className="block text-xs">다음 새 페이지</strong><span className="text-[0.6rem] text-fg-3">별도 세로 원고 페이지 생성</span></span></label><h3 className="mt-4 border-t border-line pt-3 text-xs font-bold">추가될 객체</h3><dl className="mt-2 space-y-1.5 text-[0.68rem]"><div className="flex justify-between"><dt>컷 프레임</dt><dd className="font-bold">{applyDiff.panelCount}</dd></div><div className="flex justify-between"><dt>장면 이미지</dt><dd className="font-bold">{applyDiff.imageCount}</dd></div><div className="flex justify-between"><dt>네이티브 말풍선</dt><dd className="font-bold">{applyDiff.nativeBubbleCount}</dd></div><div className="flex justify-between"><dt>분리 레이어</dt><dd className="font-bold">{applyDiff.decomposedLayerCount}</dd></div><div className="flex justify-between"><dt>기존 레이어 변경</dt><dd className="font-bold text-good">없음</dd></div></dl>{revisionConflict ? <p role="alert" className="mt-3 rounded-lg border border-bad/30 bg-bad/10 p-2 text-[0.65rem] text-bad">세션 시작 뒤 원고 revision이 변경됐습니다. 최신 위치를 다시 확인해야 합니다.</p> : <p className="mt-3 rounded-lg border border-good/30 bg-good/10 p-2 text-[0.65rem] text-good"><ShieldCheck size={12} className="mr-1 inline" aria-hidden />동일 operation ID 중복 적용 방지 · 한 번의 Undo</p>}<p className="mt-2 text-[0.62rem] text-fg-3">후보 digest {applyDiff.candidateDigest} · {sessionId ? "서버 검수 revision을 만든 뒤 적용" : "로컬 선택 기준으로 적용"}</p><button type="button" onClick={() => void approveAndApply()} disabled={busy || revisionConflict} className="mt-3 min-h-11 w-full rounded-lg bg-accent px-4 text-xs font-bold text-on-accent disabled:opacity-45">현재 페이지에 적용</button></aside></div>
            ) : null}
          </main>
        </div>

        <footer className="flex min-h-14 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2 text-[0.65rem] text-fg-3"><span className="font-semibold text-fg-2">Activity</span>{busy ? <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />{stageLabel ?? "작업 중"}{progress ? ` (${progress.done}/${progress.total})` : ""}</span> : <span>{localJobs.length ? `${localJobs.length}개 durable 작업 기록` : "대기 중"}</span>}{error ? <span role="alert" className="text-bad"><AlertTriangle size={12} className="mr-1 inline" aria-hidden />{error}</span> : null}<button type="button" onClick={onDiscard} disabled={busy} className="ml-auto min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised disabled:opacity-45">초안 버리기</button>{stage !== "finish" ? <button type="button" onClick={() => setStage(STAGES[Math.min(STAGES.length - 1, STAGES.findIndex((item) => item.id === stage) + 1)]!.id)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised">다음 단계<ChevronRight size={13} aria-hidden /></button> : null}</footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
