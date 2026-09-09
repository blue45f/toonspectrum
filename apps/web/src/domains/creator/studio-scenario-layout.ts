/**
 * Studio Scenario Layout — 시나리오 자동 생성(장면 분할 결과)을 캔버스 컷 배치로 변환하는 순수 코어.
 *
 * studio-dialogue.ts의 parseDialogueScript/layoutDialogueBubbles를 그대로 재사용한다(대사 파싱·
 * 좌우 자동 배치 로직을 중복 구현하지 않는다) — 각 장면의 dialogue 필드는 기존 "대사 한 번에"
 * 말풍선 삽입 기능과 동일한 미니 문법("이름: 대사" / "(지문)")이다(studio-scenario-scenes.ts의
 * 프롬프트가 이 문법으로 응답하도록 모델에 지시한다).
 *
 * 프레임 배치는 StudioPage.addFrame()의 "가장 아래 프레임 다음에 이어붙이기" 정책을 여러 장면
 * 배치용으로 일반화한 것이다 — 항상 현재 페이지의 기존 컷 아래로 세로 스크롤 웹툰처럼 이어붙인다.
 * 각 패널의 높이는 그 장면 대사량(말풍선 스택 높이)에 맞춰 자동으로 정해진다.
 *
 * Konva/DOM 의존 없음, 순수·결정적.
 */

import { layoutDialogueBubbles, parseDialogueScript, type DialogueBubbleSeed } from "./studio-dialogue";
import { normalizeScenarioBeatType, type ScenarioBeatType } from "./studio-story-beats";

import type { StudioStoryBeat } from "./studio-continuity";
import type { StudioPublishAiProvenance } from "./studio-publish-preflight";

const MARGIN = 24;
const MIN_FRAME_HEIGHT = 360;
const MAX_FRAME_HEIGHT = 900;
const BUBBLE_TOP_PAD = 32;
const BUBBLE_BOTTOM_PAD = 32;

export type ScenarioFrameRect = { x: number; y: number; width: number; height: number };

export interface ScenarioSceneInput {
  beatType?: ScenarioBeatType;
  summary?: string;
  imagePrompt: string;
  dialogue: string;
  continuity?: Omit<StudioStoryBeat, "sceneId">;
}

export type ScenarioPanelAspect = "square" | "portrait" | "landscape";
export type ScenarioImageVariantCount = 1 | 2 | 4;
export type ScenarioImageQualityProfile = "draft" | "balanced" | "final";
export type ScenarioImageVariationStrategy = "subtle" | "directorial" | "coverage";

export interface ScenarioImageQualityFinding {
  readonly id: string;
  readonly severity: "review" | "info";
  readonly category:
    | "resolution"
    | "alpha"
    | "edge-clipping"
    | "contrast"
    | "exposure"
    | "semantic-unknown";
  readonly message: string;
}

export interface ScenarioImageQualityReport {
  readonly version: 1;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly opaqueCoverage: number;
  readonly edgeOccupancy: number;
  readonly meanLuminance: number;
  readonly contrast: number;
  readonly confidence: "measured";
  readonly findings: readonly ScenarioImageQualityFinding[];
  readonly analyzedAt: string;
}

export interface ScenarioImageRepairRecord {
  readonly version: 1;
  readonly target:
    | "identity"
    | "face"
    | "expression"
    | "hands"
    | "anatomy"
    | "costume"
    | "prop"
    | "background"
    | "lighting"
    | "composition"
    | "text-artifact"
    | "outpaint";
  readonly parentCandidateId: string;
  readonly maskFingerprint: string;
  readonly prompt: string;
  readonly provider: string;
  readonly model: string;
  readonly createdAt: string;
}

export interface ScenarioImageLayer {
  readonly id: string;
  readonly name: string;
  readonly role: "foreground" | "background" | "provider-layer";
  readonly imageDataUrl: string;
  readonly sourceCandidateId: string;
}

export interface ScenarioImageLayerManifest {
  readonly version: 1;
  readonly method: "provider-native" | "manual-mask" | "single-layer";
  readonly editable: boolean;
  readonly sourceCandidateId: string;
  readonly layers: readonly ScenarioImageLayer[];
  readonly createdAt: string;
  readonly limitation?: string;
}

export interface ScenarioImageCandidate {
  id: string;
  imageDataUrl: string;
  imageProvenance?: StudioPublishAiProvenance;
  inputFingerprint: string;
  createdAt: string;
  /** Provider-neutral review metadata; it never claims a model-side seed or unsupported control. */
  qualityProfile?: ScenarioImageQualityProfile;
  variationStrategy?: ScenarioImageVariationStrategy;
  variationLabel?: string;
  qualityReport?: ScenarioImageQualityReport;
  repair?: ScenarioImageRepairRecord;
  layerManifest?: ScenarioImageLayerManifest;
}

export function scenarioPanelAspect(width: number, height: number): ScenarioPanelAspect {
  if (height <= 0) return "square";
  const ratio = width / height;
  if (ratio > 1.2) return "landscape";
  if (ratio < 1 / 1.2) return "portrait";
  return "square";
}

export interface ScenarioPanelSeed {
  frame: ScenarioFrameRect;
  bubbles: DialogueBubbleSeed[];
  beatType: ScenarioBeatType;
  summary: string;
  imagePrompt: string;
  /** 원본 미니 문법을 함께 보존해 미리보기 단계에서 사용자가 장면별 대사를 고치고 다시
   * 레이아웃할 수 있게 한다. bubbles만 남기면 화자 표기와 지문 문법을 복원할 수 없다. */
  dialogue: string;
  continuity?: Omit<StudioStoryBeat, "sceneId">;
  aspect: ScenarioPanelAspect;
}

export interface ScenarioPreviewItem extends ScenarioPanelSeed {
  imageDataUrl?: string;
  imageError?: string;
  imageProvenance?: StudioPublishAiProvenance;
  imageCandidates?: ScenarioImageCandidate[];
  selectedImageCandidateId?: string;
  approvedImageCandidateId?: string;
  preferredVariantCount?: ScenarioImageVariantCount;
  qualityReport?: ScenarioImageQualityReport;
  layerManifest?: ScenarioImageLayerManifest;
  approvalRevision?: number;
}

export interface ScenarioLayoutResult {
  panels: ScenarioPanelSeed[];
  /** 마지막 패널 하단 + 여백까지 반영한 페이지 캔버스 높이(기존 canvasH보다 작아지지 않는다). */
  nextCanvasH: number;
}

export function layoutScenarioPanels(
  existingFrames: readonly ScenarioFrameRect[],
  canvasW: number,
  canvasH: number,
  scenes: readonly ScenarioSceneInput[]
): ScenarioLayoutResult {
  const frameW = Math.max(1, canvasW - MARGIN * 2);
  const bottomFrame = existingFrames.reduce<ScenarioFrameRect | null>(
    (best, frame) => (!best || frame.y + frame.height > best.y + best.height ? frame : best),
    null,
  );
  let cursorY = bottomFrame ? bottomFrame.y + bottomFrame.height + MARGIN : MARGIN;
  const panels: ScenarioPanelSeed[] = [];

  for (const scene of scenes) {
    const lines = parseDialogueScript(scene.dialogue);
    const seedsAtOrigin = lines.length > 0
      ? layoutDialogueBubbles(lines, { canvasWidth: frameW, startY: 0 })
      : [];
    const bubbleStackHeight = seedsAtOrigin.reduce(
      (maximum, seed) => Math.max(maximum, seed.y + seed.height),
      0,
    );
    const height = Math.min(
      MAX_FRAME_HEIGHT,
      Math.max(
        MIN_FRAME_HEIGHT,
        bubbleStackHeight > 0
          ? bubbleStackHeight + BUBBLE_TOP_PAD + BUBBLE_BOTTOM_PAD
          : MIN_FRAME_HEIGHT,
      ),
    );
    const frame: ScenarioFrameRect = {
      x: MARGIN,
      y: cursorY,
      width: frameW,
      height,
    };
    const bubbles: DialogueBubbleSeed[] = seedsAtOrigin.map((seed) => ({
      ...seed,
      x: seed.x + frame.x,
      y: seed.y + frame.y + BUBBLE_TOP_PAD,
    }));
    panels.push({
      frame,
      bubbles,
      beatType: normalizeScenarioBeatType(scene.beatType),
      summary:
        scene.summary?.trim()
        || scene.imagePrompt.trim()
        || scene.dialogue.trim().split("\n")[0]
        || "장면",
      imagePrompt: scene.imagePrompt,
      dialogue: scene.dialogue,
      ...(scene.continuity ? { continuity: scene.continuity } : {}),
      aspect: scenarioPanelAspect(frame.width, frame.height),
    });
    cursorY = frame.y + frame.height + MARGIN;
  }

  return { panels, nextCanvasH: Math.max(canvasH, cursorY) };
}
