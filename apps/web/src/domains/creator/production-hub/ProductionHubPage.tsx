import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  Coins,
  FileKey2,
  GitBranch,
  Handshake,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  MessagesSquare,
  PanelTopOpen,
  Scale,
  ScrollText,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import {
  createPlanningSnapshot,
  evaluateHandoffReadiness,
  evaluateReviewApproval,
  preflightCreditManifest,
  type ClarificationThread,
  type EpisodeCollaboration,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ReviewDecision,
  type StoryToArtHandoffPackage,
} from "@toonspectrum/core/production";

import { ProductionCommandPalette } from "./ProductionCommandPalette";
import { ProductionEpisodeOperationsWorkspace } from "./ProductionEpisodeOperationsWorkspace";
import { ProductionReviewWorkspace } from "./ProductionReviewWorkspace";
import { ProductionCrewCoverage, ProductionRoleWorkspace } from "./ProductionRoleWorkspace";
import { ProductionScheduleWorkspace } from "./ProductionScheduleWorkspace";
import { ProductionVisualPlanningWorkspace } from "./ProductionVisualPlanningWorkspace";
import { createProductionDemoProject } from "./production-demo";
import { ProductionIntegrationsPanel } from "./ProductionIntegrationsPanel";
import { ProductionManagementWorkspace } from "./ProductionManagementWorkspace";
import {
  executeProductionCommand,
  getProductionProject,
  type ProductionClientCommand,
  type ProductionProjectAccess,
} from "./production-api";

import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  creatorRoleLens,
  type CreatorRoleLens,
} from "@/shared/lib/creator-role-contract";
import { cn } from "@/shared/lib/utils";
import { useApp } from "@/shared/lib/store";
import { getApiErrorMessage } from "@/infrastructure/api";
import { getMyProfile } from "@/infrastructure/me-client";

export type ProductionProjectSurface =
  | "overview"
  | "planning"
  | "episodes"
  | "production"
  | "schedule"
  | "handoff"
  | "review"
  | "procurement"
  | "rights"
  | "settings";

type RoleLens = CreatorRoleLens;
type SaveState = "idle" | "saving" | "saved" | "error";

const SAMPLE_PROJECT_ID = "sample-project";
const DATE_ONLY = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" });

function usePreferredRoleLens(fallback: RoleLens): readonly [RoleLens, (next: RoleLens) => void] {
  const userId = useApp((state) => state.userId);
  const [roleLens, setRoleLens] = useState<RoleLens>(fallback);
  const manuallyChanged = useRef(false);

  useEffect(() => {
    manuallyChanged.current = false;
    if (!userId) {
      setRoleLens(fallback);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    getMyProfile(controller.signal)
      .then((profile) => {
        if (!alive || manuallyChanged.current) return;
        const role = profile.creatorRoleProfile.activeRole ?? profile.creatorRoleProfile.primaryRole;
        setRoleLens(creatorRoleLens(role));
      })
      .catch(() => {});
    return () => {
      alive = false;
      controller.abort();
    };
  }, [fallback, userId]);

  const changeRoleLens = useCallback((next: RoleLens) => {
    manuallyChanged.current = true;
    setRoleLens(next);
  }, []);

  return [roleLens, changeRoleLens];
}

const SURFACES: readonly {
  readonly id: ProductionProjectSurface;
  readonly label: string;
  readonly description: string;
  readonly icon: typeof LayoutDashboard;
}[] = [
  { id: "overview", label: "프로젝트 홈", description: "오늘 할 일과 막힌 작업", icon: LayoutDashboard },
  { id: "planning", label: "기획", description: "작품·시즌·장면 기준", icon: BookOpenText },
  { id: "episodes", label: "회차", description: "회차별 상태와 원고", icon: PanelTopOpen },
  { id: "production", label: "작업 보드", description: "담당자와 진행 상태", icon: Workflow },
  { id: "schedule", label: "일정", description: "마감과 작업량 확인", icon: CalendarClock },
  { id: "handoff", label: "작업 넘기기", description: "꼭 지킬 내용과 질문", icon: Handshake },
  { id: "review", label: "검수·수정", description: "수정 요청과 승인", icon: ClipboardCheck },
  { id: "procurement", label: "외주·발주", description: "의뢰 범위와 납품", icon: BriefcaseBusiness },
  { id: "rights", label: "계약·정산", description: "권리·크레딧·보상", icon: Scale },
  { id: "settings", label: "팀 설정", description: "참여자와 역할", icon: Users },
];

const EPISODE_STATE_LABELS: Readonly<Record<EpisodeCollaboration["state"], string>> = {
  "episode-planning": "회차 기획",
  "story-drafting": "스토리 초안",
  "story-review": "스토리 검수",
  "story-ready-for-art": "작화 준비",
  "art-clarification": "작화 질문",
  thumbnailing: "콘티 제작",
  "thumbnail-joint-review": "공동 콘티 검수",
  "thumbnail-locked": "콘티 확정",
  "final-art-production": "최종 작화",
  "lettering-and-integration": "식자·통합",
  "joint-proof": "공동 교정",
  "publish-ready": "공개 준비",
  published: "공개됨",
  blocked: "차단",
  "paused-health": "건강 사유 휴식",
  "paused-contract": "계약 보류",
  "change-request-open": "변경 검토",
  "creator-replacement": "창작자 교체",
  cancelled: "취소",
};

function formatDay(value: string | null): string {
  if (!value) return "미정";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_ONLY.format(date) : "미정";
}

function stateTone(state: EpisodeCollaboration["state"]): "neutral" | "accent" | "success" | "warning" | "danger" {
  if (state === "published" || state === "publish-ready") return "success";
  if (state === "blocked" || state === "cancelled") return "danger";
  if (state.startsWith("paused") || state === "change-request-open") return "warning";
  if (["story-drafting", "thumbnailing", "final-art-production", "lettering-and-integration"].includes(state)) return "accent";
  return "neutral";
}

function Pill({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  const tones = {
    neutral: "border-line bg-raised text-fg-2",
    accent: "border-accent/35 bg-accent-soft text-accent",
    success: "border-good/35 bg-good/10 text-good",
    warning: "border-warn/35 bg-warn/10 text-warn",
    danger: "border-bad/35 bg-bad/10 text-bad",
  } as const;
  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-line bg-card p-4", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-fg">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-2">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly icon: typeof LayoutDashboard;
  readonly tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "border-line bg-panel",
    accent: "border-accent/30 bg-accent-soft",
    success: "border-good/30 bg-good/10",
    warning: "border-warn/30 bg-warn/10",
    danger: "border-bad/30 bg-bad/10",
  }[tone];
  return (
    <div className={cn("rounded-2xl border p-3.5", toneClass)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">{label}</p>
        <Icon className="size-4 text-fg-3" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight text-fg">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-fg-2">{detail}</p>
    </div>
  );
}

function EmptyState({ title, description }: { readonly title: string; readonly description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <p className="text-sm font-bold text-fg">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-fg-2">{description}</p>
    </div>
  );
}

function assignmentLabel(aggregate: ProductionProjectAggregate, assignmentId: string): string {
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const party = assignment
    ? aggregate.parties.find((entry) => entry.id === assignment.partyId)
    : null;
  return party?.publicDisplayName ?? assignmentId;
}

function partyRole(aggregate: ProductionProjectAggregate, partyId: string): string {
  const roles = aggregate.assignments
    .filter((assignment) => assignment.partyId === partyId && assignment.status === "active")
    .map((assignment) => assignment.publicCreditRole ?? assignment.roleType);
  return roles.join(" · ") || "참여자";
}

function replaceById<T extends { readonly id: string }>(values: readonly T[], value: T): readonly T[] {
  const found = values.some((entry) => entry.id === value.id);
  return found
    ? values.map((entry) => entry.id === value.id ? value : entry)
    : [...values, value];
}

function reduceDemoCommand(
  aggregate: ProductionProjectAggregate,
  command: ProductionClientCommand,
): ProductionProjectAggregate {
  const base = { ...aggregate, revision: aggregate.revision + 1, updatedAt: new Date().toISOString() };
  switch (command.type) {
    case "upsert-planning-record": {
      const record = command.record;
      switch (record.kind) {
        case "project-brief": return { ...base, projectBriefs: replaceById(aggregate.projectBriefs, record.value) };
        case "series-master": return { ...base, seriesMasters: replaceById(aggregate.seriesMasters, record.value) };
        case "season-plan": return { ...base, seasonPlans: replaceById(aggregate.seasonPlans, record.value) };
        case "episode-plan": return { ...base, episodePlans: replaceById(aggregate.episodePlans, record.value) };
        case "scene-plan": return { ...base, scenePlans: replaceById(aggregate.scenePlans, record.value) };
        case "cut-plan": return { ...base, cutPlans: replaceById(aggregate.cutPlans, record.value) };
        case "asset-requirement": return { ...base, assetRequirements: replaceById(aggregate.assetRequirements, record.value) };
        case "risk": return { ...base, risks: replaceById(aggregate.risks, record.value) };
        case "decision": return { ...base, decisions: replaceById(aggregate.decisions, record.value) };
      }
      return aggregate;
    }
    case "create-planning-snapshot": {
      const snapshot = createPlanningSnapshot(command.snapshot);
      return { ...base, planningSnapshots: [...aggregate.planningSnapshots, snapshot] };
    }
    case "upsert-commercial-record": {
      const record = command.record;
      switch (record.kind) {
        case "proposal": return { ...base, proposals: replaceById(aggregate.proposals, record.value) };
        case "agreement": return { ...base, agreements: replaceById(aggregate.agreements, record.value) };
        case "change-order": return { ...base, changeOrders: replaceById(aggregate.changeOrders, record.value) };
        case "milestone": return { ...base, contractMilestones: replaceById(aggregate.contractMilestones, record.value) };
        case "delivery-revision": return { ...base, deliveryRevisions: replaceById(aggregate.deliveryRevisions, record.value) };
        case "invoice": return { ...base, invoices: replaceById(aggregate.invoices, record.value) };
        case "payment": return { ...base, paymentRecords: replaceById(aggregate.paymentRecords, record.value) };
        case "dispute": return { ...base, disputes: replaceById(aggregate.disputes, record.value) };
      }
      return aggregate;
    }
    case "upsert-clarification":
      return { ...base, clarifications: replaceById(aggregate.clarifications, command.clarification) };
    case "upsert-handoff":
      return { ...base, handoffs: replaceById(aggregate.handoffs, command.handoff) };
    case "upsert-branch":
      return { ...base, branches: replaceById(aggregate.branches, command.branch) };
    case "upsert-merge-request":
      return { ...base, mergeRequests: replaceById(aggregate.mergeRequests, command.mergeRequest) };
    case "upsert-deliverable":
      return { ...base, deliverables: replaceById(aggregate.deliverables, command.deliverable) };
    case "upsert-submission":
      return { ...base, submissions: replaceById(aggregate.submissions, command.submission) };
    case "record-review-decision":
      return { ...base, reviewDecisions: replaceById(aggregate.reviewDecisions, command.decision) };
    case "upsert-episode":
      return { ...base, episodes: replaceById(aggregate.episodes, command.episode) };
    case "upsert-task":
      return { ...base, tasks: replaceById(aggregate.tasks, command.task) };
    case "upsert-episode-operations": {
      const episodes = command.episode
        ? replaceById(aggregate.episodes, command.episode)
        : aggregate.episodes;
      const episodePlans = command.episodePlan
        ? replaceById(aggregate.episodePlans, command.episodePlan)
        : aggregate.episodePlans;
      const tasks = command.tasks.reduce<readonly ProductionTask[]>(
        (current, task) => replaceById(current, task),
        aggregate.tasks,
      );
      return { ...base, episodes, episodePlans, tasks };
    }
    case "upsert-change-request":
      return { ...base, changeRequests: replaceById(aggregate.changeRequests, command.request) };
    case "upsert-contribution":
      return { ...base, contributions: replaceById(aggregate.contributions, command.contribution) };
    case "upsert-credit-manifest":
      return { ...base, creditManifests: replaceById(aggregate.creditManifests, command.manifest) };
    case "upsert-rights-interest":
      return { ...base, rightsInterests: replaceById(aggregate.rightsInterests, command.interest) };
    case "upsert-compensation-plan":
      return { ...base, compensationPlans: replaceById(aggregate.compensationPlans, command.plan) };
    case "upsert-review-policy":
      return { ...base, reviewPolicies: replaceById(aggregate.reviewPolicies, command.policy) };
    case "configure-collaboration":
      return {
        ...base,
        parties: command.parties,
        assignments: command.assignments,
        authorityRules: command.authorityRules,
        charters: command.charter ? replaceById(aggregate.charters, command.charter) : aggregate.charters,
      };
    case "publish-scope-package":
    case "amend-scope-package":
      return aggregate;
  }
}

function useProductionProject(projectId: string | undefined) {
  const isDemo = !projectId || projectId === SAMPLE_PROJECT_ID;
  const [aggregate, setAggregate] = useState<ProductionProjectAggregate | null>(
    isDemo ? createProductionDemoProject() : null,
  );
  const [access, setAccess] = useState<ProductionProjectAccess>({
    view: true,
    comment: true,
    edit: true,
    manage: true,
    owner: true,
    role: "owner",
  });
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const aggregateRef = useRef<ProductionProjectAggregate | null>(aggregate);
  const commandQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    aggregateRef.current = aggregate;
  }, [aggregate]);

  useEffect(() => {
    if (isDemo) {
      setAggregate(createProductionDemoProject());
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void getProductionProject(projectId).then((record) => {
      if (!active) return;
      setAggregate(record.aggregate);
      setAccess(record.access);
      setLoading(false);
    }).catch(async (cause: unknown) => {
      if (!active) return;
      setError(await getApiErrorMessage(cause, "제작 프로젝트를 불러오지 못했습니다."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [isDemo, projectId]);

  const execute = useCallback((command: ProductionClientCommand, successMessage: string): Promise<void> => {
    const run = async () => {
      const current = aggregateRef.current;
      if (!current) return;
      setSaveState("saving");
      setNotice(null);
      try {
        const next = isDemo
          ? reduceDemoCommand(current, command)
          : (await executeProductionCommand(current.projectId, current.revision, command)).aggregate;
        aggregateRef.current = next;
        setAggregate(next);
        setSaveState("saved");
        setNotice(successMessage);
      } catch (cause) {
        setSaveState("error");
        setNotice(await getApiErrorMessage(cause, "변경 내용을 저장하지 못했습니다."));
      }
    };
    const pending = commandQueueRef.current.then(run, run);
    commandQueueRef.current = pending.catch(() => undefined);
    return pending;
  }, [isDemo]);

  return { aggregate, access, loading, error, saveState, notice, execute, isDemo };
}

export function ProductionLandingPage() {
  const demo = useMemo(() => createProductionDemoProject(), []);
  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
            <span>ToonStudio</span><span aria-hidden="true">/</span><span>웹툰 제작 관리</span>
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-fg sm:text-5xl">
                흩어진 웹툰 제작을 하나의 흐름으로
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
                기획·회차·담당자·일정·파일·검수·계약을 연결해, 팀과 1인 작가 모두 다음 할 일을 바로 알 수 있습니다.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className={buttonClass({ size: "lg" })} to={`/production/projects/${demo.projectId}/overview`}>
                  기능 미리 보기 <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link className={buttonClass({ variant: "outline", size: "lg" })} to="/studio/projects">
                  내 프로젝트 열기
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="작업 기준" value="3" detail="스토리·그림·최종본 연결" icon={GitBranch} tone="accent" />
              <Metric label="확인 단계" value="4" detail="기획 · 넘기기 · 콘티 · 최종 검수" icon={LockKeyhole} tone="success" />
              <Metric label="역할·권한" value="11" detail="항목별 제안·승인·거부 권한" icon={ShieldCheck} />
              <Metric label="연결 범위" value="100%" detail="회차부터 계약·크레딧까지" icon={FileKey2} tone="warning" />
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: BookOpenText, title: "기획·회차", text: "작품 목표와 세계관, 시즌·회차별 기준을 최신 버전으로 정리합니다." },
            { icon: Handshake, title: "작업 넘기기", text: "다음 작업자가 꼭 지킬 내용, 자유롭게 바꿀 부분과 질문을 분명히 나눕니다." },
            { icon: ClipboardCheck, title: "검수·수정", text: "스토리·그림·제작·권리별 필수 승인과 수정 요청을 파일에 연결합니다." },
            { icon: Scale, title: "계약·정산", text: "기여 기록, 공개 크레딧, 사용 권리와 보상 기준을 따로 정확히 관리합니다." },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-2xl border border-line bg-card p-5">
              <Icon className="size-5 text-accent" aria-hidden="true" />
              <h2 className="mt-4 font-bold text-fg">{title}</h2>
              <p className="mt-2 text-xs leading-6 text-fg-2">{text}</p>
            </article>
          ))}
        </section>

        <SectionCard className="mt-6" title="현재 제작 흐름" description="한 화면에서 단계별 상태와 다음 결정자를 확인합니다.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            {["기획 확정", "작업 넘기기", "콘티", "최종 원고", "검수·수정", "내보내기"].map((label, index) => (
              <div key={label} className="relative rounded-xl border border-line bg-panel p-3">
                <p className="text-[0.6875rem] font-bold text-accent">{String(index + 1).padStart(2, "0")}</p>
                <p className="mt-1 text-sm font-semibold text-fg">{label}</p>
                {index < 5 ? <ChevronRight className="absolute -right-3 top-1/2 z-10 hidden size-5 -translate-y-1/2 text-fg-3 lg:block" aria-hidden="true" /> : null}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function ProjectHeader({
  aggregate,
  access,
  roleLens,
  onRoleLensChange,
  saveState,
  isDemo,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly access: ProductionProjectAccess;
  readonly roleLens: RoleLens;
  readonly onRoleLensChange: (value: RoleLens) => void;
  readonly saveState: SaveState;
  readonly isDemo: boolean;
}) {
  return (
    <header className="border-b border-line bg-panel px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[100rem] flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link className="text-xs font-bold tracking-[0.08em] text-accent" to="/production">제작 관리</Link>
            <span className="text-fg-3" aria-hidden="true">/</span>
            <Pill tone={isDemo ? "warning" : "success"}>{isDemo ? "기능 미리보기" : "실제 프로젝트"}</Pill>
            <Pill>{access.role ?? "읽기 전용"}</Pill>
          </div>
          <h1 className="mt-1 truncate text-xl font-black tracking-tight text-fg">{aggregate.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductionCommandPalette aggregate={aggregate} />
          <label className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2">
            <span>내 역할</span>
            <select
              className="bg-transparent font-semibold text-fg outline-none"
              value={roleLens}
              onChange={(event) => onRoleLensChange(event.target.value as RoleLens)}
            >
              <option value="story">스토리 작가</option>
              <option value="art">그림 작가</option>
              <option value="producer">PD·편집자</option>
            </select>
          </label>
          <span className="min-w-20 text-right text-xs text-fg-3" role="status">
            {saveState === "saving" ? "저장 중…" : saveState === "saved" ? "저장됨" : saveState === "error" ? "저장 실패" : `r${aggregate.revision}`}
          </span>
          <Link className={buttonClass({ variant: "outline", size: "sm" })} to={`/studio/work/${encodeURIComponent(aggregate.workId)}/canvas`}>
            원고 작업 열기
          </Link>
        </div>
      </div>
    </header>
  );
}

function ProjectNav({ projectId, surface }: { readonly projectId: string; readonly surface: ProductionProjectSurface }) {
  return (
    <nav aria-label="프로젝트 메뉴" className="overflow-x-auto border-b border-line bg-panel lg:sticky lg:top-0 lg:h-[calc(100dvh-0px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="flex min-w-max gap-1 p-2 lg:min-w-0 lg:flex-col lg:p-3">
        {SURFACES.map(({ id, label, description, icon: Icon }) => (
          <Link
            key={id}
            to={`/production/projects/${encodeURIComponent(projectId)}/${id}`}
            aria-current={surface === id ? "page" : undefined}
            title={`${label} · ${description}`}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors lg:min-h-[3.75rem]",
              surface === id ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block whitespace-nowrap">{label}</span>
              <span className="mt-0.5 hidden truncate text-[0.6875rem] font-normal text-fg-3 lg:block">{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function OverviewSurface({
  aggregate,
  roleLens,
  execute,
  canEdit,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly roleLens: RoleLens;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
}) {
  return <ProductionManagementWorkspace aggregate={aggregate} roleLens={roleLens} execute={execute} canEdit={canEdit} />;
}

function PlanningSurface({
  aggregate,
  execute,
  canEdit,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
}) {
  const charter = [...aggregate.charters].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const brief = [...aggregate.projectBriefs].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const seriesMaster = [...aggregate.seriesMasters].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const season = [...aggregate.seasonPlans].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const domains = ["canon", "dialogue", "layout", "visual-direction", "color", "publication", "rights"] as const;
  const openRisks = aggregate.risks.filter((risk) => !["resolved", "closed"].includes(risk.status));
  const currentEpisodePlans = aggregate.episodePlans.filter((plan) => !aggregate.episodePlans.some((candidate) => candidate.episodeId === plan.episodeId && candidate.revision > plan.revision));
  const currentScenePlans = aggregate.scenePlans.filter((plan) => !aggregate.scenePlans.some((candidate) => candidate.sceneId === plan.sceneId && candidate.revision > plan.revision));
  const currentCutPlans = aggregate.cutPlans.filter((plan) => !aggregate.cutPlans.some((candidate) => candidate.cutId === plan.cutId && candidate.revision > plan.revision));
  return (
    <div className="space-y-4">
      <ProductionVisualPlanningWorkspace aggregate={aggregate} execute={execute} canEdit={canEdit} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="기획 기준선" value={brief ? `r${brief.revision}` : "—"} detail={brief?.status ?? "작품 한눈에 보기 없음"} icon={ScrollText} tone={brief?.status === "approved" ? "success" : "warning"} />
        <Metric label="회차 계획" value={String(currentEpisodePlans.length)} detail={`${currentScenePlans.length} scenes · ${currentCutPlans.length} cuts`} icon={PanelTopOpen} tone="accent" />
        <Metric label="에셋 요구" value={String(aggregate.assetRequirements.length)} detail={`${aggregate.assetRequirements.filter((entry) => entry.status === "blocked").length}개 차단`} icon={Boxes} />
        <Metric label="열린 위험" value={String(openRisks.length)} detail={`${openRisks.filter((entry) => entry.probability * entry.impact >= 12).length}개 고위험`} icon={AlertTriangle} tone={openRisks.some((entry) => entry.probability * entry.impact >= 12) ? "danger" : "neutral"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="작품 한눈에 보기" description="작품 목표·독자·공개 플랫폼·제약을 확인된 최신 버전으로 정리합니다.">
          {brief ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-accent/30 bg-accent-soft p-4">
                <div className="flex flex-wrap items-center gap-2"><Pill tone="accent">{brief.status}</Pill><Pill>r{brief.revision}</Pill></div>
                <h3 className="mt-3 text-lg font-black text-fg">{brief.title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-fg">{brief.logline}</p>
                <p className="mt-2 text-xs leading-6 text-fg-2">{brief.synopsis}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">독자·장르</p><p className="mt-2 text-xs leading-5 text-fg-2">{[...brief.audience, ...brief.genreKeys].join(" · ")}</p></div>
                <div className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">사업·제약</p><p className="mt-2 text-xs leading-5 text-fg-2">{[...brief.businessGoals, ...brief.constraints].join(" · ")}</p></div>
              </div>
            </div>
          ) : <EmptyState title="작품 요약이 없습니다" description="한 줄 소개, 독자, 공개 플랫폼과 권리 기준을 먼저 정해 주세요." />}
        </SectionCard>

        <SectionCard title="작품 공통 설정" description="모든 회차가 함께 쓰는 세계·캐릭터·그림 스타일 기준입니다.">
          {seriesMaster ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-line bg-panel p-3"><div><p className="text-xs text-fg-3">작품 핵심</p><p className="mt-1 text-sm font-semibold leading-6 text-fg">{seriesMaster.premise}</p></div><Pill tone="success">{seriesMaster.status} r{seriesMaster.revision}</Pill></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">세계 규칙</p><ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2">{seriesMaster.worldRules.map((entry) => <li key={entry}>• {entry}</li>)}</ul></div>
                <div className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">시각 규칙</p><ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2">{seriesMaster.styleRules.map((entry) => <li key={entry}>• {entry}</li>)}</ul></div>
              </div>
              {seriesMaster.forbiddenElements.length ? <div className="rounded-xl border border-bad/30 bg-bad/10 p-3"><p className="text-xs font-bold text-fg">금지 요소</p><p className="mt-1 text-xs leading-5 text-fg-2">{seriesMaster.forbiddenElements.join(" · ")}</p></div> : null}
            </div>
          ) : <EmptyState title="작품 공통 설정이 없습니다" description="캐릭터·장소·세계 규칙과 그림 기준을 하나의 최신 버전으로 정리하세요." />}
        </SectionCard>
      </div>

      <SectionCard title={season ? `시즌 · ${season.title}` : "시즌·회차 기획"} description={season?.goal ?? "시즌 목표와 회차별 리듬을 관리합니다."} action={season ? <Pill tone="success">{season.status} · {season.targetEpisodeCount}화</Pill> : undefined}>
        <div className="grid gap-3 lg:grid-cols-2">
          {[...currentEpisodePlans].sort((a, b) => a.episodeNumber - b.episodeNumber).map((plan) => {
            const scenes = currentScenePlans.filter((entry) => entry.episodeId === plan.episodeId);
            const cuts = currentCutPlans.filter((entry) => entry.episodeId === plan.episodeId);
            return (
              <article key={plan.id} className="rounded-xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-accent">EP {plan.episodeNumber}</p><h3 className="mt-1 font-bold text-fg">{plan.title}</h3></div><Pill tone={plan.status === "locked" || plan.status === "approved" ? "success" : "warning"}>{plan.status} · r{plan.revision}</Pill></div>
                <p className="mt-3 text-xs leading-5 text-fg-2">{plan.logline}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-raised p-2"><p className="text-fg-3">목표 컷</p><p className="mt-1 font-bold text-fg">{plan.targetCutCount}</p></div><div className="rounded-lg bg-raised p-2"><p className="text-fg-3">설계 장면</p><p className="mt-1 font-bold text-fg">{scenes.length}</p></div><div className="rounded-lg bg-raised p-2"><p className="text-fg-3">설계 컷</p><p className="mt-1 font-bold text-fg">{cuts.length}</p></div></div>
                <p className="mt-3 text-[0.6875rem] leading-5 text-fg-3">Hook: {plan.openingHook || "작성 중"} · Cliffhanger: {plan.cliffhanger || "작성 중"}</p>
              </article>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title="창작 합의" description="함께 지킬 작품 기준과 각 창작자가 자유롭게 결정할 부분을 합의합니다.">
          {charter ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-accent/30 bg-accent-soft p-4"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-accent">Core Experience</p><p className="mt-2 text-sm font-semibold leading-6 text-fg">{charter.coreExperience}</p></div>
              <div className="grid gap-2 md:grid-cols-2">{[["스토리 자율", charter.storyAutonomy], ["작화 자율", charter.artAutonomy], ["공동 결정", charter.jointDecisionAreas], ["피드백 원칙", charter.feedbackPrinciples]].map(([label, items]) => <div key={label as string} className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">{label as string}</p><ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2">{(items as readonly string[]).map((item) => <li key={item}>• {item}</li>)}</ul></div>)}</div>
            </div>
          ) : <EmptyState title="창작 합의가 없습니다" description="자율 영역, 함께 결정할 내용과 피드백 원칙을 합의해 주세요." />}
        </SectionCard>

        <SectionCard title="창작 결정권 매트릭스" description="프로젝트 관리자 권한과 창작 최종결정권을 분리합니다.">
          <div className="overflow-x-auto"><table className="w-full min-w-[38rem] border-separate border-spacing-y-1 text-left text-xs"><thead className="text-fg-3"><tr><th className="px-3 py-2">항목</th><th className="px-3 py-2">제안</th><th className="px-3 py-2">승인</th><th className="px-3 py-2">최종 결정</th><th className="px-3 py-2">거부 권한</th></tr></thead><tbody>{domains.map((domain) => { const rule = aggregate.authorityRules.find((entry) => entry.domain === domain); return <tr key={domain} className="bg-panel text-fg-2"><td className="rounded-l-xl px-3 py-2.5 font-semibold text-fg">{domain}</td><td className="px-3 py-2.5">{rule?.proposerAssignmentIds.map((id) => assignmentLabel(aggregate, id)).join(", ") || "—"}</td><td className="px-3 py-2.5">{rule?.requiredApproverAssignmentIds.map((id) => assignmentLabel(aggregate, id)).join(", ") || "—"}</td><td className="px-3 py-2.5">{rule?.decisionAssignmentId ? assignmentLabel(aggregate, rule.decisionAssignmentId) : "공동"}</td><td className="rounded-r-xl px-3 py-2.5">{rule?.vetoAssignmentIds.map((id) => assignmentLabel(aggregate, id)).join(", ") || "없음"}</td></tr>; })}</tbody></table></div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="에셋 요구사항" description="기획 breakdown에서 내부 제작·외주·마켓 소싱으로 전환됩니다.">
          <div className="space-y-2">{aggregate.assetRequirements.map((entry) => <div key={entry.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3"><Pill>{entry.category}</Pill><span className="font-semibold text-fg">{entry.title}</span><Pill tone={entry.status === "ready" ? "success" : entry.status === "blocked" ? "danger" : "warning"}>{entry.status}</Pill><span className="ml-auto text-xs text-fg-3">{entry.sourcing}</span><p className="w-full text-xs leading-5 text-fg-2">{entry.specification}</p></div>)}</div>
        </SectionCard>
        <SectionCard title="위험·결정 원장" description="위험 대응과 창작·운영 결정을 회차·장면 범위에 고정합니다.">
          <div className="space-y-2">{openRisks.map((risk) => <div key={risk.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex flex-wrap items-center gap-2"><Pill tone={risk.probability * risk.impact >= 12 ? "danger" : "warning"}>P{risk.probability} × I{risk.impact}</Pill><span className="font-semibold text-fg">{risk.title}</span><Pill>{risk.status}</Pill></div><p className="mt-2 text-xs leading-5 text-fg-2">{risk.mitigation}</p></div>)}</div>
        </SectionCard>
      </div>
    </div>
  );
}
function ProductionSurface({
  aggregate,
  execute,
  canEdit,
  roleLens,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly roleLens: RoleLens;
}) {
  return (
    <ProductionRoleWorkspace
      aggregate={aggregate}
      execute={execute}
      canEdit={canEdit}
      roleLens={roleLens}
    />
  );
}
function ScheduleSurface({
  aggregate,
  execute,
  canEdit,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
}) {
  return <ProductionScheduleWorkspace aggregate={aggregate} execute={execute} canEdit={canEdit} />;
}

function HandoffSurface({
  aggregate,
  execute,
  roleLens,
  canEdit,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly roleLens: RoleLens;
  readonly canEdit: boolean;
}) {
  const handoff = aggregate.handoffs.find((entry) => !["superseded", "cancelled"].includes(entry.status));
  if (!handoff) return <EmptyState title="넘길 작업이 없습니다" description="스토리 확정 후 회차 의도와 참고 파일을 묶어 다음 작업자에게 전달하세요." />;
  const clarifications = aggregate.clarifications.filter((entry) => entry.handoffId === handoff.id);
  const readiness = evaluateHandoffReadiness({ package: handoff, clarifications });
  const answerFirstBlocking = async () => {
    const thread = clarifications.find((entry) => entry.blocking && entry.status === "open");
    if (!thread) return;
    const next: ClarificationThread = {
      ...thread,
      status: "decision-recorded",
      answer: "문양은 노출할 수 있지만 글자와 발신인 식별 요소는 마지막 컷 전까지 가립니다.",
      decisionRecordId: `decision-${thread.id}`,
      updatedAt: new Date().toISOString(),
    };
    await execute({ type: "upsert-clarification", clarification: next }, "차단 질문의 결정을 기록했습니다.");
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
      <SectionCard title="작업 넘기기 준비도" description="필수 확인 항목이 하나라도 남으면 다음 작업을 시작할 수 없습니다.">
        <div className="flex items-end justify-between gap-4 rounded-xl border border-line bg-panel p-4">
          <div><p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">Readiness</p><p className="mt-1 text-4xl font-black text-fg">{readiness.score}<span className="text-base text-fg-3">/100</span></p></div>
          <Pill tone={readiness.ready ? "success" : "danger"}>{readiness.ready ? "작화 수락 가능" : `${readiness.hardBlocks.length}개 차단`}</Pill>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Object.entries(readiness.metrics).map(([key, value]) => (
            <div key={key} className="rounded-xl border border-line bg-panel p-2.5"><p className="truncate text-[0.6875rem] text-fg-3">{key}</p><p className="mt-1 font-bold text-fg">{value}</p></div>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {readiness.hardBlocks.map((block) => <div key={block.code} className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs text-fg"><AlertTriangle className="mr-2 inline size-4 text-bad" aria-hidden="true" />{block.message}</div>)}
          {readiness.advisories.map((entry) => <div key={entry.code} className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg">{entry.message}</div>)}
        </div>
      </SectionCard>

      <div className="space-y-4">
        <SectionCard title={`스토리 → 작화 · ${handoff.episodeId}`} description={`스토리 ${handoff.storyLockRef ? `버전 ${handoff.storyLockRef.revision}` : "미확정"} · 넘기기 버전 ${handoff.handoffRevision} · ${handoff.status}`}>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["반드시 보존", handoff.instructions.filter((entry) => entry.priority === "MUST_PRESERVE")],
              ["의도", handoff.instructions.filter((entry) => entry.priority === "INTENT")],
              ["작가 선택", handoff.instructions.filter((entry) => entry.priority === "ARTIST_CHOICE")],
              ["사용 금지", handoff.instructions.filter((entry) => entry.priority === "DO_NOT_USE")],
            ].map(([label, entries]) => (
              <div key={label as string} className="rounded-xl border border-line bg-panel p-3">
                <p className="text-xs font-bold text-fg">{label as string}</p>
                <div className="mt-2 space-y-2">
                  {(entries as StoryToArtHandoffPackage["instructions"]).map((entry) => (
                    <div key={entry.id} className="rounded-lg bg-raised p-2.5"><p className="text-xs leading-5 text-fg">{entry.text}</p><p className="mt-1 text-[0.6875rem] text-fg-3">자율도 {entry.latitude}</p></div>
                  ))}
                  {(entries as StoryToArtHandoffPackage["instructions"]).length === 0 ? <p className="text-xs text-fg-3">항목 없음</p> : null}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="질문·결정"
          description="차단 질문은 답변 또는 명시적인 위험 수락 전까지 다음 공정을 열지 않습니다."
          action={clarifications.some((entry) => entry.blocking && entry.status === "open") ? (
            <button type="button" className={buttonClass({ size: "sm" })} onClick={() => void answerFirstBlocking()} disabled={!canEdit || roleLens === "art"}>첫 차단 질문 결정</button>
          ) : undefined}
        >
          <div className="space-y-2">
            {clarifications.map((thread) => (
              <article key={thread.id} className={cn("rounded-xl border p-3", thread.blocking && thread.status === "open" ? "border-bad/30 bg-bad/10" : "border-line bg-panel")}>
                <div className="flex flex-wrap items-center gap-2"><Pill tone={thread.blocking ? "danger" : "neutral"}>{thread.blocking ? "진행 막힘" : thread.category}</Pill><Pill tone={thread.status === "decision-recorded" ? "success" : "warning"}>{thread.status}</Pill></div>
                <p className="mt-2 text-sm font-semibold text-fg">{thread.question}</p>
                {thread.answer ? <p className="mt-2 rounded-lg bg-raised p-2.5 text-xs leading-5 text-fg-2">결정: {thread.answer}</p> : null}
                <p className="mt-2 text-[0.6875rem] text-fg-3">질문 {assignmentLabel(aggregate, thread.askedByAssignmentId)} → 답변 {assignmentLabel(aggregate, thread.answerOwnerAssignmentId)}</p>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function ReviewSurface({
  aggregate,
  execute,
  canEdit,
  roleLens,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly roleLens: RoleLens;
}) {
  const policy = aggregate.reviewPolicies[0];
  if (!policy) return (
    <div className="space-y-4">
      <ProductionReviewWorkspace aggregate={aggregate} execute={execute} canEdit={canEdit} roleLens={roleLens} />
      <EmptyState title="검수 기준이 없습니다" description="스토리·그림·제작·권리별 검수 항목과 필수 승인 수를 정하세요." />
    </div>
  );
  const roundId = aggregate.reviewDecisions[0]?.reviewRoundId ?? "active-round";
  const decisions = aggregate.reviewDecisions.filter((entry) => entry.reviewRoundId === roundId);
  const evaluation = evaluateReviewApproval(policy, decisions);
  return (
    <div className="space-y-4">
      <ProductionReviewWorkspace aggregate={aggregate} execute={execute} canEdit={canEdit} roleLens={roleLens} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="검수 항목" value={String(policy.lanes.length)} detail="역할별 독립 승인" icon={Layers3} />
        <Metric label="승인 완료" value={String(evaluation.laneResults.filter((entry) => entry.approved).length)} detail={`${policy.lanes.length}개 중`} icon={BadgeCheck} tone={evaluation.approved ? "success" : "warning"} />
        <Metric label="게시 차단" value={String(evaluation.blockingLanes.length)} detail={evaluation.blockingLanes.join(", ") || "없음"} icon={LockKeyhole} tone={evaluation.blockingLanes.length ? "danger" : "success"} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {evaluation.laneResults.map((result) => (
          <SectionCard key={result.lane} title={result.lane} description={`${result.approvals}/${result.requiredApprovals} 승인`}>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between"><span className="text-fg-2">상태</span><Pill tone={result.approved ? "success" : "warning"}>{result.approved ? "승인" : "대기"}</Pill></div>
              <div className="flex items-center justify-between"><span className="text-fg-2">필수 승인 누락</span><span className="font-semibold text-fg">{result.missingRequiredAssignmentIds.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-fg-2">변경 요청</span><span className="font-semibold text-fg">{result.changeRequestedByAssignmentIds.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-fg-2">거부</span><span className="font-semibold text-fg">{result.vetoedByAssignmentIds.length}</span></div>
            </div>
          </SectionCard>
        ))}
      </div>
      <SectionCard title="검수 근거" description="필수 수정과 거부 결정은 확정된 의도·설정·규격·권리 조건을 근거로 남겨야 합니다.">
        <div className="space-y-2">
          {decisions.map((decision) => (
            <div key={decision.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-3 text-xs">
              <Pill tone={decision.value === "approve" ? "success" : decision.value === "veto" ? "danger" : "warning"}>{decision.value}</Pill>
              <span className="font-semibold text-fg">{decision.lane}</span>
              <span className="text-fg-2">{assignmentLabel(aggregate, decision.assignmentId)}</span>
              <span className="ml-auto text-fg-3">{decision.reasonCode ?? "근거 코드 없음"}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function ProcurementSurface({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const pendingPayments = aggregate.paymentRecords.filter((entry) => entry.status === "recorded-pending-verification");
  const activeAgreements = aggregate.agreements.filter((entry) => entry.status === "active" || entry.status === "signed");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="공개 범위" value={String(aggregate.scopePackages.filter((entry) => entry.status === "published").length)} detail="불변 ScopePackage" icon={BriefcaseBusiness} tone="accent" />
        <Metric label="접수 제안" value={String(aggregate.proposals.length)} detail={`${aggregate.proposals.filter((entry) => entry.status === "selected").length}개 선정`} icon={MessagesSquare} />
        <Metric label="활성 계약" value={String(activeAgreements.length)} detail={`${aggregate.contractMilestones.length}개 마일스톤`} icon={FileKey2} tone="success" />
        <Metric label="지급 검증 대기" value={String(pendingPayments.length)} detail="외부 증빙 전 지급 완료 아님" icon={Coins} tone={pendingPayments.length > 0 ? "warning" : "success"} />
      </div>

      {aggregate.scopePackages.map((scopePackage) => {
        const proposals = aggregate.proposals.filter((entry) => entry.scopePackageId === scopePackage.id && entry.scopePackageRevision === scopePackage.revision);
        return (
          <SectionCard key={`${scopePackage.id}:${scopePackage.revision}`} title={scopePackage.id} description={`r${scopePackage.revision} · ${scopePackage.informationDisclosureLevel} · digest ${scopePackage.digest}`} action={<Pill tone={scopePackage.status === "published" ? "success" : "neutral"}>{scopePackage.status}</Pill>}>
            <div className="grid gap-4 lg:grid-cols-[0.85fr_0.85fr_1.3fr]">
              <div><p className="text-xs font-bold text-fg">산출물</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-fg-2">{scopePackage.deliverableSpecifications.map((entry) => <li key={entry}>• {entry}</li>)}</ul></div>
              <div><p className="text-xs font-bold text-fg">완료 기준</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-fg-2">{scopePackage.acceptanceCriteria.map((entry) => <li key={entry}>• {entry}</li>)}</ul></div>
              <div className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">일정·조건</p><dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-fg-2"><div><dt className="text-fg-3">시작</dt><dd className="mt-1 font-semibold text-fg">{formatDay(scopePackage.schedule.startsAt)}</dd></div><div><dt className="text-fg-3">납기</dt><dd className="mt-1 font-semibold text-fg">{formatDay(scopePackage.schedule.deliveryDueAt)}</dd></div><div><dt className="text-fg-3">검수 SLA</dt><dd className="mt-1 font-semibold text-fg">{scopePackage.schedule.reviewResponseHours}h</dd></div><div><dt className="text-fg-3">수정</dt><dd className="mt-1 font-semibold text-fg">{scopePackage.includedRevisionRounds}회</dd></div></dl></div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {proposals.map((proposal) => (
                <article key={proposal.id} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-fg-3">{aggregate.parties.find((party) => party.id === proposal.proposerPartyId)?.publicDisplayName ?? proposal.proposerPartyId}</p><h3 className="mt-1 font-bold text-fg">{proposal.totalAmountMinor.toLocaleString("ko-KR")} {proposal.currency}</h3></div><Pill tone={proposal.status === "selected" ? "success" : proposal.status === "rejected" ? "danger" : "warning"}>{proposal.status}</Pill></div>
                  <p className="mt-3 text-xs leading-5 text-fg-2">{proposal.understanding}</p>
                  <div className="mt-3 space-y-1.5">{proposal.milestoneDrafts.map((milestone) => <div key={milestone.title} className="flex justify-between rounded-lg bg-raised px-3 py-2 text-xs"><span className="text-fg-2">{milestone.title}</span><span className="font-semibold text-fg">{milestone.amountMinor.toLocaleString("ko-KR")}원</span></div>)}</div>
                </article>
              ))}
              {proposals.length === 0 ? <EmptyState title="제안서가 없습니다" description="범위 revision에 고정된 제안서를 접수해 가격·일정·수정 조건을 비교하세요." /> : null}
            </div>
          </SectionCard>
        );
      })}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="계약·마일스톤" description="선택한 제안과 외주 범위 버전을 계약 내용으로 확정합니다.">
          <div className="space-y-3">
            {activeAgreements.map((agreement) => {
              const milestones = aggregate.contractMilestones.filter((entry) => entry.agreementId === agreement.id).sort((a, b) => a.sequence - b.sequence);
              return (
                <article key={agreement.id} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[0.6875rem] text-fg-3">{agreement.id} · r{agreement.revision}</p><h3 className="mt-1 font-bold text-fg">{agreement.totalAmountMinor.toLocaleString("ko-KR")} {agreement.currency}</h3></div><Pill tone="success">{agreement.status}</Pill></div>
                  <div className="mt-4 space-y-2">{milestones.map((milestone) => <div key={milestone.id} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-raised p-3"><div className="flex size-8 items-center justify-center rounded-full bg-panel font-black text-accent">{milestone.sequence}</div><div><p className="text-xs font-semibold text-fg">{milestone.title}</p><p className="mt-1 text-[0.6875rem] text-fg-3">{formatDay(milestone.dueAt)} · {milestone.amountMinor.toLocaleString("ko-KR")}원</p></div><Pill tone={milestone.status === "paid" || milestone.status === "accepted" ? "success" : milestone.status === "changes-requested" ? "danger" : "warning"}>{milestone.status}</Pill></div>)}</div>
                </article>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="납품·청구·지급 증빙" description="외부 결제의 참조와 증빙이 확인되기 전에는 지급 완료로 표시하지 않습니다.">
          <div className="space-y-2">
            {aggregate.deliveryRevisions.map((delivery) => <div key={delivery.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-fg">납품 r{delivery.revision}</p><Pill tone={delivery.status === "accepted" ? "success" : "warning"}>{delivery.status}</Pill></div><p className="mt-2 text-[0.6875rem] text-fg-3">Submission {delivery.submissionIds.length} · License {delivery.licenseEvidenceRefs.length} · AI receipt {delivery.aiUseReceiptRefs.length}</p></div>)}
            {aggregate.invoices.map((invoice) => {
              const payment = aggregate.paymentRecords.find((entry) => entry.invoiceId === invoice.id);
              return <div key={invoice.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-fg">청구 {invoice.amountMinor.toLocaleString("ko-KR")} {invoice.currency}</p><p className="mt-1 text-[0.6875rem] text-fg-3">{invoice.externalInvoiceRef ?? "외부 청구 참조 없음"}</p></div><Pill tone={invoice.status === "settled" ? "success" : "warning"}>{invoice.status}</Pill></div>{payment ? <div className={cn("mt-3 rounded-lg border p-2.5 text-xs", payment.status === "verified-paid" ? "border-good/30 bg-good/10" : "border-warn/30 bg-warn/10")}><p className="font-semibold text-fg">{payment.status === "verified-paid" ? "지급 검증 완료" : "지급 기록 · 검증 대기"}</p><p className="mt-1 text-fg-2">{payment.externalPaymentRef ?? "외부 결제 참조와 증빙이 아직 없습니다."}</p></div> : null}</div>;
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
function RightsSurface({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const manifest = aggregate.creditManifests[0] ?? null;
  const preflight = preflightCreditManifest({
    manifest,
    contentRevisionRefs: manifest?.contentRevisionRefs ?? [],
    contributions: aggregate.contributions,
    rightsInterests: aggregate.rightsInterests,
    requiredApproverAssignmentIds: ["assignment-story", "assignment-art"],
  });
  const plan = aggregate.compensationPlans[0];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Credit Manifest" description="실제로 공개할 파일 버전과 공개 크레딧을 함께 확정합니다.">
        {manifest ? <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3"><div><p className="text-xs text-fg-3">상태</p><p className="mt-1 font-bold text-fg">{manifest.status} · r{manifest.revision}</p></div><Pill tone={preflight.passed ? "success" : "warning"}>{preflight.passed ? "공개 준비 완료" : `막힌 항목 ${preflight.blockers.length}`}</Pill></div>
          {[...manifest.entries].sort((a, b) => a.order - b.order).map((entry) => <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-3"><div className="flex size-9 items-center justify-center rounded-full bg-raised font-black text-accent">{entry.order}</div><div><p className="text-sm font-semibold text-fg">{entry.publicName}</p><p className="text-xs text-fg-2">{entry.roleLabel} · {entry.media.join(", ")}</p></div></div>)}
          {preflight.blockers.map((entry) => <p key={entry} className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs text-fg">{entry}</p>)}
          {preflight.warnings.map((entry) => <p key={entry} className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg">{entry}</p>)}
        </div> : <EmptyState title="공개 크레딧 목록이 없습니다" description="기여 기록과 계약 버전을 근거로 작성하세요." />}
      </SectionCard>

      <SectionCard title="권리·동의 원장" description="AI 처리 동의와 AI 학습 동의를 별도 권리 항목으로 보존합니다.">
        <div className="space-y-2">
          {aggregate.rightsInterests.map((interest) => (
            <div key={interest.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3 text-xs">
              <Pill tone={interest.status === "verified" ? "success" : interest.status === "disputed" ? "danger" : "warning"}>{interest.status}</Pill>
              <span className="font-semibold text-fg">{interest.type}</span>
              <span className="text-fg-2">{aggregate.parties.find((party) => party.id === interest.partyId)?.publicDisplayName ?? interest.partyId}</span>
              <span className="ml-auto text-fg-3">증빙 {interest.evidenceRefs.length}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard className="xl:col-span-2" title="보상·수익 배분" description="기여 기록만으로 배분율이 바뀌지 않으며, 계약 버전에서만 확정됩니다.">
        {plan ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plan.revenueShareRules.map((rule) => (
            <div key={rule.id} className="rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-fg">{rule.revenueSource}</p><Pill>{rule.basis}</Pill></div>
              <div className="mt-3 space-y-2">
                {Object.entries(rule.partySharesBasisPoints).map(([partyId, value]) => <div key={partyId} className="flex justify-between text-xs"><span className="text-fg-2">{aggregate.parties.find((party) => party.id === partyId)?.publicDisplayName ?? partyId}</span><span className="font-semibold text-fg">{(value / 100).toFixed(1)}%</span></div>)}
              </div>
              {rule.deductions.length ? <p className="mt-3 text-[0.6875rem] leading-5 text-fg-3">공제: {rule.deductions.join(", ")}</p> : null}
            </div>
          ))}
        </div> : <EmptyState title="활성 보상 계획이 없습니다" description="고정 대가와 수익원별 배분 기준을 계약 버전에 연결하세요." />}
      </SectionCard>
    </div>
  );
}

function SettingsSurface({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <SectionCard title="참여자와 역할" description="역할 배정은 실제 기여·저작권·보상과 별도의 객체입니다.">
        <div className="space-y-2">
          {aggregate.parties.map((party) => (
            <div key={party.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-raised font-black text-accent">{party.publicDisplayName.slice(0, 1)}</div>
              <div><p className="text-sm font-semibold text-fg">{party.publicDisplayName}</p><p className="text-xs text-fg-2">{partyRole(aggregate, party.id)}</p></div>
              <Pill tone={party.status === "active" ? "success" : "neutral"}>{party.status}</Pill>
              <span className="ml-auto text-xs text-fg-3">{aggregate.assignments.filter((entry) => entry.partyId === party.id).length} assignments</span>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="운영 안전 경계" description="창작 협업에서 자동화가 넘어서는 안 되는 경계입니다.">
        <ul className="space-y-2 text-xs leading-6 text-fg-2">
          {[
            "파일 업로드자를 저작권자로 자동 판정하지 않습니다.",
            "관리자 권한을 창작 최종결정권으로 해석하지 않습니다.",
            "검수 기한이 지나도 자동 승인하지 않습니다.",
            "기여량으로 수익 배분율을 자동 변경하지 않습니다.",
            "작업자 생산성 순위나 감시 지표를 만들지 않습니다.",
            "AI 추천은 계약 선정·게시 승인·지급을 대신하지 않습니다.",
          ].map((entry) => <li key={entry} className="rounded-xl border border-line bg-panel px-3 py-2">• {entry}</li>)}
        </ul>
      </SectionCard>
      </div>
      <ProductionCrewCoverage aggregate={aggregate} />
      <ProductionIntegrationsPanel aggregate={aggregate} />
    </div>
  );
}

function SurfaceContent({
  surface,
  aggregate,
  roleLens,
  execute,
  canEdit,
}: {
  readonly surface: ProductionProjectSurface;
  readonly aggregate: ProductionProjectAggregate;
  readonly roleLens: RoleLens;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
}) {
  switch (surface) {
    case "overview": return <OverviewSurface aggregate={aggregate} roleLens={roleLens} execute={execute} canEdit={canEdit} />;
    case "planning": return <PlanningSurface aggregate={aggregate} execute={execute} canEdit={canEdit} />;
    case "episodes": return <ProductionEpisodeOperationsWorkspace aggregate={aggregate} execute={execute} canEdit={canEdit} />;
    case "production": return <ProductionSurface aggregate={aggregate} execute={execute} canEdit={canEdit} roleLens={roleLens} />;
    case "schedule": return <ScheduleSurface aggregate={aggregate} execute={execute} canEdit={canEdit} />;
    case "handoff": return <HandoffSurface aggregate={aggregate} roleLens={roleLens} execute={execute} canEdit={canEdit} />;
    case "review": return <ReviewSurface aggregate={aggregate} execute={execute} canEdit={canEdit} roleLens={roleLens} />;
    case "procurement": return <ProcurementSurface aggregate={aggregate} />;
    case "rights": return <RightsSurface aggregate={aggregate} />;
    case "settings": return <SettingsSurface aggregate={aggregate} />;
  }
}

export function ProductionProjectPage({ surface }: { readonly surface: ProductionProjectSurface }) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const project = useProductionProject(projectId);
  const [roleLens, setRoleLens] = usePreferredRoleLens("producer");

  if (!projectId) return <Navigate to="/production" replace />;
  if (project.loading) return <div className="min-h-dvh bg-canvas p-6 text-fg"><div className="mx-auto max-w-5xl animate-pulse rounded-3xl border border-line bg-card p-8">제작 프로젝트를 불러오는 중…</div></div>;
  if (project.error || !project.aggregate) return <div className="min-h-dvh bg-canvas p-6 text-fg"><div role="alert" className="mx-auto max-w-3xl rounded-2xl border border-bad/30 bg-bad/10 p-6"><h1 className="font-bold">프로젝트를 열 수 없습니다</h1><p className="mt-2 text-sm text-fg-2">{project.error ?? "프로젝트 데이터가 없습니다."}</p><Link className={cn(buttonClass({ variant: "outline" }), "mt-4")} to="/production">제작 관리 홈</Link></div></div>;

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <ProjectHeader aggregate={project.aggregate} access={project.access} roleLens={roleLens} onRoleLensChange={setRoleLens} saveState={project.saveState} isDemo={project.isDemo} />
      <div className="mx-auto grid max-w-[100rem] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <ProjectNav projectId={project.aggregate.projectId} surface={surface} />
        <div className="min-w-0 p-4 sm:p-6">
          {project.notice ? <div className={cn("mb-4 rounded-xl border px-3 py-2 text-xs", project.saveState === "error" ? "border-bad/30 bg-bad/10 text-fg" : "border-good/30 bg-good/10 text-fg")} role="status">{project.notice}</div> : null}
          <SurfaceContent surface={surface} aggregate={project.aggregate} roleLens={roleLens} execute={project.execute} canEdit={project.access.edit} />
        </div>
      </div>
    </div>
  );
}

function TimelineStep({
  label,
  active,
  done,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly done: boolean;
}) {
  return (
    <div className="min-w-28 flex-1">
      <div className={cn("h-1 rounded-full", done ? "bg-good" : active ? "bg-accent" : "bg-line")} />
      <p className={cn("mt-2 text-[0.6875rem] font-semibold", active ? "text-accent" : done ? "text-good" : "text-fg-3")}>{label}</p>
    </div>
  );
}

export function ProductionEpisodeRoomPage() {
  const params = useParams<{ projectId: string; episodeId: string }>();
  const project = useProductionProject(params.projectId);
  const [roleLens, setRoleLens] = usePreferredRoleLens("art");
  const userId = useApp((state) => state.userId);

  if (!params.projectId || !params.episodeId) return <Navigate to="/production" replace />;
  if (project.loading) return <div className="min-h-dvh bg-canvas p-6 text-fg">회차 작업실을 불러오는 중…</div>;
  if (!project.aggregate || project.error) return <div className="min-h-dvh bg-canvas p-6 text-fg">{project.error ?? "회차 데이터가 없습니다."}</div>;

  const aggregate = project.aggregate;
  const episode = aggregate.episodes.find((entry) => entry.episodeId === params.episodeId);
  if (!episode) return <div className="min-h-dvh bg-canvas p-6 text-fg"><div className="mx-auto max-w-3xl rounded-2xl border border-line bg-card p-6">회차를 찾을 수 없습니다.</div></div>;
  const handoff = aggregate.handoffs.find((entry) => entry.episodeId === episode.episodeId && !["superseded", "cancelled"].includes(entry.status));
  const clarifications = handoff ? aggregate.clarifications.filter((entry) => entry.handoffId === handoff.id) : [];
  const readiness = handoff ? evaluateHandoffReadiness({ package: handoff, clarifications }) : null;
  const storyParty = aggregate.parties.find((party) => party.id === aggregate.assignments.find((entry) => entry.roleType === "story-lead")?.partyId);
  const artParty = aggregate.parties.find((party) => party.id === aggregate.assignments.find((entry) => entry.roleType === "art-lead")?.partyId);
  const viewerAssignment = aggregate.assignments.find((assignment) =>
    aggregate.parties.find((party) => party.id === assignment.partyId)?.accountUserId === userId);

  const pipeline = [
    { label: "스토리 확정", done: episode.storyLockApproved, active: episode.state.startsWith("story") },
    { label: "작업 넘기기", done: Boolean(episode.activeHandoffId), active: episode.state === "art-clarification" },
    { label: "콘티", done: episode.thumbnailLockApproved, active: episode.state.includes("thumbnail") },
    { label: "최종 원고", done: Boolean(episode.visualRevisionRef) && episode.thumbnailLockApproved, active: episode.state === "final-art-production" },
    { label: "최종 검수", done: episode.jointProofApproved, active: episode.state === "joint-proof" },
    { label: "공개 준비", done: episode.state === "published", active: episode.state === "publish-ready" },
  ];

  const answerBlocker = async (thread: ClarificationThread) => {
    const assignmentId = project.isDemo ? "assignment-story" : viewerAssignment?.id;
    if (!assignmentId || assignmentId !== thread.answerOwnerAssignmentId) return;
    await project.execute({
      type: "upsert-clarification",
      clarification: {
        ...thread,
        status: "decision-recorded",
        answer: "문양은 보여도 되지만 발신인을 특정할 수 있는 글자와 도상은 마지막 컷 전까지 가립니다.",
        decisionRecordId: `decision-${thread.id}`,
        updatedAt: new Date().toISOString(),
      },
    }, "질문 답변과 결정을 기록했습니다.");
  };

  const approveVisualLane = async () => {
    const policy = aggregate.reviewPolicies.find((entry) => entry.scope.id === episode.episodeId);
    const assignmentId = project.isDemo ? "assignment-art" : viewerAssignment?.id;
    if (!policy || !assignmentId) return;
    const decision: ReviewDecision = {
      id: `decision-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      reviewRoundId: "thumbnail-round-1",
      lane: "visual-direction",
      assignmentId,
      value: "approve",
      reasonCode: null,
      evidenceScopeRefs: [policy.scope],
      conditions: [],
      createdAt: new Date().toISOString(),
    };
    await project.execute({ type: "record-review-decision", policyId: policy.id, decision }, "시각 연출 lane을 승인했습니다.");
  };

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <ProjectHeader aggregate={aggregate} access={project.access} roleLens={roleLens} onRoleLensChange={setRoleLens} saveState={project.saveState} isDemo={project.isDemo} />
      <div className="border-b border-line bg-card px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-[100rem]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><Link className="text-xs font-semibold text-fg-3 hover:text-accent" to={`/production/projects/${aggregate.projectId}/episodes`}>← 회차 목록</Link><h1 className="mt-1 text-2xl font-black text-fg">{episode.episodeId} 공동 회차 작업실</h1></div>
            <div className="flex items-center gap-2"><Pill tone={stateTone(episode.state)}>{EPISODE_STATE_LABELS[episode.state]}</Pill>{readiness ? <Pill tone={readiness.ready ? "success" : "danger"}>넘기기 준비도 {readiness.score}</Pill> : null}</div>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{pipeline.map((step) => <TimelineStep key={step.label} {...step} />)}</div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[100rem] gap-4 p-4 sm:p-6 xl:grid-cols-[0.8fr_1.25fr_0.95fr]">
        <div className="space-y-4">
          <SectionCard title="스토리 의도" description={`${storyParty?.publicDisplayName ?? "스토리 작가"} · ${episode.narrativeRevisionRef ? `r${episode.narrativeRevisionRef.revision}` : "초안"}`}>
            <div className="rounded-xl border border-accent/30 bg-accent-soft p-3"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-accent">독자 경험</p><p className="mt-2 text-sm font-semibold leading-6 text-fg">독자가 주인공의 선택을 이해한 직후, 봉투의 정체가 그 선택을 뒤집는다는 사실을 깨닫는다.</p></div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3 rounded-lg bg-panel p-2.5"><dt className="text-fg-3">오프닝</dt><dd className="text-right text-fg">빈 우편함과 젖은 손</dd></div>
              <div className="flex justify-between gap-3 rounded-lg bg-panel p-2.5"><dt className="text-fg-3">감정 전환</dt><dd className="text-right text-fg">경계 → 안도 → 의심</dd></div>
              <div className="flex justify-between gap-3 rounded-lg bg-panel p-2.5"><dt className="text-fg-3">클리프행어</dt><dd className="text-right text-fg">발신인 이름 공개</dd></div>
            </dl>
          </SectionCard>

          <SectionCard title="보존·자율 경계" description="스토리 의도와 그림 작가의 시각적 자율성을 함께 표시합니다.">
            <div className="space-y-2">
              {handoff?.instructions.map((instruction) => (
                <div key={instruction.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex flex-wrap gap-2"><Pill tone={instruction.priority === "MUST_PRESERVE" ? "danger" : instruction.priority === "ARTIST_CHOICE" ? "success" : "accent"}>{instruction.priority}</Pill><Pill>{instruction.latitude}</Pill></div><p className="mt-2 text-xs leading-5 text-fg">{instruction.text}</p><p className="mt-1 text-[0.6875rem] text-fg-3">{instruction.rationale}</p></div>
              )) ?? <p className="text-xs text-fg-3">넘길 작업 지시가 없습니다.</p>}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-3">
            <div><p className="text-xs font-black text-fg">시각 작업대</p><p className="mt-1 text-[0.6875rem] text-fg-3">{artParty?.publicDisplayName ?? "그림 작가"} · {episode.visualRevisionRef ? `그림 버전 ${episode.visualRevisionRef.revision}` : "그림 초안 없음"}</p></div>
            <Link className={buttonClass({ size: "sm" })} to={`/studio/work/${aggregate.workId}/comic`}>Studio 열기</Link>
          </div>
          <ProductionVisualPlanningWorkspace
            aggregate={aggregate}
            execute={project.execute}
            canEdit={project.access.edit}
            initialEpisodeId={episode.episodeId}
            showEpisodeRail={false}
            compact
            defaultView="scroll"
          />

          <SectionCard title="공동 검수" description="콘티가 확정된 스토리 의도와 맞는지 항목별로 함께 확인합니다." action={<button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => void approveVisualLane()} disabled={!project.access.edit}>그림 연출 승인</button>}>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["스토리", aggregate.reviewDecisions.some((entry) => entry.lane === "narrative")],
                ["그림 연출", aggregate.reviewDecisions.some((entry) => entry.lane === "visual-direction")],
                ["제작", aggregate.reviewDecisions.some((entry) => entry.lane === "production")],
              ].map(([label, approved]) => <div key={label as string} className="rounded-xl border border-line bg-panel p-3"><p className="text-xs font-bold text-fg">{label as string}</p><div className="mt-2"><Pill tone={approved ? "success" : "warning"}>{approved ? "결정 기록됨" : "대기"}</Pill></div></div>)}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="질문·결정" description="장면과 컷에 고정된 협업 질문입니다.">
            <div className="space-y-2">
              {clarifications.map((thread) => (
                <article key={thread.id} className={cn("rounded-xl border p-3", thread.blocking && thread.status === "open" ? "border-bad/30 bg-bad/10" : "border-line bg-panel")}>
                  <div className="flex flex-wrap gap-2"><Pill tone={thread.blocking ? "danger" : "neutral"}>{thread.blocking ? "진행 막힘" : thread.category}</Pill><Pill tone={thread.status === "decision-recorded" ? "success" : "warning"}>{thread.status}</Pill></div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-fg">{thread.question}</p>
                  {thread.answer ? <p className="mt-2 rounded-lg bg-raised p-2 text-xs leading-5 text-fg-2">{thread.answer}</p> : null}
                  {thread.blocking && thread.status === "open" ? <button type="button" className={cn(buttonClass({ size: "sm" }), "mt-3 w-full")} onClick={() => void answerBlocker(thread)} disabled={!project.access.edit || (project.isDemo && roleLens !== "story") || (!project.isDemo && viewerAssignment?.id !== thread.answerOwnerAssignmentId)}>결정 기록</button> : null}
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="영향·비용" description="스토리 확정 뒤 생긴 변경이 이후 작업과 계약에 주는 영향을 계산합니다.">
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-line bg-panel p-3"><span className="text-fg-2">승인 후 변경</span><span className="font-bold text-fg">2건</span></div>
              <div className="flex items-center justify-between rounded-xl border border-line bg-panel p-3"><span className="text-fg-2">재작업 예상</span><span className="font-bold text-warn">6–10h</span></div>
              <div className="flex items-center justify-between rounded-xl border border-line bg-panel p-3"><span className="text-fg-2">계약 영향</span><Pill tone="warning">계약 변경 검토</Pill></div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
