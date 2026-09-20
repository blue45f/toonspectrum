import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  AlertTriangle,
  ArrowLeft,
  FileClock,
  FolderKanban,
  HardDrive,
  Info,
  MessageSquareCheck,
  Plus,
  Presentation,
  Radio,
  RotateCcw,
  Save,
  Server,
  Share2,
  ShieldCheck,
  UserRound,
  Users,
  WifiOff,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  resolveStudioProductionScope,
  type StudioProductionScope as ProductionScope,
} from "./studio-production-scope";
import {
  commitStudioProductionWorkspace,
  createDemoProductionWorkspace,
  createEmptyProductionWorkspace,
  createStudioProductionClientId,
  createStudioProductionWorkspaceInvalidation,
  loadStudioProductionWorkspace,
  parseStudioProductionWorkspaceInvalidation,
  productionWorkspaceHasContent,
  resolveStudioProductionWorkspaceMode,
  studioProductionWorkspaceCapabilities,
  type ProductionVersionSnapshot,
  type ProductionWorkspace,
  type StudioProductionWorkspaceMode,
} from "./studio-production-workspace";
import { creatorProfileProductionRoleRecommendations } from "./creator-role-production-bridge";
import { StudioPitchPptxCard } from "./StudioPitchPptxCard";
import {
  StudioProductionOperationsPanel,
  type StudioProductionRoleCandidate,
} from "./StudioProductionOperationsPanel";
import { StudioProductionReviewBoard } from "./StudioProductionReviewBoard";
import { StudioProductionTaskBoard } from "./StudioProductionTaskBoard";
import {
  loadStudioServerProductionWorkspace,
  saveStudioServerProductionWorkspace,
  StudioProductionServerConflictError,
  type StudioServerProductionCapabilities,
} from "./studio-production-server-client";
import { StudioReviewLinkManager } from "./StudioReviewLinkManager";
import { StudioServerVersionsCard } from "./StudioServerVersionsCard";
import { getStudioTeam, type StudioTeamSnapshot } from "../studio-team-client";

import { getMyProfile, type MeProfile } from "@/infrastructure/me-client";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  GLOBAL_CREATOR_ROLE_WORKSPACE_KEY,
  creatorCollaborationUiEnabled,
  resolveCreatorCollaborationLevel,
} from "@/shared/lib/creator-role-workspace-contract";
import { useCreatorRoleWorkspace } from "@/shared/lib/use-creator-role-workspace";
import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";

const StudioHandoffEnvelopeInbox = lazy(() => import("../handoff-envelope/StudioHandoffEnvelope").then((module) => ({ default: module.StudioHandoffEnvelopeInbox })));

const STUDIO_PRODUCTION_SURFACES = [
  "projects",
  "review",
  "versions",
  "present",
  "share",
  "join",
] as const;

export type StudioProductionSurface = (typeof STUDIO_PRODUCTION_SURFACES)[number];

type PersistenceState = "loading" | "saved" | "saving" | "error" | "demo";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});
let fallbackSequence = 0;

function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12);
  if (random) return `${prefix}-${random}`;
  fallbackSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
}

function surfaceHref(surface: StudioProductionSurface, scope: ProductionScope): string {
  const scopedSurface = surface === "review" || surface === "versions" || surface === "present";
  if (scopedSurface && scope.key.startsWith("work:")) {
    return `/studio/work/${encodeURIComponent(scope.key.slice(5))}/${surface}`;
  }
  if (scopedSurface && scope.key.startsWith("remix:")) {
    return `/studio/remix/${encodeURIComponent(scope.key.slice(6))}/${surface}`;
  }
  const search = scope.key === "draft" ? "" : `?scope=${encodeURIComponent(scope.key)}`;
  return `/studio/${surface}${search}`;
}

function persistenceLabel(
  state: PersistenceState,
  mode: StudioProductionWorkspaceMode,
): string {
  switch (state) {
    case "loading":
      return "저장 상태 확인 중";
    case "saving":
      return "저장 중";
    case "saved":
      return mode === "server-work" ? "팀에 저장됨" : "이 기기에 저장됨";
    case "demo":
      return "샘플 · 저장 안 함";
    case "error":
      return "저장을 확인해 주세요";
  }
}

function Metric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone?: "neutral" | "success" | "warning" | "danger";
}) {
  let toneClass = "border-line bg-panel";
  if (tone === "success") toneClass = "border-emerald-500/30 bg-emerald-500/10";
  if (tone === "warning") toneClass = "border-amber-500/30 bg-amber-500/10";
  if (tone === "danger") toneClass = "border-red-500/30 bg-red-500/10";
  return (
    <div className={cn("rounded-2xl border p-3.5", toneClass)}>
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-fg-3">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-fg">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-fg-2">{detail}</p>
    </div>
  );
}

function Pill({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  let toneClass = "border-line bg-raised text-fg-2";
  if (tone === "success") {
    toneClass = "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (tone === "warning") {
    toneClass = "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (tone === "danger") {
    toneClass = "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  if (tone === "accent") toneClass = "border-accent/30 bg-accent-soft text-accent";
  return (
    <span className={cn(
      "inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold",
      toneClass,
    )}>
      {children}
    </span>
  );
}

function Card({
  title,
  description,
  children,
  action,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-fg">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-fg-2">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <p className="text-sm font-bold text-fg">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-fg-2">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

const SURFACE_META: Readonly<
  Record<StudioProductionSurface, { readonly label: string; readonly icon: typeof FolderKanban }>
> = {
  projects: { label: "홈", icon: FolderKanban },
  review: { label: "검토", icon: MessageSquareCheck },
  versions: { label: "변경 기록", icon: FileClock },
  present: { label: "발표", icon: Presentation },
  share: { label: "공유", icon: Share2 },
  join: { label: "참여", icon: Users },
};

function ModeNotice({ mode }: { readonly mode: StudioProductionWorkspaceMode }) {
  const sharedClass = "rounded-xl border px-3 py-2.5 text-xs leading-relaxed";
  if (mode === "demo") {
    return (
      <div className={cn(sharedClass, "border-sky-500/30 bg-sky-500/10 text-fg")} role="status">
        <Info className="mr-2 inline size-4 text-sky-600" aria-hidden="true" />
        {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "이 화면은 명시적으로 연 샘플 데모입니다. 변경 내용은 저장·공유·승인되지 않습니다.")}</div>
    );
  }
  if (mode === "server-work") {
    return (
      <div className={cn(sharedClass, "border-emerald-500/30 bg-emerald-500/10 text-fg")} role="status">
        <Server className="mr-2 inline size-4 text-emerald-600" aria-hidden="true" />
        {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "팀과 공유되는 프로젝트입니다. 권한에 따라 편집과 승인이 제한될 수 있습니다.")}</div>
    );
  }
  if (mode === "read-only-cache") {
    return (
      <div className={cn(sharedClass, "border-amber-500/30 bg-amber-500/10 text-fg")} role="status">
        <WifiOff className="mr-2 inline size-4 text-amber-600" aria-hidden="true" />
        {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "연결이 없어 마지막으로 확인한 내용을 보여드립니다. 다시 연결되기 전에는 변경하거나 공유할 수 없습니다.")}</div>
    );
  }
  return (
    <div className={cn(sharedClass, "border-amber-500/30 bg-amber-500/10 text-fg")} role="status">
      <HardDrive className="mr-2 inline size-4 text-amber-600" aria-hidden="true" />
      {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "이 작업 목록과 검토 의견은 현재 이 기기에 저장됩니다. 다른 기기에서도 사용하려면 백업 파일을 만들어 주세요.")}</div>
  );
}

export function StudioProductionHubPage({
  surface,
  onOpenStudio,
}: {
  readonly surface: StudioProductionSurface;
  readonly onOpenStudio: () => void;
}) {
  const location = useLocation();
  const resolution = resolveStudioProductionScope(location);
  if (!resolution.valid) {
    return (
      <section className="m-4 rounded-xl border border-line p-4" role="alert">
        <h1 className="font-bold">{translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "프로젝트 범위를 확인할 수 없습니다")}</h1>
        <p className="my-3 text-sm">{translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "잘못되거나 서로 충돌하는 작품 정보입니다. 저장된 내용은 변경하지 않았습니다.")}</p>
        <button type="button" className={buttonClass()} onClick={onOpenStudio}>
          {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "Studio 편집기로 돌아가기")}</button>
      </section>
    );
  }
  return (
    <StudioProductionHubWorkspace
      key={resolution.scope.key}
      surface={surface}
      scope={resolution.scope}
      onOpenStudio={onOpenStudio}
    />
  );
}

function StudioProductionHubWorkspace({
  surface,
  scope,
  onOpenStudio,
}: {
  readonly surface: StudioProductionSurface;
  readonly scope: ProductionScope;
  readonly onOpenStudio: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const serverWorkId = useMemo(
    () => scope.key.startsWith("work:") ? scope.key.slice(5) : null,
    [scope.key],
  );
  const mode = useMemo(() => resolveStudioProductionWorkspaceMode({
    scopeKey: scope.key,
    search: location.search,
    serverBacked: serverWorkId !== null,
  }), [location.search, scope.key, serverWorkId]);
  const [serverCapabilities, setServerCapabilities] = useState<
    StudioServerProductionCapabilities | null
  >(null);
  const [teamSnapshot, setTeamSnapshot] = useState<StudioTeamSnapshot | null>(null);
  const [myProfile, setMyProfile] = useState<MeProfile | null>(null);
  const roleWorkspace = useCreatorRoleWorkspace(
    GLOBAL_CREATOR_ROLE_WORKSPACE_KEY,
    myProfile?.creatorRoleProfile,
    myProfile !== null,
  );
  const capabilities = useMemo(() => {
    const base = studioProductionWorkspaceCapabilities(mode);
    if (mode !== "server-work" || !serverCapabilities) return base;
    return {
      ...base,
      canEdit: serverCapabilities.edit,
      canInvite: serverCapabilities.manageLinks,
      canManageRoles: serverCapabilities.manageRoles,
      canApprove: serverCapabilities.approve,
      canPublish: serverCapabilities.publish,
    };
  }, [mode, serverCapabilities]);
  const initial = useMemo(
    () => mode === "demo"
      ? createDemoProductionWorkspace()
      : createEmptyProductionWorkspace(scope.key),
    [mode, scope.key],
  );
  const [workspace, setWorkspace] = useState<ProductionWorkspace>(initial);
  const collaborationLevel = useMemo(() => resolveCreatorCollaborationLevel({
    collaborationMode: roleWorkspace.snapshot.document.collaborationMode,
    workspaceMode: roleWorkspace.snapshot.document.workspaceMode,
    serverBacked: mode === "server-work",
    memberCount: Math.max(
      workspace.members.length,
      teamSnapshot?.members.filter((member) => member.status === "active").length ?? 0,
    ),
  }), [
    mode,
    roleWorkspace.snapshot.document.collaborationMode,
    roleWorkspace.snapshot.document.workspaceMode,
    teamSnapshot,
    workspace.members.length,
  ]);
  const showCollaborationUi =
    mode === "demo" || creatorCollaborationUiEnabled(collaborationLevel);
  const navigationSurfaces = useMemo(
    () => showCollaborationUi
      ? STUDIO_PRODUCTION_SURFACES
      : STUDIO_PRODUCTION_SURFACES.filter((item) => item !== "join"),
    [showCollaborationUi],
  );
  const [persistence, setPersistence] = useState<PersistenceState>(
    mode === "demo" ? "demo" : "loading",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const workspaceRef = useRef(workspace);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef<string>(createStudioProductionClientId());
  const inviteParameter = useMemo(
    () => new URLSearchParams(location.search).get("invite"),
    [location.search],
  );

  const adoptWorkspace = useCallback((next: ProductionWorkspace) => {
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);

  const reloadWorkspace = useCallback(async (showLoading: boolean) => {
    if (mode === "demo") {
      adoptWorkspace(createDemoProductionWorkspace());
      setServerCapabilities(null);
      setPersistence("demo");
      setLoadError(null);
      return;
    }
    if (showLoading) setPersistence("loading");
    try {
      if (mode === "server-work" && serverWorkId) {
        const loaded = await loadStudioServerProductionWorkspace(serverWorkId);
        adoptWorkspace(loaded.document);
        setServerCapabilities(loaded.capabilities);
      } else {
        const loaded = await loadStudioProductionWorkspace(scope.key);
        adoptWorkspace(loaded ?? createEmptyProductionWorkspace(scope.key));
        setServerCapabilities(null);
      }
      setPersistence("saved");
      setLoadError(null);
    } catch (cause) {
      adoptWorkspace(createEmptyProductionWorkspace(scope.key));
      setServerCapabilities(null);
      setPersistence("error");
      setLoadError(cause instanceof Error
        ? cause.message
        : "제작 운영 데이터를 불러오지 못했습니다.");
    }
  }, [adoptWorkspace, mode, scope.key, serverWorkId]);

  useEffect(() => {
    void reloadWorkspace(true);
  }, [reloadWorkspace]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    getMyProfile(controller.signal)
      .then((profile) => {
        if (alive) setMyProfile(profile);
      })
      .catch(() => {
        if (alive && !controller.signal.aborted) setMyProfile(null);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (mode !== "server-work" || !serverWorkId) {
      setTeamSnapshot(null);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    getStudioTeam(serverWorkId, controller.signal)
      .then((snapshot) => {
        if (alive) setTeamSnapshot(snapshot);
      })
      .catch(() => {
        if (alive && !controller.signal.aborted) setTeamSnapshot(null);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [mode, serverWorkId]);

  const roleCandidates = useMemo<readonly StudioProductionRoleCandidate[]>(() => {
    const recommendations = creatorProfileProductionRoleRecommendations(
      myProfile?.creatorRoleProfile,
    );
    if (teamSnapshot) {
      const candidates = teamSnapshot.members
        .filter((member) => member.status === "active")
        .map((member): StudioProductionRoleCandidate => ({
          memberId: member.userId,
          displayName: member.name,
          accessRole: member.role,
          isCurrentUser: member.userId === myProfile?.id,
          recommendedRoles: member.userId === myProfile?.id ? recommendations : [],
        }));
      if (
        myProfile
        && teamSnapshot.viewer.status === "active"
        && !candidates.some((candidate) => candidate.memberId === myProfile.id)
      ) {
        candidates.unshift({
          memberId: myProfile.id,
          displayName: myProfile.name ?? myProfile.email ?? "나",
          accessRole: teamSnapshot.viewer.role,
          isCurrentUser: true,
          recommendedRoles: recommendations,
        });
      }
      return candidates;
    }
    if (mode !== "server-work" && myProfile) {
      return [{
        memberId: myProfile.id,
        displayName: myProfile.name ?? myProfile.email ?? "나",
        accessRole: "local",
        isCurrentUser: true,
        recommendedRoles: recommendations,
      }];
    }
    return [];
  }, [mode, myProfile, teamSnapshot]);

  useEffect(() => {
    if (!capabilities.canPersistLocally || typeof BroadcastChannel === "undefined") return;
    try {
      const channel = new BroadcastChannel(`studio-production-command-center-v1:${scope.key}`);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const invalidation = parseStudioProductionWorkspaceInvalidation(event.data);
        if (
          !invalidation
          || invalidation.scopeKey !== scope.key
          || invalidation.sourceClientId === clientIdRef.current
          || invalidation.revision <= workspaceRef.current.revision
        ) {
          return;
        }
        void reloadWorkspace(false);
      };
      channelRef.current = channel;
      return () => {
        channel.close();
        channelRef.current = null;
      };
    } catch {
      channelRef.current = null;
      return undefined;
    }
  }, [capabilities.canPersistLocally, reloadWorkspace, scope.key]);

  const commit = useCallback(async (
    update: (current: ProductionWorkspace) => ProductionWorkspace,
    message: string,
  ) => {
    if (!capabilities.canEdit || loadError) {
      setNotice(loadError ?? "현재 모드에서는 변경할 수 없습니다.");
      return;
    }
    if (mode === "demo") {
      const next = {
        ...update(workspaceRef.current),
        revision: workspaceRef.current.revision + 1,
        updatedAt: new Date().toISOString(),
      } as ProductionWorkspace;
      adoptWorkspace(next);
      setNotice(`${message} 데모 변경은 저장되지 않습니다.`);
      return;
    }
    setPersistence("saving");
    try {
      if (mode === "server-work" && serverWorkId) {
        const current = workspaceRef.current;
        const saved = await saveStudioServerProductionWorkspace(
          serverWorkId,
          current.revision,
          update(current),
        );
        adoptWorkspace(saved.document);
        setServerCapabilities(saved.capabilities);
      } else if (capabilities.canPersistLocally) {
        const next = await commitStudioProductionWorkspace(
          scope.key,
          workspaceRef.current,
          update,
        );
        adoptWorkspace(next);
        channelRef.current?.postMessage(createStudioProductionWorkspaceInvalidation({
          scopeKey: scope.key,
          revision: next.revision,
          sourceClientId: clientIdRef.current,
        }));
      } else {
        setNotice("현재 모드에서는 제작 운영 데이터를 저장할 수 없습니다.");
        setPersistence("error");
        return;
      }
      setPersistence("saved");
      setNotice(message);
    } catch (cause) {
      if (cause instanceof StudioProductionServerConflictError) {
        setNotice(cause.message);
        await reloadWorkspace(false);
        return;
      }
      setPersistence("error");
      setNotice(cause instanceof Error
        ? cause.message
        : "제작 운영 데이터를 저장하지 못했습니다.");
    }
  }, [
    adoptWorkspace,
    capabilities.canEdit,
    capabilities.canPersistLocally,
    loadError,
    mode,
    reloadWorkspace,
    scope.key,
    serverWorkId,
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat) return;
      const target = event.target;
      if (
        target instanceof Element
        && target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
      ) {
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const next = navigationSurfaces[Number(event.key) - 1];
      if (!next) return;
      event.preventDefault();
      void navigate(surfaceHref(next, scope));
    };
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [navigate, navigationSurfaces, scope]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${SURFACE_META[surface].label} · ${workspace.title} · Toon Studio`;
    return () => {
      document.title = previous;
    };
  }, [surface, workspace.title]);

  const completed = workspace.tasks.filter((task) => task.status === "done").length;
  const blocked = workspace.tasks.filter((task) => task.status === "blocked").length;
  const openBlockers = workspace.reviews.filter(
    (issue) => issue.status === "open" && issue.severity === "blocker",
  ).length;
  const openMajor = workspace.reviews.filter(
    (issue) => issue.status === "open" && issue.severity === "major",
  ).length;
  const configured = productionWorkspaceHasContent(workspace);
  const releaseReady = configured && openBlockers === 0 && openMajor === 0 && blocked === 0;
  const progress = workspace.tasks.length === 0
    ? 0
    : Math.round(
        workspace.tasks.reduce((sum, task) => sum + task.progress, 0)
          / workspace.tasks.length,
      );

  const addTask = () => void commit((current) => ({
    ...current,
    tasks: [
      ...current.tasks,
      {
        id: createId("task"),
        title: "새 제작 작업",
        owner: "미배정",
        due: new Date().toISOString().slice(0, 10),
        progress: 0,
        status: "todo",
        stage: "planning",
        priority: "normal",
        role: null,
        hierarchyNodeId: null,
        dependencyIds: [],
        assigneeIds: [],
        reviewerIds: [],
        blockedReason: "",
      },
    ],
  }), "새 제작 작업을 추가했습니다.");

  const addReview = () => void commit((current) => ({
    ...current,
    reviews: [
      ...current.reviews,
      {
        id: createId("review"),
        title: mode === "server-work" ? "새 검수 항목" : "새 로컬 검수 항목",
        assignee: "미배정",
        severity: "minor",
        status: "open",
        hierarchyNodeId: null,
        pageId: null,
        requestedByRole: null,
        approvalRequired: false,
      },
    ],
  }), "검수 항목을 추가했습니다.");

  const createSnapshot = () => void commit((current) => ({
    ...current,
    versions: [
      {
        id: createId("version"),
        name: `${mode === "server-work" ? "운영" : "로컬"} 체크포인트 ${current.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        tasks: current.tasks,
        reviews: current.reviews,
        hierarchy: current.hierarchy,
        roleAssignments: current.roleAssignments,
        handoffs: current.handoffs,
      },
      ...current.versions,
    ],
  }), "작업·검수·역할·인계 체크포인트를 저장했습니다.");

  const restoreSnapshot = (snapshot: ProductionVersionSnapshot) => void commit((current) => ({
    ...current,
    tasks: snapshot.tasks,
    reviews: snapshot.reviews,
    hierarchy: snapshot.hierarchy ?? [],
    roleAssignments: snapshot.roleAssignments ?? [],
    handoffs: snapshot.handoffs ?? [],
  }), `${snapshot.name} 상태를 복원했습니다.`);

  const addSlide = () => void commit((current) => ({
    ...current,
    slides: [
      ...current.slides,
      {
        id: createId("slide"),
        title: "새 슬라이드",
        body: "핵심 메시지를 입력하세요.",
      },
    ],
  }), "피치 슬라이드를 추가했습니다.");

  return (
    <div
      className="min-h-dvh bg-bg text-fg"
      data-studio-production-command-center
      data-scope-key={scope.key}
      data-workspace-mode={mode}
      data-collaboration-level={collaborationLevel}
    >
      <header className="sticky top-0 z-40 border-b border-line bg-bg/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-3 px-3 py-2 sm:px-5">
          <button
            type="button"
            className={buttonClass({ variant: "quiet", size: "icon" })}
            onClick={onOpenStudio}
            aria-label={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "Studio 편집기로 돌아가기")}
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Radio className="size-4 text-accent" aria-hidden="true" />
              <p className="text-[0.6875rem] font-black uppercase tracking-[0.16em] text-fg-3">
                {SURFACE_META[surface].label}
              </p>
              <Pill tone={releaseReady ? "success" : configured ? "warning" : "neutral"}>
                {releaseReady ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "내보낼 준비 완료") : configured ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "확인할 내용 있음") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "시작 전")}
              </Pill>
              <Pill>{translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "변경 ")}{workspace.revision}</Pill>
            </div>
            <input
              key={`${workspace.scopeKey}:${workspace.title}`}
              defaultValue={workspace.title}
              aria-label={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "프로젝트 제목")}
              disabled={!capabilities.canEdit || Boolean(loadError)}
              className="mt-0.5 min-h-11 w-full max-w-3xl bg-transparent text-base font-black tracking-tight outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:text-lg"
              onBlur={(event) => {
                const title = event.currentTarget.value.trim();
                if (!title || title === workspaceRef.current.title) return;
                void commit((current) => ({ ...current, title }), "프로젝트 제목을 변경했습니다.");
              }}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-fg-2" role="status">
            <Save className="size-4" aria-hidden="true" />
            {persistenceLabel(persistence, mode)}
          </div>
          <Link
            href={scope.editorHref}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "원고 열기")}</Link>
        </div>
        <nav
          className="mx-auto max-w-[1920px] overflow-x-auto px-3 pb-2 sm:px-5"
          aria-label={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "프로젝트 메뉴")}
        >
          <div className="flex min-w-max gap-1">
            {navigationSurfaces.map((item, index) => {
              const meta = SURFACE_META[item];
              const Icon = meta.icon;
              const active = item === surface;
              return (
                <Link
                  key={item}
                  href={surfaceHref(item, scope)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors pointer-coarse:min-h-11",
                    active
                      ? "bg-accent text-on-accent"
                      : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                  title={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "en", "{v0} · Alt+{v1}"), { v0: String(meta.label), v1: String(index + 1) })}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {meta.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-[1920px] space-y-4 px-3 py-4 sm:px-5 sm:py-5">
        <ModeNotice mode={mode} />

        {!showCollaborationUi ? (
          <div
            className="rounded-xl border border-line bg-panel px-3 py-2.5 text-xs leading-relaxed text-fg-2"
            data-solo-workspace-notice
            role="status"
          >
            <UserRound className="mr-2 inline size-4 text-accent" aria-hidden="true" />
            {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "개인 작업 중심으로 협업 UI를 간소화했습니다. 공유는 계속 사용할 수 있고, 실제 팀 프로젝트에 참여하면 참여자·역할·협업 동선이 자동으로 다시 표시됩니다.")}
          </div>
        ) : null}

        {mode === "server-work" && serverWorkId ? <Suspense fallback={null}><StudioHandoffEnvelopeInbox workId={serverWorkId} /></Suspense> : null}

        {loadError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm" role="alert">
            <p className="font-bold">{translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "저장된 제작 운영 데이터를 안전하게 열지 못했습니다.")}</p>
            <p className="mt-1 text-xs text-fg-2">{loadError}</p>
            <p className="mt-2 text-xs text-fg-2">{translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "손상된 값을 빈 데이터로 덮어쓰지 않았습니다.")}</p>
            <button
              type="button"
              className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-3")}
              onClick={() => void reloadWorkspace(true)}
            >
              {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "다시 확인")}</button>
          </div>
        ) : null}

        {notice ? (
          <div
            className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-fg"
            role="status"
          >
            <span>{notice}</span>
            <button type="button" className="font-semibold text-accent" onClick={() => setNotice(null)}>
              {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "닫기")}</button>
          </div>
        ) : null}

        <div className={cn(
          "grid gap-3 sm:grid-cols-2",
          showCollaborationUi ? "xl:grid-cols-4" : "xl:grid-cols-3",
        )}>
          <Metric
            label={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "진행률")}
            value={`${progress}%`}
            detail={workspace.tasks.length === 0
              ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "제작 작업을 추가해 진행률을 관리하세요.")
              : formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "{v0}/{v1} 작업 완료"), { v0: String(completed), v1: String(workspace.tasks.length) })}
            tone={workspace.tasks.length > 0 && completed === workspace.tasks.length ? "success" : "neutral"}
          />
          <Metric
            label={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "먼저 해결할 항목")}
            value={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "{v0}건"), { v0: String(blocked) })}
            detail={blocked > 0 ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "다음 단계 전에 확인해 주세요") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "진행을 막는 항목이 없습니다")}
            tone={blocked > 0 ? "danger" : "success"}
          />
          <Metric
            label={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "확인할 의견")}
            value={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "{v0}건"), { v0: String(openBlockers + openMajor) })}
            detail={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "중요 {v0} · 일반 {v1}"), { v0: String(openBlockers), v1: String(openMajor) })}
            tone={openBlockers > 0 ? "danger" : openMajor > 0 ? "warning" : "success"}
          />
          {showCollaborationUi ? (
            <Metric
              label={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "참여자")}
              value={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "{v0}명"), { v0: String(workspace.members.length) })}
              detail={capabilities.serverAuthoritative ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "팀 권한에 따라 표시") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "이 기기의 프로젝트 정보")}
            />
          ) : null}
        </div>

        {surface === "projects" ? (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <Card
              title={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "다음 할 일")}
              description={mode === "server-work"
                ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "팀과 공유하는 할 일을 추가하고 진행 상태를 확인하세요.")
                : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "이 프로젝트에서 이어서 할 일을 간단히 정리하세요.")}
              action={(
                <button
                  type="button"
                  className={buttonClass({ size: "sm" })}
                  onClick={addTask}
                  disabled={!capabilities.canEdit || Boolean(loadError)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "작업 추가")}</button>
              )}
            >
              <StudioProductionTaskBoard
                workspace={workspace}
                canEdit={capabilities.canEdit && !loadError}
                canApprove={capabilities.canApprove}
                canPublish={capabilities.canPublish}
                onCommit={(update, message) => { void commit(update, message); }}
              />
            </Card>
            <Card
              title={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "내보내기 전 확인")}
              description={mode === "server-work"
                ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "남은 할 일과 검토 의견을 확인한 뒤 내보내기를 준비하세요.")
                : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "현재 기기의 할 일과 검토 의견을 기준으로 준비 상태를 보여드립니다.")}
            >
              <div className={cn(
                "rounded-2xl border p-4 text-center",
                releaseReady
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-amber-500/30 bg-amber-500/10",
              )}>
                {releaseReady ? (
                  <ShieldCheck className="mx-auto size-9 text-emerald-600" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="mx-auto size-9 text-amber-600" aria-hidden="true" />
                )}
                <p className="mt-2 text-sm font-black">
                  {releaseReady
                    ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "내보낼 준비가 됐어요")
                    : configured ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "확인할 내용이 있어요") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "할 일을 먼저 추가하세요")}
                </p>
                <p className="mt-1 text-xs text-fg-2">
                  {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "먼저 해결할 항목 ")}{blocked} {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "· 확인할 의견 ")}{openBlockers + openMajor}
                </p>
              </div>
            </Card>
            </div>
            <StudioProductionOperationsPanel
              workspace={workspace}
              canEdit={capabilities.canEdit && !loadError}
              canManageRoles={capabilities.canManageRoles && !loadError}
              roleCandidates={roleCandidates}
              onCommit={(update, message) => { void commit(update, message); }}
            />
          </div>
        ) : null}

        {surface === "review" ? (
          <Card
            title={mode === "server-work" ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "검토 의견") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "내 검토 메모")}
            description={mode === "server-work"
              ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "팀이 확인할 의견을 장면과 작업에 연결해 관리합니다.")
              : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "이 기기에 저장되는 개인 검토 메모입니다.")}
            action={(
              <button
                type="button"
                className={buttonClass({ size: "sm" })}
                onClick={addReview}
                disabled={!capabilities.canEdit || Boolean(loadError)}
              >
                <Plus className="size-4" aria-hidden="true" />
                {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "의견 추가")}</button>
            )}
          >
            <StudioProductionReviewBoard
              workspace={workspace}
              canEdit={capabilities.canEdit && !loadError}
              canApprove={capabilities.canApprove}
              onCommit={(update, message) => { void commit(update, message); }}
            />
          </Card>
        ) : null}

        {surface === "versions" ? (
          <div className="space-y-4">
            <Card
              title={mode === "server-work" ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "제작 운영 체크포인트") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "로컬 작업·검수 체크포인트")}
              description={mode === "server-work"
                ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "작업·검수·역할·인계 상태를 서버 제작 운영 문서 안에 저장합니다. 원고 컷·레이어 복원본은 아닙니다.")
                : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "로컬 작업·검수 목록만 저장·복원합니다. 원고의 컷·레이어와 서버 리비전은 포함하지 않습니다.")}
              action={(
                <button
                  type="button"
                  className={buttonClass({ size: "sm" })}
                  onClick={createSnapshot}
                  disabled={!capabilities.canEdit || Boolean(loadError)}
                >
                  <FileClock className="size-4" aria-hidden="true" />
                  {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "체크포인트 만들기")}</button>
              )}
            >
              {workspace.versions.length === 0 ? (
                <EmptyState
                  title={mode === "server-work" ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "제작 운영 체크포인트가 없습니다") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "로컬 체크포인트가 없습니다")}
                  description={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "서버 원고 리비전과 별개로, 이 화면의 작업·검수 상태를 보관할 수 있습니다.")}
                />
              ) : (
                <div className="space-y-2">
                  {workspace.versions.map((version) => (
                    <article
                      key={version.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3"
                    >
                      <div>
                        <h3 className="text-sm font-bold">{version.name}</h3>
                        <p className="mt-1 text-xs text-fg-2">
                          {DATE_TIME_FORMATTER.format(new Date(version.createdAt))} {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "· 작업 ")}{version.tasks.length} {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "· 검수 ")}{version.reviews.length}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={buttonClass({ variant: "outline", size: "sm" })}
                        onClick={() => restoreSnapshot(version)}
                        disabled={!capabilities.canEdit || Boolean(loadError)}
                      >
                        <RotateCcw className="size-4" aria-hidden="true" />
                        {mode === "server-work" ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "운영 상태 복원") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "로컬 복원")}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </Card>
            <StudioServerVersionsCard scopeKey={scope.key} />
          </div>
        ) : null}

        {surface === "present" ? (
          <StudioPitchPptxCard
            title={workspace.title}
            slides={workspace.slides}
            onAddSlide={addSlide}
            onNotice={setNotice}
            onChangeSlide={(id, patch) => void commit((current) => ({
              ...current,
              slides: current.slides.map((slide) => slide.id === id ? { ...slide, ...patch } : slide),
            }), "피치 슬라이드를 수정했습니다.")}
          />
        ) : null}

        {surface === "share" ? (
          mode === "server-work" && serverWorkId ? (
            <StudioReviewLinkManager
              workId={serverWorkId}
              workspace={workspace}
              canManage={capabilities.canInvite && !loadError}
              onNotice={setNotice}
            />
          ) : (
          <Card
            title={capabilities.canInvite ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "서버 프로젝트 공유") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "서버 공유 잠금")}
            description={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "초대 링크는 서버에서 난수 토큰을 발급하고 권한·만료·폐기를 검증해야 합니다.")}
          >
            <div className={cn(
              "rounded-2xl border p-5",
              capabilities.canInvite
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-amber-500/30 bg-amber-500/10",
            )}>
              {capabilities.canInvite ? (
                <Server className="size-8 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertTriangle className="size-8 text-amber-600" aria-hidden="true" />
              )}
              <h2 className="mt-3 text-base font-black">
                {capabilities.canInvite
                  ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "서버 초대 서비스에서 링크를 발급하세요")
                  : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "이 모드에서는 초대 링크를 만들 수 없습니다")}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-2">
                {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "브라우저에 저장된 문자열이나 작품 ID에서 계산한 값은 인증 토큰으로 인정하지 않습니다. 현재 작업 목록은")}{mode === "server-work" ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "서버 프로젝트") : mode === "read-only-cache" ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "읽기 전용 사본") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "이 기기")}{translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "에 있으며 팀 권한을 부여하지 않습니다.")}</p>
              <div className="mt-4 grid gap-2 text-xs text-fg-2 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-panel p-3">{translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "초대 권한: ")}{capabilities.canInvite ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "서버 검증") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "사용 불가")}</div>
                <div className="rounded-xl border border-line bg-panel p-3">{translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "승인 권한: ")}{capabilities.canApprove ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "서버 검증") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "사용 불가")}</div>
                <div className="rounded-xl border border-line bg-panel p-3">{translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "출판 권한: ")}{capabilities.canPublish ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "서버 검증") : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "사용 불가")}</div>
              </div>
            </div>
          </Card>
          )
        ) : null}

        {surface === "join" ? (
          <Card
            title={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "참여 링크 검증")}
            description={translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "서버에서 발급·서명·폐기 가능한 초대만 프로젝트 권한으로 인정합니다.")}
          >
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
              <AlertTriangle className="size-8 text-amber-600" aria-hidden="true" />
              <h2 className="mt-3 text-base font-black">
                {inviteParameter
                  ? translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "이 링크는 서버에서 검증되지 않았습니다")
                  : translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "검증할 서버 초대 링크가 없습니다")}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-2">
                {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "로컬 ProductionHub 토큰이나 URL 파라미터만으로 멤버를 추가하지 않습니다. 유효한 서버 초대 API가 연결되기 전에는 참여 처리를 실패 안전 상태로 유지합니다.")}</p>
              {inviteParameter ? (
                <p className="mt-3 break-all rounded-xl border border-line bg-panel p-3 font-mono text-xs text-fg-2">
                  {translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "수신 토큰: ")}{inviteParameter.slice(0, 12)}{translateCurrentStaticSourceText("domains.creator.studio.production.StudioProductionHubPageV2", "ko", "… · 권한 부여 안 됨")}</p>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
