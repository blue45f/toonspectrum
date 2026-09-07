export const STUDIO_3D_ASSET_QUALITY_PASSPORT_SCHEMA =
  "toonspectrum.studio-3d-asset-quality-passport" as const;
export const STUDIO_3D_ASSET_QUALITY_PASSPORT_VERSION = 1 as const;

export const STUDIO_3D_QUALITY_DIMENSIONS = [
  "silhouetteAnatomy",
  "faceExpression",
  "rigDeformation",
  "hairClothing",
  "materialsRendering",
  "editabilityCompatibility",
  "runtimePerformance",
  "rightsProvenance",
] as const;
export type Studio3dQualityDimension =
  (typeof STUDIO_3D_QUALITY_DIMENSIONS)[number];

export const STUDIO_3D_QUALITY_DIMENSION_WEIGHTS: Readonly<
  Record<Studio3dQualityDimension, number>
> = Object.freeze({
  silhouetteAnatomy: 15,
  faceExpression: 15,
  rigDeformation: 20,
  hairClothing: 15,
  materialsRendering: 10,
  editabilityCompatibility: 10,
  runtimePerformance: 10,
  rightsProvenance: 5,
});

export const STUDIO_3D_QUALITY_GRADES = [
  "s_hero",
  "a_production",
  "b_background",
  "quarantine",
] as const;
export type Studio3dQualityGrade = (typeof STUDIO_3D_QUALITY_GRADES)[number];
export type Studio3dPublishableQualityGrade = Exclude<
  Studio3dQualityGrade,
  "quarantine"
>;

export const STUDIO_3D_QUALITY_GRADE_MINIMUM_SCORES: Readonly<
  Record<Studio3dQualityGrade, number>
> = Object.freeze({
  s_hero: 92,
  a_production: 85,
  b_background: 75,
  quarantine: 0,
});

export const STUDIO_3D_RUNTIME_PROFILES = [
  "source_master",
  "r3_hero",
  "r2_standard",
  "r1_mobile",
  "r0_crowd",
] as const;
export type Studio3dRuntimeProfile =
  (typeof STUDIO_3D_RUNTIME_PROFILES)[number];

export interface Studio3dRuntimeBudget {
  readonly publishable: boolean;
  readonly maximumTriangles: number | null;
  readonly maximumDrawCalls: number | null;
  readonly maximumMaterialSlots: number | null;
  readonly maximumTransparentDrawCalls: number | null;
  readonly maximumTextureMemoryMiB: number | null;
  readonly maximumTextureDimension: number | null;
  readonly maximumMorphTargets: number | null;
  readonly maximumSkeletonBones: number | null;
  readonly maximumVertexInfluences: number | null;
}

export const STUDIO_3D_RUNTIME_BUDGETS: Readonly<
  Record<Studio3dRuntimeProfile, Studio3dRuntimeBudget>
> = Object.freeze({
  source_master: Object.freeze({
    publishable: false,
    maximumTriangles: null,
    maximumDrawCalls: null,
    maximumMaterialSlots: null,
    maximumTransparentDrawCalls: null,
    maximumTextureMemoryMiB: null,
    maximumTextureDimension: null,
    maximumMorphTargets: null,
    maximumSkeletonBones: null,
    maximumVertexInfluences: null,
  }),
  r3_hero: Object.freeze({
    publishable: true,
    maximumTriangles: 140_000,
    maximumDrawCalls: 20,
    maximumMaterialSlots: 16,
    maximumTransparentDrawCalls: 8,
    maximumTextureMemoryMiB: 192,
    maximumTextureDimension: 4_096,
    maximumMorphTargets: 250,
    maximumSkeletonBones: 256,
    maximumVertexInfluences: 4,
  }),
  r2_standard: Object.freeze({
    publishable: true,
    maximumTriangles: 80_000,
    maximumDrawCalls: 14,
    maximumMaterialSlots: 12,
    maximumTransparentDrawCalls: 6,
    maximumTextureMemoryMiB: 96,
    maximumTextureDimension: 2_048,
    maximumMorphTargets: 120,
    maximumSkeletonBones: 160,
    maximumVertexInfluences: 4,
  }),
  r1_mobile: Object.freeze({
    publishable: true,
    maximumTriangles: 40_000,
    maximumDrawCalls: 10,
    maximumMaterialSlots: 8,
    maximumTransparentDrawCalls: 4,
    maximumTextureMemoryMiB: 48,
    maximumTextureDimension: 1_024,
    maximumMorphTargets: 60,
    maximumSkeletonBones: 128,
    maximumVertexInfluences: 4,
  }),
  r0_crowd: Object.freeze({
    publishable: true,
    maximumTriangles: 15_000,
    maximumDrawCalls: 5,
    maximumMaterialSlots: 4,
    maximumTransparentDrawCalls: 2,
    maximumTextureMemoryMiB: 24,
    maximumTextureDimension: 1_024,
    maximumMorphTargets: 16,
    maximumSkeletonBones: 96,
    maximumVertexInfluences: 4,
  }),
});

export const STUDIO_3D_MINIMUM_GRADE_BY_RUNTIME_PROFILE: Readonly<
  Record<Studio3dRuntimeProfile, Studio3dPublishableQualityGrade>
> = Object.freeze({
  source_master: "s_hero",
  r3_hero: "s_hero",
  r2_standard: "a_production",
  r1_mobile: "b_background",
  r0_crowd: "b_background",
});

export const STUDIO_3D_MINIMUM_STRESS_POSES_BY_RUNTIME_PROFILE: Readonly<
  Record<Studio3dRuntimeProfile, number>
> = Object.freeze({
  source_master: 0,
  r3_hero: 40,
  r2_standard: 32,
  r1_mobile: 24,
  r0_crowd: 8,
});

export const STUDIO_3D_MINIMUM_RENDER_VIEWS_BY_RUNTIME_PROFILE: Readonly<
  Record<Studio3dRuntimeProfile, number>
> = Object.freeze({
  source_master: 0,
  r3_hero: 24,
  r2_standard: 24,
  r1_mobile: 12,
  r0_crowd: 8,
});

export const STUDIO_3D_QUALITY_HARD_FAILURES = [
  "face_parts_exposed",
  "severe_mesh_collapse",
  "excessive_penetration",
  "invalid_bind_pose",
  "missing_required_material_or_texture",
  "missing_rights_or_provenance",
  "unsafe_content_detected",
  "runtime_budget_exceeded",
  "stress_pose_failures",
  "render_qa_incomplete",
  "source_master_not_publishable",
] as const;
export type Studio3dQualityHardFailure =
  (typeof STUDIO_3D_QUALITY_HARD_FAILURES)[number];

export interface Studio3dRuntimeMetrics {
  readonly triangles: number;
  readonly drawCalls: number;
  readonly materialSlots: number;
  readonly transparentDrawCalls: number;
  readonly textureMemoryMiB: number;
  readonly maximumTextureDimension: number;
  readonly morphTargets: number;
  readonly skeletonBones: number;
  readonly maximumVertexInfluences: number;
}

export type Studio3dRuntimeMetricName = keyof Studio3dRuntimeMetrics;

export interface Studio3dRuntimeBudgetViolation {
  readonly metric: Studio3dRuntimeMetricName;
  readonly actual: number;
  readonly limit: number;
}

export interface Studio3dStressPoseSummary {
  readonly tested: number;
  readonly passed: number;
  readonly deformationFailures: number;
  readonly penetrationFailures: number;
}

export interface Studio3dRenderQaSummary {
  readonly expectedViews: number;
  readonly renderedViews: number;
  readonly browserRenderVerified: boolean;
  readonly visualRegressionApproved: boolean;
}

export interface Studio3dAssetQualityPassportBuildInput {
  readonly assetId: string;
  readonly assetVersion: string;
  readonly runtimeProfile: Studio3dRuntimeProfile;
  readonly dimensionScores: Readonly<Record<Studio3dQualityDimension, number>>;
  readonly runtimeMetrics: Studio3dRuntimeMetrics;
  readonly stressPose: Studio3dStressPoseSummary;
  readonly renderQa: Studio3dRenderQaSummary;
  readonly evaluatedAt: string;
  readonly evaluator: string;
  readonly hardFailures?: readonly Studio3dQualityHardFailure[];
}

export interface Studio3dAssetQualityPassport {
  readonly schema: typeof STUDIO_3D_ASSET_QUALITY_PASSPORT_SCHEMA;
  readonly version: typeof STUDIO_3D_ASSET_QUALITY_PASSPORT_VERSION;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly runtimeProfile: Studio3dRuntimeProfile;
  readonly minimumGrade: Studio3dPublishableQualityGrade;
  readonly dimensionScores: Readonly<Record<Studio3dQualityDimension, number>>;
  readonly weightedScore: number;
  readonly grade: Studio3dQualityGrade;
  readonly runtimeMetrics: Studio3dRuntimeMetrics;
  readonly runtimeBudget: Studio3dRuntimeBudget;
  readonly budgetViolations: readonly Studio3dRuntimeBudgetViolation[];
  readonly stressPose: Studio3dStressPoseSummary;
  readonly renderQa: Studio3dRenderQaSummary;
  readonly hardFailures: readonly Studio3dQualityHardFailure[];
  readonly readyForPublication: boolean;
  readonly evaluatedAt: string;
  readonly evaluator: string;
}

const HARD_FAILURE_SET = new Set<string>(STUDIO_3D_QUALITY_HARD_FAILURES);
const PROFILE_SET = new Set<string>(STUDIO_3D_RUNTIME_PROFILES);

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });
}

function requiredText(value: string, field: string, maximumLength: number): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > maximumLength || hasControlCharacters(normalized)) {
    throw new TypeError(`${field} 값이 올바르지 않습니다.`);
  }
  return normalized;
}

function finiteScore(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${field} 점수는 0부터 100 사이여야 합니다.`);
  }
  return Math.round(value * 100) / 100;
}

function nonNegativeNumber(value: number, field: string, integer = true): number {
  const valid = Number.isFinite(value) && value >= 0 && (!integer || Number.isSafeInteger(value));
  if (!valid) throw new RangeError(`${field} 값은 0 이상의 유한한 수여야 합니다.`);
  return value;
}

function isoTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError("evaluatedAt은 유효한 ISO 시각이어야 합니다.");
  return new Date(timestamp).toISOString();
}

function copyDimensionScores(
  scores: Readonly<Record<Studio3dQualityDimension, number>>
): Readonly<Record<Studio3dQualityDimension, number>> {
  const normalized = {} as Record<Studio3dQualityDimension, number>;
  for (const dimension of STUDIO_3D_QUALITY_DIMENSIONS) {
    normalized[dimension] = finiteScore(scores[dimension], dimension);
  }
  return Object.freeze(normalized);
}

function copyRuntimeMetrics(metrics: Studio3dRuntimeMetrics): Studio3dRuntimeMetrics {
  return Object.freeze({
    triangles: nonNegativeNumber(metrics.triangles, "triangles"),
    drawCalls: nonNegativeNumber(metrics.drawCalls, "drawCalls"),
    materialSlots: nonNegativeNumber(metrics.materialSlots, "materialSlots"),
    transparentDrawCalls: nonNegativeNumber(
      metrics.transparentDrawCalls,
      "transparentDrawCalls"
    ),
    textureMemoryMiB: nonNegativeNumber(
      metrics.textureMemoryMiB,
      "textureMemoryMiB",
      false
    ),
    maximumTextureDimension: nonNegativeNumber(
      metrics.maximumTextureDimension,
      "maximumTextureDimension"
    ),
    morphTargets: nonNegativeNumber(metrics.morphTargets, "morphTargets"),
    skeletonBones: nonNegativeNumber(metrics.skeletonBones, "skeletonBones"),
    maximumVertexInfluences: nonNegativeNumber(
      metrics.maximumVertexInfluences,
      "maximumVertexInfluences"
    ),
  });
}

function copyStressPose(summary: Studio3dStressPoseSummary): Studio3dStressPoseSummary {
  const stressPose = Object.freeze({
    tested: nonNegativeNumber(summary.tested, "stressPose.tested"),
    passed: nonNegativeNumber(summary.passed, "stressPose.passed"),
    deformationFailures: nonNegativeNumber(
      summary.deformationFailures,
      "stressPose.deformationFailures"
    ),
    penetrationFailures: nonNegativeNumber(
      summary.penetrationFailures,
      "stressPose.penetrationFailures"
    ),
  });
  if (stressPose.passed > stressPose.tested) {
    throw new RangeError("통과한 스트레스 포즈 수가 전체 테스트 수를 초과할 수 없습니다.");
  }
  return stressPose;
}

function copyRenderQa(summary: Studio3dRenderQaSummary): Studio3dRenderQaSummary {
  const renderQa = Object.freeze({
    expectedViews: nonNegativeNumber(summary.expectedViews, "renderQa.expectedViews"),
    renderedViews: nonNegativeNumber(summary.renderedViews, "renderQa.renderedViews"),
    browserRenderVerified: summary.browserRenderVerified,
    visualRegressionApproved: summary.visualRegressionApproved,
  });
  return renderQa;
}

export function calculateStudio3dWeightedQualityScore(
  scores: Readonly<Record<Studio3dQualityDimension, number>>
): number {
  const normalized = copyDimensionScores(scores);
  const total = STUDIO_3D_QUALITY_DIMENSIONS.reduce(
    (sum, dimension) => sum
      + normalized[dimension] * STUDIO_3D_QUALITY_DIMENSION_WEIGHTS[dimension],
    0
  );
  return Math.round(total) / 100;
}

export function studio3dQualityGradeForScore(score: number): Studio3dQualityGrade {
  const normalized = finiteScore(score, "weightedScore");
  if (normalized >= STUDIO_3D_QUALITY_GRADE_MINIMUM_SCORES.s_hero) return "s_hero";
  if (normalized >= STUDIO_3D_QUALITY_GRADE_MINIMUM_SCORES.a_production) {
    return "a_production";
  }
  if (normalized >= STUDIO_3D_QUALITY_GRADE_MINIMUM_SCORES.b_background) {
    return "b_background";
  }
  return "quarantine";
}

function runtimeBudgetViolations(
  metrics: Studio3dRuntimeMetrics,
  budget: Studio3dRuntimeBudget
): readonly Studio3dRuntimeBudgetViolation[] {
  const pairs: readonly [
    Studio3dRuntimeMetricName,
    keyof Omit<Studio3dRuntimeBudget, "publishable">
  ][] = [
    ["triangles", "maximumTriangles"],
    ["drawCalls", "maximumDrawCalls"],
    ["materialSlots", "maximumMaterialSlots"],
    ["transparentDrawCalls", "maximumTransparentDrawCalls"],
    ["textureMemoryMiB", "maximumTextureMemoryMiB"],
    ["maximumTextureDimension", "maximumTextureDimension"],
    ["morphTargets", "maximumMorphTargets"],
    ["skeletonBones", "maximumSkeletonBones"],
    ["maximumVertexInfluences", "maximumVertexInfluences"],
  ];
  const violations: Studio3dRuntimeBudgetViolation[] = [];
  for (const [metricName, budgetName] of pairs) {
    const limit = budget[budgetName];
    if (limit !== null && metrics[metricName] > limit) {
      violations.push(Object.freeze({
        metric: metricName,
        actual: metrics[metricName],
        limit,
      }));
    }
  }
  return Object.freeze(violations);
}

function normalizedHardFailures(
  declared: readonly Studio3dQualityHardFailure[] | undefined,
  profile: Studio3dRuntimeProfile,
  budget: Studio3dRuntimeBudget,
  violations: readonly Studio3dRuntimeBudgetViolation[],
  stressPose: Studio3dStressPoseSummary,
  renderQa: Studio3dRenderQaSummary
): readonly Studio3dQualityHardFailure[] {
  const failures = new Set<Studio3dQualityHardFailure>();
  for (const failure of declared ?? []) {
    if (!HARD_FAILURE_SET.has(failure)) throw new TypeError("알 수 없는 3D 품질 하드 실패 코드입니다.");
    failures.add(failure);
  }
  if (!budget.publishable) failures.add("source_master_not_publishable");
  if (violations.length > 0) failures.add("runtime_budget_exceeded");
  if (stressPose.tested < STUDIO_3D_MINIMUM_STRESS_POSES_BY_RUNTIME_PROFILE[profile]
    || stressPose.deformationFailures > 0
    || stressPose.passed < stressPose.tested) {
    failures.add("stress_pose_failures");
  }
  if (stressPose.penetrationFailures > 0) failures.add("excessive_penetration");
  if (renderQa.expectedViews < STUDIO_3D_MINIMUM_RENDER_VIEWS_BY_RUNTIME_PROFILE[profile]
    || renderQa.renderedViews < renderQa.expectedViews
    || !renderQa.browserRenderVerified
    || !renderQa.visualRegressionApproved) {
    failures.add("render_qa_incomplete");
  }
  return Object.freeze([...failures].sort());
}

export function buildStudio3dAssetQualityPassport(
  input: Studio3dAssetQualityPassportBuildInput
): Studio3dAssetQualityPassport {
  if (!PROFILE_SET.has(input.runtimeProfile)) {
    throw new TypeError("지원하지 않는 3D 런타임 프로필입니다.");
  }
  const dimensionScores = copyDimensionScores(input.dimensionScores);
  const runtimeMetrics = copyRuntimeMetrics(input.runtimeMetrics);
  const stressPose = copyStressPose(input.stressPose);
  const renderQa = copyRenderQa(input.renderQa);
  const runtimeBudget = STUDIO_3D_RUNTIME_BUDGETS[input.runtimeProfile];
  const budgetViolations = runtimeBudgetViolations(runtimeMetrics, runtimeBudget);
  const hardFailures = normalizedHardFailures(
    input.hardFailures,
    input.runtimeProfile,
    runtimeBudget,
    budgetViolations,
    stressPose,
    renderQa
  );
  const weightedScore = calculateStudio3dWeightedQualityScore(dimensionScores);
  const grade = studio3dQualityGradeForScore(weightedScore);
  const minimumGrade = STUDIO_3D_MINIMUM_GRADE_BY_RUNTIME_PROFILE[input.runtimeProfile];
  const readyForPublication = runtimeBudget.publishable
    && weightedScore >= STUDIO_3D_QUALITY_GRADE_MINIMUM_SCORES[minimumGrade]
    && hardFailures.length === 0;

  return Object.freeze({
    schema: STUDIO_3D_ASSET_QUALITY_PASSPORT_SCHEMA,
    version: STUDIO_3D_ASSET_QUALITY_PASSPORT_VERSION,
    assetId: requiredText(input.assetId, "assetId", 160),
    assetVersion: requiredText(input.assetVersion, "assetVersion", 160),
    runtimeProfile: input.runtimeProfile,
    minimumGrade,
    dimensionScores,
    weightedScore,
    grade,
    runtimeMetrics,
    runtimeBudget,
    budgetViolations,
    stressPose,
    renderQa,
    hardFailures,
    readyForPublication,
    evaluatedAt: isoTimestamp(input.evaluatedAt),
    evaluator: requiredText(input.evaluator, "evaluator", 80),
  });
}
