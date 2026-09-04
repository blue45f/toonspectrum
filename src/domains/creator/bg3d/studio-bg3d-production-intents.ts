import {
  resolveStudioBg3dProductionBatchPreset,
  type StudioBg3dProductionBatchPreset,
} from "./studio-bg3d-production-multipass";

import type { StudioBg3dShotBatchPass } from "./studio-bg3d-shot-batch-pass-catalog";

export const STUDIO_BG3D_PRODUCTION_INTENT_IDS = Object.freeze([
  "review",
  "manuscript",
  "composite",
  "ai-reference",
] as const);

export type StudioBg3dProductionIntentId =
  (typeof STUDIO_BG3D_PRODUCTION_INTENT_IDS)[number];

export interface StudioBg3dProductionIntentDefinition {
  readonly id: StudioBg3dProductionIntentId;
  readonly label: string;
  readonly description: string;
  readonly batchPreset: StudioBg3dProductionBatchPreset;
  readonly includeLayeredPsd: boolean;
  readonly includeContactSheet: boolean;
  readonly lineArtPreview: boolean;
  readonly transparentBackground: boolean;
}

export const STUDIO_BG3D_PRODUCTION_INTENTS: readonly StudioBg3dProductionIntentDefinition[] =
  Object.freeze([
    Object.freeze({
      id: "review",
      label: "컷 검수",
      description: "전체 컷의 원본·LT 합성과 콘택트 시트로 순서와 연속성을 빠르게 확인합니다.",
      batchPreset: "review",
      includeLayeredPsd: false,
      includeContactSheet: true,
      lineArtPreview: false,
      transparentBackground: false,
    }),
    Object.freeze({
      id: "manuscript",
      label: "웹툰 원고",
      description: "LT·컬러·톤·질감선·주선과 컷별 PSD, 콘택트 시트를 함께 준비합니다.",
      batchPreset: "manuscript",
      includeLayeredPsd: true,
      includeContactSheet: true,
      lineArtPreview: true,
      transparentBackground: false,
    }),
    Object.freeze({
      id: "composite",
      label: "2D 합성",
      description: "원고 패스와 레이어 PSD를 유지하면서 배경 알파를 투명하게 맞춥니다.",
      batchPreset: "manuscript",
      includeLayeredPsd: true,
      includeContactSheet: false,
      lineArtPreview: true,
      transparentBackground: true,
    }),
    Object.freeze({
      id: "ai-reference",
      label: "AI 참조",
      description: "원본·주선·깊이 패스로 구도와 포즈 확인용 입력을 준비합니다.",
      batchPreset: "ai-reference",
      includeLayeredPsd: false,
      includeContactSheet: false,
      lineArtPreview: true,
      transparentBackground: false,
    }),
  ]);

export interface StudioBg3dProductionIntentState {
  readonly availablePasses: readonly StudioBg3dShotBatchPass[];
  readonly selectedPasses: readonly StudioBg3dShotBatchPass[];
  readonly includeLayeredPsd: boolean;
  readonly includeContactSheet: boolean;
  readonly lineArtPreview: boolean;
  readonly transparentBackground: boolean;
}

export interface StudioBg3dProductionIntentPlan {
  readonly definition: StudioBg3dProductionIntentDefinition;
  readonly selectedPasses: readonly StudioBg3dShotBatchPass[];
}

function samePassSet(
  left: readonly StudioBg3dShotBatchPass[],
  right: readonly StudioBg3dShotBatchPass[],
): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length) return false;
  return leftSet.size === rightSet.size && [...leftSet].every((pass) => rightSet.has(pass));
}

export function planStudioBg3dProductionIntent(
  availablePasses: readonly StudioBg3dShotBatchPass[],
  intentId: StudioBg3dProductionIntentId,
): StudioBg3dProductionIntentPlan {
  const definition = STUDIO_BG3D_PRODUCTION_INTENTS.find((intent) => intent.id === intentId) ??
    STUDIO_BG3D_PRODUCTION_INTENTS[0]!;
  return Object.freeze({
    definition,
    selectedPasses: resolveStudioBg3dProductionBatchPreset(
      availablePasses,
      definition.batchPreset,
    ),
  });
}

export function detectStudioBg3dProductionIntent(
  state: StudioBg3dProductionIntentState,
): StudioBg3dProductionIntentId | null {
  for (const definition of STUDIO_BG3D_PRODUCTION_INTENTS) {
    const selectedPasses = resolveStudioBg3dProductionBatchPreset(
      state.availablePasses,
      definition.batchPreset,
    );
    if (
      samePassSet(state.selectedPasses, selectedPasses) &&
      state.includeLayeredPsd === definition.includeLayeredPsd &&
      state.includeContactSheet === definition.includeContactSheet &&
      state.lineArtPreview === definition.lineArtPreview &&
      state.transparentBackground === definition.transparentBackground
    ) {
      return definition.id;
    }
  }
  return null;
}
