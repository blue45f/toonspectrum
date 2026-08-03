import {
  WARDROBE_FIT_MAX,
  WARDROBE_FIT_MIN,
  WARDROBE_SLOTS,
  sanitizeWardrobeMetrics,
  wardrobeItemById,
  type WardrobeGarmentRegion,
  type WardrobeMetrics,
  type WardrobeSlot,
  type WardrobeState,
} from "./studio-vrm-wardrobe";

export type StudioVrmGarmentFitStatus = "ready" | "warning" | "unavailable";

export type StudioVrmGarmentFitIssueCode =
  | "metric-fallback"
  | "body-clearance"
  | "layer-clearance"
  | "auto-adjusted";

export interface StudioVrmGarmentFitIssue {
  code: StudioVrmGarmentFitIssueCode;
  severity: "info" | "warning";
  slots: readonly WardrobeSlot[];
  regions: readonly WardrobeGarmentRegion[];
  message: string;
  estimatedPenetrationM: number;
  suggestedFit?: number;
}

export interface StudioVrmGarmentSlotFit {
  slot: WardrobeSlot;
  itemId: string;
  authoredFit: number;
  suggestedFit: number;
  effectiveFit: number;
  referenceRadiusM: number;
  estimatedBodyClearanceM: number;
  autoAdjustmentM: number;
}

export interface StudioVrmGarmentFitReport {
  status: StudioVrmGarmentFitStatus;
  metricSource: WardrobeMetrics["source"] | "unavailable";
  signature: string;
  slots: Partial<Record<WardrobeSlot, StudioVrmGarmentSlotFit>>;
  issues: readonly StudioVrmGarmentFitIssue[];
  autoAdjusted: boolean;
  maxEstimatedPenetrationM: number;
}

export interface StudioVrmGarmentEvaluationReceipt {
  kind: "studio-vrm-garment-evaluation-receipt";
  version: 1;
  solver: "analytic-layer-fit-v1";
  modelId: string;
  poseSignature: string;
  inputSignature: string;
  generation: number;
  status: StudioVrmGarmentFitStatus;
  maxEstimatedPenetrationM: number;
  issues: readonly StudioVrmGarmentFitIssue[];
}

const EPSILON_M = 0.00025;

function clampFit(value: number): number {
  return Math.min(WARDROBE_FIT_MAX, Math.max(WARDROBE_FIT_MIN, value));
}

function round(value: number, places = 6): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function intersectRegions(
  a: readonly WardrobeGarmentRegion[],
  b: readonly WardrobeGarmentRegion[],
): WardrobeGarmentRegion[] {
  const bSet = new Set(b);
  return a.filter((region) => bSet.has(region));
}

function referenceRadiusM(slot: WardrobeSlot, metrics: WardrobeMetrics): number {
  const average = (left: number, right: number) => (left + right) / 2;
  switch (slot) {
    case "outer":
    case "top":
      return Math.max(metrics.shoulderW * 0.56, metrics.hipW * 0.95, 0.08);
    case "bottom":
      return Math.max(
        metrics.hipW * 0.95,
        average(metrics.upperLeg.left.len, metrics.upperLeg.right.len) * 0.175,
        0.065,
      );
    case "shoes":
      return Math.max(
        metrics.ankleH,
        average(metrics.lowerLeg.left.len, metrics.lowerLeg.right.len) * 0.1,
        0.04,
      );
  }
}

function formatMillimetres(valueM: number): string {
  return `${Math.max(1, Math.round(valueM * 1000))}mm`;
}

function hashSignature(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildStudioVrmGarmentFitInputSignature(
  wardrobe: WardrobeState,
  metricsRaw: WardrobeMetrics | null | undefined,
): string {
  const metrics = metricsRaw ? sanitizeWardrobeMetrics(metricsRaw) : null;
  const slots = WARDROBE_SLOTS.flatMap((slot) => {
    const equip = wardrobe[slot];
    return equip
      ? [{ slot, itemId: equip.itemId, fit: round(equip.fit), fitMode: equip.fitMode }]
      : [];
  });
  const payload = metrics
    ? {
        source: metrics.source,
        shoulderW: round(metrics.shoulderW),
        hipW: round(metrics.hipW),
        hipsToSpine: round(metrics.hipsToSpine),
        spineToNeck: round(metrics.spineToNeck),
        ankleH: round(metrics.ankleH),
        upperArm: [round(metrics.upperArm.left.len), round(metrics.upperArm.right.len)],
        upperLeg: [round(metrics.upperLeg.left.len), round(metrics.upperLeg.right.len)],
        lowerLeg: [round(metrics.lowerLeg.left.len), round(metrics.lowerLeg.right.len)],
        slots,
      }
    : { source: "unavailable", slots };
  return `garfit1:${hashSignature(JSON.stringify(payload))}`;
}

/**
 * Resolves a deterministic, non-destructive fit plan. Auto mode changes only the rendered shell;
 * authored fit values remain untouched until the user explicitly applies a suggestion.
 */
export function inspectStudioVrmGarmentFit(
  wardrobe: WardrobeState,
  metricsRaw: WardrobeMetrics | null | undefined,
): StudioVrmGarmentFitReport {
  const signature = buildStudioVrmGarmentFitInputSignature(wardrobe, metricsRaw);
  if (!metricsRaw) {
    return {
      status: "unavailable",
      metricSource: "unavailable",
      signature,
      slots: {},
      issues: [],
      autoAdjusted: false,
      maxEstimatedPenetrationM: 0,
    };
  }

  const metrics = sanitizeWardrobeMetrics(metricsRaw);
  const candidates = WARDROBE_SLOTS.flatMap((slot) => {
    const equip = wardrobe[slot];
    const item = equip ? wardrobeItemById(equip.itemId) : undefined;
    if (!equip || !item || item.slot !== slot) return [];
    const radius = referenceRadiusM(slot, metrics);
    const bodyClearance = item.fitProfile.baseBodyClearanceM + (equip.fit - 1) * radius;
    const bodyShortfall = Math.max(0, item.fitProfile.motionAllowanceM - bodyClearance);
    return [{
      slot,
      equip,
      item,
      radius,
      suggestedFit: clampFit(equip.fit + bodyShortfall / radius),
    }];
  });

  // Higher-ranked garments must clear every lower-ranked garment in the same anatomical region.
  const ordered = [...candidates].sort((a, b) => (
    a.item.fitProfile.layerRank - b.item.fitProfile.layerRank
    || WARDROBE_SLOTS.indexOf(a.slot) - WARDROBE_SLOTS.indexOf(b.slot)
  ));
  for (const outer of ordered) {
    for (const inner of ordered) {
      if (inner === outer || inner.item.fitProfile.layerRank >= outer.item.fitProfile.layerRank) continue;
      if (intersectRegions(outer.item.fitProfile.regions, inner.item.fitProfile.regions).length === 0) continue;
      const innerEnvelope = inner.item.fitProfile.baseBodyClearanceM
        + (inner.suggestedFit - 1) * inner.radius;
      const outerEnvelope = outer.item.fitProfile.baseBodyClearanceM
        + (outer.suggestedFit - 1) * outer.radius;
      const shortfall = Math.max(
        0,
        outer.item.fitProfile.layerClearanceM - (outerEnvelope - innerEnvelope),
      );
      outer.suggestedFit = clampFit(outer.suggestedFit + shortfall / outer.radius);
    }
  }

  const slots: StudioVrmGarmentFitReport["slots"] = {};
  for (const candidate of candidates) {
    const effectiveFit = candidate.equip.fitMode === "auto"
      ? candidate.suggestedFit
      : candidate.equip.fit;
    const estimatedBodyClearanceM = candidate.item.fitProfile.baseBodyClearanceM
      + (effectiveFit - 1) * candidate.radius;
    slots[candidate.slot] = {
      slot: candidate.slot,
      itemId: candidate.equip.itemId,
      authoredFit: round(candidate.equip.fit),
      suggestedFit: round(candidate.suggestedFit),
      effectiveFit: round(effectiveFit),
      referenceRadiusM: round(candidate.radius),
      estimatedBodyClearanceM: round(estimatedBodyClearanceM),
      autoAdjustmentM: round(Math.max(0, (effectiveFit - candidate.equip.fit) * candidate.radius)),
    };
  }

  const issues: StudioVrmGarmentFitIssue[] = [];
  if (metrics.source !== "raw-rig" && candidates.length > 0) {
    issues.push({
      code: "metric-fallback",
      severity: "warning",
      slots: candidates.map((candidate) => candidate.slot),
      regions: [],
      message: metrics.source === "partial-rig"
        ? "이 VRM은 일부 휴머노이드 본이 없어 읽을 수 있는 체형과 안전 기준값을 함께 사용했습니다."
        : "이 VRM은 체형 치수를 읽지 못해 안전 기준값으로 맞췄습니다.",
      estimatedPenetrationM: 0,
    });
  }

  for (const candidate of candidates) {
    const resolved = slots[candidate.slot];
    if (!resolved) continue;
    const bodyShortfall = Math.max(
      0,
      candidate.item.fitProfile.motionAllowanceM - resolved.estimatedBodyClearanceM,
    );
    if (bodyShortfall > EPSILON_M) {
      issues.push({
        code: "body-clearance",
        severity: "warning",
        slots: [candidate.slot],
        regions: candidate.item.fitProfile.regions,
        message: `${candidate.item.label}이 몸에 ${formatMillimetres(bodyShortfall)} 정도 가까워 관절을 크게 굽히면 겹칠 수 있습니다.`,
        estimatedPenetrationM: round(bodyShortfall),
        suggestedFit: round(candidate.suggestedFit),
      });
    }
    if (resolved.autoAdjustmentM > EPSILON_M) {
      issues.push({
        code: "auto-adjusted",
        severity: "info",
        slots: [candidate.slot],
        regions: candidate.item.fitProfile.regions,
        message: `${candidate.item.label}에 ${formatMillimetres(resolved.autoAdjustmentM)}의 안전 여유를 자동 적용했습니다.`,
        estimatedPenetrationM: 0,
        suggestedFit: resolved.suggestedFit,
      });
    }
  }

  for (const outer of ordered) {
    const outerResolved = slots[outer.slot];
    if (!outerResolved) continue;
    for (const inner of ordered) {
      if (inner === outer || inner.item.fitProfile.layerRank >= outer.item.fitProfile.layerRank) continue;
      const regions = intersectRegions(outer.item.fitProfile.regions, inner.item.fitProfile.regions);
      if (regions.length === 0) continue;
      const innerResolved = slots[inner.slot];
      if (!innerResolved) continue;
      const innerEnvelope = inner.item.fitProfile.baseBodyClearanceM
        + (innerResolved.effectiveFit - 1) * inner.radius;
      const outerEnvelope = outer.item.fitProfile.baseBodyClearanceM
        + (outerResolved.effectiveFit - 1) * outer.radius;
      const shortfall = Math.max(
        0,
        outer.item.fitProfile.layerClearanceM - (outerEnvelope - innerEnvelope),
      );
      if (shortfall <= EPSILON_M) continue;
      issues.push({
        code: "layer-clearance",
        severity: "warning",
        slots: [inner.slot, outer.slot],
        regions,
        message: `${inner.item.label}과 ${outer.item.label} 사이 여유가 ${formatMillimetres(shortfall)} 부족합니다. 겉 의상을 자동 맞춤으로 바꿔 주세요.`,
        estimatedPenetrationM: round(shortfall),
        suggestedFit: round(outer.suggestedFit),
      });
    }
  }

  const maxEstimatedPenetrationM = issues.reduce(
    (max, issue) => Math.max(max, issue.estimatedPenetrationM),
    0,
  );
  return {
    status: issues.some((issue) => issue.severity === "warning") ? "warning" : "ready",
    metricSource: metrics.source,
    signature,
    slots,
    issues,
    autoAdjusted: Object.values(slots).some((slot) => (slot?.autoAdjustmentM ?? 0) > EPSILON_M),
    maxEstimatedPenetrationM: round(maxEstimatedPenetrationM),
  };
}

export function createStudioVrmGarmentEvaluationReceipt(input: {
  modelId: string;
  poseSignature: string;
  generation: number;
  report: StudioVrmGarmentFitReport;
}): StudioVrmGarmentEvaluationReceipt {
  return {
    kind: "studio-vrm-garment-evaluation-receipt",
    version: 1,
    solver: "analytic-layer-fit-v1",
    modelId: input.modelId,
    poseSignature: input.poseSignature,
    inputSignature: input.report.signature,
    generation: Math.max(0, Math.trunc(input.generation)),
    status: input.report.status,
    maxEstimatedPenetrationM: input.report.maxEstimatedPenetrationM,
    issues: input.report.issues.map((issue) => ({
      ...issue,
      slots: [...issue.slots],
      regions: [...issue.regions],
    })),
  };
}
