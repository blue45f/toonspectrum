import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  BriefcaseBusiness,
  Check,
  Clock3,
  Loader2,
  Search,
  Settings2,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonspectrum/core/production";

import {
  batchPublicCreatorRoleProfiles,
  searchPublicCreatorRoles,
  type CreatorRoleDirectoryResult,
} from "@/infrastructure/creator-role-workspace-client";
import { getMyProfile, updateMyProfile, type MeProfile } from "@/infrastructure/me-client";
import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  CREATOR_ROLE_DEFINITIONS,
  CREATOR_SPECIALTY_DEFINITIONS,
  creatorRoleDefinition,
  creatorText,
  normalizeCreatorRoleProfile,
  type CreatorRoleId,
  type CreatorRoleLocale,
  type CreatorSpecialtyId,
} from "@/shared/lib/creator-role-contract";
import {
  CREATOR_ROLE_NOTIFICATION_EVENTS,
  CREATOR_ROLE_USAGE_GOALS,
  CREATOR_ROLE_WORKSPACE_PRESETS,
  GLOBAL_CREATOR_ROLE_WORKSPACE_KEY,
  creatorDetailedRoleLens,
  creatorRoleAiTools,
  creatorRoleChecklist,
  creatorRoleNotificationSettings,
  creatorRoleStudioWorkspace,
  normalizeCreatorRoleWorkspacePreference,
  rankCreatorRoleWork,
  recommendCreatorTeamRoles,
  resolveCreatorRoleProjectKey,
  type CreatorProductionRole,
  type CreatorRoleNotificationEvent,
  type CreatorRoleUsageGoal,
  type CreatorRoleVisibility,
  type CreatorRoleWorkspacePreference,
  type PublicCreatorRoleCandidate,
} from "@/shared/lib/creator-role-workspace-contract";
import { useCreatorRoleWorkspace } from "@/shared/lib/use-creator-role-workspace";
import { creatorWorkItemLaunch } from "@/shared/lib/creator-role-experience";
import { cn } from "@/shared/lib/utils";

import {
  loadStudioProductionWorkspace,
  type ProductionWorkspace,
} from "../studio-production/studio-production-workspace";
import { loadStudioServerProductionWorkspace } from "../studio-production/studio-production-server-client";
import {
  creatorProductionAssignmentIdsForUser,
  creatorRequiredProductionRoles,
  rankCreatorProductionWork,
} from "../production-hub/creator-role-production-work";
import { getProductionProjectByWork } from "../production-hub/production-api";
import { getStudioTeam, type StudioTeamSnapshot } from "../studio-team-client";

const FEATURED_ONBOARDING_ROLES: readonly CreatorRoleId[] = [
  "story",
  "line-art",
  "assistant",
  "planner",
  "producer",
  "creator",
];

const USAGE_GOAL_LABELS: Readonly<
  Record<CreatorRoleUsageGoal, { readonly ko: string; readonly en: string }>
> = {
  "personal-project": { ko: "개인 작품 제작", en: "Personal project" },
  "team-production": { ko: "팀 프로젝트 참여", en: "Team production" },
  serialization: { ko: "연재 작품 관리", en: "Serialization" },
  outsourcing: { ko: "외주 작업", en: "Freelance work" },
  portfolio: { ko: "포트폴리오 제작", en: "Portfolio" },
  "studio-management": { ko: "제작사·스튜디오 운영", en: "Studio management" },
};

const NOTIFICATION_LABELS: Readonly<
  Record<CreatorRoleNotificationEvent, { readonly ko: string; readonly en: string }>
> = {
  assignment: { ko: "담당 업무 배정", en: "Work assignment" },
  "handoff-ready": { ko: "선행 작업·인계 준비", en: "Handoff ready" },
  "review-request": { ko: "검수 요청", en: "Review request" },
  "revision-request": { ko: "수정 요청", en: "Revision request" },
  "deadline-risk": { ko: "일정 지연 위험", en: "Deadline risk" },
  "unassigned-work": { ko: "담당자 없는 업무", en: "Unassigned work" },
  "approval-needed": { ko: "승인 대기", en: "Approval needed" },
  "publish-risk": { ko: "연재·납품 위험", en: "Publishing risk" },
  "canon-change": { ko: "설정·대본 변경", en: "Canon change" },
  question: { ko: "담당자 질문", en: "Team question" },
};

const WORK_REASON_LABELS = {
  "assigned-to-me": { ko: "나에게 배정", en: "Assigned to me" },
  "role-match": { ko: "현재 직무와 일치", en: "Role match" },
  overdue: { ko: "기한 초과", en: "Overdue" },
  "due-today": { ko: "오늘 마감", en: "Due today" },
  "due-soon": { ko: "마감 임박", en: "Due soon" },
  blocked: { ko: "차단됨", en: "Blocked" },
  urgent: { ko: "긴급", en: "Urgent" },
  "review-requested": { ko: "검수 요청", en: "Review requested" },
  "approval-required": { ko: "승인 필요", en: "Approval required" },
  "dependency-ready": { ko: "선행 작업 완료", en: "Dependencies ready" },
} as const;

const PRODUCTION_ROLE_LABELS: Readonly<Record<CreatorProductionRole, string>> = {
  story: "스토리",
  storyboard: "콘티",
  lineart: "선화",
  color: "채색",
  background: "배경",
  lettering: "식자",
  reviewer: "검수",
  director: "디렉터",
  publisher: "게시",
};

function localized(locale: CreatorRoleLocale, ko: string, en: string): string {
  return locale === "ko" ? ko : en;
}

function Card({
  title,
  description,
  children,
  action,
  className,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-line bg-card p-4", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-fg">{title}</h3>
          {description ? (
            <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-2">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ToggleChip({
  selected,
  disabled,
  children,
  onClick,
}: {
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-accent/55 bg-accent-soft text-accent"
          : "border-line bg-panel text-fg-2 hover:border-accent/35 hover:text-fg",
      )}
    >
      {selected ? <Check size={12} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function studioWorkspaceHref(
  projectKey: string,
  preference: CreatorRoleWorkspacePreference,
): string {
  const params = new URLSearchParams();
  const lens = preference.detailedLens
    ?? creatorDetailedRoleLens(preference.activeRole);
  const documentWorkspace = lens === "story" || lens === "planning" || lens === "storyboard"
    ? "storyboard"
    : lens === "review"
      ? "review"
      : lens === "background" && preference.activeRole === "three-d"
        ? "3d"
        : "draw";
  params.set("workspace", documentWorkspace);
  params.set(
    "roleWorkspace",
    preference.workspacePreset
      ?? creatorRoleStudioWorkspace(preference.activeRole),
  );
  params.set("uiMode", "standard");
  if (projectKey !== "draft" && projectKey !== GLOBAL_CREATOR_ROLE_WORKSPACE_KEY) {
    params.set("scope", projectKey);
  }
  return `/studio?${params.toString()}`;
}

function statusCopy(
  locale: CreatorRoleLocale,
  status: string,
): string {
  switch (status) {
    case "loading": return localized(locale, "불러오는 중", "Loading");
    case "saving": return localized(locale, "저장 중", "Saving");
    case "offline": return localized(locale, "이 기기에 복구본 저장", "Recovery copy saved locally");
    case "error": return localized(locale, "동기화 확인 필요", "Sync needs attention");
    default: return localized(locale, "동기화됨", "Synced");
  }
}

export function StudioRolePersonalizationCenter({
  locale,
}: {
  readonly locale: CreatorRoleLocale;
}) {
  const { status } = useSession();
  const location = useLocation();
  const projectKey = useMemo(
    () => resolveCreatorRoleProjectKey({
      pathname: location.pathname,
      search: location.search,
    }),
    [location.pathname, location.search],
  );
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingRole, setOnboardingRole] = useState<CreatorRoleId | null>(null);
  const [onboardingSpecialties, setOnboardingSpecialties] = useState<readonly CreatorSpecialtyId[]>([]);
  const [onboardingGoals, setOnboardingGoals] = useState<readonly CreatorRoleUsageGoal[]>([]);
  const [onboardingVisibility, setOnboardingVisibility] = useState<CreatorRoleVisibility>({
    roles: false,
    specialties: false,
    experienceLevel: false,
    collaborationStatus: false,
  });
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [productionWorkspace, setProductionWorkspace] = useState<ProductionWorkspace | null>(null);
  const [productionAggregate, setProductionAggregate] = useState<ProductionProjectAggregate | null>(null);
  const [productionProjectId, setProductionProjectId] = useState<string | null>(null);
  const [productionLoading, setProductionLoading] = useState(false);
  const [productionError, setProductionError] = useState<string | null>(null);
  const [team, setTeam] = useState<StudioTeamSnapshot | null>(null);
  const [teamProfiles, setTeamProfiles] = useState<readonly PublicCreatorRoleCandidate[]>([]);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryRole, setDirectoryRole] = useState<CreatorRoleId | "">("");
  const [directorySpecialty, setDirectorySpecialty] = useState<CreatorSpecialtyId | "">("");
  const [directory, setDirectory] = useState<CreatorRoleDirectoryResult | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const globalWorkspace = useCreatorRoleWorkspace(
    GLOBAL_CREATOR_ROLE_WORKSPACE_KEY,
    profile?.creatorRoleProfile,
  );
  const projectWorkspace = useCreatorRoleWorkspace(
    projectKey,
    profile?.creatorRoleProfile,
  );

  useEffect(() => {
    if (status !== "authenticated") {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setProfileLoading(true);
    setProfileError(null);
    getMyProfile(controller.signal)
      .then((next) => {
        if (!alive) return;
        setProfile(next);
        setOnboardingRole(
          next.creatorRoleProfile.primaryRole
          ?? next.creatorRoleProfile.activeRole
          ?? null,
        );
        setOnboardingSpecialties(next.creatorRoleProfile.specialties);
      })
      .catch((cause: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setProfileError(cause instanceof Error
          ? cause.message
          : localized(locale, "직무 프로필을 불러오지 못했습니다.", "Could not load your role profile."));
      })
      .finally(() => {
        if (alive) setProfileLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [locale, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      setProductionWorkspace(null);
      setProductionAggregate(null);
      setProductionProjectId(null);
      setProductionLoading(false);
      setProductionError(null);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setProductionLoading(true);
    setProductionError(null);
    setProductionWorkspace(null);
    setProductionAggregate(null);
    setProductionProjectId(null);
    void (async () => {
      try {
        if (projectKey.startsWith("work:")) {
          const workId = projectKey.slice(5);
          try {
            const record = await getProductionProjectByWork(workId);
            if (!alive) return;
            setProductionAggregate(record.aggregate);
            setProductionProjectId(record.aggregate.projectId);
            setProductionWorkspace(null);
            return;
          } catch {
            const snapshot = await loadStudioServerProductionWorkspace(workId, controller.signal);
            if (!alive) return;
            setProductionWorkspace(snapshot.document);
            return;
          }
        }
        const workspace = projectKey === "draft" || projectKey.startsWith("remix:")
          ? await loadStudioProductionWorkspace(projectKey)
          : null;
        if (alive) setProductionWorkspace(workspace);
      } catch (cause: unknown) {
        if (!alive || controller.signal.aborted) return;
        setProductionWorkspace(null);
        setProductionAggregate(null);
        setProductionProjectId(null);
        setProductionError(cause instanceof Error
          ? cause.message
          : localized(locale, "제작 업무를 불러오지 못했습니다.", "Could not load production work."));
      } finally {
        if (alive) setProductionLoading(false);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [locale, projectKey, status]);

  useEffect(() => {
    if (status !== "authenticated" || !projectKey.startsWith("work:")) {
      setTeam(null);
      setTeamProfiles([]);
      setTeamError(null);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    const workId = projectKey.slice(5);
    getStudioTeam(workId, controller.signal)
      .then(async (snapshot) => {
        if (!alive) return;
        setTeam(snapshot);
        const profiles = await batchPublicCreatorRoleProfiles(
          snapshot.members
            .filter((member) => member.status === "active")
            .map((member) => member.userId),
          controller.signal,
        );
        if (alive) setTeamProfiles(profiles);
      })
      .catch((cause: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setTeamError(cause instanceof Error
          ? cause.message
          : localized(locale, "팀 직무 정보를 불러오지 못했습니다.", "Could not load team role profiles."));
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [locale, projectKey, status]);

  if (status !== "authenticated") return null;

  if (profileLoading && !profile) {
    return (
      <section className="mt-7 rounded-3xl border border-line bg-card p-5" aria-label={localized(locale, "직무 작업실 불러오는 중", "Loading role workspace")}>
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-accent" aria-hidden="true" />
          <p className="text-sm font-semibold text-fg-2">
            {localized(locale, "직무별 작업 환경을 준비하고 있습니다.", "Preparing your role-specific workspace.")}
          </p>
        </div>
      </section>
    );
  }

  if (!profile) {
    return profileError ? (
      <section className="mt-7 rounded-3xl border border-bad/30 bg-bad/10 p-5" role="alert">
        <p className="text-sm font-bold text-bad">{profileError}</p>
      </section>
    ) : null;
  }

  const globalDocument = globalWorkspace.snapshot.document;
  const projectDocument = projectWorkspace.snapshot.document;
  const selectedRoles = [
    profile.creatorRoleProfile.primaryRole,
    ...profile.creatorRoleProfile.secondaryRoles,
  ].filter((role): role is CreatorRoleId => role !== null);
  const activeRole = projectDocument.activeRole
    ?? profile.creatorRoleProfile.activeRole
    ?? profile.creatorRoleProfile.primaryRole;
  const activeDefinition = creatorRoleDefinition(activeRole);
  const checklist = creatorRoleChecklist(activeRole);
  const aiTools = creatorRoleAiTools(activeRole);
  const notifications = creatorRoleNotificationSettings(activeRole, projectDocument);
  const workQueue = productionAggregate
    ? rankCreatorProductionWork(productionAggregate, {
        userId: profile.id,
        activeRole,
        limit: 12,
      })
    : productionWorkspace
      ? rankCreatorRoleWork(productionWorkspace, {
          userId: profile.id,
          displayName: profile.name,
          activeRole,
          limit: 12,
        })
      : [];
  const modernAssignmentIds = productionAggregate
    ? creatorProductionAssignmentIdsForUser(productionAggregate, profile.id)
    : new Set<string>();
  const currentAssignments = productionWorkspace?.roleAssignments.filter((assignment) => (
    assignment.memberId === profile.id
    || assignment.displayName.trim().toLocaleLowerCase()
      === (profile.name ?? "").trim().toLocaleLowerCase()
  )) ?? [];
  const currentAssignmentIds = new Set(currentAssignments.map((assignment) => assignment.id));
  const assignedOpenTasks = productionAggregate
    ? productionAggregate.tasks.filter((task) => (
        !["done", "cancelled", "out-of-scope"].includes(task.status)
        && (
          task.assignmentIds.some((id) => modernAssignmentIds.has(id))
          || task.reviewerAssignmentIds.some((id) => modernAssignmentIds.has(id))
        )
      )).length
    : productionWorkspace?.tasks.filter((task) => (
        task.status !== "done"
        && (task.assigneeIds ?? []).some((id) => currentAssignmentIds.has(id))
      )).length ?? 0;
  const unassignedTasks = productionAggregate
    ? productionAggregate.tasks.filter((task) => (
        !["done", "cancelled", "out-of-scope"].includes(task.status)
        && task.assignmentIds.length === 0
      )).length
    : productionWorkspace?.tasks.filter((task) => (
        task.status !== "done" && (task.assigneeIds ?? []).length === 0
      )).length ?? 0;
  const requiredRoles = productionAggregate
    ? creatorRequiredProductionRoles(productionAggregate)
    : productionWorkspace
      ? [...new Set(productionWorkspace.tasks
          .filter((task) => task.status !== "done" && (task.assigneeIds ?? []).length === 0)
          .map((task) => task.role)
          .filter((role): role is CreatorProductionRole => role !== null))]
      : [];
  const teamRecommendations = recommendCreatorTeamRoles(
    teamProfiles,
    requiredRoles.length > 0 ? requiredRoles : undefined,
  ).slice(0, 8);
  const capacity = projectDocument.capacity;
  const capacityPercent = capacity.weeklyCapacityHours && capacity.weeklyCapacityHours > 0
    ? Math.round(capacity.currentAssignedHours / capacity.weeklyCapacityHours * 100)
    : null;
  const onboardingNeeded = (
    !profile.creatorRoleProfile.primaryRole
    || !globalDocument.onboardingComplete
  ) && !onboardingDismissed;

  const saveProjectPatch = async (
    patch: Partial<CreatorRoleWorkspacePreference>,
  ) => {
    await projectWorkspace.save(normalizeCreatorRoleWorkspacePreference({
      ...projectDocument,
      ...patch,
    }));
  };

  const saveVisibility = async (
    key: keyof CreatorRoleVisibility,
    value: boolean,
  ) => {
    const nextVisibility = { ...globalDocument.visibility, [key]: value };
    await globalWorkspace.save(normalizeCreatorRoleWorkspacePreference({
      ...globalDocument,
      visibility: nextVisibility,
    }));
    if (key === "roles") {
      const updated = await updateMyProfile({
        creatorRoleProfile: normalizeCreatorRoleProfile({
          ...profile.creatorRoleProfile,
          roleVisibility: value,
        }),
      });
      setProfile(updated);
    }
  };

  const completeOnboarding = async () => {
    if (!onboardingRole || onboardingSaving) return;
    setOnboardingSaving(true);
    setProfileError(null);
    try {
      const updated = await updateMyProfile({
        creatorRoleProfile: normalizeCreatorRoleProfile({
          ...profile.creatorRoleProfile,
          primaryRole: onboardingRole,
          secondaryRoles: profile.creatorRoleProfile.secondaryRoles.filter(
            (role) => role !== onboardingRole,
          ),
          specialties: onboardingSpecialties,
          activeRole: onboardingRole,
          roleVisibility: onboardingVisibility.roles,
        }),
      });
      setProfile(updated);
      const next = normalizeCreatorRoleWorkspacePreference({
        ...globalDocument,
        activeRole: onboardingRole,
        detailedLens: creatorDetailedRoleLens(onboardingRole),
        workspacePreset: creatorRoleStudioWorkspace(onboardingRole),
        usageGoals: onboardingGoals,
        visibility: onboardingVisibility,
        onboardingComplete: true,
      });
      await globalWorkspace.save(next);
      if (projectKey !== GLOBAL_CREATOR_ROLE_WORKSPACE_KEY) {
        await projectWorkspace.save(normalizeCreatorRoleWorkspacePreference({
          ...projectDocument,
          activeRole: onboardingRole,
          detailedLens: creatorDetailedRoleLens(onboardingRole),
          workspacePreset: creatorRoleStudioWorkspace(onboardingRole),
          notificationPreset: "balanced",
        }));
      }
    } catch (cause) {
      setProfileError(cause instanceof Error
        ? cause.message
        : localized(locale, "직무 설정을 저장하지 못했습니다.", "Could not save role settings."));
    } finally {
      setOnboardingSaving(false);
    }
  };

  const runDirectorySearch = async () => {
    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const result = await searchPublicCreatorRoles({
        q: directoryQuery,
        role: directoryRole || null,
        specialty: directorySpecialty || null,
        collaborationStatus: "available",
        limit: 12,
      });
      setDirectory(result);
    } catch (cause) {
      setDirectoryError(cause instanceof Error
        ? cause.message
        : localized(locale, "창작자를 검색하지 못했습니다.", "Could not search creators."));
    } finally {
      setDirectoryLoading(false);
    }
  };

  return (
    <section className="mt-7 space-y-4 rounded-3xl border border-accent/25 bg-panel/45 p-4 shadow-sm sm:p-6" aria-labelledby="role-personalization-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-accent">
            <Workflow size={16} aria-hidden="true" />
            <p className="text-[0.68rem] font-black uppercase tracking-[0.15em]">ROLE OPERATIONS</p>
          </div>
          <h2 id="role-personalization-title" className="mt-2 text-xl font-black tracking-tight text-fg">
            {localized(locale, "내 직무·업무 작업실", "My role and work workspace")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
            {localized(
              locale,
              "개인 직무, 프로젝트 담당 역할, 접근 권한을 분리하면서 실제 업무·알림·체크리스트·AI 도구를 현재 프로젝트에 맞게 구성합니다.",
              "Personalize live work, notifications, checklists and AI tools while keeping personal roles, project assignments and access permissions separate.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
            projectWorkspace.status === "error"
              ? "border-bad/35 bg-bad/10 text-bad"
              : projectWorkspace.status === "offline"
                ? "border-warn/35 bg-warn/10 text-warn"
                : "border-good/35 bg-good/10 text-good",
          )}>
            {projectWorkspace.status === "loading" || projectWorkspace.status === "saving"
              ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              : <Check size={12} aria-hidden="true" />}
            {statusCopy(locale, projectWorkspace.status)}
          </span>
          <Link href="/me?tab=profile" className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5" })}>
            <Settings2 size={14} aria-hidden="true" />
            {localized(locale, "프로필 직무 편집", "Edit profile roles")}
          </Link>
        </div>
      </header>

      {profileError || projectWorkspace.error ? (
        <div className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-xs font-semibold text-bad" role="alert">
          {profileError ?? projectWorkspace.error}
        </div>
      ) : null}

      {onboardingNeeded ? (
        <Card
          title={localized(locale, "직무별 작업실 시작하기", "Set up your role workspace")}
          description={localized(
            locale,
            "선택 내용은 언제든 바꿀 수 있으며, 공개 항목은 마지막 단계에서 직접 동의한 것만 표시됩니다.",
            "You can change these choices anytime. Only fields explicitly enabled in the final step become public.",
          )}
          className="border-accent/35 bg-accent-soft/20"
          action={(
            <button
              type="button"
              className={buttonClass({ variant: "quiet", size: "sm" })}
              onClick={() => setOnboardingDismissed(true)}
            >
              {localized(locale, "나중에 설정", "Set up later")}
            </button>
          )}
        >
          <ol className="mb-4 grid grid-cols-4 gap-2 text-center text-[0.68rem] font-bold text-fg-3" aria-label={localized(locale, "온보딩 진행", "Onboarding progress")}>
            {["직무", "전문 분야", "사용 목적", "공개 범위"].map((label, index) => (
              <li key={label} className={cn(
                "rounded-full border px-2 py-1.5",
                onboardingStep === index
                  ? "border-accent bg-accent text-on-accent"
                  : onboardingStep > index
                    ? "border-good/30 bg-good/10 text-good"
                    : "border-line bg-panel",
              )}>
                {locale === "ko" ? label : ["Role", "Specialties", "Goals", "Privacy"][index]}
              </li>
            ))}
          </ol>

          {onboardingStep === 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURED_ONBOARDING_ROLES.map((role) => {
                const definition = creatorRoleDefinition(role);
                if (!definition) return null;
                const selected = onboardingRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setOnboardingRole(role)}
                    className={cn(
                      "min-h-24 rounded-2xl border p-3 text-left transition-colors",
                      selected
                        ? "border-accent/60 bg-accent-soft"
                        : "border-line bg-card hover:border-accent/35",
                    )}
                  >
                    <span className={cn("text-sm font-black", selected ? "text-accent" : "text-fg")}>
                      {creatorText(definition.label, locale)}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-fg-2">
                      {creatorText(definition.description, locale)}
                    </span>
                  </button>
                );
              })}
              <label className="sm:col-span-2 lg:col-span-3 text-xs font-bold text-fg-2">
                {localized(locale, "전체 직무에서 선택", "Choose from all roles")}
                <select
                  value={onboardingRole ?? ""}
                  onChange={(event) => setOnboardingRole(event.currentTarget.value as CreatorRoleId || null)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg"
                >
                  <option value="">{localized(locale, "대표 직무 선택", "Select a primary role")}</option>
                  {CREATOR_ROLE_DEFINITIONS.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {creatorText(definition.label, locale)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {onboardingStep === 1 ? (
            <div className="flex flex-wrap gap-2">
              {CREATOR_SPECIALTY_DEFINITIONS.map((specialty) => (
                <ToggleChip
                  key={specialty.id}
                  selected={onboardingSpecialties.includes(specialty.id)}
                  onClick={() => setOnboardingSpecialties((current) => (
                    current.includes(specialty.id)
                      ? current.filter((id) => id !== specialty.id)
                      : current.length >= 12
                        ? current
                        : [...current, specialty.id]
                  ))}
                >
                  {creatorText(specialty.label, locale)}
                </ToggleChip>
              ))}
            </div>
          ) : null}

          {onboardingStep === 2 ? (
            <div className="flex flex-wrap gap-2">
              {CREATOR_ROLE_USAGE_GOALS.map((goal) => (
                <ToggleChip
                  key={goal}
                  selected={onboardingGoals.includes(goal)}
                  onClick={() => setOnboardingGoals((current) => (
                    current.includes(goal)
                      ? current.filter((id) => id !== goal)
                      : [...current, goal]
                  ))}
                >
                  {USAGE_GOAL_LABELS[goal][locale]}
                </ToggleChip>
              ))}
            </div>
          ) : null}

          {onboardingStep === 3 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["roles", "직무", "Roles"],
                ["specialties", "전문 분야", "Specialties"],
                ["experienceLevel", "경력 수준", "Experience level"],
                ["collaborationStatus", "협업 가능 상태", "Collaboration status"],
              ] as const).map(([key, ko, en]) => (
                <label
                  key={key}
                  aria-label={localized(locale, ko, en)}
                  className="flex items-start gap-3 rounded-xl border border-line bg-card p-3"
                >
                  <input
                    type="checkbox"
                    checked={onboardingVisibility[key]}
                    onChange={(event) => setOnboardingVisibility((current) => ({
                      ...current,
                      [key]: event.currentTarget.checked,
                    }))}
                    className="mt-0.5 size-4 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-xs font-bold text-fg">
                      {localized(locale, ko, en)}
                    </span>
                    <span className="mt-1 block text-[0.7rem] leading-5 text-fg-3">
                      {onboardingVisibility[key]
                        ? localized(locale, "공개 프로필에 표시됩니다.", "Visible on your public profile.")
                        : localized(locale, "나와 프로젝트 내부에만 표시됩니다.", "Private to you and project workflows.")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <button
              type="button"
              className={buttonClass({ variant: "quiet", size: "sm" })}
              disabled={onboardingStep === 0 || onboardingSaving}
              onClick={() => setOnboardingStep((step) => Math.max(0, step - 1))}
            >
              {localized(locale, "이전", "Back")}
            </button>
            {onboardingStep < 3 ? (
              <button
                type="button"
                className={buttonClass({ size: "sm" })}
                disabled={onboardingStep === 0 && !onboardingRole}
                onClick={() => setOnboardingStep((step) => Math.min(3, step + 1))}
              >
                {localized(locale, "다음", "Next")}
              </button>
            ) : (
              <button
                type="button"
                className={buttonClass({ size: "sm", className: "gap-1.5" })}
                disabled={!onboardingRole || onboardingSaving}
                onClick={() => void completeOnboarding()}
              >
                {onboardingSaving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}
                {localized(locale, "내 작업실 만들기", "Create my workspace")}
              </button>
            )}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <Card
          title={localized(locale, "프로젝트별 직무 모드", "Project role mode")}
          description={localized(
            locale,
            "이 선택은 현재 프로젝트에만 적용됩니다. 팀 접근 권한과 승인 권한은 변경하지 않습니다.",
            "This applies only to the current project and never changes team access or approval permissions.",
          )}
          action={activeDefinition ? (
            <span className="rounded-full border border-accent/35 bg-accent-soft px-3 py-1 text-xs font-black text-accent">
              {projectDocument.customRoleLabel || creatorText(activeDefinition.label, locale)}
            </span>
          ) : null}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-fg-2">
              {localized(locale, "현재 담당 직무", "Active project role")}
              <select
                value={activeRole ?? ""}
                disabled={selectedRoles.length === 0 || projectWorkspace.status === "saving"}
                onChange={(event) => {
                  const role = event.currentTarget.value as CreatorRoleId;
                  void saveProjectPatch({
                    activeRole: role,
                    detailedLens: creatorDetailedRoleLens(role),
                    workspacePreset: creatorRoleStudioWorkspace(role),
                  });
                }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              >
                {selectedRoles.length === 0 ? (
                  <option value="">{localized(locale, "프로필에서 직무를 먼저 선택하세요", "Select a role in your profile first")}</option>
                ) : selectedRoles.map((role) => (
                  <option key={role} value={role}>
                    {creatorText(creatorRoleDefinition(role)?.label ?? { ko: role, en: role }, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-fg-2">
              {localized(locale, "프로젝트 내 표시 직무", "Project display role")}
              <input
                value={projectDocument.customRoleLabel ?? ""}
                onChange={(event) => void saveProjectPatch({
                  customRoleLabel: event.currentTarget.value.trim().slice(0, 48) || null,
                })}
                maxLength={48}
                placeholder={localized(locale, "예: 메인 작화 감독", "e.g. Lead art director")}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              />
            </label>
            <label className="text-xs font-bold text-fg-2">
              {localized(locale, "편집기 작업공간", "Editor workspace")}
              <select
                value={projectDocument.workspacePreset ?? creatorRoleStudioWorkspace(activeRole)}
                onChange={(event) => void saveProjectPatch({
                  workspacePreset: event.currentTarget.value as CreatorRoleWorkspacePreference["workspacePreset"],
                })}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              >
                {CREATOR_ROLE_WORKSPACE_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <Link
                href={studioWorkspaceHref(projectKey, projectDocument)}
                className={buttonClass({ className: "w-full justify-center gap-2" })}
              >
                <BriefcaseBusiness size={15} aria-hidden="true" />
                {localized(locale, "이 직무 배치로 편집기 열기", "Open editor with this role layout")}
              </Link>
            </div>
          </div>
        </Card>

        <Card
          title={localized(locale, "작업 가능량", "Work capacity")}
          description={localized(locale, "공개 프로필이 아니라 현재 프로젝트 운영에만 사용합니다.", "Used only for the current project, not your public profile.")}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <label className="text-xs font-bold text-fg-2">
              {localized(locale, "주간 가능 시간", "Weekly capacity")}
              <input
                type="number"
                min={0}
                max={168}
                step={0.5}
                value={capacity.weeklyCapacityHours ?? ""}
                onChange={(event) => void saveProjectPatch({
                  capacity: {
                    ...capacity,
                    weeklyCapacityHours: event.currentTarget.value
                      ? Number(event.currentTarget.value)
                      : null,
                  },
                })}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              />
            </label>
            <label className="text-xs font-bold text-fg-2">
              {localized(locale, "현재 배정 시간", "Assigned hours")}
              <input
                type="number"
                min={0}
                max={2000}
                step={0.5}
                value={capacity.currentAssignedHours}
                onChange={(event) => void saveProjectPatch({
                  capacity: {
                    ...capacity,
                    currentAssignedHours: Number(event.currentTarget.value || 0),
                  },
                })}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              />
            </label>
          </div>
          <div className={cn(
            "mt-3 rounded-xl border px-3 py-2 text-xs font-semibold",
            capacityPercent !== null && capacityPercent > 100
              ? "border-bad/30 bg-bad/10 text-bad"
              : "border-line bg-panel text-fg-2",
          )}>
            {capacityPercent === null
              ? localized(locale, "주간 가능 시간을 입력하면 과부하를 확인할 수 있습니다.", "Enter weekly capacity to detect overload.")
              : localized(
                  locale,
                  `현재 ${capacityPercent}% 배정 · 열린 담당 업무 ${assignedOpenTasks}건`,
                  `${capacityPercent}% allocated · ${assignedOpenTasks} open assigned tasks`,
                )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title={localized(locale, "지금 처리할 업무", "Work to handle now")}
          description={localized(locale, "배정, 마감, 차단, 검수와 선행 작업 상태를 종합해 정렬합니다.", "Ranked by assignment, deadline, blockers, reviews and dependency readiness.")}
          action={productionLoading ? <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" /> : (
            <span className="text-xs font-bold text-fg-3">{workQueue.length}</span>
          )}
        >
          {productionError ? (
            <p className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs text-bad" role="alert">{productionError}</p>
          ) : workQueue.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs leading-5 text-fg-2">
              {localized(locale, "현재 직무와 직접 연결된 열린 업무가 없습니다. 제작 관리에서 담당자와 직무를 지정하면 여기에 표시됩니다.", "No open work is directly connected to this role. Assign people and production roles to populate this queue.")}
            </p>
          ) : (
            <div className="space-y-2">
              {workQueue.map((item) => (
                <article key={`${item.kind}-${item.id}`} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-fg">{item.title}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.reasons.map((reason) => (
                          <span key={reason} className="rounded-full border border-line px-2 py-0.5 text-[0.65rem] font-semibold text-fg-2">
                            {WORK_REASON_LABELS[reason][locale]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="rounded-full bg-accent-soft px-2 py-1 text-[0.68rem] font-black text-accent">
                      {item.productionRole ? PRODUCTION_ROLE_LABELS[item.productionRole] : item.kind}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                    {item.due ? (
                      <p className="flex items-center gap-1 text-[0.7rem] text-fg-3">
                        <Clock3 size={12} aria-hidden="true" /> {item.due}
                      </p>
                    ) : <span />}
                    <Link
                      href={creatorWorkItemLaunch(item, { activeRole, projectKey, productionProjectId }).href}
                      className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5" })}
                    >
                      {localized(
                        locale,
                        creatorWorkItemLaunch(item, { activeRole, projectKey, productionProjectId }).labelKo,
                        creatorWorkItemLaunch(item, { activeRole, projectKey, productionProjectId }).labelEn,
                      )}
                      <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>

        <Card
          title={localized(locale, "직무별 완료 체크", "Role completion checklist")}
          description={localized(locale, "프로젝트마다 별도로 저장되며 다른 탭에도 즉시 반영됩니다.", "Saved per project and synchronized across open tabs.")}
        >
          <div className="space-y-2">
            {checklist.map((item) => {
              const checked = projectDocument.checklistStates[item.id] === true;
              return (
                <label
                  key={item.id}
                  aria-label={localized(locale, item.labelKo, item.labelEn)}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel p-3"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => void saveProjectPatch({
                      checklistStates: {
                        ...projectDocument.checklistStates,
                        [item.id]: event.currentTarget.checked,
                      },
                    })}
                    className="mt-0.5 size-4 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-xs font-black text-fg">
                      {localized(locale, item.labelKo, item.labelEn)}
                    </span>
                    <span className="mt-1 block text-[0.7rem] leading-5 text-fg-3">
                      {localized(locale, item.descriptionKo, item.descriptionEn)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          title={localized(locale, "직무별 알림", "Role notifications")}
          description={localized(locale, "집중·균형·전체·음소거 프리셋 위에 이벤트별 예외를 지정합니다.", "Choose a preset and override individual events when needed.")}
          action={<Bell className="size-4 text-accent" aria-hidden="true" />}
        >
          <select
            value={projectDocument.notificationPreset}
            onChange={(event) => void saveProjectPatch({
              notificationPreset: event.currentTarget.value as CreatorRoleWorkspacePreference["notificationPreset"],
              notificationOverrides: {},
            })}
            className="min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
          >
            <option value="focused">{localized(locale, "집중", "Focused")}</option>
            <option value="balanced">{localized(locale, "균형", "Balanced")}</option>
            <option value="all">{localized(locale, "전체", "All")}</option>
            <option value="muted">{localized(locale, "음소거", "Muted")}</option>
          </select>
          <div className="mt-3 flex flex-wrap gap-2">
            {CREATOR_ROLE_NOTIFICATION_EVENTS.map((event) => (
              <ToggleChip
                key={event}
                selected={notifications[event]}
                onClick={() => void saveProjectPatch({
                  notificationOverrides: {
                    ...projectDocument.notificationOverrides,
                    [event]: !notifications[event],
                  },
                })}
              >
                {NOTIFICATION_LABELS[event][locale]}
              </ToggleChip>
            ))}
          </div>
        </Card>

        <Card
          title={localized(locale, "직무별 AI 작업실", "Role-aware AI workspace")}
          description={localized(locale, "도구는 현재 직무와 작업 목적만 전달하며 프로젝트 접근 권한을 확대하지 않습니다.", "Tools receive the current role and task intent without expanding project access.")}
          action={<Bot className="size-4 text-accent" aria-hidden="true" />}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {aiTools.map((tool) => (
              <Link key={tool.id} href={`${tool.href}&projectKey=${encodeURIComponent(projectKey)}&role=${encodeURIComponent(activeRole ?? "creator")}`} className="rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent/35 hover:bg-raised">
                <span className="text-xs font-black text-fg">
                  {localized(locale, tool.titleKo, tool.titleEn)}
                </span>
                <span className="mt-1 block text-[0.7rem] leading-5 text-fg-2">
                  {localized(locale, tool.descriptionKo, tool.descriptionEn)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <details className="rounded-2xl border border-line bg-card p-4">
        <summary className="cursor-pointer list-none text-sm font-black text-fg">
          <span className="inline-flex items-center gap-2">
            <UsersRound size={16} className="text-accent" aria-hidden="true" />
            {localized(locale, "팀 역할 추천·창작자 찾기", "Team role recommendations and creator search")}
          </span>
        </summary>
        <p className="mt-2 text-xs leading-5 text-fg-2">
          {localized(locale, "추천은 공개에 동의한 직무·전문 분야와 프로젝트 가능량을 근거로 하며 자동 배정하거나 접근 권한을 바꾸지 않습니다.", "Recommendations use only opted-in role evidence and project capacity. They never auto-assign work or alter access permissions.")}
        </p>

        {teamError ? <p className="mt-3 text-xs font-semibold text-bad" role="alert">{teamError}</p> : null}
        {team && teamRecommendations.length > 0 ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {teamRecommendations.map((recommendation) => (
              <article key={`${recommendation.userId}-${recommendation.productionRole}`} className="rounded-xl border border-line bg-panel p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black text-fg">{recommendation.name}</p>
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-black text-accent">
                    {PRODUCTION_ROLE_LABELS[recommendation.productionRole]}
                  </span>
                </div>
                <p className="mt-2 text-[0.7rem] leading-5 text-fg-2">
                  {recommendation.reasons.join(" · ")}
                </p>
              </article>
            ))}
          </div>
        ) : team ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-2">
            {localized(locale, `현재 공개 직무 정보로 추천할 팀원이 없습니다. 담당자 없는 업무 ${unassignedTasks}건`, `No team recommendations from public role data. ${unassignedTasks} tasks are unassigned.`)}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_13rem_13rem_auto]">
          <label className="text-xs font-bold text-fg-2">
            {localized(locale, "이름·표시 직무", "Name or display role")}
            <input
              value={directoryQuery}
              onChange={(event) => setDirectoryQuery(event.currentTarget.value)}
              maxLength={80}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              placeholder={localized(locale, "예: 배경 작가", "e.g. background artist")}
            />
          </label>
          <label className="text-xs font-bold text-fg-2">
            {localized(locale, "직무", "Role")}
            <select
              value={directoryRole}
              onChange={(event) => setDirectoryRole(event.currentTarget.value as CreatorRoleId | "")}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
            >
              <option value="">{localized(locale, "전체", "All")}</option>
              {CREATOR_ROLE_DEFINITIONS.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {creatorText(definition.shortLabel, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-fg-2">
            {localized(locale, "전문 분야", "Specialty")}
            <select
              value={directorySpecialty}
              onChange={(event) => setDirectorySpecialty(event.currentTarget.value as CreatorSpecialtyId | "")}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg"
            >
              <option value="">{localized(locale, "전체", "All")}</option>
              {CREATOR_SPECIALTY_DEFINITIONS.map((specialty) => (
                <option key={specialty.id} value={specialty.id}>
                  {creatorText(specialty.label, locale)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={cn(buttonClass({ size: "sm", className: "self-end gap-1.5" }), "min-h-11")}
            disabled={directoryLoading}
            onClick={() => void runDirectorySearch()}
          >
            {directoryLoading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Search size={14} aria-hidden="true" />}
            {localized(locale, "검색", "Search")}
          </button>
        </div>

        {directoryError ? <p className="mt-3 text-xs font-semibold text-bad" role="alert">{directoryError}</p> : null}
        {directory ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {directory.items.map((candidate) => (
              <Link key={candidate.userId} href={`/users/${encodeURIComponent(candidate.userId)}`} className="rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent/35">
                <p className="text-xs font-black text-fg">{candidate.name}</p>
                <p className="mt-1 text-[0.7rem] font-semibold text-accent">
                  {candidate.customRoleLabel
                    ?? creatorText(creatorRoleDefinition(candidate.roleProfile.primaryRole)?.label ?? { ko: candidate.roleProfile.primaryRole, en: candidate.roleProfile.primaryRole }, locale)}
                </p>
                {candidate.roleProfile.specialties.length > 0 ? (
                  <p className="mt-2 line-clamp-2 text-[0.68rem] leading-5 text-fg-3">
                    {candidate.roleProfile.specialties
                      .map((id) => CREATOR_SPECIALTY_DEFINITIONS.find((entry) => entry.id === id))
                      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
                      .map((entry) => creatorText(entry.label, locale))
                      .join(" · ")}
                  </p>
                ) : null}
              </Link>
            ))}
            {directory.items.length === 0 ? (
              <p className="md:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-2">
                {localized(locale, "조건에 맞고 공개에 동의한 창작자를 찾지 못했습니다.", "No opted-in creators matched these filters.")}
              </p>
            ) : null}
          </div>
        ) : null}
      </details>

      <details className="rounded-2xl border border-line bg-card p-4">
        <summary className="cursor-pointer list-none text-sm font-black text-fg">
          {localized(locale, "공개 범위·개인정보 설정", "Public visibility and privacy")}
        </summary>
        <p className="mt-2 text-xs leading-5 text-fg-2">
          {localized(locale, "모든 항목은 기본 비공개입니다. 공개한 정보만 창작자 검색과 팀 추천에 사용됩니다.", "Every field is private by default. Only explicitly shared information is used for discovery and recommendations.")}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {([
            ["roles", "직무", "Roles"],
            ["specialties", "전문 분야", "Specialties"],
            ["experienceLevel", "경력 수준", "Experience level"],
            ["collaborationStatus", "협업 가능 상태", "Collaboration status"],
          ] as const).map(([key, ko, en]) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
              <span className="text-xs font-bold text-fg">{localized(locale, ko, en)}</span>
              <input
                type="checkbox"
                checked={globalDocument.visibility[key]}
                onChange={(event) => void saveVisibility(key, event.currentTarget.checked)}
                className="size-4 accent-[var(--accent)]"
              />
            </label>
          ))}
        </div>
      </details>

      {capacityPercent !== null && capacityPercent > 100 ? (
        <div className="flex items-start gap-2 rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs leading-5 text-bad" role="status">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {localized(locale, "현재 배정량이 주간 가능 시간을 초과했습니다. 추천은 자동 배정하지 않으며 프로듀서가 일정과 담당자를 최종 결정해야 합니다.", "Current allocation exceeds weekly capacity. Recommendations never auto-assign work; the producer retains the final decision.")}
        </div>
      ) : null}
    </section>
  );
}
