import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clapperboard,
  Eye,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  StudioAiImageReferencePackEditor,
  STUDIO_AI_IMAGE_REFERENCE_PROVIDER_SAFE_MAX,
  type StudioAiImageReferenceAssetOption,
} from "./StudioAiImageReferencePackEditor";
import {
  approveScenarioImageCandidate,
  scenarioImageCandidates,
  scenarioImageReferenceSignature,
  selectScenarioImageCandidate,
  type StudioScenarioImageGenerationRequest,
} from "./studio-scenario-candidate-workflow";
import {
  analyzeStudioAiComicDirectorQuality,
  applyStudioAiComicDirectorPromptIntent,
  defaultStudioAiComicDirectorSelection,
  normalizeStudioAiComicDirectorSelection,
  parseStudioAiComicDirectorPreferences,
  STUDIO_AI_COMIC_DIRECTOR_INTENTS,
  STUDIO_AI_COMIC_DIRECTOR_PROFILES,
  STUDIO_AI_COMIC_DIRECTOR_STAGE_IDS,
  studioAiComicDirectorApplySummary,
  studioAiComicDirectorIntent,
  studioAiComicDirectorProfile,
  studioAiComicDirectorPromptIntent,
  type StudioAiComicDirectorFinding,
  type StudioAiComicDirectorIntentId,
  type StudioAiComicDirectorPreferences,
  type StudioAiComicDirectorProfileId,
  type StudioAiComicDirectorStageId,
  type StudioAiComicDirectorViewId,
} from "./studio-ai-comic-director";
import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
} from "../studio-panel-ui";
import {
  SCENARIO_SCENE_COUNT_MAX,
  SCENARIO_SCENE_COUNT_MIN,
} from "../studio-scenario-scenes";
import { StudioScenarioCandidateDesk } from "../StudioScenarioCandidateDesk";
import {
  SCENARIO_BEAT_LABELS,
  SCENARIO_BEAT_TYPES,
  type ScenarioBeatType,
} from "../studio-story-beats";
import { StudioContinuityMetadataEditor } from "../StudioContinuityMetadataEditor";
import { useStudioModalSheet } from "../useStudioModalSheet";

import type { StudioTextAiProvenance } from "./studio-ai-client";
import type { StudioAiImageReferenceDocument } from "./studio-ai-image-reference-roles";
import type { ScenarioPreviewItem } from "../studio-scenario-layout";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

const STORY_TEXT_MAX = 2_000;
const EMPTY_ITEMS: readonly ScenarioPreviewItem[] = [];
const PREFERENCES_KEY = "toonspectrum:studio-ai-comic-director:v1";
const SCENE_COUNT_OPTIONS = Array.from(
  { length: SCENARIO_SCENE_COUNT_MAX - SCENARIO_SCENE_COUNT_MIN + 1 },
  (_, index) => SCENARIO_SCENE_COUNT_MIN + index,
);

const BUTTON_BASE = cn(
  "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
  "disabled:cursor-not-allowed disabled:opacity-45",
);
const SECONDARY_BUTTON = cn(
  BUTTON_BASE,
  "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg",
);
const QUIET_BUTTON = cn(
  BUTTON_BASE,
  "border-transparent bg-transparent text-fg-3 hover:bg-raised hover:text-fg",
);
const PRIMARY_BUTTON = cn(
  BUTTON_BASE,
  "border-accent bg-accent px-4 font-black text-on-accent hover:bg-accent/90",
  "disabled:border-line disabled:bg-raised disabled:text-fg-3",
);
const FIELD_CLASS = cn(
  "w-full rounded-lg border border-line bg-card px-3 py-2 text-xs leading-relaxed text-fg placeholder:text-fg-3",
  "hover:border-line-strong focus:border-accent disabled:cursor-not-allowed disabled:opacity-55",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
);

const STAGE_COPY: Readonly<
  Record<
    StudioAiComicDirectorStageId,
    {
      readonly number: string;
      readonly shortLabel: string;
      readonly title: string;
      readonly description: string;
    }
  >
> = {
  brief: {
    number: "01",
    shortLabel: "이야기·기준",
    title: "이야기와 작품 기준 준비",
    description: "대본·컷 수·캐릭터·장소·화풍 기준을 먼저 정합니다.",
  },
  direction: {
    number: "02",
    shortLabel: "컷 연출",
    title: "AI가 이해한 컷과 연출 확인",
    description: "이미지를 만들기 전에 장면, 대사와 연속성 기준을 수정합니다.",
  },
  production: {
    number: "03",
    shortLabel: "제작·수리",
    title: "후보를 만들고 사용할 결과 선택",
    description: "필요한 컷만 후보로 만들고 이전 결과를 보존합니다.",
  },
  finish: {
    number: "04",
    shortLabel: "마감·추가",
    title: "독자 흐름과 Studio 추가 내용 확인",
    description: "세로 미리보기와 추가 위치를 확인한 뒤 원고에 반영합니다.",
  },
};

export interface StudioAiComicDirectorPanelProps {
  open: boolean;
  onClose: () => void;
  textConfigured: boolean;
  imageConfigured: boolean;
  imageReferenceDocument: StudioAiImageReferenceDocument;
  imageReferenceAssetOptions: readonly StudioAiImageReferenceAssetOption[];
  imageReferencesLoading: boolean;
  imageReferenceMissingCount: number;
  onImageReferenceDocumentChange: (value: StudioAiImageReferenceDocument) => void;
  storyText: string;
  onStoryTextChange: (value: string) => void;
  sceneCountHint: number | undefined;
  onSceneCountHintChange: (value: number | undefined) => void;
  applyTarget: "current-page" | "new-page";
  onApplyTargetChange: (value: "current-page" | "new-page") => void;
  busy: boolean;
  stageLabel: string | null;
  progress: { done: number; total: number } | null;
  error: string | null;
  preview: ScenarioPreviewItem[] | null;
  textProvenance: StudioTextAiProvenance | null;
  onGenerate: () => void;
  onGenerateImages: (request?: StudioScenarioImageGenerationRequest) => void;
  onChangeScene: (index: number, patch: Partial<ScenarioPreviewItem>) => void;
  onRemoveScene: (index: number) => void;
  onRegenerateScene: (index: number) => void;
  regeneratingIndex: number | null;
  onCancel: () => void;
  onApply: () => void;
  onDiscard: () => void;
}

function readPreferences(
  items: readonly ScenarioPreviewItem[] | null,
): StudioAiComicDirectorPreferences {
  if (typeof sessionStorage === "undefined") {
    return parseStudioAiComicDirectorPreferences(null, items);
  }
  try {
    return parseStudioAiComicDirectorPreferences(
      sessionStorage.getItem(PREFERENCES_KEY),
      items,
    );
  } catch {
    return parseStudioAiComicDirectorPreferences(null, items);
  }
}

function StatusPill({
  tone = "neutral",
  children,
}: {
  readonly tone?: "neutral" | "accent" | "good" | "warn" | "bad";
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.62rem] font-bold",
        tone === "neutral" && "border-line bg-raised text-fg-3",
        tone === "accent" && "border-accent/40 bg-accent-soft text-accent",
        tone === "good" && "border-good/35 bg-good/10 text-good",
        tone === "warn" && "border-warn/40 bg-warn/10 text-warn",
        tone === "bad" && "border-bad/40 bg-bad/10 text-bad",
      )}
    >
      {children}
    </span>
  );
}

function StageThumbnail({
  item,
  generating,
}: {
  readonly item: ScenarioPreviewItem;
  readonly generating: boolean;
}): ReactElement {
  if (item.imageDataUrl) {
    return (
      <img
        src={item.imageDataUrl}
        alt={`${item.summary || "장면"} 이미지 결과`}
        className="size-full object-cover"
      />
    );
  }
  if (generating) {
    return (
      <div
        className="grid size-full place-items-center bg-raised text-fg-3"
        aria-label={`${item.summary || "장면"} 이미지 제작 중`}
      >
        <Loader2
          size={20}
          className="animate-spin motion-reduce:animate-none"
          aria-hidden
        />
      </div>
    );
  }
  if (item.imageError) {
    return (
      <div className="grid size-full place-items-center gap-1 bg-bad/10 p-2 text-center text-bad">
        <AlertTriangle size={18} aria-hidden />
        <span className="text-[0.62rem]">이미지 제작 실패</span>
      </div>
    );
  }
  return (
    <div className="grid size-full place-items-center gap-1 bg-raised text-fg-3">
      <ImagePlus size={19} aria-hidden />
      <span className="text-[0.62rem]">아직 이미지 없음</span>
    </div>
  );
}

function stageStatus(item: ScenarioPreviewItem): {
  readonly tone: "neutral" | "accent" | "good" | "warn" | "bad";
  readonly label: string;
} {
  if (item.imageError) return { tone: "bad", label: "다시 제작 필요" };
  if (item.approvedImageCandidateId) return { tone: "good", label: "결과 확정" };
  if (item.imageDataUrl || scenarioImageCandidates(item).length > 0) {
    return { tone: "accent", label: "후보 검토" };
  }
  if (!item.summary.trim() || !item.imagePrompt.trim()) {
    return { tone: "bad", label: "먼저 수정" };
  }
  return { tone: "neutral", label: "제작 준비" };
}

function FindingSummary({
  findings,
  onSelect,
}: {
  readonly findings: readonly StudioAiComicDirectorFinding[];
  readonly onSelect: (finding: StudioAiComicDirectorFinding) => void;
}): ReactElement {
  if (findings.length === 0) {
    return (
      <div className="flex min-h-12 items-center gap-2 rounded-xl border border-good/30 bg-good/10 px-3 text-xs text-good">
        <CheckCircle2 size={15} aria-hidden />
        현재 단계에서 먼저 수정할 문제가 없습니다.
      </div>
    );
  }
  const first = findings[0];
  const blockCount = findings.filter((finding) => finding.severity === "block").length;
  const reviewCount = findings.filter((finding) => finding.severity === "review").length;
  return (
    <div
      className={cn(
        "flex min-h-14 flex-wrap items-center gap-2 rounded-xl border px-3 py-2",
        blockCount > 0 ? "border-bad/35 bg-bad/10" : "border-warn/35 bg-warn/10",
      )}
    >
      <AlertTriangle
        size={16}
        className={blockCount > 0 ? "text-bad" : "text-warn"}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <strong className="block text-xs text-fg">{first.title}</strong>
        <span className="block text-[0.62rem] text-fg-3">{first.description}</span>
      </div>
      <StatusPill tone={blockCount > 0 ? "bad" : "warn"}>
        먼저 수정 {blockCount} · 확인 권장 {reviewCount}
      </StatusPill>
      <button type="button" onClick={() => onSelect(first)} className={SECONDARY_BUTTON}>
        확인
      </button>
    </div>
  );
}

function CandidateCompareDialog({
  open,
  item,
  onClose,
  onSelect,
}: {
  readonly open: boolean;
  readonly item: ScenarioPreviewItem | undefined;
  readonly onClose: () => void;
  readonly onSelect: (candidateId: string) => void;
}): ReactElement | null {
  const dialogRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : document.body,
  );
  useStudioModalSheet({
    activeKey: open ? "comic-director-candidate-compare" : null,
    dialogRef,
    rootRef,
    onDismiss: onClose,
  });
  if (!open || !item || typeof document === "undefined") return null;
  const candidates = scenarioImageCandidates(item).slice(0, 4);
  return createPortal(
    <div className="fixed inset-0 z-[130] grid place-items-center bg-[oklch(0.08_0.01_70/0.82)] p-3 backdrop-blur-sm">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-studio-modal-backdrop="true"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="컷 후보 비교"
        tabIndex={-1}
        className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Eye size={15} className="text-accent" aria-hidden />
          <h2 className="text-sm font-black text-fg">{item.summary} · 후보 비교</h2>
          <button type="button" onClick={onClose} className={cn(QUIET_BUTTON, "ml-auto")}>
            닫기
          </button>
        </header>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 sm:grid-cols-2">
          {candidates.map((candidate, index) => (
            <article key={candidate.id} className="overflow-hidden rounded-xl border border-line bg-card">
              <img
                src={candidate.imageDataUrl}
                alt={`${item.summary} 후보 ${index + 1}`}
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="flex items-center gap-2 p-2.5">
                <div className="min-w-0 flex-1">
                  <strong className="block text-xs text-fg">후보 {index + 1}</strong>
                  <span className="block truncate text-[0.6rem] text-fg-3">
                    {candidate.imageProvenance
                      ? `${candidate.imageProvenance.provider} / ${candidate.imageProvenance.model}`
                      : "이전 생성 결과"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(candidate.id);
                    onClose();
                  }}
                  className={SECONDARY_BUTTON}
                >
                  이 후보 사용
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function StudioAiComicDirectorPanel({
  open,
  onClose,
  textConfigured,
  imageConfigured,
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
  const dialogRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : document.body,
  );
  const [preferences] = useState(() => readPreferences(preview));
  const [stage, setStage] = useState(preferences.stage);
  const [view, setView] = useState<StudioAiComicDirectorViewId>(preferences.view);
  const [profileId, setProfileId] = useState<StudioAiComicDirectorProfileId>(
    preferences.profile,
  );
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>(
    [...preferences.selectedIndexes],
  );
  const [selectedPanelIndex, setSelectedPanelIndex] = useState(
    preferences.selectedPanelIndex,
  );
  const [intents, setIntents] = useState(preferences.intents);
  const [compareOpen, setCompareOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(
    imageReferenceDocument.references.length > 0,
  );

  const items = preview ?? EMPTY_ITEMS;
  const hasPreview = items.length > 0;
  const editingLocked = busy || regeneratingIndex !== null;
  const validSelectedIndexes = useMemo(
    () => normalizeStudioAiComicDirectorSelection(selectedIndexes, items.length),
    [items.length, selectedIndexes],
  );
  const selectedItem = items[selectedPanelIndex] ?? items[0];
  const profile = studioAiComicDirectorProfile(profileId);
  const hasReferences = imageReferenceDocument.references.length > 0;
  const imageReferencesBlocked =
    hasReferences &&
    (imageReferencesLoading ||
      imageReferenceMissingCount > 0 ||
      imageReferenceDocument.references.length >
        STUDIO_AI_IMAGE_REFERENCE_PROVIDER_SAFE_MAX);
  const imageGenerationReady = imageConfigured && !imageReferencesBlocked;
  const imageGenerationDisabledReason = !imageConfigured
    ? "이미지 생성 API를 먼저 연결하세요"
    : imageReferencesBlocked
      ? "AI 참조 에셋을 모두 확인한 뒤 생성하세요"
      : undefined;
  const referenceSignature = scenarioImageReferenceSignature(
    imageReferenceDocument.references,
  );
  const qualityFindings = useMemo(
    () =>
      analyzeStudioAiComicDirectorQuality({
        items,
        referenceSignature,
        referencesLoading: imageReferencesLoading,
        missingReferenceCount: imageReferenceMissingCount,
        referenceCount: imageReferenceDocument.references.length,
        referenceLimit: STUDIO_AI_IMAGE_REFERENCE_PROVIDER_SAFE_MAX,
      }),
    [
      imageReferenceDocument.references,
      imageReferenceMissingCount,
      imageReferencesLoading,
      items,
      referenceSignature,
    ],
  );
  const blockingFindings = qualityFindings.filter(
    (finding) => finding.severity === "block",
  );
  const applySummary = useMemo(
    () => studioAiComicDirectorApplySummary(items),
    [items],
  );
  const missingImageCount = items.filter((item) => !item.imageDataUrl).length;
  const canPlan =
    textConfigured && !editingLocked && storyText.trim().length > 0;
  const canGenerateSelected =
    imageGenerationReady && !editingLocked && validSelectedIndexes.length > 0;

  useStudioModalSheet({
    activeKey: open ? "studio-ai-comic-director" : null,
    dialogRef,
    rootRef,
    onDismiss: onClose,
    resolveInitialFocus: (dialog) =>
      dialog.querySelector<HTMLElement>("[data-stage-heading='true']"),
  });

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!hasPreview) {
      setStage("brief");
      setSelectedIndexes([]);
      setSelectedPanelIndex(0);
      return;
    }
    setSelectedIndexes((current) => {
      const normalized = normalizeStudioAiComicDirectorSelection(
        current,
        items.length,
      );
      return normalized.length > 0
        ? normalized
        : defaultStudioAiComicDirectorSelection(items);
    });
    setSelectedPanelIndex((current) =>
      Math.min(Math.max(0, current), items.length - 1),
    );
  }, [hasPreview, items]);

  useEffect(() => {
    if (!open || typeof sessionStorage === "undefined") return;
    const next: StudioAiComicDirectorPreferences = {
      stage,
      view,
      profile: profileId,
      selectedIndexes: validSelectedIndexes,
      selectedPanelIndex,
      intents,
    };
    try {
      sessionStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
    } catch {
      // Session persistence is a convenience; the parent remains the authority.
    }
  }, [
    intents,
    open,
    profileId,
    selectedPanelIndex,
    stage,
    validSelectedIndexes,
    view,
  ]);

  if (!open || typeof document === "undefined") return null;

  function selectCandidate(index: number, candidateId: string): void {
    const item = items[index];
    if (!item || editingLocked) return;
    const next = selectScenarioImageCandidate(item, candidateId);
    onChangeScene(index, {
      imageCandidates: next.imageCandidates,
      selectedImageCandidateId: next.selectedImageCandidateId,
      imageDataUrl: next.imageDataUrl,
      imageProvenance: next.imageProvenance,
      imageError: next.imageError,
    });
  }

  function approveCandidate(index: number, candidateId: string): void {
    const item = items[index];
    if (!item || editingLocked) return;
    const next = approveScenarioImageCandidate(item, candidateId);
    onChangeScene(index, {
      imageCandidates: next.imageCandidates,
      selectedImageCandidateId: next.selectedImageCandidateId,
      approvedImageCandidateId: next.approvedImageCandidateId,
      imageDataUrl: next.imageDataUrl,
      imageProvenance: next.imageProvenance,
      imageError: next.imageError,
    });
  }

  function toggleSelectedIndex(index: number): void {
    setSelectedIndexes((current) =>
      current.includes(index)
        ? current.filter((candidate) => candidate !== index)
        : [...current, index].sort((left, right) => left - right),
    );
  }

  function currentIntent(index: number): StudioAiComicDirectorIntentId {
    const explicit = intents[String(index)];
    const promptIntent = studioAiComicDirectorPromptIntent(
      items[index]?.imagePrompt ?? "",
    );
    return explicit ?? promptIntent ?? "faithful";
  }

  function chooseIntent(
    index: number,
    intentId: StudioAiComicDirectorIntentId,
  ): void {
    const item = items[index];
    if (!item || editingLocked) return;
    setIntents((current) => ({ ...current, [String(index)]: intentId }));
    onChangeScene(index, {
      imagePrompt: applyStudioAiComicDirectorPromptIntent(
        item.imagePrompt,
        intentId,
      ),
    });
  }

  function generateSelected(): void {
    if (!canGenerateSelected) return;
    onGenerateImages({
      indexes: validSelectedIndexes,
      variants: profile.variants,
    });
    setStage("production");
  }

  function selectFinding(finding: StudioAiComicDirectorFinding): void {
    if (finding.panelIndex !== undefined) {
      setSelectedPanelIndex(finding.panelIndex);
      setStage("direction");
      return;
    }
    setReferenceOpen(true);
    setStage("brief");
  }

  function renderReferencePack(): ReactElement {
    return (
      <details
        open={referenceOpen}
        onToggle={(event) => setReferenceOpen(event.currentTarget.open)}
        className="rounded-xl border border-line bg-card/55"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-bold text-fg-2 marker:hidden">
          <BookOpen size={14} className="text-accent" aria-hidden />
          <span className="min-w-0 flex-1">작품 바이블 · AI 이미지 참조 팩</span>
          <StatusPill
            tone={imageReferencesBlocked ? "bad" : hasReferences ? "good" : "neutral"}
          >
            {imageReferenceDocument.references.length}개
          </StatusPill>
        </summary>
        <div className="border-t border-line p-2.5">
          <StudioAiImageReferencePackEditor
            document={imageReferenceDocument}
            assetOptions={imageReferenceAssetOptions}
            loading={imageReferencesLoading}
            disabled={editingLocked}
            onChange={onImageReferenceDocumentChange}
          />
          {imageReferenceMissingCount > 0 ? (
            <p
              role="alert"
              className="mt-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[0.7rem] leading-relaxed text-bad"
            >
              연결된 참조 에셋 {imageReferenceMissingCount}개를 찾을 수 없습니다.
              삭제된 참조를 제거하거나 프로젝트 에셋을 다시 추가하면 이미지 생성을
              계속할 수 있어요.
            </p>
          ) : null}
          {imageReferenceDocument.references.length >
          STUDIO_AI_IMAGE_REFERENCE_PROVIDER_SAFE_MAX ? (
            <p
              role="alert"
              className="mt-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[0.7rem] leading-relaxed text-bad"
            >
              AI 이미지 참조는 최대 {STUDIO_AI_IMAGE_REFERENCE_PROVIDER_SAFE_MAX}개까지
              사용할 수 있습니다. 일부 참조를 제거한 뒤 생성해 주세요.
            </p>
          ) : null}
        </div>
      </details>
    );
  }

  const stageMeta = STAGE_COPY[stage];
  const selectedCandidates = selectedItem
    ? scenarioImageCandidates(selectedItem)
    : [];

  const modal = (
    <div className="fixed inset-0 z-[120] bg-[oklch(0.08_0.01_70/0.82)] p-0 text-fg backdrop-blur-sm sm:p-3">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI 코믹 디렉터"
        tabIndex={-1}
        className="mx-auto flex h-full w-full max-w-[100rem] flex-col overflow-hidden border border-line bg-panel shadow-2xl sm:rounded-2xl"
      >
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
            <Clapperboard size={15} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-black text-fg">AI 코믹 디렉터</h2>
            <p className="truncate text-[0.61rem] text-fg-3">
              이야기 → 컷 연출 → 선택 후보 → 편집 가능한 원고
            </p>
          </div>
          <span className="ml-auto hidden text-[0.63rem] text-fg-3 md:inline">
            {busy
              ? `${stageLabel ?? "AI 작업 진행 중"}${progress ? ` (${progress.done}/${progress.total})` : ""}`
              : "부모 제작 세션에 자동 유지"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="AI 코믹 디렉터 닫기"
            className={cn(QUIET_BUTTON, "size-11 px-0")}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)] lg:grid-rows-1">
          <nav
            aria-label="AI 코믹 디렉터 제작 단계"
            className="overflow-x-auto border-b border-line bg-panel px-2 py-1.5 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-3"
          >
            <ol className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
              {STUDIO_AI_COMIC_DIRECTOR_STAGE_IDS.map((stageId) => {
                const copy = STAGE_COPY[stageId];
                const active = stage === stageId;
                const disabled = stageId !== "brief" && !hasPreview;
                return (
                  <li key={stageId} className="min-w-32 lg:min-w-0">
                    <button
                      type="button"
                      aria-current={active ? "step" : undefined}
                      disabled={disabled}
                      onClick={() => setStage(stageId)}
                      className={cn(
                        "flex min-h-12 w-full items-center gap-2 rounded-lg border px-2.5 text-left",
                        STUDIO_EASE,
                        STUDIO_FOCUS_RING,
                        active
                          ? "border-accent/45 bg-accent-soft text-fg"
                          : "border-transparent text-fg-3 hover:bg-raised hover:text-fg",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                    >
                      <span className="font-mono text-sm font-black text-accent">
                        {copy.number}
                      </span>
                      <span className="text-[0.67rem] font-bold">{copy.shortLabel}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="flex min-h-0 min-w-0 flex-col">
            <header className="flex min-h-[4.75rem] shrink-0 items-center gap-3 border-b border-line px-3 py-2 sm:px-4">
              <div className="min-w-0">
                <p className="font-mono text-[0.55rem] font-black tracking-[0.12em] text-accent">
                  STEP {stageMeta.number}
                </p>
                <h3
                  data-stage-heading="true"
                  tabIndex={-1}
                  className="truncate text-sm font-black text-fg"
                >
                  {stageMeta.title}
                </h3>
                <p className="truncate text-[0.62rem] text-fg-3">
                  {stageMeta.description}
                </p>
              </div>
              {qualityFindings.length > 0 ? (
                <button
                  type="button"
                  onClick={() => selectFinding(qualityFindings[0])}
                  className={cn(SECONDARY_BUTTON, "ml-auto")}
                >
                  <AlertTriangle size={13} className="text-warn" aria-hidden />
                  확인 {qualityFindings.length}
                </button>
              ) : null}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scroll-padding-block:5rem] sm:px-4">
              {stage === "brief" ? (
                <section className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1.2fr)_20rem]">
                  <div className="space-y-4">
                    {!textConfigured ? (
                      <p className="rounded-xl border border-warn/35 bg-warn/10 px-3 py-2 text-xs text-fg-2">
                        텍스트 AI를 연결하면 이야기에서 컷 구성을 만들 수 있습니다.
                      </p>
                    ) : null}
                    <section className="rounded-xl border border-line bg-card/45 p-3">
                      <label
                        htmlFor="scenario-story-text"
                        className="mb-1 block text-xs font-bold text-fg-2"
                      >
                        스토리 아이디어
                      </label>
                      <textarea
                        id="scenario-story-text"
                        value={storyText}
                        onChange={(event) =>
                          onStoryTextChange(event.target.value.slice(0, STORY_TEXT_MAX))
                        }
                        placeholder="예: 비 오는 밤, 주인공이 폐역에서 오래전 사라진 친구를 발견한다."
                        rows={8}
                        disabled={editingLocked}
                        className={cn(FIELD_CLASS, "resize-y text-sm")}
                      />
                      <p className="mt-1 text-[0.62rem] text-fg-3">
                        {storyText.length} / {STORY_TEXT_MAX}자 · 원문은 보존됩니다.
                      </p>
                    </section>
                    {renderReferencePack()}
                  </div>
                  <aside className="space-y-3">
                    <section className="rounded-xl border border-line bg-card/55 p-3">
                      <h4 className="text-xs font-black text-fg">생성 품질</h4>
                      <fieldset className="mt-2 grid gap-2">
                        <legend className="sr-only">생성 품질 프로필</legend>
                        {STUDIO_AI_COMIC_DIRECTOR_PROFILES.map((candidate) => (
                          <label
                            key={candidate.id}
                            className={cn(
                              "grid cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2.5",
                              profileId === candidate.id
                                ? "border-accent/45 bg-accent-soft"
                                : "border-line bg-panel",
                            )}
                          >
                            <input
                              type="radio"
                              name="comic-director-profile"
                              checked={profileId === candidate.id}
                              onChange={() => setProfileId(candidate.id)}
                              disabled={editingLocked}
                              className="size-4 accent-accent"
                            />
                            <span>
                              <strong className="block text-xs text-fg">{candidate.label}</strong>
                              <span className="block text-[0.6rem] text-fg-3">
                                {candidate.description}
                              </span>
                            </span>
                            <StatusPill tone={profileId === candidate.id ? "accent" : "neutral"}>
                              후보 {candidate.variants}
                            </StatusPill>
                          </label>
                        ))}
                      </fieldset>
                    </section>
                    <section className="rounded-xl border border-line bg-card/55 p-3">
                      <label className="flex items-center justify-between gap-3 text-xs text-fg-2">
                        장면 수
                        <select
                          value={sceneCountHint ?? ""}
                          onChange={(event) =>
                            onSceneCountHintChange(
                              event.target.value === ""
                                ? undefined
                                : Number(event.target.value),
                            )
                          }
                          disabled={editingLocked}
                          className={cn(FIELD_CLASS, "w-auto min-w-32")}
                        >
                          <option value="">자동(3~8개)</option>
                          {SCENE_COUNT_OPTIONS.map((count) => (
                            <option key={count} value={count}>
                              {count}개
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="mt-2 text-[0.62rem] text-fg-3">
                        아직 이미지는 생성하지 않습니다.
                      </p>
                    </section>
                    <button
                      type="button"
                      onClick={onGenerate}
                      disabled={!canPlan}
                      className={cn(PRIMARY_BUTTON, "w-full")}
                    >
                      <Sparkles size={14} aria-hidden />
                      컷 구성 만들기
                    </button>
                  </aside>
                </section>
              ) : null}

              {stage === "direction" ? (
                <section className="mx-auto max-w-[90rem]">
                  <FindingSummary findings={qualityFindings} onSelect={selectFinding} />
                  <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div
                          className="inline-flex rounded-lg border border-line bg-card p-0.5"
                          role="group"
                          aria-label="컷 보기"
                        >
                          <button
                            type="button"
                            aria-pressed={view === "board"}
                            onClick={() => setView("board")}
                            className={cn(
                              QUIET_BUTTON,
                              "min-h-9 px-2.5",
                              view === "board" && "bg-raised text-fg",
                            )}
                          >
                            <LayoutGrid size={13} aria-hidden /> 보드
                          </button>
                          <button
                            type="button"
                            aria-pressed={view === "list"}
                            onClick={() => setView("list")}
                            className={cn(
                              QUIET_BUTTON,
                              "min-h-9 px-2.5",
                              view === "list" && "bg-raised text-fg",
                            )}
                          >
                            <List size={13} aria-hidden /> 목록
                          </button>
                        </div>
                        <StatusPill tone="accent">
                          {validSelectedIndexes.length}컷 선택
                        </StatusPill>
                        <div className="ml-auto flex gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedIndexes(
                                defaultStudioAiComicDirectorSelection(items),
                              )
                            }
                            disabled={editingLocked || items.length === 0}
                            className={SECONDARY_BUTTON}
                          >
                            제작할 컷 선택
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedIndexes([])}
                            disabled={editingLocked || validSelectedIndexes.length === 0}
                            className={SECONDARY_BUTTON}
                          >
                            선택 해제
                          </button>
                        </div>
                      </div>
                      <ul
                        aria-label="컷 구성"
                        className={cn(
                          "grid gap-2",
                          view === "board"
                            ? "sm:grid-cols-2 2xl:grid-cols-3"
                            : "grid-cols-1",
                        )}
                      >
                        {items.map((item, index) => {
                          const status = stageStatus(item);
                          const checked = validSelectedIndexes.includes(index);
                          const active = selectedPanelIndex === index;
                          return (
                            <li
                              key={index}
                              className={cn(
                                "min-w-0 overflow-hidden rounded-xl border bg-card",
                                active ? "border-accent/55" : "border-line",
                                checked && "bg-accent/5",
                                view === "list" &&
                                  "grid grid-cols-[6rem_minmax(0,1fr)]",
                              )}
                            >
                              <div
                                className={cn(
                                  "relative overflow-hidden bg-raised",
                                  view === "board" ? "aspect-[4/3]" : "min-h-28",
                                )}
                              >
                                <StageThumbnail
                                  item={item}
                                  generating={
                                    index === regeneratingIndex ||
                                    (busy && progress?.done === index)
                                  }
                                />
                                <span className="absolute left-2 top-2 rounded-full border border-line bg-[oklch(0.16_0.01_70/0.86)] px-2 py-1 font-mono text-[0.58rem] font-black text-fg">
                                  CUT {String(index + 1).padStart(2, "0")}
                                </span>
                                <label className="absolute right-2 top-2 grid size-11 cursor-pointer place-items-center rounded-lg border border-line bg-[oklch(0.16_0.01_70/0.86)]">
                                  <span className="sr-only">컷 {index + 1} 제작 선택</span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleSelectedIndex(index)}
                                    disabled={editingLocked}
                                    className="size-4 accent-accent"
                                  />
                                </label>
                              </div>
                              <div className="min-w-0 p-3">
                                <button
                                  type="button"
                                  onClick={() => setSelectedPanelIndex(index)}
                                  className={cn(
                                    "w-full rounded-md text-left",
                                    STUDIO_FOCUS_RING,
                                  )}
                                >
                                  <strong className="block truncate text-xs text-fg">
                                    {item.summary || `컷 ${index + 1}`}
                                  </strong>
                                  <span className="mt-1 block truncate text-[0.62rem] text-fg-3">
                                    {SCENARIO_BEAT_LABELS[item.beatType]} · 후보 {scenarioImageCandidates(item).length}
                                  </span>
                                </button>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <aside className="min-w-0 rounded-xl border border-line bg-panel xl:sticky xl:top-0">
                      {selectedItem ? (
                        <>
                          <header className="border-b border-line px-3 py-3">
                            <p className="font-mono text-[0.57rem] font-black tracking-[0.12em] text-accent">
                              CUT {String(selectedPanelIndex + 1).padStart(2, "0")}
                            </p>
                            <h4 className="mt-1 truncate text-sm font-black text-fg">
                              {selectedItem.summary || "선택한 컷"}
                            </h4>
                          </header>
                          <div className="max-h-[calc(100dvh-16rem)] space-y-4 overflow-y-auto p-3">
                            <details open className="rounded-lg border border-line bg-card/55 px-2.5 py-2">
                              <summary className="text-[0.68rem] font-semibold text-fg-2">
                                이야기와 작품 기준
                              </summary>
                              <label
                                htmlFor="scenario-story-text-direction"
                                className="mt-2 block text-[0.65rem] font-semibold text-fg-3"
                              >
                                스토리 아이디어
                              </label>
                              <textarea
                                id="scenario-story-text-direction"
                                value={storyText}
                                onChange={(event) =>
                                  onStoryTextChange(
                                    event.target.value.slice(0, STORY_TEXT_MAX),
                                  )
                                }
                                disabled={editingLocked}
                                rows={3}
                                className={cn(FIELD_CLASS, "mt-1 resize-y")}
                              />
                            </details>
                            <label className="block text-[0.65rem] font-semibold text-fg-3">
                              비트 역할
                              <select
                                value={selectedItem.beatType}
                                onChange={(event) =>
                                  onChangeScene(selectedPanelIndex, {
                                    beatType: event.target.value as ScenarioBeatType,
                                  })
                                }
                                disabled={editingLocked}
                                aria-label={`${selectedPanelIndex + 1}번 장면 비트 역할`}
                                className={cn(FIELD_CLASS, "mt-1")}
                              >
                                {SCENARIO_BEAT_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {SCENARIO_BEAT_LABELS[type]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block text-[0.65rem] font-semibold text-fg-3">
                              장면 변화 요약
                              <textarea
                                value={selectedItem.summary}
                                onChange={(event) =>
                                  onChangeScene(selectedPanelIndex, {
                                    summary: event.target.value.slice(0, 240),
                                  })
                                }
                                disabled={editingLocked}
                                rows={2}
                                aria-label={`${selectedPanelIndex + 1}번 장면 변화 요약`}
                                className={cn(FIELD_CLASS, "mt-1 resize-y")}
                              />
                            </label>
                            <label className="block text-[0.65rem] font-semibold text-fg-3">
                              제작 방향
                              <select
                                value={currentIntent(selectedPanelIndex)}
                                onChange={(event) =>
                                  chooseIntent(
                                    selectedPanelIndex,
                                    event.target.value as StudioAiComicDirectorIntentId,
                                  )
                                }
                                disabled={editingLocked}
                                aria-label={`${selectedPanelIndex + 1}번 장면 제작 방향`}
                                className={cn(FIELD_CLASS, "mt-1")}
                              >
                                {STUDIO_AI_COMIC_DIRECTOR_INTENTS.map((intent) => (
                                  <option key={intent.id} value={intent.id}>
                                    {intent.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <p className="text-[0.61rem] text-fg-3">
                              {studioAiComicDirectorIntent(
                                currentIntent(selectedPanelIndex),
                              ).description}
                            </p>
                            <label className="block text-[0.65rem] font-semibold text-fg-3">
                              그림 프롬프트
                              <textarea
                                value={selectedItem.imagePrompt}
                                onChange={(event) =>
                                  onChangeScene(selectedPanelIndex, {
                                    imagePrompt: event.target.value.slice(0, 1_200),
                                  })
                                }
                                disabled={editingLocked}
                                rows={5}
                                aria-label={`${selectedPanelIndex + 1}번 장면 그림 프롬프트`}
                                className={cn(FIELD_CLASS, "mt-1 resize-y")}
                              />
                            </label>
                            <label className="block text-[0.65rem] font-semibold text-fg-3">
                              대사·지문
                              <textarea
                                value={selectedItem.dialogue}
                                onChange={(event) =>
                                  onChangeScene(selectedPanelIndex, {
                                    dialogue: event.target.value.slice(0, 2_000),
                                  })
                                }
                                disabled={editingLocked}
                                rows={4}
                                aria-label={`${selectedPanelIndex + 1}번 장면 대사와 지문`}
                                className={cn(FIELD_CLASS, "mt-1 resize-y")}
                              />
                            </label>
                            <details open className="border-t border-line pt-3">
                              <summary className="text-[0.68rem] font-semibold text-fg-2">
                                연속성 메타 — 인물·장소·시간·의상·소품
                              </summary>
                              <div className="mt-2">
                                <StudioContinuityMetadataEditor
                                  value={selectedItem.continuity ?? {}}
                                  onChange={(continuity) =>
                                    onChangeScene(selectedPanelIndex, { continuity })
                                  }
                                  disabled={editingLocked}
                                  compact
                                />
                              </div>
                            </details>
                            <button
                              type="button"
                              onClick={() => onRegenerateScene(selectedPanelIndex)}
                              disabled={
                                !imageGenerationReady ||
                                editingLocked ||
                                selectedItem.imagePrompt.trim().length === 0
                              }
                              title={imageGenerationDisabledReason}
                              className={cn(SECONDARY_BUTTON, "w-full")}
                            >
                              <RefreshCw size={13} aria-hidden />
                              {selectedItem.imageDataUrl
                                ? "이 장면 다시 생성"
                                : "이 장면 이미지 생성"}
                            </button>
                            {renderReferencePack()}
                            <button
                              type="button"
                              onClick={() => onRemoveScene(selectedPanelIndex)}
                              disabled={editingLocked || items.length <= 1}
                              className={cn(
                                SECONDARY_BUTTON,
                                "w-full border-bad/30 text-bad hover:bg-bad/10",
                              )}
                            >
                              <Trash2 size={13} aria-hidden /> 컷 {selectedPanelIndex + 1} 삭제
                            </button>
                          </div>
                        </>
                      ) : null}
                    </aside>
                  </div>
                  <div className="sticky bottom-2 z-10 mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-raised/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                    <strong className="font-mono text-xs text-fg">
                      {validSelectedIndexes.length}컷 선택됨
                    </strong>
                    <span className="text-[0.62rem] text-fg-3">
                      후보 {profile.variants}개씩 · 최대 {validSelectedIndexes.length * profile.variants}결과
                    </span>
                    <button
                      type="button"
                      onClick={generateSelected}
                      disabled={!canGenerateSelected}
                      title={imageGenerationDisabledReason}
                      className={PRIMARY_BUTTON}
                    >
                      <WandSparkles size={13} aria-hidden /> 선택한 {validSelectedIndexes.length}컷 제작하기
                    </button>
                  </div>
                </section>
              ) : null}

              {stage === "production" ? (
                <section className="mx-auto max-w-[90rem]">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
                    <div className="min-w-0">
                      <StudioScenarioCandidateDesk
                        items={items}
                        referenceSignature={referenceSignature}
                        busy={editingLocked}
                        imageGenerationReady={imageGenerationReady}
                        disabledReason={imageGenerationDisabledReason}
                        onGenerate={onGenerateImages}
                        onSelectCandidate={selectCandidate}
                        onApproveCandidate={approveCandidate}
                      />
                    </div>
                    <aside className="space-y-3 rounded-xl border border-line bg-panel p-3 xl:sticky xl:top-0">
                      <div>
                        <p className="font-mono text-[0.57rem] font-black text-accent">
                          CUT {String(selectedPanelIndex + 1).padStart(2, "0")}
                        </p>
                        <h4 className="mt-1 text-sm font-black text-fg">
                          {selectedItem?.summary ?? "컷을 선택하세요"}
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCompareOpen(true)}
                        disabled={selectedCandidates.length < 2}
                        className={cn(SECONDARY_BUTTON, "w-full")}
                      >
                        <Eye size={13} aria-hidden /> 후보 나란히 비교
                      </button>
                      <section className="border-t border-line pt-3">
                        <h5 className="text-xs font-black text-fg">부분 수리</h5>
                        <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
                          현재 시나리오 실행 경로는 마스크 영역 수리를 연결하지 않았습니다.
                          손·얼굴만 고친 것처럼 표시하지 않고 컷 전체 재생성만 제공합니다.
                        </p>
                        <button
                          type="button"
                          onClick={() => onRegenerateScene(selectedPanelIndex)}
                          disabled={!selectedItem || !imageGenerationReady || editingLocked}
                          title={imageGenerationDisabledReason}
                          className={cn(SECONDARY_BUTTON, "mt-2 w-full")}
                        >
                          <RefreshCw size={13} aria-hidden /> 이 컷 전체 다시 제작
                        </button>
                      </section>
                      {selectedItem ? (
                        <section className="border-t border-line pt-3">
                          <h5 className="flex items-center gap-1.5 text-xs font-black text-fg">
                            <MessageSquareText size={13} className="text-accent" aria-hidden />
                            대사·말풍선
                          </h5>
                          <p className="mt-1 text-[0.62rem] text-fg-3">
                            수정해도 선택한 이미지 후보는 다시 만들지 않습니다.
                          </p>
                          <textarea
                            value={selectedItem.dialogue}
                            onChange={(event) =>
                              onChangeScene(selectedPanelIndex, {
                                dialogue: event.target.value.slice(0, 2_000),
                              })
                            }
                            disabled={editingLocked}
                            rows={5}
                            aria-label={`${selectedPanelIndex + 1}번 장면 대사와 지문`}
                            className={cn(FIELD_CLASS, "mt-2 resize-y")}
                          />
                        </section>
                      ) : null}
                    </aside>
                  </div>
                </section>
              ) : null}

              {stage === "finish" ? (
                <section className="mx-auto grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
                  <div className="rounded-xl border border-line bg-card/45 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <Eye size={14} className="text-accent" aria-hidden />
                      <h4 className="text-xs font-black text-fg">세로 독자 미리보기</h4>
                      <StatusPill tone={blockingFindings.length > 0 ? "bad" : "good"}>
                        {blockingFindings.length > 0
                          ? `먼저 수정 ${blockingFindings.length}`
                          : "마감 확인 가능"}
                      </StatusPill>
                    </div>
                    <div className="mx-auto max-h-[64dvh] w-full max-w-[25rem] overflow-y-auto rounded-[1.4rem] border border-line-strong bg-[oklch(0.94_0.012_83)] p-2 shadow-xl">
                      {items.map((item, index) => (
                        <div key={index}>
                          <article className="relative min-h-52 overflow-hidden bg-[oklch(0.22_0.018_68)] text-center text-fg">
                            <StageThumbnail
                              item={item}
                              generating={index === regeneratingIndex}
                            />
                            {item.dialogue.trim() ? (
                              <p className="absolute right-4 top-4 max-w-[70%] rounded-[50%] bg-[oklch(0.96_0.009_85)] px-4 py-3 text-xs font-bold text-[oklch(0.18_0.01_70)] shadow-lg">
                                {item.dialogue
                                  .split("\n")
                                  .find((line) => line.trim())}
                              </p>
                            ) : null}
                          </article>
                          {index < items.length - 1 ? (
                            <div className="h-16 bg-[oklch(0.94_0.012_83)]" aria-hidden />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  <aside className="space-y-3">
                    <section className="rounded-xl border border-line bg-card/55 p-3">
                      <h4 className="text-xs font-black text-fg">추가 위치</h4>
                      <fieldset className="mt-2 grid gap-2">
                        <legend className="sr-only">Studio 적용 위치</legend>
                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-panel p-2.5">
                          <input
                            type="radio"
                            name="comic-director-apply-target-main"
                            checked={applyTarget === "current-page"}
                            onChange={() => onApplyTargetChange("current-page")}
                            disabled={editingLocked}
                            className="mt-0.5 size-4 accent-accent"
                          />
                          <span>
                            <strong className="block text-xs text-fg">현재 페이지 아래</strong>
                            <span className="text-[0.61rem] text-fg-3">기존 컷 다음에 추가</span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-panel p-2.5">
                          <input
                            type="radio"
                            name="comic-director-apply-target-main"
                            checked={applyTarget === "new-page"}
                            onChange={() => onApplyTargetChange("new-page")}
                            disabled={editingLocked}
                            className="mt-0.5 size-4 accent-accent"
                          />
                          <span>
                            <strong className="block text-xs text-fg">다음 새 페이지</strong>
                            <span className="text-[0.61rem] text-fg-3">새 세로 원고 페이지 생성</span>
                          </span>
                        </label>
                      </fieldset>
                    </section>
                    <section className="rounded-xl border border-line bg-card/55 p-3">
                      <h4 className="text-xs font-black text-fg">추가될 객체</h4>
                      <dl className="mt-2 grid gap-2 text-[0.67rem]">
                        <div className="flex justify-between"><dt className="text-fg-3">컷 프레임</dt><dd>{applySummary.frames}</dd></div>
                        <div className="flex justify-between"><dt className="text-fg-3">장면 이미지</dt><dd>{applySummary.images}</dd></div>
                        <div className="flex justify-between"><dt className="text-fg-3">대사 줄</dt><dd>{applySummary.dialogueLines}</dd></div>
                        <div className="flex justify-between"><dt className="text-fg-3">말풍선 시드</dt><dd>{applySummary.bubbles}</dd></div>
                        <div className="flex justify-between"><dt className="text-fg-3">기존 레이어 변경</dt><dd className="text-good">없음</dd></div>
                      </dl>
                    </section>
                    <button
                      type="button"
                      onClick={onApply}
                      disabled={editingLocked}
                      className={cn(PRIMARY_BUTTON, "w-full")}
                    >
                      <CheckCircle2 size={14} aria-hidden />
                      {applyTarget === "new-page"
                        ? `${items.length}컷을 새 페이지에 추가`
                        : `${items.length}컷을 현재 페이지에 추가`}
                    </button>
                  </aside>
                </section>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2 sm:px-4">
          {busy ? (
            <>
              <Loader2
                size={14}
                className="animate-spin text-accent motion-reduce:animate-none"
                aria-hidden
              />
              <span
                className="text-xs font-semibold text-fg-2"
                role="status"
                aria-live="polite"
              >
                {stageLabel ?? "AI 작업 진행 중"}
                {progress ? ` (${progress.done}/${progress.total})` : ""}
              </span>
              <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
                취소
              </button>
            </>
          ) : (
            <>
              <span className="size-2 rounded-full bg-good" aria-hidden />
              <span className="text-[0.68rem] text-fg-3">
                입력·후보·완료 결과는 부모 제작 세션에 유지됩니다.
              </span>
            </>
          )}
          {error ? <span className="text-[0.66rem] text-bad">{error}</span> : null}
          {textProvenance ? (
            <span className="hidden text-[0.6rem] text-fg-3 xl:inline">
              텍스트 생성 · {textProvenance.provider} / {textProvenance.model}
            </span>
          ) : null}
          {hasPreview ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onDiscard}
                disabled={editingLocked}
                className={SECONDARY_BUTTON}
              >
                <RotateCcw size={13} aria-hidden /> 다시 만들기
              </button>
              {missingImageCount > 0 ? (
                <button
                  type="button"
                  onClick={() => onGenerateImages()}
                  disabled={!imageGenerationReady || editingLocked}
                  title={imageGenerationDisabledReason}
                  className={SECONDARY_BUTTON}
                >
                  <ImagePlus size={13} aria-hidden /> 빈 장면 이미지 {missingImageCount}개 생성
                </button>
              ) : null}
              <label className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold text-fg-2">
                적용 위치
                <select
                  value={applyTarget}
                  onChange={(event) =>
                    onApplyTargetChange(
                      event.target.value === "new-page" ? "new-page" : "current-page",
                    )
                  }
                  disabled={editingLocked}
                  className={cn(FIELD_CLASS, "w-auto min-w-32")}
                >
                  <option value="current-page">현재 페이지 아래</option>
                  <option value="new-page">다음 새 페이지</option>
                </select>
              </label>
              <button
                type="button"
                onClick={onApply}
                disabled={editingLocked}
                className={SECONDARY_BUTTON}
              >
                {applyTarget === "new-page" ? "새 페이지로 적용" : "현재 페이지에 적용"}
              </button>
            </div>
          ) : null}
        </footer>
      </section>

      <CandidateCompareDialog
        open={compareOpen}
        item={selectedItem}
        onClose={() => setCompareOpen(false)}
        onSelect={(candidateId) => selectCandidate(selectedPanelIndex, candidateId)}
      />
    </div>
  );

  return createPortal(modal, document.body);
}
