/** 이름과 분리하여 실제 촉 픽셀·입력 매핑에서 추출하는 진단 전용 근거. */
import { normalizeStudioBrushDynamicsSettings, type StudioBrushDynamicsSettings } from "./studio-brush-dynamics";
import { buildStudioBrushTipAlphaMap, sampleStudioBrushTipAlphaMap } from "./studio-brush-tip-stamp";

export interface StudioBrushTipSemanticEvidence {
  readonly custom: boolean;
  readonly directionalTip: boolean;
  readonly patternedTip: boolean;
  readonly bristleTip: boolean;
  readonly grainTip: boolean;
  readonly interiorVariation: number;
  readonly gradientAnisotropy: number;
  readonly meanInteriorCrossings: number;
  readonly rotationalDifference: number;
  /** 공간 배치를 유지하는 16×16 지문. 평균·분산이 같은 서로 다른 촉을 구분한다. */
  readonly spatialAlpha: readonly number[];
}

export function profileStudioBrushTipSemanticEvidence(
  settings: StudioBrushDynamicsSettings,
): StudioBrushTipSemanticEvidence {
  const dynamics = normalizeStudioBrushDynamicsSettings(settings);
  const map = buildStudioBrushTipAlphaMap(dynamics.tip);
  const side = 32;
  const pixels: number[] = [];
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      pixels.push(sampleStudioBrushTipAlphaMap(map,
        (x + 0.5) / side * (map.size - 1), (y + 0.5) / side * (map.size - 1)));
    }
  }
  let dx = 0, dy = 0, horizontalCrossings = 0, verticalCrossings = 0;
  let rotationalDifference = 0;
  for (let y = 4; y < side - 4; y++) {
    for (let x = 4; x < side - 4; x++) {
      const a = pixels[y * side + x]!;
      const bx = pixels[y * side + x + 1]!;
      const by = pixels[(y + 1) * side + x]!;
      dx += Math.abs(a - bx);
      dy += Math.abs(a - by);
      if ((a > 0.35) !== (bx > 0.35)) horizontalCrossings++;
      if ((a > 0.35) !== (by > 0.35)) verticalCrossings++;
      const u = (x + 0.5) / side - 0.5;
      const v = (y + 0.5) / side - 0.5;
      const rotated = sampleStudioBrushTipAlphaMap(map,
        (0.5 + (u - v) / Math.SQRT2) * (map.size - 1),
        (0.5 + (u + v) / Math.SQRT2) * (map.size - 1));
      rotationalDifference += Math.abs(a - rotated);
    }
  }
  const interiorVariation = (dx + dy) / (24 * 24 * 2);
  const gradientAnisotropy = Math.max(dx, dy) / Math.max(0.001, Math.min(dx, dy));
  const meanInteriorCrossings = Math.max(horizontalCrossings, verticalCrossings) / 24;
  rotationalDifference /= 24 * 24;
  const spatialAlpha = Array.from({ length: 256 }, (_, index) => {
    const x = index % 16 * 2, y = Math.floor(index / 16) * 2;
    return Math.round((pixels[y * side + x]! + pixels[y * side + x + 1]!
      + pixels[(y + 1) * side + x]! + pixels[(y + 1) * side + x + 1]!) * 250_000) / 1_000_000;
  });
  const mappedShape = dynamics.roundness.base < 0.9
    || dynamics.roundness.mappings.some(({ from, to }) => Math.min(from, to) < 0.9);
  return Object.freeze({
    custom: map.custom,
    directionalTip: mappedShape || rotationalDifference > 0.06,
    patternedTip: map.custom && meanInteriorCrossings >= 1 && interiorVariation > 0.06,
    bristleTip: dynamics.tip.shape === "bristle"
      || (meanInteriorCrossings >= 3 && gradientAnisotropy > 1.5),
    grainTip: dynamics.grain.amount > 0 || interiorVariation > 0.055,
    interiorVariation, gradientAnisotropy, meanInteriorCrossings, rotationalDifference,
    spatialAlpha: Object.freeze(spatialAlpha),
  });
}
