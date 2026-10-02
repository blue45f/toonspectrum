import { episodeScope, scopeContains } from "../../core/src/production/scope";
import {
  PRODUCTION_ROLE_TYPES,
  type ProductionProjectAggregate,
  type ProductionProcessStep,
  type ProductionWorkflowProfile,
  type ProductionTaskTransition,
  type ProductionRoleType,
  type ProductionTask,
  type ProductionTaskStatus,
} from "../../core/src/production/types";
import { detectTaskDependencyCycles, transitionProductionTask } from "../../core/src/production/workflow";

export const PRODUCTION_BOARD_STATUSES = [
  "draft",
  "needs-input",
  "ready",
  "in-progress",
  "internal-review",
  "external-review",
  "changes-requested",
  "conditionally-approved",
  "approved",
  "done",
  "blocked",
  "paused",
  "cancelled",
  "out-of-scope",
] as const satisfies readonly ProductionTaskStatus[];
export const PRODUCTION_WORKFLOW_SCALES = {
  solo: "개인 제작",
  team: "소규모 협업",
  studio: "스튜디오 제작",
} as const;
const CLOSED = new Set<ProductionTaskStatus>(["approved", "done", "cancelled", "out-of-scope"]);
const STAGES: readonly [string, string, ProductionRoleType, number][] = [
  ["story-lock", "스토리", "writer", 8],
  ["storyboard", "콘티", "storyboard-artist", 12],
  ["line-art", "선화", "line-artist", 16],
  ["background", "배경", "background-artist", 12],
  ["color", "채색", "colorist", 12],
  ["lettering", "식자", "letterer", 4],
  ["joint-proof", "최종 교정", "editor", 4],
  ["publication", "납품 준비", "producer", 2],
];
export function createProductionWorkflowProfile(
  projectId: string,
  scale: ProductionWorkflowProfile["scale"],
  at: string,
): ProductionWorkflowProfile {
  const stages = STAGES.filter(
    ([key]) =>
      scale === "studio" ||
      (scale === "solo"
        ? ["story-lock", "storyboard", "line-art", "joint-proof"].includes(key)
        : !["background", "publication"].includes(key)),
  );
  const steps = stages.map(
    ([key, name, defaultRole, estimateHours], index): ProductionProcessStep => ({
      key,
      name,
      description: "",
      defaultRole,
      estimateHours,
      dependsOn:
        scale === "studio" && key === "background"
          ? ["storyboard"]
          : scale === "studio" && key === "color"
          ? ["line-art", "background"]
          : stages[index - 1]
          ? [stages[index - 1][0]]
          : [],
      wipLimit: scale === "solo" ? 1 : scale === "team" ? 3 : 6,
      reviewRequired: scale !== "solo" || key === "joint-proof",
      completionCriteria: [`${name} 산출물과 검수 기준 확인`],
    }),
  );
  return {
    id: "production-workflow",
    projectId,
    name: PRODUCTION_WORKFLOW_SCALES[scale],
    scale,
    revision: 1,
    steps,
    updatedAt: at,
  };
}
export function productionProcessWip(tasks: readonly ProductionTask[], key: string): number {
  return tasks.filter(
    (task) =>
      canonicalProductionProcessKey(task.processKey) === canonicalProductionProcessKey(key) &&
      task.status === "in-progress",
  ).length;
}
/** 공정을 삭제하면 저장할 수 없게 되는, 아직 닫히지 않은 작업 수. */
export function countOpenProductionTasksForStep(tasks: readonly ProductionTask[], key: string): number {
  return tasks.filter(
    (task) =>
      canonicalProductionProcessKey(task.processKey) === canonicalProductionProcessKey(key) &&
      !CLOSED.has(task.status),
  ).length;
}
export const PRODUCTION_WORKFLOW_PRESETS = {
  "monochrome-manga": "흑백 만화",
  "background-split": "배경 분리 제작",
  "proof-heavy": "검수 강화 연재",
} as const;
export type ProductionWorkflowPreset = keyof typeof PRODUCTION_WORKFLOW_PRESETS;
interface ProductionWorkflowPresetStage {
  readonly key: string;
  readonly name: string;
  readonly defaultRole: ProductionRoleType;
  readonly estimateHours: number;
  readonly dependsOn: readonly string[];
  readonly reviewRequired?: boolean;
}
const PRODUCTION_WORKFLOW_PRESET_STAGES: Record<
  ProductionWorkflowPreset,
  { readonly scale: ProductionWorkflowProfile["scale"]; readonly stages: readonly ProductionWorkflowPresetStage[] }
> = {
  // 채색 대신 스크린톤 공정으로 마감하는 흑백 원고 흐름.
  "monochrome-manga": {
    scale: "team",
    stages: [
      { key: "story-lock", name: "스토리", defaultRole: "writer", estimateHours: 8, dependsOn: [] },
      { key: "name-board", name: "네임", defaultRole: "storyboard-artist", estimateHours: 10, dependsOn: ["story-lock"] },
      { key: "sketch", name: "밑그림", defaultRole: "line-artist", estimateHours: 8, dependsOn: ["name-board"] },
      { key: "ink", name: "펜화", defaultRole: "line-artist", estimateHours: 14, dependsOn: ["sketch"] },
      { key: "tone", name: "톤·마무리", defaultRole: "assistant", estimateHours: 8, dependsOn: ["ink"] },
      { key: "lettering", name: "식자", defaultRole: "letterer", estimateHours: 4, dependsOn: ["tone"] },
      { key: "joint-proof", name: "최종 교정", defaultRole: "editor", estimateHours: 4, dependsOn: ["lettering"], reviewRequired: true },
      { key: "publication", name: "납품 준비", defaultRole: "producer", estimateHours: 2, dependsOn: ["joint-proof"] },
    ],
  },
  // 배경을 원화와 합성으로 나눠 선화와 병렬로 돌리는 분업 흐름.
  "background-split": {
    scale: "studio",
    stages: [
      { key: "story-lock", name: "스토리", defaultRole: "writer", estimateHours: 8, dependsOn: [] },
      { key: "storyboard", name: "콘티", defaultRole: "storyboard-artist", estimateHours: 12, dependsOn: ["story-lock"] },
      { key: "line-art", name: "선화", defaultRole: "line-artist", estimateHours: 16, dependsOn: ["storyboard"] },
      { key: "background-draft", name: "배경 원화", defaultRole: "background-artist", estimateHours: 10, dependsOn: ["storyboard"] },
      { key: "background-compose", name: "배경 합성", defaultRole: "background-artist", estimateHours: 6, dependsOn: ["background-draft"] },
      { key: "color", name: "채색", defaultRole: "colorist", estimateHours: 12, dependsOn: ["line-art", "background-compose"] },
      { key: "lettering", name: "식자", defaultRole: "letterer", estimateHours: 4, dependsOn: ["color"] },
      { key: "joint-proof", name: "최종 교정", defaultRole: "editor", estimateHours: 4, dependsOn: ["lettering"], reviewRequired: true },
      { key: "publication", name: "납품 준비", defaultRole: "producer", estimateHours: 2, dependsOn: ["joint-proof"] },
    ],
  },
  // 편집 교정이 1차 교정·수정 반영·최종 검수로 나뉘는 연재 흐름.
  "proof-heavy": {
    scale: "team",
    stages: [
      { key: "story-lock", name: "스토리", defaultRole: "writer", estimateHours: 8, dependsOn: [] },
      { key: "storyboard", name: "콘티", defaultRole: "storyboard-artist", estimateHours: 12, dependsOn: ["story-lock"] },
      { key: "line-art", name: "선화", defaultRole: "line-artist", estimateHours: 16, dependsOn: ["storyboard"] },
      { key: "background", name: "배경", defaultRole: "background-artist", estimateHours: 12, dependsOn: ["storyboard"] },
      { key: "color", name: "채색", defaultRole: "colorist", estimateHours: 12, dependsOn: ["line-art", "background"] },
      { key: "lettering", name: "식자", defaultRole: "letterer", estimateHours: 4, dependsOn: ["color"] },
      { key: "first-proof", name: "1차 교정", defaultRole: "editor", estimateHours: 3, dependsOn: ["lettering"], reviewRequired: true },
      { key: "proof-revision", name: "수정 반영", defaultRole: "assistant", estimateHours: 4, dependsOn: ["first-proof"] },
      { key: "final-proof", name: "최종 검수", defaultRole: "editor", estimateHours: 3, dependsOn: ["proof-revision"], reviewRequired: true },
      { key: "publication", name: "납품 준비", defaultRole: "producer", estimateHours: 2, dependsOn: ["final-proof"] },
    ],
  },
};
export function createProductionWorkflowPresetProfile(
  projectId: string,
  preset: ProductionWorkflowPreset,
  at: string,
): ProductionWorkflowProfile {
  const definition = PRODUCTION_WORKFLOW_PRESET_STAGES[preset];
  const scale = definition.scale;
  const steps = definition.stages.map(
    (stage): ProductionProcessStep => ({
      key: stage.key,
      name: stage.name,
      description: "",
      defaultRole: stage.defaultRole,
      estimateHours: stage.estimateHours,
      dependsOn: [...stage.dependsOn],
      wipLimit: scale === "solo" ? 1 : scale === "team" ? 3 : 6,
      reviewRequired: stage.reviewRequired ?? scale !== "solo",
      completionCriteria: [`${stage.name} 산출물과 검수 기준 확인`],
    }),
  );
  return {
    id: "production-workflow",
    projectId,
    name: PRODUCTION_WORKFLOW_PRESETS[preset],
    scale,
    revision: 1,
    steps,
    updatedAt: at,
  };
}
export function validateProductionWorkflowProfile(
  aggregate: ProductionProjectAggregate,
  profile: ProductionWorkflowProfile,
): readonly string[] {
  const issues: string[] = [];
  if (profile.projectId !== aggregate.projectId) issues.push("프로젝트가 일치하지 않습니다.");
  if (!profile.name.trim() || profile.name.length > 120) issues.push("공정 이름은 1~120자로 입력하세요.");
  if (profile.revision !== (aggregate.workflowProfile?.revision ?? 0) + 1)
    issues.push("공정 설정이 변경되었습니다. 최신 설정을 다시 불러오세요.");
  if (aggregate.workflowProfile && profile.id !== aggregate.workflowProfile.id)
    issues.push("공정 설정 식별자는 바꿀 수 없습니다.");
  if (profile.steps.length < 1 || profile.steps.length > 32) issues.push("공정은 1~32개로 구성하세요.");
  const keys = new Set(profile.steps.map((step) => step.key));
  if (keys.size !== profile.steps.length) issues.push("공정 키는 중복될 수 없습니다.");
  if (
    new Set(profile.steps.map((step) => canonicalProductionProcessKey(step.key))).size !==
    profile.steps.length
  )
    issues.push("같은 의미의 레거시 공정과 새 공정은 함께 등록할 수 없습니다.");
  for (const step of profile.steps) {
    if (!/^[a-z][a-z0-9-]{0,79}$/u.test(step.key))
      issues.push(`${step.name}: 공정 키 형식이 올바르지 않습니다.`);
    if (!step.name.trim() || step.name.length > 120) issues.push("단계 이름은 1~120자로 입력하세요.");
    if (step.description.length > 4000) issues.push(`${step.name}: 작업 안내는 4000자까지 입력하세요.`);
    if (
      step.completionCriteria.length > 30 ||
      step.completionCriteria.some((value) => !value.trim() || value.length > 4000)
    )
      issues.push(`${step.name}: 완료 기준은 30개 이하, 각 1~4000자로 입력하세요.`);
    if (!PRODUCTION_ROLE_TYPES.includes(step.defaultRole))
      issues.push(`${step.name}: 담당 역할을 확인하세요.`);
    if (
      step.wipLimit !== null &&
      (!Number.isInteger(step.wipLimit) || step.wipLimit < 1 || step.wipLimit > 1000)
    )
      issues.push(`${step.name}: 동시 작업 수는 1~1000 또는 제한 없음입니다.`);
    if (!Number.isFinite(step.estimateHours) || step.estimateHours < 0 || step.estimateHours > 10000)
      issues.push(`${step.name}: 예상 공수를 확인하세요.`);
    if (
      new Set(step.dependsOn).size !== step.dependsOn.length ||
      step.dependsOn.some((key) => key === step.key || !keys.has(key))
    )
      issues.push(`${step.name}: 선행 공정을 확인하세요.`);
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    const cyclic = (profile.steps.find((step) => step.key === key)?.dependsOn ?? []).some(visit);
    visiting.delete(key);
    visited.add(key);
    return cyclic;
  };
  if (profile.steps.some((step) => visit(step.key)))
    issues.push("선행 공정이 순환합니다. 연결을 한 개 이상 해제하세요.");
  for (const previous of aggregate.workflowProfile?.steps ?? []) {
    if (
      !profile.steps.some(
        (step) => canonicalProductionProcessKey(step.key) === canonicalProductionProcessKey(previous.key),
      ) &&
      aggregate.tasks.some(
        (task) =>
          canonicalProductionProcessKey(task.processKey) === canonicalProductionProcessKey(previous.key) &&
          !CLOSED.has(task.status),
      )
    ) {
      issues.push(
        `${previous.name}: 진행할 작업이 남아 있어 삭제할 수 없습니다. 먼저 작업을 완료하거나 다른 공정으로 옮기세요.`,
      );
    }
  }
  return [...new Set(issues)];
}
export function validateProductionWorkflowMutation(
  before: ProductionProjectAggregate,
  after: ProductionProjectAggregate,
): readonly string[] {
  const profile = after.workflowProfile;
  if (!profile) return [];
  const issues: string[] = [];
  const previousById = new Map(before.tasks.map((task) => [task.id, task]));
  const stepByKey = new Map(profile.steps.map((step) => [canonicalProductionProcessKey(step.key), step]));
  const completed = before.tasks
    .filter((task) => ["approved", "done"].includes(task.status))
    .map((task) => task.id);
  const taskIds = new Set(after.tasks.map((task) => task.id));
  const assignments = new Map(after.assignments.map((assignment) => [assignment.id, assignment]));
  for (const next of after.tasks) {
    const previous = previousById.get(next.id);
    const step = stepByKey.get(canonicalProductionProcessKey(next.processKey));
    if (!previous && next.status !== "draft")
      issues.push(`${next.title}: 새 작업은 초안에서 시작해야 합니다.`);
    if ((!previous || previous.processKey !== next.processKey) && !step)
      issues.push(`${next.title}: 설정에 없는 공정입니다.`);
    if (previous && previous.status !== next.status) {
      try {
        transitionProductionTask({ ...next, status: previous.status }, next.status, completed);
      } catch {
        issues.push(`${next.title}: 상태 전환 또는 선행 작업·고정 입력·산출물 조건을 확인하세요.`);
      }
    }
    const entering = !previous || previous.status !== next.status || previous.processKey !== next.processKey;
    if (!previous || next.dependencyTaskIds !== previous.dependencyTaskIds) {
      if (
        next.dependencyTaskIds.some((id) => id === next.id || !taskIds.has(id)) ||
        new Set(next.dependencyTaskIds).size !== next.dependencyTaskIds.length
      )
        issues.push(`${next.title}: 선행 작업이 없거나 중복되었습니다.`);
    }
    if (
      !previous ||
      next.assignmentIds !== previous.assignmentIds ||
      next.reviewerAssignmentIds !== previous.reviewerAssignmentIds
    ) {
      for (const id of new Set([...next.assignmentIds, ...next.reviewerAssignmentIds])) {
        const assignment = assignments.get(id);
        if (
          !assignment ||
          assignment.projectId !== after.projectId ||
          !scopeContains(assignment.scope, next.scope)
        )
          issues.push(`${next.title}: 작업 범위를 담당할 수 없는 배정입니다.`);
      }
    }
    if (new Set(next.briefBlocks?.map((block) => block.id)).size !== (next.briefBlocks?.length ?? 0))
      issues.push(`${next.title}: 설명 블록 식별자가 중복되었습니다.`);
    if (
      entering &&
      next.status === "in-progress" &&
      !next.assignmentIds.some((id) => after.assignments.some((a) => a.id === id && a.status === "active"))
    ) {
      issues.push(`${next.title}: 작업을 시작하기 전에 활성 담당자를 배정하세요.`);
    }
    if (
      entering &&
      step?.reviewRequired &&
      ["internal-review", "external-review"].includes(next.status) &&
      !next.reviewerAssignmentIds.some((id) =>
        after.assignments.some((a) => a.id === id && a.status === "active"),
      )
    ) {
      issues.push(`${next.title}: 이 공정에는 검수자 배정이 필요합니다.`);
    }
  }
  for (const step of profile.steps) {
    const count = productionProcessWip(after.tasks, step.key);
    if (
      step.wipLimit !== null &&
      count > step.wipLimit &&
      count > productionProcessWip(before.tasks, step.key)
    ) {
      issues.push(
        `${step.name}: 동시 작업 제한 ${step.wipLimit}개를 초과합니다. 진행 중인 작업을 먼저 마무리하세요.`,
      );
    }
  }
  if (detectTaskDependencyCycles(after.tasks).length) issues.push("작업 의존성에 순환이 있습니다.");
  return [...new Set(issues)];
}
export function transitionProductionTaskBatch(
  aggregate: ProductionProjectAggregate,
  transitions: readonly ProductionTaskTransition[],
  at: string,
): readonly ProductionTask[] {
  if (
    transitions.length === 0 ||
    transitions.length > 200 ||
    new Set(transitions.map((entry) => entry.taskId)).size !== transitions.length
  ) {
    throw new Error("작업은 중복 없이 1~200개까지 선택하세요.");
  }
  const completed = aggregate.tasks
    .filter((task) => ["approved", "done"].includes(task.status))
    .map((task) => task.id);
  const tasksById = new Map(aggregate.tasks.map((task) => [task.id, task]));
  const changed = transitions.map((entry) => {
    const task = tasksById.get(entry.taskId);
    if (!task || task.status !== entry.fromStatus) throw new Error("workflow-task-conflict");
    if (["approved", "conditionally-approved"].includes(entry.toStatus))
      throw new Error("승인은 작업 보드가 아니라 고정 검수 절차에서 처리하세요.");
    if (
      entry.toStatus === "done" &&
      !task.outputDeliverableIds.some((id) => {
        const deliverable = aggregate.deliverables.find((value) => value.id === id);
        return (
          deliverable?.approvedSubmissionId &&
          aggregate.submissions.some(
            (s) =>
              s.id === deliverable.approvedSubmissionId && s.deliverableId === id && s.status === "approved",
          )
        );
      })
    )
      throw new Error("승인된 제출본이 연결된 작업만 완료할 수 있습니다.");
    let next: ProductionTask;
    try {
      next = transitionProductionTask(task, entry.toStatus, completed);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      if (detail.includes("pinned input revisions"))
        throw new Error(`${task.title}: 작업을 시작하기 전에 입력 버전을 고정하세요.`, { cause: error });
      if (detail.includes("dependencies are incomplete"))
        throw new Error(`${task.title}: 선행 작업이 아직 완료되지 않았습니다.`, { cause: error });
      if (detail.includes("must have a deliverable"))
        throw new Error(`${task.title}: 연결된 산출물이 필요합니다.`, { cause: error });
      throw new Error(
        `${task.title}: 현재 상태에서는 이 단계로 이동할 수 없습니다. 준비·제작·검수 순서를 확인하세요.`,
        { cause: error },
      );
    }
    return {
      ...next,
      statusChangedAt: at,
      startedAt: task.startedAt ?? (next.status === "in-progress" ? at : null),
      completedAt: next.status === "done" ? at : null,
    };
  });
  const changedById = new Map(changed.map((task) => [task.id, task]));
  const tasks = aggregate.tasks.map((task) => changedById.get(task.id) ?? task);
  const issues = validateProductionWorkflowMutation(aggregate, { ...aggregate, tasks });
  if (issues.length) throw new Error(issues.join("\n"));
  return changed;
}
export function buildProductionWorkflowTasks(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
  instanceId: string,
  at: string,
): readonly ProductionTask[] {
  const profile = aggregate.workflowProfile;
  if (!profile) throw new Error("공정 설정을 먼저 저장하세요.");
  if (!aggregate.episodes.some((entry) => entry.episodeId === episodeId))
    throw new Error("작업을 생성할 회차를 찾을 수 없습니다.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(instanceId))
    throw new Error("작업 생성 식별자가 올바르지 않습니다.");
  const existing = aggregate.tasks.filter(
    (task) =>
      task.scope.kind === "episode" &&
      task.scope.id === episodeId &&
      !["cancelled", "out-of-scope"].includes(task.status),
  );
  const ids = new Map(
    profile.steps.map((step, index) => {
      const matches = existing
        .filter(
          (task) =>
            canonicalProductionProcessKey(task.processKey) === canonicalProductionProcessKey(step.key),
        )
        .map((task) => task.id);
      const id = `task:${instanceId}:${index}`;
      if (!matches.length && aggregate.tasks.some((task) => task.id === id))
        throw new Error("작업 생성 식별자가 다른 회차에 사용되었습니다.");
      return [step.key, matches.length ? matches : [id]] as const;
    }),
  );
  return profile.steps.flatMap((step): ProductionTask[] => {
    if (
      existing.some(
        (task) => canonicalProductionProcessKey(task.processKey) === canonicalProductionProcessKey(step.key),
      )
    )
      return [];
    const id = ids.get(step.key)?.[0];
    if (!id) throw new Error("공정 식별자를 찾을 수 없습니다.");
    const candidates = aggregate.assignments.filter(
      (a) =>
        a.roleType === step.defaultRole &&
        a.status === "active" &&
        Date.parse(a.startsAt) <= Date.parse(at) &&
        (!a.endsAt || Date.parse(a.endsAt) > Date.parse(at)) &&
        ((a.scope.kind === "project" && a.scope.id === aggregate.projectId) ||
          (a.scope.kind === "episode" && a.scope.id === episodeId)),
    );
    return [
      {
        id,
        projectId: aggregate.projectId,
        scope: episodeScope(aggregate.projectId, episodeId),
        processKey: step.key,
        title: step.name,
        status: "draft",
        priority: "normal",
        assignmentIds: candidates.length === 1 ? candidates.map((a) => a.id) : [],
        reviewerAssignmentIds: [],
        inputRevisionRefs: [],
        outputDeliverableIds: [],
        dependencyTaskIds: step.dependsOn.flatMap((key) => {
          const dependencies = ids.get(key);
          if (!dependencies) throw new Error("선행 공정이 없습니다.");
          return dependencies;
        }),
        dueAt: null,
        statusChangedAt: at,
        startedAt: null,
        completedAt: null,
        estimateHours: {
          optimistic: step.estimateHours * 0.75,
          likely: step.estimateHours,
          pessimistic: step.estimateHours * 1.5,
        },
        completionCriteria: [...step.completionCriteria],
        sourceAgreementMilestoneId: null,
        briefBlocks: step.description ? [{ id: "brief", kind: "paragraph", text: step.description }] : [],
      },
    ];
  });
}

/** 회차 운영의 레거시 공정 키를 데이터 변경 없이 같은 제작 단계로 해석한다. */
export function canonicalProductionProcessKey(key: string): string {
  if (key === "story") return "story-lock";
  if (key === "thumbnail") return "storyboard";
  return key;
}
