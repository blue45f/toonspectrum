/**
 * 브러시가 종이와 상호작용하는 세기 — 렌더 패밀리 × 문서 종이 물리.
 *
 * 실물에서 종이 결이 보이는 정도는 도구가 정한다. 목탄 가루는 골에 그대로 쌓이고(강한
 * granulation), 수채 안료는 물에 실려 골로 내려앉으며, 기술펜 잉크는 섬유에 즉시 물들어
 * (staining) 종이 요철과 무관하게 균일한 선을 남긴다. 이 표는 그 차이를
 * `studio-paper-texture`의 두 축(granulation / staining)으로 옮긴 뒤,
 * 문서에 깔린 종이(`PAPER_PHYSICS_PROFILES`)의 tooth/sizing/scale 으로 한 번 더 변조한다.
 *
 * **왜 브러시 스냅샷이 아니라 표인가** — 종이 반응은 저장되는 획 상태가 아니라 도구의
 * 물성이다. 문서가 소유하는 것은 *어떤 종이를 깔았는가*(`StudioPaperSurfaceSettings`)뿐이다.
 */

import { resolveStudioBrushRenderFamily, type StudioBrushRenderFamily } from "../studio-brush";

import {
  STUDIO_PAPER_GRANULATION_IDENTITY,
  normalizeStudioPaperGranulationSettings,
  resolveStudioDocumentPaperSurface,
  type StudioPaperGranulationSettings,
} from "./studio-paper-granulation-runtime";
import {
  getStudioPaperPhysicsProfile,
  normalizePaperGrainKind,
  type PaperGrainKind,
} from "./studio-paper-texture";

/**
 * 렌더 패밀리 → 종이 반응 베이스 (cold-press 기준).
 *
 * 자연매체 최대 granulation 0.7 — 0.75를 넘기면 황목/샌디드에서 알파 배수가 상한에 닿아
 * 평균 보존이 깨진다.
 */
export const STUDIO_PAPER_BRUSH_RESPONSE: Readonly<
  Record<StudioBrushRenderFamily, StudioPaperGranulationSettings>
> = Object.freeze({
  "dry-media": { granulation: 0.7, staining: 0.04, scale: 1.5 },
  pastel: { granulation: 0.64, staining: 0.05, scale: 1.45 },
  pencil: { granulation: 0.55, staining: 0.08, scale: 1 },
  watercolor: { granulation: 0.58, staining: 0.18, scale: 1 },
  brush: { granulation: 0.36, staining: 0.2, scale: 1.05 },
  oil: { granulation: 0.3, staining: 0.22, scale: 1.35 },
  calligraphy: { granulation: 0.24, staining: 0.4, scale: 1 },
  // 종이를 타지 않는 도구들 — 정확한 항등.
  airbrush: STUDIO_PAPER_GRANULATION_IDENTITY,
  pen: STUDIO_PAPER_GRANULATION_IDENTITY,
  gpen: STUDIO_PAPER_GRANULATION_IDENTITY,
  perfect: STUDIO_PAPER_GRANULATION_IDENTITY,
  marker: STUDIO_PAPER_GRANULATION_IDENTITY,
  highlighter: STUDIO_PAPER_GRANULATION_IDENTITY,
  neon: STUDIO_PAPER_GRANULATION_IDENTITY,
  glow: STUDIO_PAPER_GRANULATION_IDENTITY,
  glitter: STUDIO_PAPER_GRANULATION_IDENTITY,
  "ink-particle": STUDIO_PAPER_GRANULATION_IDENTITY,
  screentone: STUDIO_PAPER_GRANULATION_IDENTITY,
  stamp: STUDIO_PAPER_GRANULATION_IDENTITY,
  pixel: STUDIO_PAPER_GRANULATION_IDENTITY,
});

// Newly authored core wet strokes already carry their own grain snapshot.
const STUDIO_AUTHORED_WET_DYNAMIC_PAPER_RESPONSE_IDS = new Set([
  "watercolor",
  "ink-wash",
  "inkwash-pen",
  "inkwash-water-brush",
  "inkwash-bleed-wash",
  "inkwash-white-ink",
]);

/** Mean-preserving ceiling shared with granulation runtime tests. */
const GRANULATION_CEILING = 0.7;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Apply document paper physics to a brush-family base response.
 * Identity brushes stay exact identity (same object reference).
 */
export function applyStudioPaperPhysicsToBrushResponse(
  base: StudioPaperGranulationSettings,
  paperKind: PaperGrainKind | unknown,
): StudioPaperGranulationSettings {
  if (
    base === STUDIO_PAPER_GRANULATION_IDENTITY
    || (base.granulation <= 0 && base.staining <= 0)
  ) {
    return STUDIO_PAPER_GRANULATION_IDENTITY;
  }
  const physics = getStudioPaperPhysicsProfile(paperKind);
  // Dry-media friction boosts lodging; wet absorbency slightly lifts granulation for washes.
  const dryBoost = 0.72 + physics.contactFriction * 0.45;
  const wetBoost = 0.85 + physics.absorbency * 0.22;
  const mediumBlend = dryBoost * 0.55 + wetBoost * 0.45;
  const granulation = clamp(
    base.granulation * physics.toothGain * mediumBlend,
    0,
    GRANULATION_CEILING,
  );
  const staining = clamp(base.staining * physics.sizingGain, 0, 1);
  const scale = clamp(
    base.scale * physics.scaleMul,
    0.25,
    16,
  );
  return normalizeStudioPaperGranulationSettings({
    granulation,
    staining,
    scale,
  });
}

/**
 * 브러시 id → 종이 반응.
 * 문서 종이를 넘기지 않으면 현재 문서 표면(`resolveStudioDocumentPaperSurface`)을 쓴다.
 */
export function resolveStudioPaperBrushResponse(
  brushId: unknown,
  paperKind?: PaperGrainKind | unknown,
): StudioPaperGranulationSettings {
  if (
    typeof brushId === "string"
    && STUDIO_AUTHORED_WET_DYNAMIC_PAPER_RESPONSE_IDS.has(brushId.trim().toLowerCase())
  ) {
    return STUDIO_PAPER_GRANULATION_IDENTITY;
  }
  const family = resolveStudioBrushRenderFamily(brushId);
  const base = STUDIO_PAPER_BRUSH_RESPONSE[family];
  if (base === STUDIO_PAPER_GRANULATION_IDENTITY) {
    return STUDIO_PAPER_GRANULATION_IDENTITY;
  }
  const kind = paperKind !== undefined && paperKind !== null
    ? normalizePaperGrainKind(paperKind)
    : resolveStudioDocumentPaperSurface().kind;
  return applyStudioPaperPhysicsToBrushResponse(base, kind);
}

/**
 * Rank helper for tests / UI: effective granulation strength on a given paper.
 */
export function resolveStudioPaperBrushEffectiveGranulation(
  brushId: unknown,
  paperKind?: PaperGrainKind | unknown,
): number {
  const response = resolveStudioPaperBrushResponse(brushId, paperKind);
  return response.granulation * (1 - response.staining);
}
