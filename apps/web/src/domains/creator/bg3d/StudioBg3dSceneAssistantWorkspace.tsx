"use no memo";
// The editor exposes one mutable host bag. The assistant polls that bag and must re-render the
// shared viewport even when the bag identity itself stays stable.

import {
  ArrowLeft,
  ArrowRight,
  Box,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Copy,
  Cuboid,
  Focus,
  ImagePlus,
  Layers3,
  Loader2,
  Maximize2,
  Move3d,
  Rotate3d,
  Save,
  Scaling,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";

import type { ReactNode } from "react";

import { StudioBg3dEditorViewport } from "./StudioBg3dEditorViewport";
import {
  STUDIO_BG3D_ASSISTANT_CAMERA_PRESETS,
  STUDIO_BG3D_ASSISTANT_HERO,
  STUDIO_BG3D_ASSISTANT_OUTPUT_STYLES,
  STUDIO_BG3D_ASSISTANT_SCENES,
  STUDIO_BG3D_ASSISTANT_STEPS,
  nextStudioBg3dAssistantStep,
  previousStudioBg3dAssistantStep,
  studioBg3dAssistantOutputSettings,
  studioBg3dAssistantStepIndex,
} from "./studio-bg3d-scene-assistant";

import type {
  StudioBg3dAssistantGoal,
  StudioBg3dAssistantOutputStyle,
  StudioBg3dAssistantScenePreset,
  StudioBg3dAssistantSheetState,
  StudioBg3dAssistantStep,
} from "./studio-bg3d-scene-assistant";

import "./studio-bg3d-scene-assistant.css";

type AssistantAsset = {
  readonly id: string;
  readonly name: string;
  readonly thumbnail: string | null;
  readonly canUse: boolean;
};

type AssistantSceneNode = { readonly id: string; readonly modelId?: string };
type AssistantBooleanSetter = (next: boolean | ((current: boolean) => boolean)) => void;

export interface StudioBg3dSceneAssistantHost {
  readonly open: boolean;
  readonly operation?: "insert" | "update";
  readonly primitives?: readonly AssistantSceneNode[];
  readonly customModels?: readonly AssistantSceneNode[];
  readonly sharedCharacterCaptureElementIds?: readonly string[];
  readonly selectedIds?: ReadonlySet<string>;
  readonly setSelectedIds?: (ids: Set<string>) => void;
  readonly modelLibrary?: readonly AssistantAsset[];
  readonly genericModelClassifications?: ReadonlyMap<string, string>;
  readonly transformMode?: "translate" | "rotate" | "scale";
  readonly lineArtPreview?: boolean;
  readonly placementActive?: boolean;
  readonly placementSession?: { readonly phase?: string };
  readonly isCapturing?: boolean;
  readonly isRestoringScene?: boolean;
  readonly isUploadingModel?: boolean;
  readonly isBatchRenderingShots?: boolean;
  readonly applyingTemplateId?: string | null;
  readonly deletingModelId?: string | null;
  readonly insertBlocked?: boolean;
  readonly immersiveSceneActive?: boolean;
  readonly sharedStageUpdateBlockedReason?: string | null;
  readonly groundSelectionDisabledReason?: string | null;
  readonly focusSelectionDisabledReason?: string | null;
  readonly error?: string | null;
  readonly addSceneTemplate: (templateId: string) => boolean;
  readonly addCustomModelToScene: (modelId: string) => void | Promise<void>;
  readonly addPrimitive: (kind: "box" | "cylinder" | "plane" | "sphere") => void;
  readonly applyCameraPreset: (presetId: string) => void;
  readonly zoomCameraBy: (factor: number) => void;
  readonly setTransformMode: (mode: "translate" | "rotate" | "scale") => void;
  readonly setLineArtPreview: AssistantBooleanSetter;
  readonly updateLtToneSettings: (settings: Record<string, unknown>) => void;
  readonly groundSelectedEntity: () => void;
  readonly focusSelectedEntity: () => void;
  readonly duplicateSelected: () => void;
  readonly deleteSelected: () => void;
  readonly handleSaveToLibrary: () => void;
  readonly handleInsert: () => void | Promise<void>;
  readonly setActivePanelTab: (tab: string) => void;
  readonly setModelsPanelActivated: (active: boolean) => void;
  readonly setViewEditorSection: (section: string) => void;
  readonly setLtEditorSection: (section: string) => void;
  readonly [key: string]: unknown;
}

interface StudioBg3dSceneAssistantWorkspaceProps {
  readonly h: StudioBg3dSceneAssistantHost;
  readonly onOpenProfessional: () => void;
}

const GOALS: readonly {
  readonly id: StudioBg3dAssistantGoal;
  readonly title: string;
  readonly description: string;
  readonly icon: typeof Layers3;
}[] = Object.freeze([
  {
    id: "background",
    title: "배경·구도",
    description: "완성된 장소를 고르고 카메라만 맞춰요",
    icon: Layers3,
  },
  {
    id: "character",
    title: "인물·포즈",
    description: "프로젝트 캐릭터와 포즈 참고를 배치해요",
    icon: CircleUserRound,
  },
  {
    id: "props",
    title: "소품",
    description: "가구와 물건을 현재 장면에 바로 놓아요",
    icon: Cuboid,
  },
]);

const TRANSFORM_ACTIONS = Object.freeze([
  { id: "translate", label: "위치 옮기기", icon: Move3d },
  { id: "rotate", label: "방향 바꾸기", icon: Rotate3d },
  { id: "scale", label: "크게·작게", icon: Scaling },
] as const);

function readAssistantHostSnapshot(h: StudioBg3dSceneAssistantHost): string {
  return [
    h.open ? 1 : 0,
    h.isCapturing ? 1 : 0,
    h.isRestoringScene ? 1 : 0,
    h.isUploadingModel ? 1 : 0,
    h.isBatchRenderingShots ? 1 : 0,
    h.applyingTemplateId ?? "",
    h.deletingModelId ?? "",
    h.insertBlocked ? 1 : 0,
    h.immersiveSceneActive ? 1 : 0,
    h.sharedStageUpdateBlockedReason ?? "",
    h.primitives?.length ?? 0,
    (h.primitives ?? []).map((node) => node.id).join(","),
    h.customModels?.length ?? 0,
    (h.customModels ?? []).map((node) => node.id).join(","),
    h.sharedCharacterCaptureElementIds?.length ?? 0,
    h.selectedIds?.size ?? 0,
    [...(h.selectedIds ?? [])].sort().join(","),
    h.modelLibrary?.length ?? 0,
    h.genericModelClassifications?.size ?? 0,
    h.transformMode ?? "",
    h.lineArtPreview ? 1 : 0,
    h.placementActive ? 1 : 0,
    h.placementSession?.phase ?? "",
    h.groundSelectionDisabledReason ?? "",
    h.focusSelectionDisabledReason ?? "",
    h.error ?? "",
  ].join("|");
}

function classifyAssistantAsset(
  entry: AssistantAsset,
  classifications: ReadonlyMap<string, string> | undefined,
): StudioBg3dAssistantGoal | null {
  const declared = classifications?.get(entry.id);
  if (declared === "character" || declared === "creature") return "character";
  if (declared === "prop") return "props";
  const name = entry.name.toLocaleLowerCase();
  if (/character|avatar|girl|boy|woman|man|person|fairy|knight|witch|캐릭터|인물/u.test(name)) {
    return "character";
  }
  if (/background|environment|room|street|classroom|cafe|배경|공간/u.test(name)) return null;
  return "props";
}

function assistantSceneHasContent(h: StudioBg3dSceneAssistantHost): boolean {
  return (h.primitives?.length ?? 0) > 0
    || (h.customModels?.length ?? 0) > 0
    || (h.sharedCharacterCaptureElementIds?.length ?? 0) > 0;
}

function studioAssistantSurfaceHref(surface: "poser" | "character"): string {
  if (typeof window === "undefined") return `/studio/${surface}`;
  const nextPathname = /\/bg3d$/u.test(window.location.pathname)
    ? window.location.pathname.replace(/\/bg3d$/u, `/${surface}`)
    : `/studio/${surface}`;
  return `${nextPathname}${window.location.search}`;
}

function stepActionLabel(step: StudioBg3dAssistantStep): string {
  if (step === "choose") return "다음: 배치하기";
  if (step === "arrange") return "다음: 구도 잡기";
  if (step === "frame") return "다음: 작화 스타일";
  return "현재 컷에 적용";
}

function SheetHandle({
  state,
  onChange,
}: {
  readonly state: StudioBg3dAssistantSheetState;
  readonly onChange: (state: StudioBg3dAssistantSheetState) => void;
}) {
  const next = state === "peek" ? "half" : state === "half" ? "full" : "peek";
  return (
    <button
      type="button"
      className="scene-assistant__sheet-handle"
      aria-label={state === "full" ? "도구 패널 접기" : "도구 패널 펼치기"}
      onClick={() => onChange(next)}
    >
      <span aria-hidden />
      {state === "full" ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
    </button>
  );
}
function AssistantStepper({
  step,
  onStepChange,
}: {
  readonly step: StudioBg3dAssistantStep;
  readonly onStepChange: (step: StudioBg3dAssistantStep) => void;
}) {
  const activeIndex = studioBg3dAssistantStepIndex(step);
  return (
    <nav className="scene-assistant__steps" aria-label="장면 제작 단계">
      {STUDIO_BG3D_ASSISTANT_STEPS.map((item, index) => {
        const current = item.id === step;
        const complete = index < activeIndex;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={`${item.number}. ${item.label}`}
            aria-current={current ? "step" : undefined}
            className="scene-assistant__step"
            data-current={current || undefined}
            data-complete={complete || undefined}
            onClick={() => onStepChange(item.id)}
          >
            <span className="scene-assistant__step-number">
              {complete ? <Check size={13} aria-hidden /> : item.number}
            </span>
            <span className="scene-assistant__step-copy">
              <span>{item.shortLabel}</span>
              <small>{item.label}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function GoalPicker({
  goal,
  onChange,
}: {
  readonly goal: StudioBg3dAssistantGoal;
  readonly onChange: (goal: StudioBg3dAssistantGoal) => void;
}) {
  return (
    <div className="scene-assistant__goal-grid" role="group" aria-label="만들 장면 종류">
      {GOALS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className="scene-assistant__goal"
            aria-pressed={goal === item.id}
            onClick={() => onChange(item.id)}
          >
            <span className="scene-assistant__goal-icon"><Icon size={18} aria-hidden /></span>
            <span><strong>{item.title}</strong><small>{item.description}</small></span>
          </button>
        );
      })}
    </div>
  );
}
function ScenePresetCard({
  preset,
  selected,
  disabled,
  onSelect,
}: {
  readonly preset: StudioBg3dAssistantScenePreset;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: (preset: StudioBg3dAssistantScenePreset) => void;
}) {
  return (
    <button
      type="button"
      className="scene-assistant__scene-card"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onSelect(preset)}
    >
      <img src={preset.image} alt="" loading="lazy" decoding="async" />
      <span className="scene-assistant__scene-card-shade" aria-hidden />
      <span className="scene-assistant__scene-card-copy">
        <span className="scene-assistant__badge">{preset.badge}</span>
        <strong>{preset.title}</strong>
        <small>{preset.description}</small>
      </span>
      {selected ? <span className="scene-assistant__scene-check"><Check size={14} aria-hidden /></span> : null}
    </button>
  );
}

function AssetCard({
  asset,
  disabled,
  onAdd,
}: {
  readonly asset: AssistantAsset;
  readonly disabled: boolean;
  readonly onAdd: (asset: AssistantAsset) => void;
}) {
  return (
    <button
      type="button"
      className="scene-assistant__asset-card"
      disabled={disabled || !asset.canUse}
      onClick={() => onAdd(asset)}
    >
      <span className="scene-assistant__asset-thumb">
        {asset.thumbnail
          ? <img src={asset.thumbnail} alt="" loading="lazy" decoding="async" />
          : <Box size={28} aria-hidden />}
      </span>
      <span><strong>{asset.name}</strong><small>장면에 놓고 위치를 정해요</small></span>
      <ImagePlus size={16} aria-hidden />
    </button>
  );
}
function ChooseStep({
  goal,
  selectedSceneId,
  assets,
  busy,
  hasScene,
  onGoalChange,
  onSceneSelect,
  onAssetAdd,
  onOpenProfessional,
}: {
  readonly goal: StudioBg3dAssistantGoal;
  readonly selectedSceneId: string | null;
  readonly assets: readonly AssistantAsset[];
  readonly busy: boolean;
  readonly hasScene: boolean;
  readonly onGoalChange: (goal: StudioBg3dAssistantGoal) => void;
  readonly onSceneSelect: (preset: StudioBg3dAssistantScenePreset) => void;
  readonly onAssetAdd: (asset: AssistantAsset) => void;
  readonly onOpenProfessional: () => void;
}) {
  return (
    <div className="scene-assistant__step-body" data-step="choose">
      <section className="scene-assistant__hero">
        <img src={STUDIO_BG3D_ASSISTANT_HERO} alt="" decoding="async" />
        <div>
          <p><Sparkles size={13} aria-hidden /> 1분 장면 제작</p>
          <h3>무엇을 만들까요?</h3>
          <span>장소나 인물을 고르면 배치부터 웹툰 적용까지 필요한 도구만 보여 드립니다.</span>
        </div>
      </section>

      <GoalPicker goal={goal} onChange={onGoalChange} />

      {goal === "background" ? (
        <section aria-labelledby="scene-assistant-scene-title">
          <div className="scene-assistant__section-title">
            <div><p>CURATED SCENE COLLECTION</p><h4 id="scene-assistant-scene-title">장면 프리셋</h4></div>
            {hasScene ? <span>선택하면 현재 장면을 바꿉니다</span> : <span>선택 즉시 3D 장면을 구성합니다</span>}
          </div>
          <div className="scene-assistant__scene-grid">
            {STUDIO_BG3D_ASSISTANT_SCENES.map((preset) => (
              <ScenePresetCard
                key={preset.id}
                preset={preset}
                selected={selectedSceneId === preset.id}
                disabled={busy}
                onSelect={onSceneSelect}
              />
            ))}
          </div>
        </section>
      ) : null}
      {goal !== "background" ? (
        <section aria-labelledby="scene-assistant-assets-title">
          <div className="scene-assistant__section-title">
            <div>
              <p>{goal === "character" ? "CHARACTER & POSE" : "SMART PROPS"}</p>
              <h4 id="scene-assistant-assets-title">
                {goal === "character" ? "인물·포즈 소재" : "바로 놓는 소품"}
              </h4>
            </div>
            <span>선택 후 화면에서 위치만 정하세요</span>
          </div>
          {goal === "character" ? (
            <div className="scene-assistant__tool-links" aria-label="인물 제작 도구">
              <a href={studioAssistantSurfaceHref("poser")}>
                <CircleUserRound size={18} aria-hidden />
                <span><strong>포즈 편집기</strong><small>프로젝트 캐릭터의 표정·포즈·의상 조정</small></span>
                <ArrowRight size={15} aria-hidden />
              </a>
              <a href={studioAssistantSurfaceHref("character")}>
                <Sparkles size={18} aria-hidden />
                <span><strong>새 캐릭터 만들기</strong><small>외형을 만들고 프로젝트 소재로 재사용</small></span>
                <ArrowRight size={15} aria-hidden />
              </a>
            </div>
          ) : null}
          {assets.length > 0 ? (
            <div className="scene-assistant__asset-grid">
              {assets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} disabled={busy} onAdd={onAssetAdd} />
              ))}
            </div>
          ) : (
            <div className="scene-assistant__empty-state">
              <Box size={24} aria-hidden />
              <strong>표시할 준비된 소재가 없습니다.</strong>
              <span>정밀 편집에서 모델을 가져오거나 전체 라이브러리를 확인할 수 있습니다.</span>
              <button type="button" onClick={onOpenProfessional}>
                <SlidersHorizontal size={15} aria-hidden /> 전체 라이브러리 열기
              </button>
            </div>
          )}
        </section>
      ) : null}

      <section className="scene-assistant__handoff" aria-label="이미지에서 3D 만들기">
        <div><Upload size={18} aria-hidden /><span><strong>이미지에서 3D 만들기</strong><small>캐릭터·소품·배경 이미지를 입체 장면으로 변환</small></span></div>
        <a href="/studio/lift3d">이미지 선택</a>
      </section>
    </div>
  );
}
function ArrangeStep({
  h,
  selectedCount,
  objectCount,
  placementActive,
  busy,
  onReturnToChoose,
}: {
  readonly h: StudioBg3dSceneAssistantHost;
  readonly selectedCount: number;
  readonly objectCount: number;
  readonly placementActive: boolean;
  readonly busy: boolean;
  readonly onReturnToChoose: (goal: StudioBg3dAssistantGoal) => void;
}) {
  return (
    <div className="scene-assistant__step-body" data-step="arrange">
      <section className="scene-assistant__status-card" data-active={placementActive || undefined}>
        <span className="scene-assistant__status-icon">
          {placementActive ? <Move3d size={20} aria-hidden /> : <Layers3 size={20} aria-hidden />}
        </span>
        <div>
          <p>{placementActive ? "배치 위치를 정하는 중" : `${objectCount}개 항목으로 장면 구성됨`}</p>
          <strong>
            {placementActive
              ? "화면에서 원하는 바닥이나 표면을 누르세요."
              : selectedCount > 0
                ? `${selectedCount}개 항목을 선택했습니다.`
                : "화면의 물체를 눌러 바로 조정하세요."}
          </strong>
        </div>
      </section>

      {selectedCount > 0 ? (
        <section aria-labelledby="scene-assistant-transform-title">
          <div className="scene-assistant__section-title compact">
            <div><p>SELECTED ITEM</p><h4 id="scene-assistant-transform-title">선택 항목 조정</h4></div>
          </div>
          <div className="scene-assistant__action-grid three">
            {TRANSFORM_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  aria-pressed={h.transformMode === action.id}
                  disabled={busy}
                  onClick={() => h.setTransformMode(action.id)}
                >
                  <Icon size={18} aria-hidden /><span>{action.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
      {selectedCount > 0 ? (
        <div className="scene-assistant__quick-actions">
          {!h.groundSelectionDisabledReason ? (
            <button type="button" disabled={busy} onClick={h.groundSelectedEntity}>
              <Maximize2 size={15} aria-hidden /> 바닥에 놓기
            </button>
          ) : null}
          {!h.focusSelectionDisabledReason ? (
            <button type="button" disabled={busy} onClick={h.focusSelectedEntity}>
              <Focus size={15} aria-hidden /> 선택 항목 보기
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={h.duplicateSelected}>
            <Copy size={15} aria-hidden /> 복제
          </button>
          <button className="danger" type="button" disabled={busy} onClick={h.deleteSelected}>
            <Trash2 size={15} aria-hidden /> 삭제
          </button>
        </div>
      ) : null}

      <section aria-labelledby="scene-assistant-add-title">
        <div className="scene-assistant__section-title compact">
          <div><p>ADD TO SCENE</p><h4 id="scene-assistant-add-title">장면에 더하기</h4></div>
          <span>필요한 것만 추가하세요</span>
        </div>
        <div className="scene-assistant__add-grid">
          <button type="button" onClick={() => onReturnToChoose("background")}>
            <Layers3 size={20} aria-hidden /><span><strong>배경 바꾸기</strong><small>장소 프리셋 선택</small></span>
          </button>
          <button type="button" onClick={() => onReturnToChoose("character")}>
            <CircleUserRound size={20} aria-hidden /><span><strong>인물·포즈</strong><small>캐릭터 소재 선택</small></span>
          </button>
          <button type="button" onClick={() => onReturnToChoose("props")}>
            <Cuboid size={20} aria-hidden /><span><strong>소품</strong><small>가구·물건 선택</small></span>
          </button>
        </div>
      </section>

      <details className="scene-assistant__details">
        <summary>간단한 도형 직접 추가</summary>
        <div className="scene-assistant__primitive-row">
          <button type="button" disabled={busy} onClick={() => h.addPrimitive("box")}>상자</button>
          <button type="button" disabled={busy} onClick={() => h.addPrimitive("cylinder")}>원기둥</button>
          <button type="button" disabled={busy} onClick={() => h.addPrimitive("plane")}>평면</button>
          <button type="button" disabled={busy} onClick={() => h.addPrimitive("sphere")}>구</button>
        </div>
      </details>
    </div>
  );
}
function FrameStep({
  h,
  activeCameraPreset,
  busy,
  onCameraPreset,
}: {
  readonly h: StudioBg3dSceneAssistantHost;
  readonly activeCameraPreset: string;
  readonly busy: boolean;
  readonly onCameraPreset: (presetId: string) => void;
}) {
  return (
    <div className="scene-assistant__step-body" data-step="frame">
      <section className="scene-assistant__status-card camera">
        <span className="scene-assistant__status-icon"><Camera size={20} aria-hidden /></span>
        <div>
          <p>카메라 프리셋</p>
          <strong>먼저 가까운 구도를 고른 뒤 화면에서 조금만 움직이세요.</strong>
        </div>
      </section>

      <section aria-labelledby="scene-assistant-camera-title">
        <div className="scene-assistant__section-title compact">
          <div><p>CAMERA COMPOSITION</p><h4 id="scene-assistant-camera-title">추천 구도</h4></div>
          <span>언제든 다시 바꿀 수 있습니다</span>
        </div>
        <div className="scene-assistant__camera-grid">
          {STUDIO_BG3D_ASSISTANT_CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={activeCameraPreset === preset.id}
              disabled={busy}
              onClick={() => onCameraPreset(preset.id)}
            >
              <span className={`scene-assistant__camera-glyph is-${preset.id}`} aria-hidden>
                <span />
              </span>
              <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
              {activeCameraPreset === preset.id ? <Check size={15} aria-hidden /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="scene-assistant__camera-tune" aria-label="카메라 간단 조정">
        <div><strong>거리 미세 조정</strong><small>장면을 더 가깝게 또는 넓게 봅니다.</small></div>
        <div>
          <button type="button" disabled={busy} onClick={() => h.zoomCameraBy(1.18)}>더 멀리</button>
          <button type="button" disabled={busy} onClick={() => h.zoomCameraBy(0.84)}>더 가까이</button>
        </div>
      </section>

      <button
        type="button"
        className="scene-assistant__preview-toggle"
        aria-pressed={Boolean(h.lineArtPreview)}
        onClick={() => h.setLineArtPreview((current: boolean) => !current)}
      >
        <ScanLine size={18} aria-hidden />
        <span><strong>선화로 미리 보기</strong><small>배경선의 밀도와 인물 가독성을 미리 확인합니다.</small></span>
        <span className="scene-assistant__switch" aria-hidden><span /></span>
      </button>
    </div>
  );
}
function FinishStep({
  h,
  outputStyle,
  busy,
  hasScene,
  onOutputStyle,
}: {
  readonly h: StudioBg3dSceneAssistantHost;
  readonly outputStyle: StudioBg3dAssistantOutputStyle;
  readonly busy: boolean;
  readonly hasScene: boolean;
  readonly onOutputStyle: (style: StudioBg3dAssistantOutputStyle) => void;
}) {
  return (
    <div className="scene-assistant__step-body" data-step="finish">
      <section className="scene-assistant__finish-hero">
        <div className="scene-assistant__finish-art" aria-hidden>
          <span className="color" /><span className="line" /><span className="tone" />
        </div>
        <div>
          <p><Sparkles size={13} aria-hidden /> 웹툰 적용 준비</p>
          <h3>어떤 모습으로 넣을까요?</h3>
          <span>적용 후에도 연결된 장면을 다시 열어 구도와 스타일을 바꿀 수 있습니다.</span>
        </div>
      </section>

      <section aria-labelledby="scene-assistant-output-title">
        <div className="scene-assistant__section-title compact">
          <div><p>OUTPUT STYLE</p><h4 id="scene-assistant-output-title">작화 스타일</h4></div>
          <span>추천: 컬러 배경</span>
        </div>
        <div className="scene-assistant__output-grid">
          {STUDIO_BG3D_ASSISTANT_OUTPUT_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              aria-pressed={outputStyle === style.id}
              disabled={busy}
              onClick={() => onOutputStyle(style.id)}
            >
              <span className={`scene-assistant__output-preview is-${style.id}`} aria-hidden>
                <span /><span /><span />
              </span>
              <span><strong>{style.label}</strong><small>{style.description}</small></span>
              {outputStyle === style.id ? <Check size={15} aria-hidden /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="scene-assistant__apply-benefits">
        <div><Check size={14} aria-hidden /><span>현재 컷 비율에 맞춰 출력</span></div>
        <div><Check size={14} aria-hidden /><span>원본 3D 장면을 함께 보존</span></div>
        <div><Check size={14} aria-hidden /><span>캔버스에서 다시 편집 가능</span></div>
      </section>

      <button type="button" className="scene-assistant__save" disabled={busy || !hasScene} onClick={h.handleSaveToLibrary}>
        <Save size={16} aria-hidden /><span><strong>장면을 소재로도 저장</strong><small>다른 컷과 다음 화에서 다시 사용합니다.</small></span>
      </button>
    </div>
  );
}
export function StudioBg3dSceneAssistantWorkspace({
  h,
  onOpenProfessional,
}: StudioBg3dSceneAssistantWorkspaceProps) {
  const [, refreshMutableHost] = useReducer((revision: number) => revision + 1, 0);
  const initialContent = assistantSceneHasContent(h);
  const [step, setStep] = useState<StudioBg3dAssistantStep>(initialContent ? "arrange" : "choose");
  const [goal, setGoal] = useState<StudioBg3dAssistantGoal>("background");
  const [sheetState, setSheetState] = useState<StudioBg3dAssistantSheetState>("half");
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [activeCameraPreset, setActiveCameraPreset] = useState("threeQuarter");
  const [outputStyle, setOutputStyle] = useState<StudioBg3dAssistantOutputStyle>("color");
  const [sceneFramingRequest, requestSceneFraming] = useReducer((revision: number) => revision + 1, 0);
  const hydratedRef = useRef(false);
  const completedSceneFramingRequestRef = useRef(0);

  useEffect(() => {
    if (!h.open) return undefined;
    let previous = readAssistantHostSnapshot(h);
    const interval = window.setInterval(() => {
      const next = readAssistantHostSnapshot(h);
      if (next === previous) return;
      previous = next;
      refreshMutableHost();
    }, 180);
    return () => window.clearInterval(interval);
  }, [h]);

  const objectCount = (h.primitives?.length ?? 0)
    + (h.customModels?.length ?? 0)
    + (h.sharedCharacterCaptureElementIds?.length ?? 0);
  const hasScene = objectCount > 0;
  const modalOpen = h.open;
  const restoringScene = Boolean(h.isRestoringScene);
  const selectedCount = h.selectedIds?.size ?? 0;
  const placementActive = h.placementSession?.phase === "preview" || Boolean(h.placementActive);
  const busy = Boolean(
    h.isCapturing
    || h.isRestoringScene
    || h.isUploadingModel
    || h.isBatchRenderingShots
    || h.applyingTemplateId
    || h.deletingModelId,
  );
  const insertDisabled = !hasScene
    || busy
    || Boolean(h.insertBlocked)
    || Boolean(h.immersiveSceneActive)
    || Boolean(h.sharedStageUpdateBlockedReason);
  const selectableSceneIds = [
    ...(h.primitives ?? []).map((node) => node.id),
    ...(h.customModels ?? []).map((node) => node.id),
  ];
  const selectableSceneIdSignature = [...selectableSceneIds].sort().join("|");
  const selectedSceneIdSignature = [...(h.selectedIds ?? [])].sort().join("|");

  useEffect(() => {
    if (
      sceneFramingRequest === 0
      || completedSceneFramingRequestRef.current === sceneFramingRequest
      || busy
      || h.focusSelectionDisabledReason
      || selectableSceneIdSignature.length === 0
    ) return undefined;
    if (h.setSelectedIds && selectedSceneIdSignature !== selectableSceneIdSignature) {
      h.setSelectedIds(new Set(selectableSceneIdSignature.split("|").filter(Boolean)));
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      completedSceneFramingRequestRef.current = sceneFramingRequest;
      h.focusSelectedEntity();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    busy,
    h,
    h.focusSelectionDisabledReason,
    sceneFramingRequest,
    selectableSceneIdSignature,
    selectedSceneIdSignature,
  ]);

  useEffect(() => {
    if (!modalOpen) {
      hydratedRef.current = false;
      setStep("choose");
      setSheetState("half");
      return;
    }
    if (restoringScene || hydratedRef.current) return;
    hydratedRef.current = true;
    if (hasScene) setStep("arrange");
  }, [hasScene, modalOpen, restoringScene]);
  const assistantAssets = ((h.modelLibrary ?? []) as readonly AssistantAsset[])
    .filter((entry) => classifyAssistantAsset(entry, h.genericModelClassifications) === goal)
    .slice(0, 8);

  const changeStep = (next: StudioBg3dAssistantStep) => {
    if (studioBg3dAssistantStepIndex(next) > 0 && !hasScene) {
      setStep("choose");
      setSheetState("full");
      return;
    }
    setStep(next);
    setSheetState(next === "choose" ? "full" : "half");
  };

  const frameWholeScene = () => {
    requestSceneFraming();
  };

  const replaceWithScene = (preset: StudioBg3dAssistantScenePreset) => {
    if (busy) return;
    if (hasScene) {
      const accepted = window.confirm(
        `현재 배경을 “${preset.title}” 장면으로 바꿀까요? 배치한 인물과 소품은 유지됩니다.`,
      );
      if (!accepted) return;
    }
    const created = h.addSceneTemplate(preset.templateId);
    if (!created) return;
    h.applyCameraPreset(preset.cameraPreset);
    frameWholeScene();
    setSelectedSceneId(preset.id);
    setActiveCameraPreset(preset.cameraPreset);
    setStep("arrange");
    setSheetState("half");
  };

  const addAsset = (asset: AssistantAsset) => {
    if (busy || !asset.canUse) return;
    void h.addCustomModelToScene(asset.id);
    setStep("arrange");
    setSheetState("peek");
  };

  const selectCameraPreset = (presetId: string) => {
    h.applyCameraPreset(presetId);
    frameWholeScene();
    setActiveCameraPreset(presetId);
  };

  const selectOutputStyle = (style: StudioBg3dAssistantOutputStyle) => {
    const settings = studioBg3dAssistantOutputSettings(style);
    setOutputStyle(style);
    h.setLineArtPreview(settings.lineArtPreview);
    h.updateLtToneSettings(settings.tone);
  };
  const advance = () => {
    if (step === "finish") {
      if (!insertDisabled) void h.handleInsert();
      return;
    }
    const next = nextStudioBg3dAssistantStep(step);
    if (next) changeStep(next);
  };

  const goBack = () => {
    const previous = previousStudioBg3dAssistantStep(step);
    if (previous) changeStep(previous);
  };

  const returnToChoose = (nextGoal: StudioBg3dAssistantGoal) => {
    setGoal(nextGoal);
    setStep("choose");
    setSheetState("full");
  };

  let stepContent: ReactNode;
  if (step === "choose") {
    stepContent = (
      <ChooseStep
        goal={goal}
        selectedSceneId={selectedSceneId}
        assets={assistantAssets}
        busy={busy}
        hasScene={hasScene}
        onGoalChange={setGoal}
        onSceneSelect={replaceWithScene}
        onAssetAdd={addAsset}
        onOpenProfessional={onOpenProfessional}
      />
    );
  } else if (step === "arrange") {
    stepContent = (
      <ArrangeStep
        h={h}
        selectedCount={selectedCount}
        objectCount={objectCount}
        placementActive={placementActive}
        busy={busy}
        onReturnToChoose={returnToChoose}
      />
    );
  } else if (step === "frame") {
    stepContent = (
      <FrameStep
        h={h}
        activeCameraPreset={activeCameraPreset}
        busy={busy}
        onCameraPreset={selectCameraPreset}
      />
    );
  } else {
    stepContent = (
      <FinishStep
        h={h}
        outputStyle={outputStyle}
        busy={busy}
        hasScene={hasScene}
        onOutputStyle={selectOutputStyle}
      />
    );
  }
  const openProfessionalForContext = () => {
    if (goal === "character" || goal === "props") {
      h.setActivePanelTab("models");
      h.setModelsPanelActivated(true);
    } else if (step === "frame") {
      h.setActivePanelTab("view");
      h.setViewEditorSection("camera");
    } else if (step === "finish") {
      h.setActivePanelTab("lt");
      h.setLtEditorSection("line");
    } else {
      h.setActivePanelTab("templates");
    }
    onOpenProfessional();
  };

  const primaryDisabled = busy || !hasScene || (step === "finish" && insertDisabled);
  const primaryLabel = step === "finish" && h.operation === "update"
    ? "현재 컷에 다시 적용"
    : stepActionLabel(step);

  return (
    <div
      className="scene-assistant"
      data-sheet-state={sheetState}
      data-step={step}
      data-assistant-busy={busy || undefined}
      data-assistant-has-scene={hasScene || undefined}
      data-assistant-primary-disabled={primaryDisabled || undefined}
      data-assistant-restoring={h.isRestoringScene || undefined}
      data-assistant-uploading={h.isUploadingModel || undefined}
      data-assistant-applying-template={h.applyingTemplateId || undefined}
      data-assistant-deleting={h.deletingModelId || undefined}
      data-testid="studio-bg3d-scene-assistant"
    >
      <div className="scene-assistant__viewport">
        <StudioBg3dEditorViewport h={h} simplified />
        <div className="scene-assistant__viewport-status" aria-live="polite">
          {placementActive
            ? "화면에서 배치할 위치를 선택하세요"
            : selectedCount > 0
              ? `${selectedCount}개 선택 · ${TRANSFORM_ACTIONS.find((item) => item.id === h.transformMode)?.label ?? "위치 조정"}`
              : hasScene
                ? "물체를 누르면 바로 조정할 수 있어요"
                : "먼저 오른쪽에서 장면을 골라 주세요"}
        </div>
      </div>

      <aside className="scene-assistant__panel" aria-label="장면 도우미">
        <SheetHandle state={sheetState} onChange={setSheetState} />
        <div className="scene-assistant__panel-head">
          <div className="scene-assistant__panel-title">
            <span><Sparkles size={15} aria-hidden /></span>
            <div><p>SCENE ASSISTANT</p><h3>{STUDIO_BG3D_ASSISTANT_STEPS[studioBg3dAssistantStepIndex(step)]?.label}</h3></div>
          </div>
          <button type="button" className="scene-assistant__precision" onClick={openProfessionalForContext}>
            <SlidersHorizontal size={14} aria-hidden /> 정밀 편집
          </button>
        </div>

        <AssistantStepper step={step} onStepChange={changeStep} />
        <div className="scene-assistant__panel-scroll">{stepContent}</div>
        {h.error || h.sharedStageUpdateBlockedReason ? (
          <div className="scene-assistant__notice" role="alert">
            {h.error ?? h.sharedStageUpdateBlockedReason}
          </div>
        ) : null}

        <footer className="scene-assistant__footer">
          <div className="scene-assistant__footer-secondary">
            {step !== "choose" ? (
              <button type="button" onClick={goBack}>
                <ArrowLeft size={15} aria-hidden /> 이전
              </button>
            ) : (
              <button type="button" onClick={openProfessionalForContext}>
                <SlidersHorizontal size={15} aria-hidden /> 정밀 편집
              </button>
            )}
          </div>
          <button
            type="button"
            className="scene-assistant__primary"
            disabled={primaryDisabled}
            onClick={advance}
          >
            {busy ? <Loader2 className="animate-spin" size={17} aria-hidden /> : step === "finish" ? <ImagePlus size={17} aria-hidden /> : null}
            <span>{primaryLabel}</span>
            {!busy && step !== "finish" ? <ArrowRight size={16} aria-hidden /> : null}
          </button>
        </footer>
      </aside>
    </div>
  );
}
