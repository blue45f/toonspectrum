import {
  episodeScope,
  type EpisodeCollaboration,
  type EpisodePlan,
  type ProductionProjectAggregate,
  type ProductionRoleType,
  type ProductionTask,
  type ProductionTaskStatus,
  type RevisionRef,
} from "@toonspectrum/core/production";

const DAY_MS = 86_400_000;
const COMPLETE_TASK_STATUSES = new Set<ProductionTaskStatus>([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);
const ACTIVE_RISK_STATUSES = new Set<ProductionTaskStatus>([
  "blocked",
  "changes-requested",
  "needs-input",
]);

export type EpisodeDeadlineHealth =
  | "published"
  | "critical"
  | "risk"
  | "healthy"
  | "unplanned";

export interface EpisodePipelineTemplateStep {
  readonly processKey: string;
  readonly label: string;
  readonly daysBeforeRelease: number;
  readonly likelyHours: number;
  readonly ownerRoles: readonly ProductionRoleType[];
  readonly reviewerRoles: readonly ProductionRoleType[];
  readonly dependencyProcessKeys: readonly string[];
  readonly completionCriteria: readonly string[];
}

export const WEBTOON_EPISODE_PIPELINE: readonly EpisodePipelineTemplateStep[] = Object.freeze([
  {
    processKey: "story",
    label: "대본·연출 확정",
    daysBeforeRelease: 14,
    likelyHours: 10,
    ownerRoles: ["story-lead", "writer", "adaptation-writer"],
    reviewerRoles: ["editor", "producer"],
    dependencyProcessKeys: [],
    completionCriteria: ["회차 목표와 감정 변화 확정", "대사 정본 고정", "클리프행어 검수"],
  },
  {
    processKey: "thumbnail",
    label: "콘티·스크롤 리듬",
    daysBeforeRelease: 10,
    likelyHours: 16,
    ownerRoles: ["storyboard-artist", "art-lead"],
    reviewerRoles: ["story-lead", "art-lead", "editor", "producer"],
    dependencyProcessKeys: ["story"],
    completionCriteria: ["전체 컷 배치", "모바일 시선 흐름", "대사 안전영역"],
  },
  {
    processKey: "line-art",
    label: "캐릭터·선화",
    daysBeforeRelease: 7,
    likelyHours: 28,
    ownerRoles: ["line-artist", "art-lead"],
    reviewerRoles: ["art-lead", "editor"],
    dependencyProcessKeys: ["thumbnail"],
    completionCriteria: ["캐릭터 모델 일치", "확대 선 품질", "채색 인계 레이어 정리"],
  },
  {
    processKey: "background",
    label: "배경·3D·소품",
    daysBeforeRelease: 7,
    likelyHours: 20,
    ownerRoles: ["background-artist", "vendor", "assistant"],
    reviewerRoles: ["art-lead", "rights-reviewer"],
    dependencyProcessKeys: ["thumbnail"],
    completionCriteria: ["원근·광원 연속성", "수정 가능한 레이어", "에셋 라이선스 기록"],
  },
  {
    processKey: "color",
    label: "밑색·명암·이펙트",
    daysBeforeRelease: 4,
    likelyHours: 26,
    ownerRoles: ["colorist", "art-lead"],
    reviewerRoles: ["art-lead", "editor"],
    dependencyProcessKeys: ["line-art", "background"],
    completionCriteria: ["팔레트 기준 일치", "컷 간 조명 연결", "효과 레이어 분리"],
  },
  {
    processKey: "lettering",
    label: "말풍선·효과음·식자",
    daysBeforeRelease: 2,
    likelyHours: 9,
    ownerRoles: ["letterer", "editor"],
    reviewerRoles: ["story-lead", "editor"],
    dependencyProcessKeys: ["color"],
    completionCriteria: ["대사 정본 일치", "모바일 가독성", "효과음·폰트 라이선스 확인"],
  },
  {
    processKey: "rights-preflight",
    label: "권리·AI·크레딧 검수",
    daysBeforeRelease: 2,
    likelyHours: 5,
    ownerRoles: ["rights-reviewer", "producer"],
    reviewerRoles: ["editor", "producer"],
    dependencyProcessKeys: ["thumbnail"],
    completionCriteria: ["외부 에셋 라이선스", "AI 사용 증빙", "크레딧 정합성"],
  },
  {
    processKey: "joint-proof",
    label: "통합 원고 공동 교정",
    daysBeforeRelease: 1,
    likelyHours: 7,
    ownerRoles: ["editor", "producer"],
    reviewerRoles: ["story-lead", "art-lead", "rights-reviewer", "producer"],
    dependencyProcessKeys: ["lettering", "rights-preflight"],
    completionCriteria: ["서사·시각·식자 통합 비교", "플랫폼 규격", "필수 승인 lane 완료"],
  },
  {
    processKey: "publication",
    label: "게시 패키지·예약 공개",
    daysBeforeRelease: 0,
    likelyHours: 3,
    ownerRoles: ["producer", "editor"],
    reviewerRoles: ["editor", "rights-reviewer"],
    dependencyProcessKeys: ["joint-proof", "rights-preflight"],
    completionCriteria: ["게시 후보 revision 고정", "썸네일·회차 소개·크레딧 확인", "업로드 규격 검증"],
  },
]);

export interface EpisodeOperationsRow {
  readonly episode: EpisodeCollaboration;
  readonly plan: EpisodePlan | null;
  readonly episodeNumber: number | null;
  readonly title: string;
  readonly tasks: readonly ProductionTask[];
  readonly publicationTask: ProductionTask | null;
  readonly releaseAt: string | null;
  readonly daysUntilRelease: number | null;
  readonly progressPercent: number;
  readonly remainingHours: number;
  readonly availableHours: number;
  readonly loadRatio: number | null;
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly overdueTasks: readonly ProductionTask[];
  readonly riskyTasks: readonly ProductionTask[];
  readonly missingProcessKeys: readonly string[];
  readonly health: EpisodeDeadlineHealth;
  readonly healthReasons: readonly string[];
}

export interface ProductionOperationsOverview {
  readonly rows: readonly EpisodeOperationsRow[];
  readonly nextRelease: EpisodeOperationsRow | null;
  readonly cadenceDays: number | null;
  readonly readyBufferCount: number;
  readonly criticalCount: number;
  readonly riskCount: number;
  readonly unplannedCount: number;
  readonly overdueTaskCount: number;
  readonly openBlockerCount: number;
  readonly remainingHours: number;
}

function latestEpisodePlan(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
): EpisodePlan | null {
  return [...aggregate.episodePlans]
    .filter((entry) => entry.episodeId === episodeId)
    .sort((left, right) => right.revision - left.revision)[0] ?? null;
}

function episodeTasks(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
): readonly ProductionTask[] {
  return aggregate.tasks.filter((task) =>
    task.scope.kind === "episode" && task.scope.id === episodeId);
}

function publicationTask(tasks: readonly ProductionTask[]): ProductionTask | null {
  return [...tasks]
    .filter((task) => task.processKey === "publication" && task.status !== "cancelled")
    .sort((left, right) => {
      const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.MAX_SAFE_INTEGER;
      const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    })[0] ?? null;
}

function numericEpisodeId(episodeId: string): number | null {
  const match = episodeId.match(/(?:^|[-_])(\d+)$/u);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function progressPercent(episode: EpisodeCollaboration, tasks: readonly ProductionTask[]): number {
  if (episode.state === "published") return 100;
  const completed = (processKey: string) => tasks.some((task) =>
    task.processKey === processKey && COMPLETE_TASK_STATUSES.has(task.status));
  const stages = [
    episode.storyLockApproved || completed("story"),
    episode.thumbnailLockApproved || completed("thumbnail"),
    Boolean(episode.visualRevisionRef) || completed("line-art"),
    completed("color"),
    completed("lettering"),
    episode.jointProofApproved || completed("joint-proof"),
    episode.publicationPreflightPassed || completed("rights-preflight"),
    completed("publication"),
  ];
  return Math.round((stages.filter(Boolean).length / stages.length) * 100);
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function daysUntil(timestamp: string, nowMs: number): number {
  return Math.ceil((Date.parse(timestamp) - nowMs) / DAY_MS);
}

function uniqueActiveAssigneeCount(tasks: readonly ProductionTask[]): number {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (COMPLETE_TASK_STATUSES.has(task.status)) continue;
    for (const assignmentId of task.assignmentIds) ids.add(assignmentId);
  }
  return Math.max(1, ids.size);
}

function healthFor(input: {
  readonly episode: EpisodeCollaboration;
  readonly releaseAt: string | null;
  readonly daysUntilRelease: number | null;
  readonly progressPercent: number;
  readonly loadRatio: number | null;
  readonly overdueTasks: readonly ProductionTask[];
  readonly riskyTasks: readonly ProductionTask[];
}): { readonly health: EpisodeDeadlineHealth; readonly reasons: readonly string[] } {
  if (input.episode.state === "published") {
    return { health: "published", reasons: ["게시 완료"] };
  }
  if (!input.releaseAt || input.daysUntilRelease === null) {
    return { health: "unplanned", reasons: ["게시 마감 미설정"] };
  }
  const reasons: string[] = [];
  if (input.daysUntilRelease < 0) reasons.push("게시 마감 경과");
  if (input.episode.openBlockerCount > 0) reasons.push(`회차 차단 질문 ${input.episode.openBlockerCount}건`);
  if (input.overdueTasks.length > 0) reasons.push(`지연 작업 ${input.overdueTasks.length}건`);
  if (input.riskyTasks.some((task) => task.status === "blocked")) reasons.push("차단된 작업 존재");
  if (input.loadRatio !== null && input.loadRatio > 1) reasons.push("잔여 공수가 가용 시간 초과");
  if (input.daysUntilRelease <= 2 && input.progressPercent < 85) reasons.push("마감 2일 이내 진행률 부족");
  if (reasons.length > 0) return { health: "critical", reasons };

  if (input.riskyTasks.length > 0) reasons.push(`주의 작업 ${input.riskyTasks.length}건`);
  if (input.loadRatio !== null && input.loadRatio >= 0.75) reasons.push("가용 시간의 75% 이상 사용 예상");
  if (input.daysUntilRelease <= 5 && input.progressPercent < 70) reasons.push("마감 5일 이내 진행률 점검 필요");
  if (reasons.length > 0) return { health: "risk", reasons };
  return { health: "healthy", reasons: ["현재 일정 기준 정상"] };
}

export function deriveEpisodeOperationsRow(
  aggregate: ProductionProjectAggregate,
  episode: EpisodeCollaboration,
  now = new Date(),
): EpisodeOperationsRow {
  const plan = latestEpisodePlan(aggregate, episode.episodeId);
  const tasks = episodeTasks(aggregate, episode.episodeId);
  const releaseTask = publicationTask(tasks);
  const releaseAt = releaseTask?.dueAt ?? null;
  const nowMs = now.getTime();
  const daysUntilRelease = releaseAt ? daysUntil(releaseAt, nowMs) : null;
  const completedTasks = tasks.filter((task) => COMPLETE_TASK_STATUSES.has(task.status)).length;
  const remainingTasks = tasks.filter((task) => !COMPLETE_TASK_STATUSES.has(task.status));
  const remainingHours = round(remainingTasks.reduce(
    (sum, task) => sum + (task.estimateHours?.likely ?? 0),
    0,
  ));
  const availableHours = daysUntilRelease === null
    ? 0
    : Math.max(0, daysUntilRelease) * 8 * uniqueActiveAssigneeCount(remainingTasks);
  const loadRatio = availableHours > 0 ? round(remainingHours / availableHours, 2) : null;
  const overdueTasks = remainingTasks.filter((task) =>
    Boolean(task.dueAt && Date.parse(task.dueAt) < nowMs));
  const riskyTasks = remainingTasks.filter((task) => ACTIVE_RISK_STATUSES.has(task.status));
  const progress = progressPercent(episode, tasks);
  const health = healthFor({
    episode,
    releaseAt,
    daysUntilRelease,
    progressPercent: progress,
    loadRatio,
    overdueTasks,
    riskyTasks,
  });
  const episodeNumber = plan?.episodeNumber ?? numericEpisodeId(episode.episodeId);
  const title = plan?.title?.trim() || (episodeNumber ? `${episodeNumber}화` : episode.episodeId);
  const existingKeys = new Set(tasks
    .filter((task) => task.status !== "cancelled" && task.status !== "out-of-scope")
    .map((task) => task.processKey));

  return {
    episode,
    plan,
    episodeNumber,
    title,
    tasks,
    publicationTask: releaseTask,
    releaseAt,
    daysUntilRelease,
    progressPercent: progress,
    remainingHours,
    availableHours,
    loadRatio,
    totalTasks: tasks.length,
    completedTasks,
    overdueTasks,
    riskyTasks,
    missingProcessKeys: WEBTOON_EPISODE_PIPELINE
      .filter((step) => !existingKeys.has(step.processKey))
      .map((step) => step.processKey),
    health: health.health,
    healthReasons: health.reasons,
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2, 0);
}

function deriveCadenceDays(
  aggregate: ProductionProjectAggregate,
  rows: readonly EpisodeOperationsRow[],
): number | null {
  const seasonCadence = [...aggregate.seasonPlans]
    .filter((entry) => entry.releaseCadenceDays && entry.releaseCadenceDays > 0)
    .sort((left, right) => right.revision - left.revision)[0]?.releaseCadenceDays ?? null;
  if (seasonCadence) return seasonCadence;
  const releaseTimes = rows
    .map((row) => row.releaseAt ? Date.parse(row.releaseAt) : Number.NaN)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const gaps = releaseTimes.slice(1).map((timestamp, index) =>
    Math.max(1, Math.round((timestamp - (releaseTimes[index] ?? timestamp)) / DAY_MS)));
  return median(gaps);
}

export function deriveProductionOperationsOverview(
  aggregate: ProductionProjectAggregate,
  now = new Date(),
): ProductionOperationsOverview {
  const rows = aggregate.episodes
    .map((episode) => deriveEpisodeOperationsRow(aggregate, episode, now))
    .sort((left, right) => {
      if (left.episodeNumber !== null && right.episodeNumber !== null) {
        return left.episodeNumber - right.episodeNumber;
      }
      if (left.releaseAt && right.releaseAt) return Date.parse(left.releaseAt) - Date.parse(right.releaseAt);
      if (left.releaseAt) return -1;
      if (right.releaseAt) return 1;
      return left.episode.episodeId.localeCompare(right.episode.episodeId);
    });
  const nowMs = now.getTime();
  const nextRelease = rows
    .filter((row) => row.episode.state !== "published" && row.releaseAt && Date.parse(row.releaseAt) >= nowMs)
    .sort((left, right) => Date.parse(left.releaseAt!) - Date.parse(right.releaseAt!))[0] ?? null;
  const readyBufferCount = rows.filter((row) =>
    row.episode.state !== "published"
    && (row.episode.state === "publish-ready" || row.progressPercent === 100)
    && row.episode.episodeId !== nextRelease?.episode.episodeId).length;
  return {
    rows,
    nextRelease,
    cadenceDays: deriveCadenceDays(aggregate, rows),
    readyBufferCount,
    criticalCount: rows.filter((row) => row.health === "critical").length,
    riskCount: rows.filter((row) => row.health === "risk").length,
    unplannedCount: rows.filter((row) => row.health === "unplanned").length,
    overdueTaskCount: rows.reduce((sum, row) => sum + row.overdueTasks.length, 0),
    openBlockerCount: rows.reduce((sum, row) => sum + row.episode.openBlockerCount, 0),
    remainingHours: round(rows.reduce((sum, row) => sum + row.remainingHours, 0)),
  };
}

function assignmentIdsForRoles(
  aggregate: ProductionProjectAggregate,
  roles: readonly ProductionRoleType[],
  episodeId: string,
): readonly string[] {
  const rolePriority = new Map(roles.map((role, index) => [role, index]));
  const matches = aggregate.assignments
    .filter((assignment) => assignment.status === "active" && rolePriority.has(assignment.roleType))
    .filter((assignment) => assignment.scope.kind === "project"
      || (assignment.scope.kind === "episode" && assignment.scope.id === episodeId))
    .sort((left, right) => {
      const roleOrder = (rolePriority.get(left.roleType) ?? 999) - (rolePriority.get(right.roleType) ?? 999);
      if (roleOrder !== 0) return roleOrder;
      if (left.lead !== right.lead) return left.lead ? -1 : 1;
      return left.id.localeCompare(right.id);
    });
  return matches.length > 0 ? [matches[0]!.id] : [];
}

function episodeRevisionRefs(episode: EpisodeCollaboration): readonly RevisionRef[] {
  return [
    episode.narrativeRevisionRef,
    episode.visualRevisionRef,
    episode.integratedRevisionRef,
  ].filter((value): value is RevisionRef => value !== null);
}

function taskIdFor(episodeId: string, processKey: string): string {
  return `task-${episodeId}-${processKey}`.slice(0, 160);
}

function titlePrefix(plan: EpisodePlan | null, episodeId: string): string {
  const number = plan?.episodeNumber ?? numericEpisodeId(episodeId);
  return number ? `${number}화` : episodeId;
}

function shiftIso(timestamp: string, daysBeforeRelease: number): string {
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) throw new Error("게시 마감 시간이 올바르지 않습니다.");
  return new Date(value - daysBeforeRelease * DAY_MS).toISOString();
}

function milestoneCompletesProcess(
  episode: EpisodeCollaboration,
  processKey: string,
): boolean {
  switch (processKey) {
    case "story":
      return episode.storyLockApproved;
    case "thumbnail":
      return episode.thumbnailLockApproved;
    case "joint-proof":
      return episode.jointProofApproved;
    case "rights-preflight":
      return episode.creditPreflightPassed && episode.publicationPreflightPassed;
    case "publication":
      return episode.state === "published";
    default:
      return false;
  }
}

export interface BuildEpisodePipelineInput {
  readonly aggregate: ProductionProjectAggregate;
  readonly episode: EpisodeCollaboration;
  readonly episodePlan?: EpisodePlan | null;
  readonly releaseAt: string;
  readonly rebaselineExisting: boolean;
}

export interface EpisodePipelinePlan {
  readonly tasks: readonly ProductionTask[];
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly preservedCompletedCount: number;
}

export function buildEpisodePipelinePlan(input: BuildEpisodePipelineInput): EpisodePipelinePlan {
  const plan = input.episodePlan ?? latestEpisodePlan(input.aggregate, input.episode.episodeId);
  const existingTasks = episodeTasks(input.aggregate, input.episode.episodeId);
  const existingByProcess = new Map(existingTasks
    .filter((task) => task.status !== "cancelled" && task.status !== "out-of-scope")
    .map((task) => [task.processKey, task]));
  const idByProcess = new Map(WEBTOON_EPISODE_PIPELINE.map((step) => [
    step.processKey,
    existingByProcess.get(step.processKey)?.id ?? taskIdFor(input.episode.episodeId, step.processKey),
  ]));
  const tasks: ProductionTask[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let preservedCompletedCount = 0;

  for (const step of WEBTOON_EPISODE_PIPELINE) {
    const existing = existingByProcess.get(step.processKey) ?? null;
    const complete = existing ? COMPLETE_TASK_STATUSES.has(existing.status) : false;
    if (existing && (!input.rebaselineExisting || complete)) {
      tasks.push(existing);
      if (complete && input.rebaselineExisting) preservedCompletedCount += 1;
      continue;
    }
    const dependencyTaskIds = step.dependencyProcessKeys
      .map((processKey) => idByProcess.get(processKey))
      .filter((value): value is string => Boolean(value));
    const assignmentIds = existing?.assignmentIds.length
      ? existing.assignmentIds
      : assignmentIdsForRoles(input.aggregate, step.ownerRoles, input.episode.episodeId);
    const reviewerAssignmentIds = existing?.reviewerAssignmentIds.length
      ? existing.reviewerAssignmentIds
      : step.reviewerRoles.flatMap((role) =>
        assignmentIdsForRoles(input.aggregate, [role], input.episode.episodeId))
        .filter((value, index, all) => all.indexOf(value) === index && !assignmentIds.includes(value));
    const likely = existing?.estimateHours?.likely ?? step.likelyHours;
    const task: ProductionTask = {
      id: existing?.id ?? idByProcess.get(step.processKey)!,
      projectId: input.aggregate.projectId,
      scope: existing?.scope ?? episodeScope(input.aggregate.projectId, input.episode.episodeId),
      processKey: step.processKey,
      title: existing?.title ?? `${titlePrefix(plan, input.episode.episodeId)} ${step.label}`,
      status: existing?.status ?? (milestoneCompletesProcess(input.episode, step.processKey) ? "done" : "draft"),
      assignmentIds,
      reviewerAssignmentIds,
      inputRevisionRefs: existing?.inputRevisionRefs ?? episodeRevisionRefs(input.episode),
      outputDeliverableIds: existing?.outputDeliverableIds ?? [],
      dependencyTaskIds: [...new Set([...(existing?.dependencyTaskIds ?? []), ...dependencyTaskIds])],
      dueAt: shiftIso(input.releaseAt, step.daysBeforeRelease),
      estimateHours: existing?.estimateHours ?? {
        optimistic: round(likely * 0.7),
        likely,
        pessimistic: round(likely * 1.35),
      },
      completionCriteria: existing?.completionCriteria.length
        ? existing.completionCriteria
        : step.completionCriteria,
      sourceAgreementMilestoneId: existing?.sourceAgreementMilestoneId ?? null,
    };
    tasks.push(task);
    if (existing) updatedCount += 1;
    else createdCount += 1;
  }

  return { tasks, createdCount, updatedCount, preservedCompletedCount };
}

export function nextEpisodeNumber(aggregate: ProductionProjectAggregate): number {
  const values = [
    ...aggregate.episodePlans.map((plan) => plan.episodeNumber),
    ...aggregate.episodes
      .map((episode) => numericEpisodeId(episode.episodeId))
      .filter((value): value is number => value !== null),
  ];
  return Math.max(0, ...values) + 1;
}

export function suggestedReleaseAt(
  overview: ProductionOperationsOverview,
  now = new Date(),
): Date {
  const cadenceDays = overview.cadenceDays ?? 7;
  const latest = overview.rows
    .map((row) => row.releaseAt ? Date.parse(row.releaseAt) : Number.NaN)
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  const base = latest && latest > now.getTime() ? new Date(latest) : new Date(now);
  base.setDate(base.getDate() + cadenceDays);
  base.setHours(18, 0, 0, 0);
  return base;
}
