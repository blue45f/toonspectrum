import { scopeContains } from "./scope";

import type {
  ProductionProjectAggregate,
  ProductionRoleType,
  ProductionTask,
  ProductionTaskStatus,
  RoleAssignment,
} from "./types";

export const PRODUCTION_DEPARTMENT_KEYS = [
  "story",
  "storyboard",
  "line-art",
  "background",
  "color",
  "lettering",
  "localization",
  "editorial",
  "production",
  "rights",
] as const;

export type ProductionDepartmentKey = (typeof PRODUCTION_DEPARTMENT_KEYS)[number];

export interface ProductionDepartmentDefinition {
  readonly key: ProductionDepartmentKey;
  readonly label: string;
  readonly shortLabel: string;  readonly description: string;
  readonly order: number;
  readonly primaryRoleTypes: readonly ProductionRoleType[];
  readonly reviewerRoleTypes: readonly ProductionRoleType[];
  readonly processAliases: readonly string[];
  readonly defaultCompletionCriteria: readonly string[];
}

function defineDepartment(
  definition: ProductionDepartmentDefinition,
): ProductionDepartmentDefinition {
  return Object.freeze(definition);
}

export const PRODUCTION_ROLE_LABELS: Readonly<Record<ProductionRoleType, string>> = Object.freeze({
  "story-lead": "스토리 리드",
  writer: "글 작가",
  "adaptation-writer": "각색 작가",
  "storyboard-artist": "콘티 작가",
  "art-lead": "작화 리드",
  "line-artist": "선화 작가",
  colorist: "채색 작가",
  "background-artist": "배경 작가",
  letterer: "식자 담당",
  localizer: "번역·현지화",
  editor: "편집자",
  producer: "프로듀서",
  "rights-reviewer": "권리 검수",
  assistant: "작화 어시스턴트",
  vendor: "외부 파트너",
});

export const PRODUCTION_DEPARTMENTS: readonly ProductionDepartmentDefinition[] = Object.freeze([
  defineDepartment({
    key: "story",
    label: "스토리·각색",
    shortLabel: "스토리",
    description: "시놉시스, 회차 대본, 대사와 StoryLock 정본을 관리합니다.",
    order: 10,
    primaryRoleTypes: ["story-lead", "writer", "adaptation-writer"],
    reviewerRoleTypes: ["story-lead", "editor", "producer"],
    processAliases: ["story", "script", "scenario", "plot", "dialogue", "adaptation", "story-lock"],
    defaultCompletionCriteria: ["회차 의도와 정보 공개 순서 반영", "대사·복선·연속성 자체 검수", "StoryLock 입력 revision 고정"],
  }),
  defineDepartment({
    key: "storyboard",
    label: "콘티·연출",
    shortLabel: "콘티",
    description: "컷 분할, 세로 리듬, 카메라와 감정 연출을 설계합니다.",
    order: 20,
    primaryRoleTypes: ["storyboard-artist", "art-lead"],
    reviewerRoleTypes: ["art-lead", "story-lead", "editor", "producer"],
    processAliases: ["storyboard", "thumbnail", "conte", "layout", "scroll-rhythm"],
    defaultCompletionCriteria: ["전체 컷과 스크롤 리듬 배치", "대사 안전영역 확인", "핵심 정보 공개 순서 검수"],
  }),
  defineDepartment({
    key: "line-art",
    label: "캐릭터·선화",
    shortLabel: "선화",
    description: "캐릭터 작화, 펜선, 표정과 포즈의 정합성을 책임집니다.",
    order: 30,
    primaryRoleTypes: ["line-artist", "art-lead", "assistant"],
    reviewerRoleTypes: ["art-lead", "editor"],
    processAliases: ["line-art", "lineart", "inking", "pencil", "character-art", "character"],
    defaultCompletionCriteria: ["캐릭터 모델·의상 연속성 통과", "확대 기준 선 품질 확인", "배경·채색 인계 레이어 정리"],
  }),
  defineDepartment({
    key: "background",
    label: "배경·3D",
    shortLabel: "배경",
    description: "공간, 원근, 3D 블로킹과 광원 기준을 제작합니다.",
    order: 40,
    primaryRoleTypes: ["background-artist", "vendor", "assistant"],
    reviewerRoleTypes: ["art-lead", "editor", "rights-reviewer"],
    processAliases: ["background", "environment", "bg", "3d", "location", "set"],
    defaultCompletionCriteria: ["원근·광원 continuity 통과", "캐릭터와 분리된 레이어", "에셋 라이선스와 출처 첨부"],
  }),
  defineDepartment({
    key: "color",
    label: "밑색·채색",
    shortLabel: "채색",
    description: "밑색, 명암, 이펙트와 회차 색채 기준을 완성합니다.",
    order: 50,
    primaryRoleTypes: ["colorist", "art-lead", "assistant"],
    reviewerRoleTypes: ["art-lead", "editor"],
    processAliases: ["color", "colour", "coloring", "lighting", "render", "effect"],
    defaultCompletionCriteria: ["캐릭터 팔레트와 조명 기준 일치", "컷 간 색 연결 검수", "플랫폼 색공간·명암 기준 확인"],
  }),
  defineDepartment({
    key: "lettering",
    label: "식자·효과음",
    shortLabel: "식자",
    description: "말풍선, 폰트, 효과음과 읽기 순서를 편집합니다.",
    order: 60,
    primaryRoleTypes: ["letterer"],
    reviewerRoleTypes: ["editor", "story-lead", "producer"],
    processAliases: ["lettering", "typeset", "typesetting", "sfx", "balloon", "speech"],
    defaultCompletionCriteria: ["대사 정본과 텍스트 일치", "모바일 가독성과 읽기 순서 확인", "폰트·효과음 라이선스 확인"],
  }),
  defineDepartment({
    key: "localization",
    label: "번역·현지화",
    shortLabel: "현지화",
    description: "번역, 문화권별 표현과 지역별 식자 정본을 관리합니다.",
    order: 65,
    primaryRoleTypes: ["localizer", "letterer"],
    reviewerRoleTypes: ["localizer", "editor", "story-lead"],
    processAliases: ["localization", "localisation", "translation", "locale", "global"],
    defaultCompletionCriteria: ["용어집과 인물 말투 일치", "문화권별 금칙·등급 기준 확인", "역번역 또는 편집 검수 완료"],
  }),
  defineDepartment({
    key: "editorial",
    label: "편집·통합 검수",
    shortLabel: "편집",
    description: "통합 원고, 연속성, 플랫폼 규격과 공동 교정을 관리합니다.",
    order: 70,
    primaryRoleTypes: ["editor", "producer"],
    reviewerRoleTypes: ["editor", "producer", "story-lead", "art-lead", "rights-reviewer"],
    processAliases: ["editorial", "proof", "joint-proof", "quality", "qa", "integration", "review"],
    defaultCompletionCriteria: ["서사·시각·식자 통합본 비교", "플랫폼 규격과 접근성 확인", "필수 검수 lane 승인"],
  }),
  defineDepartment({
    key: "production",
    label: "제작·게시 운영",
    shortLabel: "제작",
    description: "일정, 용량, 납품, 게시 패키지와 대외 커뮤니케이션을 조정합니다.",
    order: 80,
    primaryRoleTypes: ["producer", "vendor"],
    reviewerRoleTypes: ["producer", "editor", "rights-reviewer"],
    processAliases: ["production", "publish", "publication", "delivery", "upload", "schedule", "release"],
    defaultCompletionCriteria: ["게시 후보 revision 고정", "크레딧·권리 preflight 통과", "플랫폼 업로드 패키지 검증"],
  }),
  defineDepartment({
    key: "rights",
    label: "권리·크레딧",
    shortLabel: "권리",
    description: "저작권, 외부 에셋, AI 사용, 크레딧과 계약 증빙을 검수합니다.",
    order: 90,
    primaryRoleTypes: ["rights-reviewer", "producer"],
    reviewerRoleTypes: ["rights-reviewer", "producer", "editor"],
    processAliases: ["rights", "credit", "compliance", "license", "contract", "provenance"],
    defaultCompletionCriteria: ["기여·크레딧 정합성 확인", "라이선스·AI 사용 증빙 확인", "게시·2차 이용 권리 범위 확인"],
  }),
]);const DEPARTMENT_BY_KEY = new Map(PRODUCTION_DEPARTMENTS.map((entry) => [entry.key, entry]));
const ROLE_DEPARTMENT: Readonly<Record<ProductionRoleType, ProductionDepartmentKey>> = Object.freeze({
  "story-lead": "story",
  writer: "story",
  "adaptation-writer": "story",
  "storyboard-artist": "storyboard",
  "art-lead": "line-art",
  "line-artist": "line-art",
  colorist: "color",
  "background-artist": "background",
  letterer: "lettering",
  localizer: "localization",
  editor: "editorial",
  producer: "production",
  "rights-reviewer": "rights",
  assistant: "line-art",
  vendor: "production",
});

export interface ProductionPipelineStageDefinition {
  readonly key: string;
  readonly label: string;
  readonly departmentKey: ProductionDepartmentKey;
  readonly dependsOnDepartmentKeys: readonly ProductionDepartmentKey[];
}

function definePipelineStage(
  definition: ProductionPipelineStageDefinition,
): ProductionPipelineStageDefinition {
  return Object.freeze(definition);
}

export const WEBTOON_PRODUCTION_PIPELINE: readonly ProductionPipelineStageDefinition[] = Object.freeze([
  definePipelineStage({
    key: "story-lock",
    label: "대본 잠금",
    departmentKey: "story",
    dependsOnDepartmentKeys: [],
  }),
  definePipelineStage({
    key: "storyboard",
    label: "콘티·연출",
    departmentKey: "storyboard",
    dependsOnDepartmentKeys: ["story"],
  }),
  definePipelineStage({
    key: "line-art",
    label: "캐릭터·선화",
    departmentKey: "line-art",
    dependsOnDepartmentKeys: ["storyboard"],
  }),
  definePipelineStage({
    key: "background",
    label: "배경·3D",
    departmentKey: "background",
    dependsOnDepartmentKeys: ["storyboard"],
  }),
  definePipelineStage({
    key: "color",
    label: "채색·이펙트",
    departmentKey: "color",
    dependsOnDepartmentKeys: ["line-art", "background"],
  }),
  definePipelineStage({
    key: "lettering",
    label: "식자·효과음",
    departmentKey: "lettering",
    dependsOnDepartmentKeys: ["color"],
  }),
  definePipelineStage({
    key: "joint-proof",
    label: "통합 교정",
    departmentKey: "editorial",
    dependsOnDepartmentKeys: ["lettering"],
  }),
  definePipelineStage({
    key: "publication",
    label: "게시 패키지",
    departmentKey: "production",
    dependsOnDepartmentKeys: ["editorial", "rights"],
  }),
]);

const CLOSED_TASK_STATUSES = new Set<ProductionTaskStatus>(["done", "cancelled", "out-of-scope"]);
const DEPENDENCY_COMPLETE_STATUSES = new Set<ProductionTaskStatus>(["approved", "done"]);
const REVIEW_TASK_STATUSES = new Set<ProductionTaskStatus>([
  "internal-review",
  "external-review",
  "conditionally-approved",
]);

function normalizeProcessKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[\s_]+/gu, "-");
}

export function productionDepartment(
  key: ProductionDepartmentKey,
): ProductionDepartmentDefinition {
  const definition = DEPARTMENT_BY_KEY.get(key);
  if (!definition) throw new Error(`Unknown production department: ${key}`);
  return definition;
}

export function departmentForRole(roleType: ProductionRoleType): ProductionDepartmentKey {
  return ROLE_DEPARTMENT[roleType];
}

export function inferProductionTaskDepartment(
  task: ProductionTask,
  assignments: readonly RoleAssignment[],
): ProductionDepartmentKey | null {
  const processKey = normalizeProcessKey(task.processKey);
  const aliasMatch = PRODUCTION_DEPARTMENTS.find((department) =>
    department.processAliases.some((alias) =>
      processKey === alias
      || processKey.includes(`${alias}-`)
      || processKey.includes(`-${alias}`)),
  );
  if (aliasMatch) return aliasMatch.key;

  const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const scores = new Map<ProductionDepartmentKey, number>();
  for (const assignmentId of [...task.assignmentIds, ...task.reviewerAssignmentIds]) {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment) continue;
    const key = departmentForRole(assignment.roleType);
    scores.set(key, (scores.get(key) ?? 0) + (task.assignmentIds.includes(assignmentId) ? 2 : 1));
  }
  return [...scores.entries()]
    .sort((left, right) =>
      right[1] - left[1]
      || productionDepartment(left[0]).order - productionDepartment(right[0]).order)[0]?.[0]
    ?? null;
}

function assignmentAvailable(assignment: RoleAssignment, at: string): boolean {
  if (assignment.status !== "active" && assignment.status !== "onboarding") return false;
  const instant = Date.parse(at);
  const start = Date.parse(assignment.startsAt);
  const end = assignment.endsAt ? Date.parse(assignment.endsAt) : Number.POSITIVE_INFINITY;
  return Number.isFinite(instant)
    && Number.isFinite(start)
    && start <= instant
    && instant <= end;
}

function assignmentScheduled(assignment: RoleAssignment, at: string): boolean {
  if (assignment.status !== "active" && assignment.status !== "onboarding") return false;
  const instant = Date.parse(at);
  const start = Date.parse(assignment.startsAt);
  const end = assignment.endsAt ? Date.parse(assignment.endsAt) : Number.POSITIVE_INFINITY;
  return Number.isFinite(instant)
    && Number.isFinite(start)
    && instant < start
    && instant <= end;
}

export function eligibleAssignmentsForTask(input: {
  readonly task: ProductionTask;
  readonly assignments: readonly RoleAssignment[];
  readonly departmentKey?: ProductionDepartmentKey | null;
  readonly kind: "owner" | "reviewer";
  readonly at: string;
}): readonly RoleAssignment[] {
  const departmentKey = input.departmentKey
    ?? inferProductionTaskDepartment(input.task, input.assignments);
  if (!departmentKey) return Object.freeze([]);
  const department = productionDepartment(departmentKey);
  const allowedRoles = new Set(
    input.kind === "owner" ? department.primaryRoleTypes : department.reviewerRoleTypes,
  );
  return Object.freeze(input.assignments
    .filter((assignment) =>
      assignmentAvailable(assignment, input.at)
      && allowedRoles.has(assignment.roleType)
      && scopeContains(assignment.scope, input.task.scope))
    .sort((left, right) =>
      Number(right.lead) - Number(left.lead)
      || left.startsAt.localeCompare(right.startsAt)));
}

export interface ProductionTaskGate {
  readonly taskId: string;
  readonly departmentKey: ProductionDepartmentKey | null;
  readonly missingDependencyTaskIds: readonly string[];
  readonly missingInputRevision: boolean;
  readonly missingAssignee: boolean;
  readonly missingReviewer: boolean;
  readonly missingDeliverable: boolean;
  readonly overdue: boolean;
  readonly dueSoon: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly canStart: boolean;
  readonly canRequestReview: boolean;
  readonly canApprove: boolean;
}

export function evaluateProductionTaskGate(input: {
  readonly task: ProductionTask;
  readonly tasks: readonly ProductionTask[];
  readonly assignments: readonly RoleAssignment[];
  readonly at: string;
  readonly dueSoonHours?: number;
}): ProductionTaskGate {
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const departmentKey = inferProductionTaskDepartment(input.task, input.assignments);
  const eligibleOwnerIds = new Set(eligibleAssignmentsForTask({
    task: input.task,
    assignments: input.assignments,
    departmentKey,
    kind: "owner",
    at: input.at,
  }).map((assignment) => assignment.id));
  const eligibleReviewerIds = new Set(eligibleAssignmentsForTask({
    task: input.task,
    assignments: input.assignments,
    departmentKey,
    kind: "reviewer",
    at: input.at,
  }).map((assignment) => assignment.id));
  const missingDependencyTaskIds = input.task.dependencyTaskIds.filter((taskId) => {
    const dependency = taskById.get(taskId);
    return !dependency || !DEPENDENCY_COMPLETE_STATUSES.has(dependency.status);
  });
  const missingInputRevision = input.task.inputRevisionRefs.length === 0;
  const missingAssignee = !input.task.assignmentIds.some((assignmentId) =>
    eligibleOwnerIds.has(assignmentId));
  const missingReviewer = !input.task.reviewerAssignmentIds.some((assignmentId) =>
    eligibleReviewerIds.has(assignmentId));
  const missingDeliverable = input.task.outputDeliverableIds.length === 0;
  const now = Date.parse(input.at);
  const due = input.task.dueAt ? Date.parse(input.task.dueAt) : Number.NaN;
  const dueSoonHours = input.dueSoonHours ?? 72;
  const dueSoonWindow = dueSoonHours * 60 * 60 * 1_000;
  const active = !CLOSED_TASK_STATUSES.has(input.task.status);
  const overdue = active && Number.isFinite(now) && Number.isFinite(due) && due < now;
  const dueSoon = active
    && Number.isFinite(now)
    && Number.isFinite(due)
    && due >= now
    && due <= now + dueSoonWindow;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (missingDependencyTaskIds.length > 0) {
    blockers.push(`선행 작업 ${missingDependencyTaskIds.length}개가 완료되지 않았습니다.`);
  }
  if (missingInputRevision) blockers.push("시작 입력 revision이 고정되지 않았습니다.");
  if (missingAssignee) blockers.push("현재 작업 가능한 주 담당자가 배정되지 않았습니다.");
  if (missingReviewer) warnings.push("현재 검수 가능한 담당자가 배정되지 않았습니다.");
  if (missingDeliverable) warnings.push("완료 산출물이 연결되지 않았습니다.");
  if (overdue) warnings.push("마감 기한이 지났습니다.");
  else if (dueSoon) warnings.push(`${dueSoonHours}시간 안에 마감됩니다.`);
  return Object.freeze({
    taskId: input.task.id,
    departmentKey,
    missingDependencyTaskIds: Object.freeze(missingDependencyTaskIds),
    missingInputRevision,
    missingAssignee,
    missingReviewer,
    missingDeliverable,
    overdue,
    dueSoon,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    canStart: blockers.length === 0 && input.task.status === "ready",
    canRequestReview:
      blockers.length === 0
      && input.task.status === "in-progress"
      && !missingReviewer
      && !missingDeliverable,
    canApprove:
      blockers.length === 0
      && REVIEW_TASK_STATUSES.has(input.task.status)
      && !missingReviewer
      && !missingDeliverable,
  });
}

export type ProductionWorkcellHealth = "healthy" | "attention" | "blocked" | "unfilled";
export type ProductionWorkcellCoverage = "covered" | "lead-missing" | "scheduled" | "unfilled";

export interface ProductionRoleWorkcell {
  readonly department: ProductionDepartmentDefinition;
  readonly assignmentIds: readonly string[];
  readonly scheduledAssignmentIds: readonly string[];
  readonly leadAssignmentIds: readonly string[];
  readonly taskIds: readonly string[];
  readonly openTaskCount: number;
  readonly activeTaskCount: number;  readonly reviewTaskCount: number;
  readonly blockedTaskCount: number;
  readonly completedTaskCount: number;
  readonly overdueTaskCount: number;
  readonly dueSoonTaskCount: number;
  readonly likelyHours: number;
  readonly coverage: ProductionWorkcellCoverage;
  readonly health: ProductionWorkcellHealth;
}

export interface ProductionRoleWorkcellBoard {
  readonly workcells: readonly ProductionRoleWorkcell[];
  readonly taskGates: Readonly<Record<string, ProductionTaskGate>>;
  readonly unclassifiedTaskIds: readonly string[];
  readonly coverageGapDepartmentKeys: readonly ProductionDepartmentKey[];
  readonly bottleneckDepartmentKeys: readonly ProductionDepartmentKey[];
  readonly totalLikelyHours: number;
}

export function buildProductionRoleWorkcellBoard(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly at: string;
}): ProductionRoleWorkcellBoard {
  const gates = Object.fromEntries(input.aggregate.tasks.map((task) => [
    task.id,
    evaluateProductionTaskGate({
      task,
      tasks: input.aggregate.tasks,
      assignments: input.aggregate.assignments,
      at: input.at,
    }),
  ]));
  const availableAssignments = input.aggregate.assignments.filter((assignment) =>
    assignmentAvailable(assignment, input.at));
  const scheduledAssignments = input.aggregate.assignments.filter((assignment) =>
    assignmentScheduled(assignment, input.at));
  const taskDepartment = new Map(input.aggregate.tasks.map((task) => [
    task.id,
    inferProductionTaskDepartment(task, input.aggregate.assignments),
  ]));
  const workcells = PRODUCTION_DEPARTMENTS.map((department): ProductionRoleWorkcell => {
    const assignments = availableAssignments.filter((assignment) =>
      department.primaryRoleTypes.includes(assignment.roleType));
    const scheduled = scheduledAssignments.filter((assignment) =>
      department.primaryRoleTypes.includes(assignment.roleType));
    const tasks = input.aggregate.tasks.filter((task) =>
      taskDepartment.get(task.id) === department.key);
    const openTasks = tasks.filter((task) => !CLOSED_TASK_STATUSES.has(task.status));
    const blockedTaskCount = openTasks.filter((task) =>
      task.status === "blocked" || (gates[task.id]?.blockers.length ?? 0) > 0).length;
    const reviewTaskCount = openTasks.filter((task) =>
      REVIEW_TASK_STATUSES.has(task.status)).length;
    const overdueTaskCount = openTasks.filter((task) => gates[task.id]?.overdue).length;
    const dueSoonTaskCount = openTasks.filter((task) => gates[task.id]?.dueSoon).length;
    const coverage: ProductionWorkcellCoverage = assignments.length === 0
      ? scheduled.length > 0
        ? "scheduled"
        : "unfilled"
      : assignments.some((assignment) => assignment.lead)
        ? "covered"
        : "lead-missing";
    const health: ProductionWorkcellHealth = openTasks.length > 0 && coverage === "unfilled"
      ? "unfilled"
      : blockedTaskCount > 0 || overdueTaskCount > 0
        ? "blocked"
        : reviewTaskCount > 0
          || dueSoonTaskCount > 0
          || coverage === "lead-missing"
          || coverage === "scheduled"
          ? "attention"
          : "healthy";
    return Object.freeze({
      department,
      assignmentIds: Object.freeze(assignments.map((assignment) => assignment.id)),
      scheduledAssignmentIds: Object.freeze(scheduled.map((assignment) => assignment.id)),
      leadAssignmentIds: Object.freeze(assignments
        .filter((assignment) => assignment.lead)
        .map((assignment) => assignment.id)),
      taskIds: Object.freeze(tasks.map((task) => task.id)),
      openTaskCount: openTasks.length,
      activeTaskCount: openTasks.filter((task) => task.status === "in-progress").length,
      reviewTaskCount,
      blockedTaskCount,
      completedTaskCount: tasks.filter((task) => task.status === "done").length,
      overdueTaskCount,
      dueSoonTaskCount,
      likelyHours: openTasks.reduce((sum, task) =>
        sum + (task.estimateHours?.likely ?? 0), 0),
      coverage,
      health,
    });
  });
  const coverageGapDepartmentKeys = workcells
    .filter((workcell) =>
      workcell.openTaskCount > 0 && workcell.coverage !== "covered")
    .map((workcell) => workcell.department.key);
  const bottleneckDepartmentKeys = [...workcells]
    .filter((workcell) => workcell.openTaskCount > 0)
    .sort((left, right) =>
      right.blockedTaskCount - left.blockedTaskCount
      || right.overdueTaskCount - left.overdueTaskCount
      || right.reviewTaskCount - left.reviewTaskCount
      || right.likelyHours - left.likelyHours)
    .slice(0, 3)
    .map((workcell) => workcell.department.key);
  return Object.freeze({
    workcells: Object.freeze(workcells),
    taskGates: Object.freeze(gates),
    unclassifiedTaskIds: Object.freeze(input.aggregate.tasks
      .filter((task) => taskDepartment.get(task.id) === null)
      .map((task) => task.id)),
    coverageGapDepartmentKeys: Object.freeze(coverageGapDepartmentKeys),
    bottleneckDepartmentKeys: Object.freeze(bottleneckDepartmentKeys),
    totalLikelyHours: workcells.reduce((sum, workcell) =>
      sum + workcell.likelyHours, 0),
  });
}
