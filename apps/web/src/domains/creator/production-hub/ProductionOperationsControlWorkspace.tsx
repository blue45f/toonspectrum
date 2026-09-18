import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Coins,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  GitBranch,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Play,
  Rocket,
  Save,
  Scissors,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  deriveCriticalPathSchedule,
  derivePersonalProductionInbox,
  deriveProductionFinancialForecast,
  deriveProductionFlowAnalytics,
  deriveScheduleRecoveryScenarios,
  evaluateReleaseReadiness,
  type EpisodeReleasePlan,
  type ExternalReviewAccess,
  type ProductionAutomationRule,
  type ProductionNotification,
  type ProductionNotificationPolicy,
  type ProductionProjectAggregate,
  type ProductionSavedView,
  type ProductionTask,
  type ResourceCalendar,
  type ScheduleBaseline,
  type ScheduleRecoveryScenario,
} from "@toonspectrum/core/production";

import type { ProductionClientCommand } from "./production-api";

import { downloadBlob } from "../export/studio-export";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

type ControlView =
  | "schedule"
  | "inbox"
  | "calendar"
  | "cuts"
  | "release"
  | "review"
  | "automation"
  | "analytics"
  | "views";
type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

interface ProductionOperationsControlWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly canManage: boolean;
}

const DAY_MS = 86_400_000;
const CLOSED_STATUSES = new Set<ProductionTask["status"]>([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);
const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const VIEWS: readonly {
  readonly id: ControlView;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "schedule", label: "일정 회복", description: "임계경로·대안", icon: GitBranch },
  { id: "inbox", label: "개인 작업함", description: "내 업무·검수", icon: ClipboardList },
  { id: "calendar", label: "근무 캘린더", description: "휴가·가용량", icon: CalendarDays },
  { id: "cuts", label: "컷 분배", description: "컷 범위 배정", icon: Scissors },
  { id: "release", label: "연재 계획", description: "플랫폼·현지화", icon: Rocket },
  { id: "review", label: "외부 검수", description: "만료·워터마크", icon: Link2 },
  { id: "automation", label: "자동화·알림", description: "규칙·에스컬레이션", icon: Bot },
  { id: "analytics", label: "분석·예산", description: "병목·비용 전망", icon: BarChart3 },
  { id: "views", label: "저장된 보기", description: "개인화·공유", icon: LayoutDashboard },
];

function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

function formatDate(value: string | null): string {
  if (!value) return "미정";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : "미정";
}

function formatMoney(currency: string, amountMinor: number): string {
  try {
    const formatter = new Intl.NumberFormat("ko-KR", { style: "currency", currency });
    const divisor = 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2);
    return formatter.format(amountMinor / divisor);
  } catch {
    return `${currency} ${amountMinor.toLocaleString("ko-KR")}`;
  }
}

function localToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toneClass(tone: Tone): string {
  return {
    neutral: "border-line bg-raised text-fg-2",
    accent: "border-accent/35 bg-accent-soft text-accent",
    success: "border-good/35 bg-good/10 text-good",
    warning: "border-warn/35 bg-warn/10 text-warn",
    danger: "border-bad/35 bg-bad/10 text-bad",
  }[tone];
}

function Pill({ children, tone = "neutral" }: { readonly children: ReactNode; readonly tone?: Tone }) {
  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold", toneClass(tone))}>
      {children}
    </span>
  );
}

function assignmentName(aggregate: ProductionProjectAggregate, assignmentId: string): string {
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : null;
  return party?.publicDisplayName ?? assignment?.publicCreditRole ?? assignmentId;
}

function activeAssignments(aggregate: ProductionProjectAggregate) {
  return aggregate.assignments.filter((entry) => entry.status === "active");
}

async function sha256Digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(hash)].map((entry) => entry.toString(16).padStart(2, "0")).join("")}`;
}

function currentCutPlans(aggregate: ProductionProjectAggregate, episodeId: string) {
  const latest = new Map<string, (typeof aggregate.cutPlans)[number]>();
  for (const cut of aggregate.cutPlans.filter((entry) => entry.episodeId === episodeId)) {
    const current = latest.get(cut.cutId);
    if (!current || cut.revision > current.revision) latest.set(cut.cutId, cut);
  }
  return [...latest.values()].sort((left, right) => left.order - right.order);
}

function Section({ title, description, children, action }: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-fg">{title}</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-2">{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ProductionOperationsControlWorkspace({
  aggregate,
  execute,
  canEdit,
  canManage,
}: ProductionOperationsControlWorkspaceProps) {
  const [now] = useState(() => new Date());
  const assignments = useMemo(() => activeAssignments(aggregate), [aggregate]);
  const defaultAssignmentId = assignments.find((entry) => entry.roleType === "producer")?.id
    ?? assignments[0]?.id
    ?? "";
  const [view, setView] = useState<ControlView>("schedule");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(defaultAssignmentId);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const schedule = useMemo(
    () => deriveCriticalPathSchedule(aggregate, now),
    [aggregate, now],
  );
  const scenarios = useMemo(
    () => deriveScheduleRecoveryScenarios(aggregate, now),
    [aggregate, now],
  );
  const inbox = useMemo(
    () => derivePersonalProductionInbox(aggregate, selectedAssignmentId, now),
    [aggregate, now, selectedAssignmentId],
  );
  const flowAnalytics = useMemo(
    () => deriveProductionFlowAnalytics(aggregate, now),
    [aggregate, now],
  );
  const financialForecast = useMemo(
    () => deriveProductionFinancialForecast(aggregate, now),
    [aggregate, now],
  );

  const [calendarWeeklyHours, setCalendarWeeklyHours] = useState(40);
  const [calendarDailyHours, setCalendarDailyHours] = useState(8);
  const [calendarWeekdays, setCalendarWeekdays] = useState<readonly number[]>([1, 2, 3, 4, 5]);
  const [timeOffFrom, setTimeOffFrom] = useState("");
  const [timeOffTo, setTimeOffTo] = useState("");
  const [timeOffReason, setTimeOffReason] = useState("");

  const episodeIds = useMemo(
    () => aggregate.episodes.map((entry) => entry.episodeId),
    [aggregate.episodes],
  );
  const [cutEpisodeId, setCutEpisodeId] = useState(episodeIds[0] ?? "");
  const cuts = useMemo(
    () => currentCutPlans(aggregate, cutEpisodeId),
    [aggregate, cutEpisodeId],
  );
  const [cutFrom, setCutFrom] = useState(1);
  const [cutTo, setCutTo] = useState(1);
  const [cutProcessKey, setCutProcessKey] = useState("line-art");
  const [cutAssignmentId, setCutAssignmentId] = useState(defaultAssignmentId);

  const [releaseEpisodeId, setReleaseEpisodeId] = useState(episodeIds[0] ?? "");
  const [releasePlatform, setReleasePlatform] = useState("webtoon");
  const [releaseLocale, setReleaseLocale] = useState("ko-KR");
  const [releaseAt, setReleaseAt] = useState("");
  const [releaseTitle, setReleaseTitle] = useState("");
  const [releaseDescription, setReleaseDescription] = useState("");
  const [releaseThumbnail, setReleaseThumbnail] = useState("");
  const [releaseChecks, setReleaseChecks] = useState<readonly string[]>([]);
  const requiredReleaseChecks = ["image-size", "scroll-order", "credit", "rights", "age-rating"] as const;

  const approvedSubmissions = aggregate.submissions.filter((entry) => entry.status === "approved");
  const [reviewSubmissionId, setReviewSubmissionId] = useState(approvedSubmissions[0]?.id ?? "");
  const [reviewLabel, setReviewLabel] = useState("편집부 최종 검수");
  const [reviewExpiresAt, setReviewExpiresAt] = useState("");
  const [reviewAllowDownload, setReviewAllowDownload] = useState(false);
  const [generatedReviewLink, setGeneratedReviewLink] = useState<string | null>(null);

  const [automationName, setAutomationName] = useState("마감 경과 즉시 알림");
  const [automationTrigger, setAutomationTrigger] = useState<ProductionAutomationRule["trigger"]>("due-passed");
  const [savedViewName, setSavedViewName] = useState("내 운영 조종석");
  const [savedViewDensity, setSavedViewDensity] = useState<ProductionSavedView["density"]>("comfortable");
  const [savedViewShared, setSavedViewShared] = useState(false);

  const run = async (key: string, operation: () => Promise<void>) => {
    if (busyKey) return;
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "작업을 완료하지 못했습니다.");
    } finally {
      setBusyKey(null);
    }
  };

  const saveRecord = (
    record: Extract<ProductionClientCommand, { readonly type: "upsert-operations-record" }>["record"],
    message: string,
  ) => execute({ type: "upsert-operations-record", record }, message);

  const applyScenario = (scenario: ScheduleRecoveryScenario) => run(`scenario:${scenario.id}`, async () => {
    if (!canEdit || !selectedAssignmentId) return;
    const tasks = aggregate.tasks
      .filter((task) => !CLOSED_STATUSES.has(task.status) && scenario.forecastByTaskId[task.id])
      .map((task) => ({ ...task, dueAt: scenario.forecastByTaskId[task.id]! }));
    const baseline: ScheduleBaseline = {
      id: id(`baseline-${scenario.id}`),
      projectId: aggregate.projectId,
      name: `${scenario.label} · ${new Date().toLocaleDateString("ko-KR")}`,
      createdByAssignmentId: selectedAssignmentId,
      releaseAt: schedule.releaseAt,
      items: tasks.map((task) => ({
        taskId: task.id,
        dueAt: task.dueAt,
        assignmentIds: task.assignmentIds,
        estimateLikelyHours: task.estimateHours?.likely ?? null,
      })),
      active: true,
      createdAt: new Date().toISOString(),
    };
    await execute({ type: "apply-schedule-scenario", baseline, tasks }, `${scenario.label} 일정안을 적용했습니다.`);
    setNotice(`${scenario.label} 기준선과 ${tasks.length}개 업무 마감을 원자적으로 저장했습니다.`);
  });

  const loadCalendar = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    const calendar = (aggregate.resourceCalendars ?? []).find((entry) => entry.assignmentId === assignmentId);
    setCalendarWeeklyHours(calendar?.weeklyHours ?? 40);
    setCalendarDailyHours(calendar?.dailyHours ?? 8);
    setCalendarWeekdays(calendar?.workingWeekdays ?? [1, 2, 3, 4, 5]);
  };

  const saveCalendar = () => run("calendar", async () => {
    if (!canManage || !selectedAssignmentId) return;
    const current = (aggregate.resourceCalendars ?? []).find((entry) => entry.assignmentId === selectedAssignmentId);
    const nextException = timeOffFrom && timeOffTo
      ? [{
          id: id("calendar-exception"),
          type: "time-off" as const,
          startsAt: new Date(`${timeOffFrom}T00:00:00`).toISOString(),
          endsAt: new Date(`${timeOffTo}T23:59:59`).toISOString(),
          availableHours: 0,
          reason: timeOffReason.trim() || "부재",
        }]
      : [];
    const calendar: ResourceCalendar = {
      id: current?.id ?? id("resource-calendar"),
      projectId: aggregate.projectId,
      assignmentId: selectedAssignmentId,
      timezone: "Asia/Seoul",
      weeklyHours: calendarWeeklyHours,
      dailyHours: calendarDailyHours,
      workingWeekdays: calendarWeekdays,
      exceptions: [...(current?.exceptions ?? []), ...nextException],
      revision: (current?.revision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveRecord({ kind: "resource-calendar", value: calendar }, "근무 캘린더를 저장했습니다.");
    setTimeOffFrom("");
    setTimeOffTo("");
    setTimeOffReason("");
    setNotice("휴가와 가용 시간이 일정·작업량 계산에 반영되었습니다.");
  });

  const assignCuts = () => run("cuts", async () => {
    if (!canEdit || !cutAssignmentId || cuts.length === 0) return;
    const lower = Math.max(1, Math.min(cutFrom, cutTo));
    const upper = Math.min(cuts.length, Math.max(cutFrom, cutTo));
    const selectedCuts = cuts.slice(lower - 1, upper);
    const duplicateCutIds = selectedCuts
      .filter((cut) => aggregate.tasks.some((task) =>
        task.scope.kind === "cut"
        && task.scope.id === cut.cutId
        && task.processKey === cutProcessKey
        && !CLOSED_STATUSES.has(task.status)))
      .map((cut) => cut.cutId);
    if (duplicateCutIds.length > 0) {
      throw new Error(`이미 같은 공정이 배정된 컷이 있습니다: ${duplicateCutIds.join(", ")}`);
    }
    const episode = aggregate.episodes.find((entry) => entry.episodeId === cutEpisodeId);
    const reviewers = assignments
      .filter((entry) => entry.roleType === "art-lead" || entry.roleType === "editor")
      .map((entry) => entry.id)
      .slice(0, 2);
    const dueAt = aggregate.tasks
      .filter((task) => task.scope.kind === "episode" && task.scope.id === cutEpisodeId && task.processKey === cutProcessKey)
      .map((task) => task.dueAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0]
      ?? new Date(now.getTime() + 7 * DAY_MS).toISOString();
    const tasks: ProductionTask[] = selectedCuts.map((cut) => ({
      id: id(`task-${cutProcessKey}-${cut.cutId}`),
      projectId: aggregate.projectId,
      scope: {
        kind: "cut",
        id: cut.cutId,
        ancestors: [
          { kind: "project", id: aggregate.projectId },
          { kind: "episode", id: cut.episodeId },
          { kind: "scene", id: cut.sceneId },
        ],
      },
      processKey: cutProcessKey,
      title: `${cutEpisodeId} ${cut.order}컷 ${cutProcessKey}`,
      status: "ready",
      assignmentIds: [cutAssignmentId],
      reviewerAssignmentIds: reviewers,
      inputRevisionRefs: [episode?.narrativeRevisionRef, episode?.visualRevisionRef]
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry !== undefined),
      outputDeliverableIds: [],
      dependencyTaskIds: [],
      dueAt,
      estimateHours: {
        optimistic: Math.max(0.25, cut.estimatedHours * 0.75),
        likely: Math.max(0.25, cut.estimatedHours),
        pessimistic: Math.max(0.5, cut.estimatedHours * 1.5),
      },
      completionCriteria: [
        `${cut.cutId} ${cutProcessKey} 산출물 제출`,
        "컷 계획의 구도·카메라·레이어 요구 충족",
      ],
      sourceAgreementMilestoneId: null,
    }));
    await execute({ type: "upsert-task-batch", tasks }, `${tasks.length}개 컷 업무를 배정했습니다.`);
    setNotice(`${lower}~${upper}번 컷을 ${assignmentName(aggregate, cutAssignmentId)}에게 원자적으로 배정했습니다.`);
  });

  const currentReleasePlan = (aggregate.releasePlans ?? []).find((plan) =>
    plan.episodeId === releaseEpisodeId
    && plan.platformKey === releasePlatform
    && plan.locale === releaseLocale) ?? null;
  const releaseDraft: EpisodeReleasePlan = {
    id: currentReleasePlan?.id ?? id(`release-${releaseEpisodeId}-${releasePlatform}-${releaseLocale}`),
    projectId: aggregate.projectId,
    episodeId: releaseEpisodeId,
    platformKey: releasePlatform,
    locale: releaseLocale,
    timezone: "Asia/Seoul",
    scheduledAt: localToIso(releaseAt),
    status: currentReleasePlan?.status ?? "draft",
    title: releaseTitle,
    description: releaseDescription,
    thumbnailRevisionRef: releaseThumbnail.trim() || null,
    sourceSubmissionIds: approvedSubmissions.map((entry) => entry.id).slice(0, 1),
    requiredCheckKeys: requiredReleaseChecks,
    passedCheckKeys: releaseChecks,
    blockers: [],
    warnings: [],
    externalReleaseId: currentReleasePlan?.externalReleaseId ?? null,
    externalUrl: currentReleasePlan?.externalUrl ?? null,
    revision: (currentReleasePlan?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  const releaseReadiness = evaluateReleaseReadiness(aggregate, releaseDraft);

  const saveReleasePlan = (status: EpisodeReleasePlan["status"]) => run(`release:${status}`, async () => {
    if (!canEdit || !releaseEpisodeId) return;
    const plan: EpisodeReleasePlan = {
      ...releaseDraft,
      status,
      revision: (currentReleasePlan?.revision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveRecord({ kind: "release-plan", value: plan }, status === "scheduled" ? "연재 일정을 예약했습니다." : "연재 계획을 저장했습니다.");
    setNotice(status === "scheduled" ? "플랫폼별 연재 일정이 예약 상태로 전환됐습니다." : "연재 사전 검사 결과를 저장했습니다.");
  });

  const downloadReleaseManifest = (plan: EpisodeReleasePlan) => {
    const submissions = plan.sourceSubmissionIds.map((submissionId) => {
      const submission = aggregate.submissions.find((entry) => entry.id === submissionId);
      const deliverable = submission
        ? aggregate.deliverables.find((entry) => entry.id === submission.deliverableId) ?? null
        : null;
      return {
        submissionId,
        status: submission?.status ?? "missing",
        revisionRef: submission?.revisionRef ?? null,
        evidenceRefs: submission?.evidenceRefs ?? [],
        deliverable: deliverable ? {
          id: deliverable.id,
          type: deliverable.type,
          expectedFormat: deliverable.expectedFormat,
          completionCriteria: deliverable.completionCriteria,
        } : null,
      };
    });
    const manifest = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      project: { id: aggregate.projectId, title: aggregate.title, workId: aggregate.workId },
      releasePlan: plan,
      readiness: evaluateReleaseReadiness(aggregate, plan),
      submissions,
    };
    const filename = `${aggregate.title}-${plan.episodeId}-${plan.platformKey}-${plan.locale}-release-manifest.json`
      .replace(/[^\p{L}\p{N}._-]+/gu, "-");
    downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), filename);
    setNotice("플랫폼 API가 없는 경우 사용할 수 있는 업로드 manifest를 내려받았습니다.");
  };

  const updateReleaseStatus = (
    plan: EpisodeReleasePlan,
    status: Extract<EpisodeReleasePlan["status"], "published" | "failed" | "withdrawn">,
  ) => run(`release-status:${plan.id}:${status}`, async () => {
    if (!canEdit) return;
    await saveRecord({
      kind: "release-plan",
      value: { ...plan, status, revision: plan.revision + 1, updatedAt: new Date().toISOString() },
    }, status === "published" ? "실제 공개를 기록했습니다." : status === "failed" ? "게시 실패를 기록했습니다." : "공개 회수를 기록했습니다.");
    setNotice(status === "published" ? "플랫폼 실제 공개 상태를 기록했습니다." : "수동 게시 상태 변경을 감사 이력에 남겼습니다.");
  });

  const generateExternalReview = () => run("external-review", async () => {
    if (!canManage || !reviewSubmissionId || !selectedAssignmentId) return;
    const token = `${globalThis.crypto?.randomUUID?.() ?? Date.now()}${globalThis.crypto?.randomUUID?.() ?? "token"}`.replaceAll("-", "");
    const reviewId = id("external-review");
    const digest = await sha256Digest(token);
    const scope = aggregate.deliverables.find((entry) => entry.currentSubmissionId === reviewSubmissionId)?.scope
      ?? { kind: "project" as const, id: aggregate.projectId, ancestors: [] };
    const permissions: ExternalReviewAccess["permissions"] = reviewAllowDownload
      ? ["view", "comment", "approve", "download"]
      : ["view", "comment", "approve"];
    const access: ExternalReviewAccess = {
      id: reviewId,
      projectId: aggregate.projectId,
      scope,
      label: reviewLabel.trim() || "외부 검수",
      tokenDigest: digest,
      submissionIds: [reviewSubmissionId],
      permissions,
      watermark: true,
      expiresAt: localToIso(reviewExpiresAt) ?? new Date(now.getTime() + 7 * DAY_MS).toISOString(),
      status: "active",
      createdByAssignmentId: selectedAssignmentId,
      createdAt: new Date().toISOString(),
      lastAccessedAt: null,
      responses: [],
    };
    await saveRecord({ kind: "external-review-access", value: access }, "외부 검수 링크를 만들었습니다.");
    const link = `${globalThis.location?.origin ?? ""}/production/review/${encodeURIComponent(aggregate.projectId)}/${encodeURIComponent(reviewId)}?token=${encodeURIComponent(token)}`;
    setGeneratedReviewLink(link);
    setNotice("원문 토큰은 다시 표시되지 않습니다. 지금 링크를 복사해 전달해 주세요.");
  });

  const revokeExternalReview = (access: ExternalReviewAccess) => run(`external-review-revoke:${access.id}`, async () => {
    if (!canManage) return;
    await saveRecord({ kind: "external-review-access", value: { ...access, status: "revoked" } }, "외부 검수 접근을 회수했습니다.");
    setNotice(`${access.label} 링크를 즉시 비활성화했습니다.`);
  });

  const saveAutomation = () => run("automation-save", async () => {
    if (!canManage || !selectedAssignmentId) return;
    const existing = (aggregate.automationRules ?? []).find((entry) => entry.name === automationName);
    const rule: ProductionAutomationRule = {
      id: existing?.id ?? id("automation-rule"),
      projectId: aggregate.projectId,
      name: automationName.trim() || "제작 자동화",
      trigger: automationTrigger,
      conditions: automationTrigger === "task-status-changed"
        ? [{ field: "task-status", operator: "equals", value: "changes-requested" }]
        : [],
      actions: [{
        type: "notify",
        assignmentIds: [selectedAssignmentId],
        urgency: automationTrigger === "due-passed" ? "critical" : "warning",
        message: `${automationName.trim() || "제작 자동화"} 조건이 충족됐습니다.`,
      }],
      failurePolicy: "require-review",
      enabled: true,
      revision: (existing?.revision ?? 0) + 1,
      lastEvaluatedAt: existing?.lastEvaluatedAt ?? null,
      createdByAssignmentId: selectedAssignmentId,
      updatedAt: new Date().toISOString(),
    };
    await saveRecord({ kind: "automation-rule", value: rule }, "자동화 규칙을 저장했습니다.");
    setNotice("자동화는 승인·공개·지급을 직접 수행하지 않고 조치 항목만 생성합니다.");
  });

  const runAutomations = () => run("automation-run", async () => {
    if (!canManage) return;
    const rules = (aggregate.automationRules ?? []).filter((entry) => entry.enabled);
    if (rules.length === 0) {
      setNotice("실행할 활성 자동화 규칙이 없습니다.");
      return;
    }
    const executionTime = new Date();
    const plan = deriveProductionAutomationExecutionPlan(aggregate, rules, executionTime);
    await execute({
      type: "apply-automation-execution",
      tasks: plan.tasks,
      notifications: plan.notifications,
      evaluatedRules: plan.evaluatedRules,
    }, "자동화 업무·알림·실행 상태를 하나의 변경으로 저장했습니다.");
    const suppressed = plan.suppressedTaskCount + plan.suppressedNotificationCount;
    setNotice(
      `자동화 결과: 조건 ${plan.matchedSourceCount}건 · 업무 ${plan.tasks.length}개 · 알림 ${plan.notifications.length}개`
      + (suppressed > 0 ? ` · 중복 ${suppressed}건 억제` : ""),
    );
  });

  const saveNotificationPolicy = () => run("notification-policy", async () => {
    if (!canManage || !selectedAssignmentId) return;
    const current = (aggregate.notificationPolicies ?? []).find((entry) => entry.assignmentId === selectedAssignmentId);
    const policy: ProductionNotificationPolicy = {
      id: current?.id ?? id("notification-policy"),
      projectId: aggregate.projectId,
      assignmentId: selectedAssignmentId,
      channels: ["in-app", "email"],
      digest: "immediate",
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      dueSoonHours: 48,
      escalationHours: 24,
      enabled: true,
      updatedAt: new Date().toISOString(),
    };
    await saveRecord({ kind: "notification-policy", value: policy }, "알림·에스컬레이션 정책을 저장했습니다.");
    setNotice("마감 48시간 전 알림, 24시간 지연 시 에스컬레이션 정책이 저장됐습니다.");
  });

  const markNotificationRead = (notification: ProductionNotification) => run(`notification-read:${notification.id}`, async () => {
    await saveRecord({
      kind: "notification",
      value: { ...notification, status: "read", readAt: new Date().toISOString() },
    }, "알림을 읽음 처리했습니다.");
  });

  const saveView = () => run("saved-view", async () => {
    if (!canEdit) return;
    const existing = (aggregate.savedViews ?? []).find((entry) =>
      entry.ownerAssignmentId === selectedAssignmentId && entry.name === savedViewName);
    const savedView: ProductionSavedView = {
      id: existing?.id ?? id("saved-view"),
      projectId: aggregate.projectId,
      ownerAssignmentId: selectedAssignmentId || null,
      name: savedViewName.trim() || "운영 보기",
      resource: "portfolio",
      filters: { role: selectedAssignmentId || "all", controlView: view },
      sort: [{ field: "risk", direction: "desc" }],
      columns: ["episode", "process", "owner", "dueAt", "risk", "progress"],
      density: savedViewDensity,
      shared: savedViewShared,
      dashboardWidgets: ["health", "critical-path", "inbox", "release", "capacity", "notifications"],
      updatedAt: new Date().toISOString(),
    };
    await saveRecord({ kind: "saved-view", value: savedView }, "저장된 보기를 만들었습니다.");
    setNotice(savedView.shared ? "팀 공유 보기를 저장했습니다." : "개인 운영 보기를 저장했습니다.");
  });

  const unreadNotifications = (aggregate.notifications ?? []).filter((entry) => entry.status === "unread");
  const activeExternalReviews = (aggregate.externalReviewAccesses ?? []).filter((entry) => entry.status === "active");

  return (
    <div className="space-y-4" data-production-operations-control>
      <section className="overflow-hidden rounded-3xl border border-accent/30 bg-card">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="accent">Production OS</Pill>
              <Pill tone={schedule.cycleTaskIds.length > 0 ? "danger" : schedule.marginHours !== null && schedule.marginHours < 0 ? "warning" : "success"}>
                {schedule.cycleTaskIds.length > 0
                  ? `의존 순환 ${schedule.cycleTaskIds.length}건`
                  : schedule.marginHours === null
                    ? "게시 목표 미연결"
                    : schedule.marginHours < 0
                      ? `예상 ${Math.ceil(Math.abs(schedule.marginHours) / 24)}일 지연`
                      : `게시 여유 ${Math.floor(schedule.marginHours / 24)}일`}
              </Pill>
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">제작 운영 완성도 센터</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
              실제 근무 캘린더, 임계경로, 컷 배정, 플랫폼별 연재, 외부 검수, 자동화와 개인화 설정을 한곳에서 운영합니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-line bg-panel p-3">
              <p className="text-[0.6875rem] font-bold text-fg-3">임계 업무</p>
              <p className="mt-1 text-xl font-black text-fg">{schedule.criticalTaskIds.length}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-3">
              <p className="text-[0.6875rem] font-bold text-fg-3">완료 신뢰도</p>
              <p className="mt-1 text-xl font-black text-fg">{schedule.confidencePercent === null ? "—" : `${schedule.confidencePercent}%`}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel p-3">
              <p className="text-[0.6875rem] font-bold text-fg-3">외부 검수</p>
              <p className="mt-1 text-xl font-black text-fg">{activeExternalReviews.length}</p>
            </div>
            <div className={cn("rounded-xl border p-3", unreadNotifications.length > 0 ? "border-warn/35 bg-warn/10" : "border-line bg-panel")}>
              <p className="text-[0.6875rem] font-bold text-fg-3">읽지 않은 알림</p>
              <p className="mt-1 text-xl font-black text-fg">{unreadNotifications.length}</p>
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="제작 운영 도구" className="overflow-x-auto rounded-2xl border border-line bg-card p-2">
        <div className="flex min-w-max gap-1">
          {VIEWS.map(({ id: itemId, label, description, icon: Icon }) => (
            <button
              key={itemId}
              type="button"
              aria-pressed={view === itemId}
              className={cn(
                "flex min-h-12 items-center gap-2 rounded-xl px-3 text-left transition-colors",
                view === itemId ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
              )}
              onClick={() => setView(itemId)}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-xs font-black">{label}</span>
                <span className={cn("mt-0.5 block text-[0.625rem]", view === itemId ? "text-on-accent/75" : "text-fg-3")}>{description}</span>
              </span>
            </button>
          ))}
        </div>
      </nav>

      {notice ? <div role="status" className="rounded-xl border border-good/35 bg-good/10 px-4 py-3 text-xs font-semibold text-fg">{notice}</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-bad/35 bg-bad/10 px-4 py-3 text-xs font-semibold text-fg">{error}</div> : null}

      {view === "schedule" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-line bg-card p-4"><p className="text-[0.6875rem] font-bold text-fg-3">예상 완료</p><p className="mt-2 text-lg font-black text-fg">{formatDate(schedule.projectFinishAt)}</p></div>
            <div className="rounded-2xl border border-line bg-card p-4"><p className="text-[0.6875rem] font-bold text-fg-3">게시 목표</p><p className="mt-2 text-lg font-black text-fg">{formatDate(schedule.releaseAt)}</p></div>
            <div className="rounded-2xl border border-line bg-card p-4"><p className="text-[0.6875rem] font-bold text-fg-3">예상 공정 길이</p><p className="mt-2 text-lg font-black text-fg">{Math.round(schedule.projectDurationHours)}h</p></div>
            <div className={cn("rounded-2xl border p-4", schedule.marginHours !== null && schedule.marginHours < 0 ? "border-bad/35 bg-bad/10" : "border-good/35 bg-good/10")}><p className="text-[0.6875rem] font-bold text-fg-3">일정 여유</p><p className="mt-2 text-lg font-black text-fg">{schedule.marginHours === null ? "—" : `${Math.round(schedule.marginHours)}h`}</p></div>
          </div>

          <Section
            title="일정 회복 시나리오"
            description="현재 계획과 검수 병렬화·핵심 작화 분할·임계 공정 용량 추가안을 동일 기준으로 비교합니다. 적용 전 예상 완료일, 절감 시간과 부작용을 확인할 수 있습니다."
          >
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
              {scenarios.map((scenario) => {
                const baseline = scenario.id === "baseline";
                const active = busyKey === `scenario:${scenario.id}`;
                const tone: Tone = baseline
                  ? "neutral"
                  : scenario.savedHours > 0
                    ? "success"
                    : "warning";
                return (
                  <article key={scenario.id} className={cn("rounded-2xl border p-4", toneClass(tone))}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Pill tone={tone}>{baseline ? "기준안" : `${Math.round(scenario.savedHours)}h 단축`}</Pill>
                        <h4 className="mt-2 text-sm font-black text-fg">{scenario.label}</h4>
                      </div>
                      <span className="text-right text-[0.6875rem] text-fg-3">
                        {scenario.confidencePercent === null ? "신뢰도 —" : `신뢰도 ${scenario.confidencePercent}%`}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-fg-2">{scenario.description}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-[0.6875rem]">
                      <div className="rounded-lg border border-line/70 bg-card/70 p-2">
                        <dt className="text-fg-3">예상 완료</dt>
                        <dd className="mt-1 font-bold text-fg">{formatDate(scenario.projectFinishAt)}</dd>
                      </div>
                      <div className="rounded-lg border border-line/70 bg-card/70 p-2">
                        <dt className="text-fg-3">비용 영향</dt>
                        <dd className="mt-1 font-bold text-fg">{scenario.costImpact}</dd>
                      </div>
                    </dl>
                    <ul className="mt-3 space-y-1 text-[0.6875rem] leading-5 text-fg-2">
                      {scenario.tradeoffs.map((tradeoff) => (
                        <li key={tradeoff} className="flex gap-2">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" />
                          <span>{tradeoff}</span>
                        </li>
                      ))}
                    </ul>
                    {!baseline ? (
                      <button
                        type="button"
                        className={cn(buttonClass({ size: "sm" }), "mt-4 w-full")}
                        disabled={!canEdit || busyKey !== null || scenario.affectedTaskIds.length === 0}
                        onClick={() => void applyScenario(scenario)}
                      >
                        {active ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                        {active ? "적용 중…" : "이 일정안 적용"}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </Section>

          <Section
            title="임계경로와 여유시간"
            description="공수의 3점 추정값과 의존관계를 사용해 가장 긴 제작 경로, 총 여유시간과 근무 캘린더 기준 예상 완료일을 계산합니다."
            action={schedule.cycleTaskIds.length > 0 ? <Pill tone="danger">순환 의존성 해결 필요</Pill> : <Pill tone="success">의존성 정상</Pill>}
          >
            {schedule.nodes.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[56rem] border-collapse text-left">
                  <thead className="bg-panel text-[0.6875rem] font-black uppercase tracking-[0.08em] text-fg-3">
                    <tr>
                      <th className="px-3 py-3">업무</th>
                      <th className="px-3 py-3">공정</th>
                      <th className="px-3 py-3 text-right">예상 공수</th>
                      <th className="px-3 py-3 text-right">총 여유</th>
                      <th className="px-3 py-3">예상 시작</th>
                      <th className="px-3 py-3">예상 완료</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.nodes.map((node) => (
                      <tr key={node.task.id} className={cn("border-t border-line text-xs", node.critical && "bg-bad/5")}>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            {node.critical ? <Pill tone="danger">임계</Pill> : <Pill tone="neutral">여유</Pill>}
                            <span className="font-bold text-fg">{node.task.title}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-fg-2">{node.task.processKey}</td>
                        <td className="px-3 py-3 text-right font-semibold text-fg">{Math.round(node.expectedHours * 10) / 10}h</td>
                        <td className="px-3 py-3 text-right font-semibold text-fg">{Math.round(node.totalFloatHours * 10) / 10}h</td>
                        <td className="px-3 py-3 text-fg-2">{formatDate(node.forecastStartAt)}</td>
                        <td className="px-3 py-3 text-fg-2">{formatDate(node.forecastEndAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line p-8 text-center">
                <AlertTriangle className="mx-auto size-8 text-warn" aria-hidden="true" />
                <p className="mt-3 text-sm font-black text-fg">계산 가능한 일정이 없습니다</p>
                <p className="mt-1 text-xs text-fg-2">작업 공수와 의존관계를 확인하거나 순환 의존성을 해소해 주세요.</p>
              </div>
            )}
          </Section>
        </div>
      ) : null}

      {view === "inbox" ? (
        <div className="space-y-4">
          <Section
            title="개인 통합 작업함"
            description="프로젝트 화면을 순회하지 않고 시작 가능 업무, 진행 중, 오늘 제출, 내 검수, 입력 대기와 다른 사람을 막고 있는 업무를 한곳에서 처리합니다."
            action={(
              <label className="flex items-center gap-2 text-xs font-semibold text-fg-2">
                담당자
                <select
                  aria-label="개인 작업함 담당자"
                  className="min-h-9 rounded-lg border border-line bg-panel px-2 text-fg"
                  value={selectedAssignmentId}
                  onChange={(event) => loadCalendar(event.target.value)}
                >
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>{assignmentName(aggregate, assignment.id)}</option>
                  ))}
                </select>
              </label>
            )}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {([
                ["dueToday", "오늘 제출", inbox.dueToday, "danger"],
                ["inProgress", "진행 중", inbox.inProgress, "accent"],
                ["ready", "지금 시작 가능", inbox.ready, "success"],
                ["review", "내 검수", inbox.review, "warning"],
                ["waitingInput", "입력 대기", inbox.waitingInput, "warning"],
                ["blockingOthers", "내가 막고 있는 업무", inbox.blockingOthers, "danger"],
              ] as const).map(([key, label, tasks, tone]) => (
                <article key={key} className="rounded-2xl border border-line bg-panel p-4">
                  <header className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-fg">{label}</h4>
                    <Pill tone={tone}>{tasks.length}</Pill>
                  </header>
                  <div className="mt-3 space-y-2">
                    {tasks.slice(0, 6).map((task) => (
                      <a
                        key={task.id}
                        href={`/production/projects/${encodeURIComponent(aggregate.projectId)}/production?task=${encodeURIComponent(task.id)}`}
                        className="block rounded-xl border border-line bg-card p-3 transition-colors hover:border-accent/40 hover:bg-raised"
                      >
                        <p className="text-xs font-bold text-fg">{task.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-fg-3">
                          <span>{task.processKey}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDate(task.dueAt)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{task.estimateHours?.likely ?? 0}h</span>
                        </div>
                      </a>
                    ))}
                    {tasks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3">해당 업무가 없습니다.</div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </Section>
        </div>
      ) : null}

      {view === "calendar" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(20rem,0.6fr)]">
          <Section
            title="근무 캘린더와 가용량"
            description="팀원별 근무 요일, 일·주간 가용 시간, 휴가·공휴일·초과 근무를 일정 계산에 반영합니다."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-fg-2 sm:col-span-2">
                대상 담당자
                <select
                  className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg"
                  value={selectedAssignmentId}
                  onChange={(event) => loadCalendar(event.target.value)}
                >
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>{assignmentName(aggregate, assignment.id)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-fg-2">
                주간 가용 시간
                <input
                  className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg"
                  type="number"
                  min={1}
                  max={168}
                  value={calendarWeeklyHours}
                  onChange={(event) => setCalendarWeeklyHours(Number(event.target.value))}
                />
              </label>
              <label className="text-xs font-semibold text-fg-2">
                하루 가용 시간
                <input
                  className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg"
                  type="number"
                  min={1}
                  max={24}
                  value={calendarDailyHours}
                  onChange={(event) => setCalendarDailyHours(Number(event.target.value))}
                />
              </label>
            </div>
            <fieldset className="mt-4">
              <legend className="text-xs font-semibold text-fg-2">근무 요일</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {["일", "월", "화", "수", "목", "금", "토"].map((label, day) => {
                  const checked = calendarWeekdays.includes(day);
                  return (
                    <label key={label} className={cn("flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-bold", checked ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg-2")}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => setCalendarWeekdays(checked
                          ? calendarWeekdays.filter((value) => value !== day)
                          : [...calendarWeekdays, day].sort())}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="mt-5 rounded-xl border border-line bg-panel p-4">
              <h4 className="text-xs font-black text-fg">휴가·부재 추가</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-fg-2">시작일<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg" type="date" value={timeOffFrom} onChange={(event) => setTimeOffFrom(event.target.value)} /></label>
                <label className="text-xs font-semibold text-fg-2">종료일<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg" type="date" value={timeOffTo} onChange={(event) => setTimeOffTo(event.target.value)} /></label>
                <label className="text-xs font-semibold text-fg-2 sm:col-span-2">사유<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg" value={timeOffReason} onChange={(event) => setTimeOffReason(event.target.value)} placeholder="휴가, 병가, 외부 일정" /></label>
              </div>
            </div>
            <button type="button" className={cn(buttonClass(), "mt-4 w-full")} disabled={!canManage || busyKey !== null || !selectedAssignmentId || calendarWeekdays.length === 0} onClick={() => void saveCalendar()}>
              {busyKey === "calendar" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              근무 캘린더 저장
            </button>
          </Section>

          <Section
            title="등록된 예외 일정"
            description="휴가·공휴일·가용량 변경은 임계경로와 담당자 배정 예측에 즉시 반영됩니다."
          >
            <div className="space-y-2">
              {((aggregate.resourceCalendars ?? []).find((entry) => entry.assignmentId === selectedAssignmentId)?.exceptions ?? []).map((exception) => (
                <div key={exception.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Pill tone={exception.type === "time-off" || exception.type === "holiday" ? "warning" : "accent"}>{exception.type}</Pill>
                    <span className="text-[0.6875rem] text-fg-3">{exception.availableHours}h</span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-fg">{exception.reason}</p>
                  <p className="mt-1 text-[0.6875rem] text-fg-3">{formatDate(exception.startsAt)} → {formatDate(exception.endsAt)}</p>
                </div>
              ))}
              {((aggregate.resourceCalendars ?? []).find((entry) => entry.assignmentId === selectedAssignmentId)?.exceptions.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-8 text-center text-xs text-fg-3">등록된 예외 일정이 없습니다.</div>
              ) : null}
            </div>
          </Section>
        </div>
      ) : null}

      {view === "cuts" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(22rem,0.7fr)]">
          <Section
            title="컷 범위 업무 배정"
            description="회차의 연속 컷 범위를 하나의 공정으로 나누어 배정합니다. 같은 컷·공정의 열린 업무가 이미 있으면 중복 배정을 차단합니다."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-fg-2 sm:col-span-2">회차<select className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={cutEpisodeId} onChange={(event) => { setCutEpisodeId(event.target.value); setCutFrom(1); setCutTo(1); }}>
                {episodeIds.map((episodeId) => <option key={episodeId} value={episodeId}>{episodeId}</option>)}
              </select></label>
              <label className="text-xs font-semibold text-fg-2">시작 컷<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" type="number" min={1} max={Math.max(1, cuts.length)} value={cutFrom} onChange={(event) => setCutFrom(Number(event.target.value))} /></label>
              <label className="text-xs font-semibold text-fg-2">종료 컷<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" type="number" min={1} max={Math.max(1, cuts.length)} value={cutTo} onChange={(event) => setCutTo(Number(event.target.value))} /></label>
              <label className="text-xs font-semibold text-fg-2">공정<select className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={cutProcessKey} onChange={(event) => setCutProcessKey(event.target.value)}>
                <option value="line-art">선화</option><option value="background">배경</option><option value="color">채색</option><option value="lettering">식자</option><option value="effect">효과</option>
              </select></label>
              <label className="text-xs font-semibold text-fg-2">담당자<select className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={cutAssignmentId} onChange={(event) => setCutAssignmentId(event.target.value)}>
                {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignmentName(aggregate, assignment.id)}</option>)}
              </select></label>
            </div>
            <button type="button" className={cn(buttonClass(), "mt-4 w-full")} disabled={!canEdit || busyKey !== null || cuts.length === 0 || !cutAssignmentId} onClick={() => void assignCuts()}>
              {busyKey === "cuts" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Scissors className="size-4" aria-hidden="true" />}
              선택 범위 업무로 배정
            </button>
          </Section>

          <Section title="선택 범위 미리보기" description={`${cuts.length}개 컷 중 실제 배정될 범위와 예상 공수를 확인합니다.`}>
            <div className="space-y-2 max-h-[34rem] overflow-y-auto pr-1">
              {cuts.map((cut, index) => {
                const selected = index + 1 >= Math.min(cutFrom, cutTo) && index + 1 <= Math.max(cutFrom, cutTo);
                return (
                  <div key={cut.cutId} className={cn("rounded-xl border p-3", selected ? "border-accent/40 bg-accent-soft" : "border-line bg-panel opacity-65")}>
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-fg">{cut.order}컷 · {cut.cutId}</span><Pill tone={selected ? "accent" : "neutral"}>{cut.estimatedHours}h</Pill></div>
                    <p className="mt-1 text-[0.6875rem] text-fg-2">{cut.framing} · {cut.camera} · {cut.layerRequirements.length}개 레이어 요구</p>
                  </div>
                );
              })}
              {cuts.length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-xs text-fg-3">이 회차에 최신 컷 계획이 없습니다.</div> : null}
            </div>
          </Section>
        </div>
      ) : null}

      {view === "release" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(22rem,0.6fr)]">
          <Section
            title="플랫폼·언어별 연재 계획"
            description="원본 회차에서 플랫폼과 언어별 변형본을 분리하고, 승인본·메타데이터·썸네일·권리·규격 검사를 통과한 경우에만 예약합니다."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-fg-2">회차<select className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={releaseEpisodeId} onChange={(event) => setReleaseEpisodeId(event.target.value)}>{episodeIds.map((episodeId) => <option key={episodeId} value={episodeId}>{episodeId}</option>)}</select></label>
              <label className="text-xs font-semibold text-fg-2">플랫폼<select className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={releasePlatform} onChange={(event) => setReleasePlatform(event.target.value)}><option value="naver-webtoon">네이버웹툰</option><option value="kakao-page">카카오페이지</option><option value="webtoon">WEBTOON</option><option value="tapas">Tapas</option><option value="community">자체 커뮤니티</option></select></label>
              <label className="text-xs font-semibold text-fg-2">언어<select className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={releaseLocale} onChange={(event) => setReleaseLocale(event.target.value)}><option value="ko-KR">한국어</option><option value="en-US">영어</option><option value="ja-JP">일본어</option><option value="zh-TW">중국어 번체</option></select></label>
              <label className="text-xs font-semibold text-fg-2">공개 예정<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" type="datetime-local" value={releaseAt} onChange={(event) => setReleaseAt(event.target.value)} /></label>
              <label className="text-xs font-semibold text-fg-2 sm:col-span-2">회차 제목<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={releaseTitle} onChange={(event) => setReleaseTitle(event.target.value)} /></label>
              <label className="text-xs font-semibold text-fg-2 sm:col-span-2">소개문<textarea className="mt-1.5 min-h-24 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg" value={releaseDescription} onChange={(event) => setReleaseDescription(event.target.value)} /></label>
              <label className="text-xs font-semibold text-fg-2 sm:col-span-2">썸네일 revision<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={releaseThumbnail} onChange={(event) => setReleaseThumbnail(event.target.value)} placeholder="asset-revision-id" /></label>
            </div>
            <fieldset className="mt-4">
              <legend className="text-xs font-semibold text-fg-2">게시 사전 검사</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {requiredReleaseChecks.map((check) => {
                  const checked = releaseChecks.includes(check);
                  return (
                    <label key={check} className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-bold", checked ? "border-good/40 bg-good/10 text-good" : "border-line bg-panel text-fg-2")}>
                      <input type="checkbox" checked={checked} onChange={() => setReleaseChecks(checked ? releaseChecks.filter((entry) => entry !== check) : [...releaseChecks, check])} />
                      {check}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busyKey !== null} onClick={() => void saveReleasePlan("preflight")}><Save className="size-4" aria-hidden="true" />계획·검사 저장</button>
              <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => downloadReleaseManifest(currentReleasePlan ?? releaseDraft)}><ClipboardList className="size-4" aria-hidden="true" />업로드 manifest</button>
              <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit || busyKey !== null || !releaseReadiness.ready || !releaseDraft.scheduledAt} onClick={() => void saveReleasePlan("scheduled")}><Rocket className="size-4" aria-hidden="true" />예약 상태로 전환</button>
            </div>
          </Section>

          <Section title="연재 준비도" description="예약 버튼이 비활성화된 이유를 항목별로 보여 줍니다.">
            <div className={cn("rounded-2xl border p-4", releaseReadiness.ready ? "border-good/35 bg-good/10" : "border-warn/35 bg-warn/10")}>
              <div className="flex items-center justify-between gap-3"><div><p className="text-[0.6875rem] font-bold text-fg-3">준비 점수</p><p className="mt-1 text-3xl font-black text-fg">{releaseReadiness.score}</p></div>{releaseReadiness.ready ? <CheckCircle2 className="size-9 text-good" aria-hidden="true" /> : <AlertTriangle className="size-9 text-warn" aria-hidden="true" />}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-card"><div className={cn("h-full rounded-full", releaseReadiness.ready ? "bg-good" : "bg-warn")} style={{ width: `${releaseReadiness.score}%` }} /></div>
            </div>
            <div className="mt-3 space-y-2">
              {[...releaseReadiness.blockers, ...releaseReadiness.missingCheckKeys].map((issue) => <div key={issue} className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" /><span>{issue}</span></div>)}
              {releaseReadiness.ready ? <div className="flex gap-2 rounded-xl border border-good/30 bg-good/10 p-3 text-xs text-fg-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" /><span>필수 승인·메타데이터·썸네일·사전 검사가 완료됐습니다.</span></div> : null}
            </div>
            <div className="mt-4 space-y-2">
              {(aggregate.releasePlans ?? []).filter((plan) => plan.episodeId === releaseEpisodeId).map((plan) => (
                <div key={plan.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-fg">{plan.platformKey} · {plan.locale}</span><Pill tone={plan.status === "scheduled" || plan.status === "published" ? "success" : plan.status === "failed" ? "danger" : "accent"}>{plan.status}</Pill></div>
                  <p className="mt-1 text-[0.6875rem] text-fg-3">{formatDate(plan.scheduledAt)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button type="button" className={buttonClass({ variant: "ghost", size: "sm" })} onClick={() => downloadReleaseManifest(plan)}>manifest</button>
                    {plan.status === "scheduled" || plan.status === "failed" ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busyKey !== null} onClick={() => void updateReleaseStatus(plan, "published")}>공개 완료</button> : null}
                    {plan.status === "scheduled" ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busyKey !== null} onClick={() => void updateReleaseStatus(plan, "failed")}>실패 기록</button> : null}
                    {plan.status === "published" ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busyKey !== null} onClick={() => void updateReleaseStatus(plan, "withdrawn")}>회수 기록</button> : null}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      ) : null}

      {view === "review" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(22rem,0.65fr)]">
          <Section title="외부 검수 링크 생성" description="승인된 불변 제출본만 선택하고, 만료·워터마크·권한을 고정한 일회성 전달 링크를 만듭니다.">
            <div className="grid gap-3">
              <label className="text-xs font-semibold text-fg-2">제출본<select className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={reviewSubmissionId} onChange={(event) => setReviewSubmissionId(event.target.value)}>{approvedSubmissions.map((submission) => <option key={submission.id} value={submission.id}>{submission.id}</option>)}</select></label>
              <label className="text-xs font-semibold text-fg-2">링크 이름<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={reviewLabel} onChange={(event) => setReviewLabel(event.target.value)} /></label>
              <label className="text-xs font-semibold text-fg-2">만료 시각<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" type="datetime-local" value={reviewExpiresAt} onChange={(event) => setReviewExpiresAt(event.target.value)} /></label>
              <label htmlFor="external-review-allow-download" className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel p-3 text-xs text-fg-2">
                <input id="external-review-allow-download" aria-label="원본 자료 링크 허용" type="checkbox" className="mt-0.5 size-4 shrink-0" checked={reviewAllowDownload} onChange={(event) => setReviewAllowDownload(event.target.checked)} />
                <span><strong className="block text-fg">원본 자료 링크 허용</strong><span className="mt-1 block leading-5 text-fg-3">켜면 외부 검수자가 연결된 증빙 URL을 열고 저장할 수 있습니다. 기본값은 비공개입니다.</span></span>
              </label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-panel p-3 text-xs"><ShieldCheck className="size-4 text-good" aria-hidden="true" /><p className="mt-2 font-bold text-fg">워터마크</p><p className="mt-1 text-fg-3">항상 적용</p></div>
              <div className="rounded-xl border border-line bg-panel p-3 text-xs"><UserRound className="size-4 text-accent" aria-hidden="true" /><p className="mt-2 font-bold text-fg">권한</p><p className="mt-1 text-fg-3">보기·댓글·승인{reviewAllowDownload ? "·원본 링크" : ""}</p></div>
              <div className="rounded-xl border border-line bg-panel p-3 text-xs"><Clock3 className="size-4 text-warn" aria-hidden="true" /><p className="mt-2 font-bold text-fg">자동 만료</p><p className="mt-1 text-fg-3">기본 7일</p></div>
            </div>
            <button type="button" className={cn(buttonClass(), "mt-4 w-full")} disabled={!canManage || busyKey !== null || !reviewSubmissionId} onClick={() => void generateExternalReview()}>{busyKey === "external-review" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}외부 검수 링크 만들기</button>
            {generatedReviewLink ? (
              <div className="mt-4 rounded-xl border border-good/35 bg-good/10 p-3">
                <p className="text-xs font-black text-fg">이번 한 번만 표시되는 링크</p>
                <p className="mt-2 break-all rounded-lg bg-card p-2 font-mono text-[0.6875rem] text-fg-2">{generatedReviewLink}</p>
                <button type="button" className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-2")} onClick={() => void globalThis.navigator?.clipboard?.writeText(generatedReviewLink)}><Copy className="size-3.5" aria-hidden="true" />복사</button>
              </div>
            ) : null}
          </Section>

          <Section title="활성 외부 검수" description="만료 시각과 응답 이력을 확인하고, 계약 종료 시에는 별도 관리 명령으로 접근을 회수합니다.">
            <div className="space-y-2">
              {activeExternalReviews.map((access) => (
                <div key={access.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-fg">{access.label}</p><Pill tone={Date.parse(access.expiresAt) <= now.getTime() ? "danger" : "success"}>{access.status}</Pill></div>
                  <p className="mt-1 text-[0.6875rem] text-fg-3">만료 {formatDate(access.expiresAt)} · 제출본 {access.submissionIds.length}개 · 원본 링크 {access.permissions.includes("download") ? "허용" : "차단"}</p>
                  <p className="mt-2 text-[0.6875rem] text-fg-2">응답 {access.responses.length}건 · 최근 접근 {formatDate(access.lastAccessedAt)}</p>
                  <button type="button" className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-3 w-full")} disabled={!canManage || busyKey !== null} onClick={() => void revokeExternalReview(access)}>접근 즉시 회수</button>
                </div>
              ))}
              {activeExternalReviews.length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-xs text-fg-3">활성 외부 검수 링크가 없습니다.</div> : null}
            </div>
          </Section>
        </div>
      ) : null}

      {view === "automation" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(22rem,0.65fr)]">
          <div className="space-y-4">
            <Section title="자동화 규칙" description="자동화는 알림·조치 업무 생성까지만 수행합니다. 승인, 공개, 계약 선정, 지급과 원본 삭제는 사람 검토 없이 실행하지 않습니다.">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-fg-2 sm:col-span-2">규칙 이름<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={automationName} onChange={(event) => setAutomationName(event.target.value)} /></label>
                <label className="text-xs font-semibold text-fg-2">트리거<select className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={automationTrigger} onChange={(event) => setAutomationTrigger(event.target.value as ProductionAutomationRule["trigger"])}><option value="due-passed">마감 경과</option><option value="due-soon">마감 임박</option><option value="task-status-changed">업무 상태 변경</option><option value="review-opened">검수 시작</option><option value="capacity-exceeded">일정 용량 초과</option><option value="release-preflight-failed">연재 검사 실패</option><option value="manual">수동 실행</option></select></label>
                <label className="text-xs font-semibold text-fg-2">알림 대상<select className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={selectedAssignmentId} onChange={(event) => setSelectedAssignmentId(event.target.value)}>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignmentName(aggregate, assignment.id)}</option>)}</select></label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canManage || busyKey !== null} onClick={() => void saveAutomation()}><Save className="size-4" aria-hidden="true" />규칙 저장</button><button type="button" className={buttonClass({ size: "sm" })} disabled={!canManage || busyKey !== null || (aggregate.automationRules ?? []).length === 0} onClick={() => void runAutomations()}><Play className="size-4" aria-hidden="true" />활성 규칙 실행</button></div>
            </Section>
            <Section title="알림·에스컬레이션 정책" description="마감 임박과 지연을 묶어 보내고 방해 금지 시간을 지키는 기본 정책을 저장합니다.">
              <div className="grid gap-2 sm:grid-cols-4"><div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] text-fg-3">채널</p><p className="mt-1 text-xs font-bold text-fg">앱·이메일</p></div><div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] text-fg-3">마감 알림</p><p className="mt-1 text-xs font-bold text-fg">48시간 전</p></div><div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] text-fg-3">에스컬레이션</p><p className="mt-1 text-xs font-bold text-fg">24시간 지연</p></div><div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] text-fg-3">방해 금지</p><p className="mt-1 text-xs font-bold text-fg">22:00–08:00</p></div></div>
              <button type="button" className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-3")} disabled={!canManage || busyKey !== null} onClick={() => void saveNotificationPolicy()}><Bell className="size-4" aria-hidden="true" />기본 정책 저장</button>
            </Section>
          </div>

          <div className="space-y-4">
            <Section title="등록된 규칙" description="실행 근거와 마지막 평가 시각을 확인합니다.">
              <div className="space-y-2">{(aggregate.automationRules ?? []).map((rule) => <div key={rule.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-fg">{rule.name}</p><Pill tone={rule.enabled ? "success" : "neutral"}>{rule.enabled ? "활성" : "중지"}</Pill></div><p className="mt-1 text-[0.6875rem] text-fg-3">{rule.trigger} · 행동 {rule.actions.length}개</p><p className="mt-1 text-[0.6875rem] text-fg-3">최근 평가 {formatDate(rule.lastEvaluatedAt)}</p></div>)}{(aggregate.automationRules ?? []).length === 0 ? <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-fg-3">등록된 규칙이 없습니다.</div> : null}</div>
            </Section>
            <Section title="알림 받은함" description="같은 원인의 반복 알림은 sourceType·sourceId로 묶어 처리할 수 있습니다.">
              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {unreadNotifications.slice(0, 20).map((notification) => (
                  <article key={notification.id} className={cn("rounded-xl border p-3", notification.urgency === "critical" ? "border-bad/35 bg-bad/10" : notification.urgency === "warning" ? "border-warn/35 bg-warn/10" : "border-line bg-panel")}>
                    <a href={notification.href} className="block"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-fg">{notification.title}</p><Pill tone={notification.urgency === "critical" ? "danger" : notification.urgency === "warning" ? "warning" : "accent"}>{notification.urgency}</Pill></div><p className="mt-1 text-[0.6875rem] leading-5 text-fg-2">{notification.body}</p></a>
                    <button type="button" className={cn(buttonClass({ variant: "ghost", size: "sm" }), "mt-2")} disabled={busyKey !== null} onClick={() => void markNotificationRead(notification)}>읽음 처리</button>
                  </article>
                ))}
                {unreadNotifications.length === 0 ? <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-fg-3">읽지 않은 알림이 없습니다.</div> : null}
              </div>
            </Section>
          </div>
        </div>
      ) : null}

      {view === "analytics" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["전체 완료율", `${flowAnalytics.completionPercent}%`, `완료 ${flowAnalytics.completedTaskCount} / 전체 ${flowAnalytics.totalTaskCount}`, BarChart3, "accent"],
              ["잔여 예상 공수", `${flowAnalytics.remainingHours}h`, `열린 업무 ${flowAnalytics.openTaskCount}개`, Clock3, "neutral"],
              ["차단·기한 초과", String(flowAnalytics.blockedCount + flowAnalytics.overdueCount), `차단 ${flowAnalytics.blockedCount} · 초과 ${flowAnalytics.overdueCount}`, AlertTriangle, flowAnalytics.blockedCount + flowAnalytics.overdueCount > 0 ? "danger" : "success"],
              ["연재 준비도", flowAnalytics.averageReleaseReadiness === null ? "—" : `${flowAnalytics.averageReleaseReadiness}%`, `활성 위험 ${flowAnalytics.activeRiskCount}건`, Rocket, "neutral"],
            ].map(([label, value, detail, Icon, tone]) => (
              <div key={String(label)} className={cn("rounded-2xl border p-4", toneClass(tone as Tone))}>
                <div className="flex items-center justify-between gap-2"><p className="text-[0.6875rem] font-black uppercase tracking-[0.1em]">{String(label)}</p><Icon className="size-4" aria-hidden="true" /></div>
                <p className="mt-2 text-2xl font-black text-fg">{String(value)}</p><p className="mt-1 text-xs text-fg-2">{String(detail)}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.7fr)]">
            <Section title="공정 병목 분석" description="잔여 공수, 추정 불확실성, 차단·지연·검수 대기를 합산해 먼저 조치할 공정을 정렬합니다.">
              <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full min-w-[42rem] border-collapse text-left">
                <thead className="bg-panel text-[0.6875rem] font-black text-fg-3"><tr><th className="px-3 py-3">공정</th><th className="px-3 py-3 text-right">병목 점수</th><th className="px-3 py-3 text-right">잔여 공수</th><th className="px-3 py-3 text-right">열린 업무</th><th className="px-3 py-3 text-right">차단·초과·검수</th></tr></thead>
                <tbody>{flowAnalytics.processes.map((process, index) => <tr key={process.processKey} className="border-t border-line text-xs"><td className="px-3 py-3"><div className="flex items-center gap-2"><Pill tone={index === 0 && process.bottleneckScore > 0 ? "danger" : index < 3 ? "warning" : "neutral"}>{index + 1}</Pill><span className="font-bold text-fg">{process.processKey}</span></div></td><td className="px-3 py-3 text-right font-black text-fg">{process.bottleneckScore}</td><td className="px-3 py-3 text-right text-fg-2">{process.remainingHours}h</td><td className="px-3 py-3 text-right text-fg-2">{process.openTaskCount}</td><td className="px-3 py-3 text-right text-fg-2">{process.blockedCount} · {process.overdueCount} · {process.reviewCount}</td></tr>)}</tbody>
              </table></div>
            </Section>
            <Section title="예산·정산 전망" description="계약, 승인 변경, 청구서와 검증된 지급을 통화별로 분리해 계산합니다.">
              <div className="space-y-3">{financialForecast.currencies.map((forecast) => <article key={forecast.currency} className="rounded-xl border border-line bg-panel p-4"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Coins className="size-4 text-accent" aria-hidden="true" /><p className="text-sm font-black text-fg">{forecast.currency}</p></div><Pill tone={forecast.overdueInvoiceCount > 0 ? "danger" : "success"}>기한 초과 {forecast.overdueInvoiceCount}</Pill></div><dl className="mt-3 grid grid-cols-2 gap-2 text-[0.6875rem]"><div className="rounded-lg border border-line bg-card p-2"><dt className="text-fg-3">계약+변경 전망</dt><dd className="mt-1 font-black text-fg">{formatMoney(forecast.currency, forecast.forecastMinor)}</dd></div><div className="rounded-lg border border-line bg-card p-2"><dt className="text-fg-3">청구</dt><dd className="mt-1 font-black text-fg">{formatMoney(forecast.currency, forecast.invoicedMinor)}</dd></div><div className="rounded-lg border border-line bg-card p-2"><dt className="text-fg-3">검증 지급</dt><dd className="mt-1 font-black text-good">{formatMoney(forecast.currency, forecast.verifiedPaidMinor)}</dd></div><div className="rounded-lg border border-line bg-card p-2"><dt className="text-fg-3">미지급 잔액</dt><dd className="mt-1 font-black text-warn">{formatMoney(forecast.currency, forecast.outstandingMinor)}</dd></div></dl></article>)}
                {financialForecast.currencies.length === 0 ? <div className="rounded-xl border border-dashed border-line p-7 text-center text-xs text-fg-3">등록된 계약·청구 데이터가 없습니다.</div> : null}
                {financialForecast.warnings.map((warning) => <div key={warning} className="flex gap-2 rounded-xl border border-warn/35 bg-warn/10 p-3 text-xs text-fg-2"><AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden="true" /><span>{warning}</span></div>)}
              </div>
            </Section>
          </div>
        </div>
      ) : null}

      {view === "views" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.75fr)_minmax(24rem,0.75fr)]">
          <Section title="운영 보기 저장" description="현재 역할·운영 탭, 정렬, 열, 밀도와 대시보드 위젯을 개인 또는 팀 공유 보기로 저장합니다.">
            <div className="grid gap-3">
              <label className="text-xs font-semibold text-fg-2">보기 이름<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={savedViewName} onChange={(event) => setSavedViewName(event.target.value)} /></label>
              <label className="text-xs font-semibold text-fg-2">표 밀도<select className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={savedViewDensity} onChange={(event) => setSavedViewDensity(event.target.value as ProductionSavedView["density"])}><option value="comfortable">기본</option><option value="compact">조밀</option></select></label>
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2"><input type="checkbox" checked={savedViewShared} onChange={(event) => setSavedViewShared(event.target.checked)} />팀 공유 보기로 저장</label>
            </div>
            <button type="button" className={cn(buttonClass(), "mt-4 w-full")} disabled={!canEdit || busyKey !== null} onClick={() => void saveView()}>{busyKey === "saved-view" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}현재 보기 저장</button>
          </Section>

          <Section title="저장된 보기" description="개인 보기와 팀 공유 보기의 필터·열·위젯 구성을 확인합니다.">
            <div className="grid gap-3 sm:grid-cols-2">
              {(aggregate.savedViews ?? []).map((savedView) => (
                <article key={savedView.id} className="rounded-2xl border border-line bg-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-black text-fg">{savedView.name}</h4><Pill tone={savedView.shared ? "accent" : "neutral"}>{savedView.shared ? "팀 공유" : "개인"}</Pill></div>
                  <p className="mt-2 text-xs text-fg-2">{savedView.resource} · {savedView.density}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{savedView.dashboardWidgets.map((widget) => <span key={widget} className="rounded-full border border-line bg-card px-2 py-1 text-[0.625rem] font-semibold text-fg-2">{widget}</span>)}</div>
                  <p className="mt-3 text-[0.6875rem] text-fg-3">열 {savedView.columns.length}개 · {formatDate(savedView.updatedAt)}</p>
                </article>
              ))}
              {(aggregate.savedViews ?? []).length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-xs text-fg-3 sm:col-span-2">저장된 운영 보기가 없습니다.</div> : null}
            </div>
          </Section>
        </div>
      ) : null}
    </div>
  );
}
