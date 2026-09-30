import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { productionProcessKey, type ProductionMatrixCell } from "./production-manuscript-competitive-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";
import type { StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";


// ── C-6: 에피소드 공정 커스텀 단계 (데이터 모델) ──────────────────────────────
// 기본 콘티→선화→채색→식자 공정을 팀별로 커스텀한다. 공정 키는 productionProcessKey와
// 매칭되며, 컬럼 순서·표시 여부·기본 담당자·마감일 규칙·건너뛰기 규칙을 지원한다.
// 렌더링은 건드리지 않고 컬럼 구성과 셀 필터링 같은 데이터 로직만 제공한다.

/** 공정을 건너뛰는 규칙. 에피소드 플랜의 회차 번호·대사 밀도를 기준으로 평가한다. */
export type ProductionProcessStageSkipRule =
  | { readonly mode: "never" }
  | { readonly mode: "episode-numbers"; readonly episodeNumbers: readonly number[] }
  | { readonly mode: "dialogue-density"; readonly densities: readonly ("low" | "medium" | "high")[] };

/** 팀별 공정 단계 설정. */
export interface ProductionProcessStageCustomization {
  /** productionProcessKey() 결과와 매칭되는 공정 키. */
  readonly key: string;
  /** 매트릭스 컬럼 라벨. */
  readonly label: string;
  /** 컬럼 순서. 작을수록 앞에 배치된다. */
  readonly order: number;
  /** false면 매트릭스 컬럼에서 숨긴다. */
  readonly visible: boolean;
  /** 신규 업무 생성 시 시드되는 기본 담당자 assignment id. */
  readonly defaultAssignmentId: string | null;
  /** 마감일 규칙: 기준일로부터 며칠 전에 마감하는지. null이면 규칙 없음. */
  readonly defaultDueOffsetDays: number | null;
  readonly skipRule: ProductionProcessStageSkipRule;
}

/** 부분 오버라이드 입력. key만 필수이며, 생략된 항목은 기본값을 유지한다. */
export interface ProductionProcessStageCustomizationInput {
  readonly key: string;
  readonly label?: string;
  readonly order?: number;
  readonly visible?: boolean;
  readonly defaultAssignmentId?: string | null;
  readonly defaultDueOffsetDays?: number | null;
  readonly skipRule?: ProductionProcessStageSkipRule;
}

/** 기본 공정: 콘티→선화→채색→식자. "color"는 별도 원고 종류가 없는 팀 정의 단계다. */
export const DEFAULT_PRODUCTION_PROCESS_STAGES: readonly ProductionProcessStageCustomization[] = Object.freeze([
  { key: "storyboard", label: "콘티", order: 0, visible: true, defaultAssignmentId: null, defaultDueOffsetDays: null, skipRule: { mode: "never" } },
  { key: "drawing", label: "선화", order: 1, visible: true, defaultAssignmentId: null, defaultDueOffsetDays: null, skipRule: { mode: "never" } },
  { key: "color", label: "채색", order: 2, visible: true, defaultAssignmentId: null, defaultDueOffsetDays: null, skipRule: { mode: "never" } },
  { key: "lettering", label: "식자", order: 3, visible: true, defaultAssignmentId: null, defaultDueOffsetDays: null, skipRule: { mode: "never" } },
]);

const NEVER_SKIP: ProductionProcessStageSkipRule = { mode: "never" };

function normalizeProductionStageSkipRule(
  rule: ProductionProcessStageSkipRule | undefined,
): ProductionProcessStageSkipRule {
  if (!rule || rule.mode === "never") return NEVER_SKIP;
  if (rule.mode === "episode-numbers") {
    const episodeNumbers = Object.freeze([...new Set(rule.episodeNumbers
      .filter((value) => Number.isInteger(value) && value > 0))].sort((left, right) => left - right));
    return episodeNumbers.length > 0 ? { mode: "episode-numbers", episodeNumbers } : NEVER_SKIP;
  }
  if (rule.mode === "dialogue-density") {
    const densities = Object.freeze(rule.densities
      .filter((value): value is "low" | "medium" | "high" =>
        value === "low" || value === "medium" || value === "high"));
    return densities.length > 0 ? { mode: "dialogue-density", densities } : NEVER_SKIP;
  }
  return NEVER_SKIP;
}

/**
 * 팀 커스텀을 기본 공정 위에 병합해 순서대로 정렬된 단계 목록을 만든다.
 * 기본에 없는 key는 커스텀 단계로 뒤에 추가된다.
 */
export function resolveProductionProcessStages(
  customizations: readonly ProductionProcessStageCustomizationInput[] = [],
): readonly ProductionProcessStageCustomization[] {
  const merged = new Map<string, ProductionProcessStageCustomization>();
  for (const stage of DEFAULT_PRODUCTION_PROCESS_STAGES) merged.set(stage.key, stage);
  for (const input of customizations) {
    const key = input.key.trim();
    if (!key) continue;
    const base: ProductionProcessStageCustomization = merged.get(key) ?? {
      key, label: key, order: Number.MAX_SAFE_INTEGER, visible: true,
      defaultAssignmentId: null, defaultDueOffsetDays: null, skipRule: NEVER_SKIP,
    };
    const order = typeof input.order === "number" && Number.isFinite(input.order) ? input.order : base.order;
    const defaultDueOffsetDays = input.defaultDueOffsetDays === undefined
      ? base.defaultDueOffsetDays
      : (typeof input.defaultDueOffsetDays === "number"
        && Number.isFinite(input.defaultDueOffsetDays)
        && input.defaultDueOffsetDays >= 0 ? input.defaultDueOffsetDays : null);
    merged.set(key, {
      key,
      label: input.label?.trim() || base.label,
      order,
      visible: input.visible ?? base.visible,
      defaultAssignmentId: input.defaultAssignmentId === undefined
        ? base.defaultAssignmentId
        : (input.defaultAssignmentId?.trim() ? input.defaultAssignmentId : null),
      defaultDueOffsetDays,
      skipRule: normalizeProductionStageSkipRule(input.skipRule ?? base.skipRule),
    });
  }
  return Object.freeze([...merged.values()]
    .sort((left, right) => left.order - right.order || left.key.localeCompare(right.key, "ko")));
}

/** 건너뛰기 규칙을 에피소드 기준으로 평가한다. 프로젝트 공통 셀(episode null)은 건너뛰지 않는다. */
export function isProductionStageSkippedForEpisode(
  rule: ProductionProcessStageSkipRule,
  episode: { readonly episodeNumber: number; readonly dialogueDensity: "low" | "medium" | "high" } | null,
): boolean {
  if (!episode || rule.mode === "never") return false;
  if (rule.mode === "episode-numbers") return rule.episodeNumbers.includes(episode.episodeNumber);
  return rule.densities.includes(episode.dialogueDensity);
}

/** 건너뛰기 규칙에 걸리거나 숨김 처리된 단계의 셀을 매트릭스에서 제외한다. */
export function filterProductionMatrixCellsByStageRules(params: {
  readonly aggregate: ProductionProjectAggregate;
  readonly cells: readonly ProductionMatrixCell[];
  readonly stages: readonly ProductionProcessStageCustomization[];
}): readonly ProductionMatrixCell[] {
  const stageByKey = new Map(params.stages.map((stage) => [stage.key, stage]));
  const planByEpisodeId = new Map(params.aggregate.episodePlans.map((plan) => [plan.episodeId, plan]));
  return Object.freeze(params.cells.filter((cell) => {
    const stage = stageByKey.get(productionProcessKey(cell.process));
    if (!stage) return true;
    if (!stage.visible) return false;
    const plan = cell.episodeId ? planByEpisodeId.get(cell.episodeId) ?? null : null;
    return !isProductionStageSkippedForEpisode(
      stage.skipRule,
      plan ? { episodeNumber: plan.episodeNumber, dialogueDensity: plan.dialogueDensity } : null,
    );
  }));
}

export interface ProductionProcessMatrixColumn {
  readonly key: string;
  readonly label: string;
}

/**
 * 매트릭스 컬럼을 단계 설정 기준으로 동적 구성한다.
 * 표시 단계(order 순) 다음에, 설정에 전혀 없는 관측 공정을 기존 라벨로 뒤에 붙여
 * 셀이 사라지지 않게 한다. 설정에서 숨김 처리된 단계는 다시 붙이지 않는다.
 */
export function buildProductionProcessColumns(params: {
  readonly cells: readonly ProductionMatrixCell[];
  readonly stages: readonly ProductionProcessStageCustomization[];
}): readonly ProductionProcessMatrixColumn[] {
  const columns: ProductionProcessMatrixColumn[] = [];
  const seen = new Set<string>();
  const configuredKeys = new Set(params.stages.map((stage) => stage.key));
  for (const stage of params.stages) {
    if (!stage.visible || seen.has(stage.key)) continue;
    seen.add(stage.key);
    columns.push({ key: stage.key, label: stage.label });
  }
  for (const cell of params.cells) {
    const key = productionProcessKey(cell.process);
    if (seen.has(key) || configuredKeys.has(key)) continue;
    seen.add(key);
    columns.push({ key, label: cell.process.label });
  }
  return Object.freeze(columns);
}

/** 공정의 기본 담당자 assignment id를 찾는다. */
export function productionStageDefaultAssignmentId(
  stages: readonly ProductionProcessStageCustomization[],
  processKey: string,
): string | null {
  return stages.find((stage) => stage.key === processKey)?.defaultAssignmentId ?? null;
}

/**
 * C-4: 공정의 리비전 기록을 검수 제출(submission) 기준 차수로 나눈다.
 * - 제출 리비전을 만날 때마다 새 차수가 시작되고, 그 제출 리비전은 새 차수에 속한다.
 * - 마지막 제출 뒤에 남은 리비전은 "수정본" 차수, 제출이 한 번도 없으면 "작업 중" 차수가 된다.
 * - 리비전이 없으면 빈 배열을 반환한다.
 */
export interface ProductionProcessRound {
  readonly index: number;
  readonly label: string;
  readonly kind: "submitted" | "working";
  readonly submission: StudioRevisionRecord | null;
  readonly head: StudioRevisionRecord | null;
  readonly revisionCount: number;
  readonly submittedAt: string | null;
  readonly approved: boolean;
}

export function deriveProductionProcessRounds(
  process: ProductionManuscriptProcess,
): readonly ProductionProcessRound[] {
  const revisions = [...process.revisions].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  if (!revisions.length) return Object.freeze([]);
  const rounds: ProductionProcessRound[] = [];
  let bucket: StudioRevisionRecord[] = [];
  let submittedCount = 0;
  const flushBucket = (kind: "submitted" | "working", submission: StudioRevisionRecord | null) => {
    if (!bucket.length) return;
    const label = kind === "submitted"
      ? `${submittedCount + 1}차`
      : (submittedCount > 0 ? "수정본" : "작업 중");
    const index = kind === "submitted" ? submittedCount : -1;
    if (kind === "submitted") submittedCount += 1;
    rounds.push(Object.freeze({
      index,
      label,
      kind,
      submission,
      head: bucket[bucket.length - 1] ?? null,
      revisionCount: bucket.length,
      submittedAt: submission?.createdAt ?? null,
      approved: bucket.some((revision) => revision.kind === "approved"),
    }));
    bucket = [];
  };
  for (const revision of revisions) {
    bucket.push(revision);
    if (revision.kind === "submission") flushBucket("submitted", revision);
  }
  flushBucket("working", null);
  return Object.freeze(rounds);
}

export interface ProductionProcessCompareColumn {
  readonly processKey: string;
  readonly processLabel: string;
  readonly roundLabel: string;
  readonly roundKind: "submitted" | "working";
}

/**
 * C-4: 차수 비교 모드의 (공정 × 차수) 독립 컬럼을 구성한다.
 * 표시 단계 순서대로 공정을 나열하고, 각 공정 아래에 관측된 차수 라벨을
 * 제출 차수 → 작업 중 차수 순으로 둔다. 숨긴 단계는 제외한다.
 */
export function buildProductionCompareColumns(params: {
  readonly cells: readonly ProductionMatrixCell[];
  readonly stages: readonly ProductionProcessStageCustomization[];
}): readonly ProductionProcessCompareColumn[] {
  const stageByKey = new Map(params.stages.map((stage) => [stage.key, stage]));
  const orderedKeys: string[] = [];
  for (const stage of params.stages) {
    if (!stage.visible || orderedKeys.includes(stage.key)) continue;
    orderedKeys.push(stage.key);
  }
  const configuredKeys = new Set(params.stages.map((stage) => stage.key));
  for (const cell of params.cells) {
    const key = productionProcessKey(cell.process);
    if (configuredKeys.has(key) || orderedKeys.includes(key)) continue;
    orderedKeys.push(key);
  }
  const columns: ProductionProcessCompareColumn[] = [];
  for (const key of orderedKeys) {
    const stage = stageByKey.get(key);
    const processLabel = stage?.label
      ?? params.cells.find((cell) => productionProcessKey(cell.process) === key)?.process.label
      ?? key;
    const roundOrder = new Map<string, { readonly kind: "submitted" | "working"; readonly order: number }>();
    for (const cell of params.cells) {
      if (productionProcessKey(cell.process) !== key) continue;
      for (const round of deriveProductionProcessRounds(cell.process)) {
        if (!roundOrder.has(round.label)) {
          roundOrder.set(round.label, {
            kind: round.kind,
            order: round.kind === "submitted" ? round.index : Number.MAX_SAFE_INTEGER,
          });
        }
      }
    }
    const orderedRounds = [...roundOrder.entries()]
      .sort((left, right) => left[1].order - right[1].order || left[0].localeCompare(right[0], "ko"));
    for (const [roundLabel, meta] of orderedRounds) {
      columns.push({ processKey: key, processLabel, roundLabel, roundKind: meta.kind });
    }
  }
  return Object.freeze(columns);
}

const DAY_MS = 86_400_000;

/**
 * 마감일 규칙을 평가한다: anchorIso(기준일)로부터 defaultDueOffsetDays일 전을 ISO로 반환.
 * 앵커(예: 회차 공개일)는 aggregate에 없으므로 호출자가 전달한다.
 */
export function resolveProductionStageDueDate(
  stage: Pick<ProductionProcessStageCustomization, "defaultDueOffsetDays">,
  anchorIso: string,
): string | null {
  if (stage.defaultDueOffsetDays == null) return null;
  const anchor = new Date(anchorIso).getTime();
  if (!Number.isFinite(anchor)) return null;
  return new Date(anchor - stage.defaultDueOffsetDays * DAY_MS).toISOString();
}
