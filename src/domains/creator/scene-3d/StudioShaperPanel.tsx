import {
  Camera,
  Check,
  ChevronRight,
  Download,
  Layers,
  Lock,
  Paintbrush,
  PersonStanding,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StudioMannequinWorkshopPreview } from "./StudioMannequinWorkshopPreview";
import {
  DEFAULT_SHAPER_SELECTION,
  SHAPER_CATEGORIES,
  SHAPER_PRESETS,
  SHAPER_STYLE_RECIPES,
  applyShaperSelectionToBodyParams,
  countShaperLiveCategories,
  getShaperCategory,
  isShaperCategoryInteractive,
  type ShaperPresetCategory,
  type ShaperPresetSelection,
} from "./studio-shaper-model";
import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
  STUDIO_MANNEQUIN_HEAD_PARAM_RANGES,
  STUDIO_MANNEQUIN_PARAM_RANGES,
  clampStudioMannequinBodyParams,
  type StudioMannequinBodyParams,
} from "./studio-mannequin-model";

import { cn } from "@/lib/utils";

export interface StudioShaperPanelProps {
  readonly selection?: Partial<ShaperPresetSelection>;
  readonly bodyParams?: StudioMannequinBodyParams;
  readonly onSelectionChange?: (selection: ShaperPresetSelection) => void;
  readonly onBodyParamsChange?: (params: StudioMannequinBodyParams) => void;
  readonly onExportPsd?: () => void | Promise<void>;
  readonly onInsertCanvas?: () => void;
  readonly onTriggerPoseScanner?: () => void;
  readonly onNavigateToTab?: (tab: "body" | "pose" | "joint" | "camera") => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

type WorkshopTab = "build" | "pose" | "output";
type EditableBuildCategory = "face" | "eye" | "nose" | "body";

const WORKSHOP_TABS: readonly {
  readonly id: WorkshopTab;
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: "build", label: "캐릭터 구성", hint: "체형과 얼굴을 실제 메시로 조절" },
  { id: "pose", label: "포즈", hint: "전신·손 포즈와 사진 인식" },
  { id: "output", label: "출력", hint: "투명 캡처와 의미 레이어 PSD" },
];

const BUILD_CATEGORIES: readonly EditableBuildCategory[] = ["face", "eye", "nose", "body"];

interface PrecisionControl {
  readonly key: keyof StudioMannequinBodyParams;
  readonly label: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly unit: "cm" | "등신" | "%";
}

const PRECISION_CONTROLS: readonly PrecisionControl[] = [
  {
    key: "heightCm",
    label: "신장",
    minimum: STUDIO_MANNEQUIN_PARAM_RANGES.heightCm[0],
    maximum: STUDIO_MANNEQUIN_PARAM_RANGES.heightCm[1],
    step: 1,
    unit: "cm",
  },
  {
    key: "headCount",
    label: "두신 비율",
    minimum: STUDIO_MANNEQUIN_PARAM_RANGES.headCount[0],
    maximum: STUDIO_MANNEQUIN_PARAM_RANGES.headCount[1],
    step: 0.1,
    unit: "등신",
  },
  {
    key: "shoulderWidth",
    label: "어깨 너비",
    minimum: STUDIO_MANNEQUIN_PARAM_RANGES.shoulderWidth[0],
    maximum: STUDIO_MANNEQUIN_PARAM_RANGES.shoulderWidth[1],
    step: 0.02,
    unit: "%",
  },
  {
    key: "pelvisWidth",
    label: "골반 너비",
    minimum: STUDIO_MANNEQUIN_PARAM_RANGES.pelvisWidth[0],
    maximum: STUDIO_MANNEQUIN_PARAM_RANGES.pelvisWidth[1],
    step: 0.02,
    unit: "%",
  },
  {
    key: "armLength",
    label: "팔 길이",
    minimum: STUDIO_MANNEQUIN_PARAM_RANGES.armLength[0],
    maximum: STUDIO_MANNEQUIN_PARAM_RANGES.armLength[1],
    step: 0.02,
    unit: "%",
  },
  {
    key: "legLength",
    label: "다리 비율",
    minimum: STUDIO_MANNEQUIN_PARAM_RANGES.legLength[0],
    maximum: STUDIO_MANNEQUIN_PARAM_RANGES.legLength[1],
    step: 0.02,
    unit: "%",
  },
  {
    key: "faceWidth",
    label: "얼굴 너비",
    minimum: STUDIO_MANNEQUIN_HEAD_PARAM_RANGES.faceWidth[0],
    maximum: STUDIO_MANNEQUIN_HEAD_PARAM_RANGES.faceWidth[1],
    step: 0.02,
    unit: "%",
  },
  {
    key: "chinLength",
    label: "턱 길이",
    minimum: STUDIO_MANNEQUIN_HEAD_PARAM_RANGES.chinLength[0],
    maximum: STUDIO_MANNEQUIN_HEAD_PARAM_RANGES.chinLength[1],
    step: 0.02,
    unit: "%",
  },
  {
    key: "eyeScale",
    label: "눈 크기",
    minimum: STUDIO_MANNEQUIN_HEAD_PARAM_RANGES.eyeScale[0],
    maximum: STUDIO_MANNEQUIN_HEAD_PARAM_RANGES.eyeScale[1],
    step: 0.02,
    unit: "%",
  },
  {
    key: "noseHeight",
    label: "코 높이",
    minimum: STUDIO_MANNEQUIN_HEAD_PARAM_RANGES.noseHeight[0],
    maximum: STUDIO_MANNEQUIN_HEAD_PARAM_RANGES.noseHeight[1],
    step: 0.02,
    unit: "%",
  },
];

const DEFAULT_COMPLETE_PARAMS: StudioMannequinBodyParams = Object.freeze({
  ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  ...STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
});

function completeSelection(selection: Partial<ShaperPresetSelection>): ShaperPresetSelection {
  return { ...DEFAULT_SHAPER_SELECTION, ...selection };
}

function formatPrecisionValue(value: number, control: PrecisionControl): string {
  if (control.unit === "cm") return `${Math.round(value)}cm`;
  if (control.unit === "등신") return `${value.toFixed(1)}등신`;
  return `${Math.round(value * 100)}%`;
}

function presetSelection(
  current: ShaperPresetSelection,
  category: ShaperPresetCategory,
  presetId: string,
): ShaperPresetSelection {
  return { ...current, [category]: presetId };
}

function WorkshopRange({
  control,
  params,
  disabled,
  onChange,
}: {
  readonly control: PrecisionControl;
  readonly params: StudioMannequinBodyParams;
  readonly disabled: boolean;
  readonly onChange: (params: StudioMannequinBodyParams) => void;
}) {
  const fallback = DEFAULT_COMPLETE_PARAMS[control.key];
  const value = typeof params[control.key] === "number" ? params[control.key] : fallback;
  const commit = (next: number) => {
    if (!Number.isFinite(next)) return;
    const bounded = Math.min(control.maximum, Math.max(control.minimum, next));
    onChange(clampStudioMannequinBodyParams({ ...params, [control.key]: bounded }));
  };
  return (
    <label className="rounded-xl border border-line/80 bg-card/70 p-2.5">
      <span className="flex items-center justify-between gap-2 text-[0.64rem] font-bold text-fg-2">
        {control.label}
        <output className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[0.6rem] tabular-nums text-fg-3">
          {formatPrecisionValue(value, control)}
        </output>
      </span>
      <span className="mt-2 grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-2">
        <input
          type="range"
          aria-label={control.label}
          min={control.minimum}
          max={control.maximum}
          step={control.step}
          value={value}
          disabled={disabled}
          className="h-10 min-w-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
          onChange={(event) => commit(event.currentTarget.valueAsNumber)}
        />
        <input
          type="number"
          aria-label={`${control.label} 정확한 값`}
          min={control.minimum}
          max={control.maximum}
          step={control.step}
          value={value}
          disabled={disabled}
          className="min-h-10 rounded-lg border border-line bg-panel px-2 text-right text-[0.64rem] font-semibold tabular-nums text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
          onChange={(event) => {
            if (event.currentTarget.value !== "") commit(event.currentTarget.valueAsNumber);
          }}
        />
      </span>
    </label>
  );
}

export function StudioShaperPanel({
  selection = DEFAULT_SHAPER_SELECTION,
  bodyParams = DEFAULT_COMPLETE_PARAMS,
  onSelectionChange,
  onBodyParamsChange,
  onExportPsd,
  onInsertCanvas,
  onTriggerPoseScanner,
  onNavigateToTab,
  disabled = false,
  className,
}: StudioShaperPanelProps) {
  const incomingSelection = useMemo(() => completeSelection(selection), [selection]);
  const [activeTab, setActiveTab] = useState<WorkshopTab>("build");
  const [activeCategory, setActiveCategory] = useState<EditableBuildCategory>("face");
  const [currentSelection, setCurrentSelection] = useState(incomingSelection);
  const [showPrecision, setShowPrecision] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState("실제 적용 가능한 슬롯만 선택할 수 있습니다.");

  useEffect(() => setCurrentSelection(incomingSelection), [incomingSelection]);

  const safeParams = clampStudioMannequinBodyParams(bodyParams);
  const previewParams = applyShaperSelectionToBodyParams(safeParams, currentSelection);
  const liveCount = countShaperLiveCategories();
  const activeMeta = getShaperCategory(activeCategory);
  const activePresets = SHAPER_PRESETS.filter((preset) => preset.category === activeCategory);

  const commitSelection = (next: ShaperPresetSelection, message: string) => {
    setCurrentSelection(next);
    setStatus(message);
    onSelectionChange?.(next);
  };

  const selectPreset = (category: ShaperPresetCategory, presetId: string, label: string) => {
    if (!isShaperCategoryInteractive(category)) return;
    commitSelection(
      presetSelection(currentSelection, category, presetId),
      `${label}을 실제 장면에 적용했습니다.`,
    );
  };

  const navigateCategory = (category: ShaperPresetCategory) => {
    const meta = getShaperCategory(category);
    if (meta.capability !== "live") {
      setStatus(meta.unavailableReason ?? `${meta.label} 슬롯은 아직 사용할 수 없습니다.`);
      return;
    }
    if (category === "bodypose" || category === "handpose") {
      setActiveTab("pose");
      return;
    }
    if (BUILD_CATEGORIES.includes(category as EditableBuildCategory)) {
      setActiveCategory(category as EditableBuildCategory);
      setActiveTab("build");
    }
  };

  const handleExport = async () => {
    if (!onExportPsd || isExporting) return;
    setIsExporting(true);
    setStatus("보이는 몸 파트를 분리해 PSD를 생성하고 있습니다.");
    try {
      await onExportPsd();
      setStatus("부위 의미 레이어 PSD를 만들었습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PSD를 생성하지 못했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section
      aria-label="ToonStudio 캐릭터 워크숍"
      className={cn("space-y-4 text-fg", className)}
      data-studio-character-workshop="true"
    >
      <div className="overflow-hidden rounded-2xl border border-line bg-card/75 shadow-sm">
        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-stretch gap-0">
          <div className="border-r border-line/70 bg-panel/65 px-1.5 pt-2">
            <StudioMannequinWorkshopPreview
              params={safeParams}
              selection={currentSelection}
              variant="hero"
              label="현재 데생 인형 결과 미리보기"
            />
          </div>
          <div className="min-w-0 p-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-accent/35 bg-accent-soft px-2 py-0.5 text-[0.58rem] font-extrabold text-accent">
                실제 장면 연동
              </span>
              <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.58rem] font-bold text-fg-3">
                {liveCount}/14 슬롯 적용
              </span>
            </div>
            <h3 className="mt-2 text-sm font-extrabold text-fg">캐릭터 워크숍</h3>
            <p className="mt-1 text-[0.64rem] leading-relaxed text-fg-3">
              카드가 예측한 체형·얼굴·포즈와 실제 3D 장면이 같은 플래너를 사용합니다. 아직 에셋이 없는 슬롯은 선택되지 않습니다.
            </p>
            <button
              type="button"
              disabled={disabled}
              className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[0.61rem] font-bold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
              onClick={() => {
                const reset = { ...DEFAULT_SHAPER_SELECTION };
                commitSelection(reset, "워크숍 프리셋을 기본 상태로 되돌렸습니다.");
                onBodyParamsChange?.(DEFAULT_COMPLETE_PARAMS);
              }}
            >
              <RotateCcw size={12} aria-hidden />
              워크숍 초기화
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel/65 p-1" role="tablist" aria-label="캐릭터 워크숍 단계">
        {WORKSHOP_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            title={tab.hint}
            disabled={disabled}
            className={cn(
              "min-h-11 rounded-lg px-2 text-[0.64rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
              activeTab === tab.id
                ? "border border-accent/45 bg-card text-accent shadow-sm"
                : "border border-transparent text-fg-3 hover:bg-card/70 hover:text-fg",
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-line/80 bg-panel/45 px-3 py-2" role="status" aria-live="polite">
        <p className="text-[0.62rem] leading-relaxed text-fg-2">{status}</p>
      </div>

      {activeTab === "build" ? (
        <div role="tabpanel" className="space-y-4">
          <div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[0.7rem] font-extrabold text-fg">빠른 스타일 레시피</p>
                <p className="mt-0.5 text-[0.59rem] text-fg-3">AI로 오해할 고정 추천이 아니라, 실제 지원 파라미터만 묶은 결정적 레시피입니다.</p>
              </div>
              <Sparkles size={15} className="text-accent" aria-hidden />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SHAPER_STYLE_RECIPES.map((recipe) => {
                const recipeParams = applyShaperSelectionToBodyParams(safeParams, recipe.selection);
                const selected = BUILD_CATEGORIES.every(
                  (category) => currentSelection[category] === recipe.selection[category],
                );
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    className={cn(
                      "min-h-[10rem] overflow-hidden rounded-2xl border text-left transition-[border-color,background-color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
                      selected
                        ? "border-accent/60 bg-accent-soft text-accent"
                        : "border-line bg-card text-fg hover:-translate-y-0.5 hover:bg-raised",
                    )}
                    onClick={() => commitSelection({ ...recipe.selection }, `${recipe.label} 레시피를 적용했습니다.`)}
                  >
                    <span className="block h-24 overflow-hidden border-b border-line/60 bg-panel/55 px-1">
                      <StudioMannequinWorkshopPreview
                        params={recipeParams}
                        selection={recipe.selection}
                        variant="card"
                        label={`${recipe.label} 실제 결과 미리보기`}
                      />
                    </span>
                    <span className="block p-2.5">
                      <span className="block text-[0.68rem] font-extrabold">{recipe.label}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[0.58rem] leading-relaxed text-fg-3">{recipe.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[0.7rem] font-extrabold text-fg">14개 제작 슬롯</p>
                <p className="mt-0.5 text-[0.59rem] text-fg-3">실제 적용·VRM 경로·에셋 준비 상태를 구분합니다.</p>
              </div>
              <span className="text-[0.58rem] tabular-nums text-fg-3">{liveCount} live</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {SHAPER_CATEGORIES.map((category) => {
                const interactive = category.capability === "live";
                const active = activeCategory === category.id && activeTab === "build";
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={active}
                    aria-disabled={!interactive}
                    title={category.unavailableReason ?? category.description}
                    className={cn(
                      "min-h-14 rounded-xl border p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      active
                        ? "border-accent/60 bg-accent-soft text-accent"
                        : interactive
                          ? "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                          : "cursor-not-allowed border-line/70 bg-panel/45 text-fg-3",
                    )}
                    onClick={() => navigateCategory(category.id)}
                  >
                    <span className="flex items-center gap-1.5 text-[0.64rem] font-extrabold">
                      {!interactive ? <Lock size={11} aria-hidden /> : <Check size={11} aria-hidden />}
                      {category.label}
                    </span>
                    <span className="mt-1 block text-[0.55rem] font-semibold opacity-80">{category.capabilityLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-card/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.7rem] font-extrabold text-fg">{activeMeta.label}</p>
                <p className="mt-0.5 text-[0.59rem] leading-relaxed text-fg-3">{activeMeta.description}</p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-line bg-panel px-2 text-[0.58rem] font-bold text-fg-3 hover:bg-raised hover:text-fg"
                onClick={() => onNavigateToTab?.(activeCategory === "body" ? "body" : "body")}
              >
                세부 탭
                <ChevronRight size={11} aria-hidden />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {activePresets.map((preset) => {
                const candidate = presetSelection(currentSelection, activeCategory, preset.id);
                const candidateParams = applyShaperSelectionToBodyParams(safeParams, candidate);
                const selected = currentSelection[activeCategory] === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    className={cn(
                      "min-h-[9.5rem] overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
                      selected
                        ? "border-accent/60 bg-accent-soft text-accent"
                        : "border-line bg-card text-fg hover:bg-raised",
                    )}
                    onClick={() => selectPreset(activeCategory, preset.id, preset.label)}
                  >
                    <span className="block h-24 overflow-hidden border-b border-line/60 bg-panel/55 px-1">
                      <StudioMannequinWorkshopPreview
                        params={candidateParams}
                        selection={candidate}
                        variant="card"
                        focus={activeCategory}
                        label={`${preset.label} 실제 결과 미리보기`}
                      />
                    </span>
                    <span className="block p-2">
                      <span className="block truncate text-[0.65rem] font-extrabold">{preset.label}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[0.56rem] leading-relaxed text-fg-3">{preset.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-card/60 p-3">
            <button
              type="button"
              aria-expanded={showPrecision}
              className="flex min-h-11 w-full items-center gap-2 text-left text-[0.68rem] font-extrabold text-fg"
              onClick={() => setShowPrecision((visible) => !visible)}
            >
              <SlidersHorizontal size={14} className="text-accent" aria-hidden />
              정밀 수치 조절
              <span className="ml-auto text-[0.58rem] font-semibold text-fg-3">{showPrecision ? "접기" : "10개 파라미터"}</span>
            </button>
            {showPrecision ? (
              <div className="mt-2 grid grid-cols-1 gap-2 border-t border-line/60 pt-3 sm:grid-cols-2">
                {PRECISION_CONTROLS.map((control) => (
                  <WorkshopRange
                    key={control.key}
                    control={control}
                    params={safeParams}
                    disabled={disabled || !onBodyParamsChange}
                    onChange={(next) => {
                      setStatus(`${control.label} 값을 실제 메시 재생성에 반영했습니다.`);
                      onBodyParamsChange?.(next);
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "pose" ? (
        <div role="tabpanel" className="space-y-4">
          {(["bodypose", "handpose"] as const).map((category) => {
            const meta = getShaperCategory(category);
            const presets = SHAPER_PRESETS.filter((preset) => preset.category === category);
            return (
              <div key={category}>
                <div className="flex items-center gap-2">
                  {category === "bodypose" ? <PersonStanding size={15} className="text-accent" aria-hidden /> : <UserRound size={15} className="text-accent" aria-hidden />}
                  <div>
                    <p className="text-[0.7rem] font-extrabold text-fg">{meta.label}</p>
                    <p className="mt-0.5 text-[0.58rem] text-fg-3">{meta.description}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {presets.map((preset) => {
                    const candidate = presetSelection(currentSelection, category, preset.id);
                    const selected = currentSelection[category] === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        className={cn(
                          "min-h-[9.5rem] overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
                          selected ? "border-accent/60 bg-accent-soft text-accent" : "border-line bg-card text-fg hover:bg-raised",
                        )}
                        onClick={() => selectPreset(category, preset.id, preset.label)}
                      >
                        <span className="block h-24 overflow-hidden border-b border-line/60 bg-panel/55 px-1">
                          <StudioMannequinWorkshopPreview
                            params={previewParams}
                            selection={candidate}
                            variant="card"
                            label={`${preset.label} 실제 포즈 미리보기`}
                          />
                        </span>
                        <span className="block p-2">
                          <span className="block text-[0.65rem] font-extrabold">{preset.label}</span>
                          <span className="mt-0.5 line-clamp-2 block text-[0.56rem] leading-relaxed text-fg-3">{preset.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="rounded-2xl border border-accent/25 bg-accent-soft/25 p-3">
            <div className="flex items-start gap-2.5">
              <Camera size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.68rem] font-extrabold text-fg">사진·카메라 포즈 인식</p>
                <p className="mt-0.5 text-[0.59rem] leading-relaxed text-fg-3">
                  원본 이미지 위의 관절을 검수하고 전신·상체·팔·손 범위를 선택해 적용합니다.
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={disabled || !onTriggerPoseScanner}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-card px-3 text-[0.63rem] font-extrabold text-accent hover:bg-raised disabled:opacity-35"
                onClick={onTriggerPoseScanner}
              >
                <Camera size={13} aria-hidden />
                사진 포즈 열기
              </button>
              <button
                type="button"
                disabled={disabled || !onNavigateToTab}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.63rem] font-extrabold text-fg-2 hover:bg-raised disabled:opacity-35"
                onClick={() => onNavigateToTab?.("joint")}
              >
                <SlidersHorizontal size={13} aria-hidden />
                관절 정밀 편집
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "output" ? (
        <div role="tabpanel" className="space-y-3">
          <div className="rounded-2xl border border-line bg-card/65 p-3">
            <div className="flex items-start gap-2.5">
              <Layers size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0">
                <p className="text-[0.7rem] font-extrabold text-fg">보이는 부위 의미 레이어 PSD</p>
                <p className="mt-0.5 text-[0.59rem] leading-relaxed text-fg-3">
                  같은 카메라의 ID 패스로 가려진 면을 보존하며 머리·몸통·좌우 팔·좌우 다리·선화를 분리합니다.
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {["머리·목", "몸통", "왼팔", "오른팔", "왼다리", "오른다리", "선화"].map((layer) => (
                <span key={layer} className="rounded-lg border border-line bg-panel px-2 py-1.5 text-[0.58rem] font-bold text-fg-3">
                  {layer}
                </span>
              ))}
            </div>
            <button
              type="button"
              disabled={disabled || isExporting || !onExportPsd}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-accent/45 bg-accent px-3 text-[0.68rem] font-extrabold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
              onClick={() => void handleExport()}
            >
              <Download size={15} aria-hidden />
              {isExporting ? "의미 레이어 생성 중…" : "부위 레이어 PSD 내려받기"}
            </button>
          </div>

          <div className="rounded-2xl border border-line bg-card/65 p-3">
            <div className="flex items-start gap-2.5">
              <Paintbrush size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <div>
                <p className="text-[0.68rem] font-extrabold text-fg">모델 표면에 직접 그리기</p>
                <p className="mt-0.5 text-[0.59rem] leading-relaxed text-fg-3">
                  데생 인형에는 UV 재질 슬롯이 없어 가짜 토글을 제공하지 않습니다. 실제 seam-safe 브러시는 3D 캐릭터(VRM) 편집기의 ‘표면’에서 사용합니다.
                </p>
              </div>
            </div>
            <span className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-line bg-panel px-2 text-[0.58rem] font-bold text-fg-3">
              VRM 전용 · round 촉 · 필압 · Undo 지원
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled || !onInsertCanvas}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.63rem] font-extrabold text-fg-2 hover:bg-raised disabled:opacity-35"
              onClick={onInsertCanvas}
            >
              <Check size={13} aria-hidden />
              캔버스에 삽입
            </button>
            <button
              type="button"
              disabled={disabled || !onNavigateToTab}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.63rem] font-extrabold text-fg-2 hover:bg-raised disabled:opacity-35"
              onClick={() => onNavigateToTab?.("camera")}
            >
              <Camera size={13} aria-hidden />
              카메라·배율
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
