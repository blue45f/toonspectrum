import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
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
  Users,
  WifiOff,
} from "lucide-react";
import {
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
  studioProductionWorkspaceModeLabel,
  type ProductionReviewSeverity,
  type ProductionTaskStatus,
  type ProductionVersionSnapshot,
  type ProductionWorkspace,
  type StudioProductionWorkspaceMode,
} from "./studio-production-workspace";
import { StudioPitchPptxCard } from "./StudioPitchPptxCard";
import { StudioServerVersionsCard } from "./StudioServerVersionsCard";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";

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

function persistenceLabel(state: PersistenceState): string {
  switch (state) {
    case "loading":
      return "불러오는 중";
    case "saving":
      return "저장 중";
    case "saved":
      return "SQLite/OPFS 저장됨";
    case "demo":
      return "데모 · 저장 안 함";
    case "error":
      return "저장소 오류";
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
  projects: { label: "프로젝트", icon: FolderKanban },
  review: { label: "리뷰", icon: MessageSquareCheck },
  versions: { label: "버전", icon: FileClock },
  present: { label: "피치", icon: Presentation },
  share: { label: "공유", icon: Share2 },
  join: { label: "참여", icon: Users },
};

function taskTone(status: ProductionTaskStatus): "neutral" | "success" | "danger" | "accent" {
  if (status === "done") return "success";
  if (status === "blocked") return "danger";
  if (status === "doing") return "accent";
  return "neutral";
}

function reviewTone(severity: ProductionReviewSeverity): "neutral" | "warning" | "danger" {
  if (severity === "blocker") return "danger";
  if (severity === "major") return "warning";
  return "neutral";
}

function ModeNotice({ mode }: { readonly mode: StudioProductionWorkspaceMode }) {
  const sharedClass = "rounded-xl border px-3 py-2.5 text-xs leading-relaxed";
  if (mode === "demo") {
    return (
      <div className={cn(sharedClass, "border-sky-500/30 bg-sky-500/10 text-fg")} role="status">
        <Info className="mr-2 inline size-4 text-sky-600" aria-hidden="true" />
        이 화면은 명시적으로 연 샘플 데모입니다. 변경 내용은 저장·공유·승인되지 않습니다.
      </div>
    );
  }
  if (mode === "server-work") {
    return (
      <div className={cn(sharedClass, "border-emerald-500/30 bg-emerald-500/10 text-fg")} role="status">
        <Server className="mr-2 inline size-4 text-emerald-600" aria-hidden="true" />
        서버 제작 운영 데이터입니다. 권한과 리비전 검사가 적용됩니다.
      </div>
    );
  }
  if (mode === "read-only-cache") {
    return (
      <div className={cn(sharedClass, "border-amber-500/30 bg-amber-500/10 text-fg")} role="status">
        <WifiOff className="mr-2 inline size-4 text-amber-600" aria-hidden="true" />
        마지막으로 확인한 캐시를 읽기 전용으로 표시합니다. 연결 전에는 변경·승인·공유할 수 없습니다.
      </div>
    );
  }
  return (
    <div className={cn(sharedClass, "border-amber-500/30 bg-amber-500/10 text-fg")} role="status">
      <HardDrive className="mr-2 inline size-4 text-amber-600" aria-hidden="true" />
      이 작업·검수 목록은 현재 기기의 SQLite/OPFS에만 저장됩니다. 서버 원고 리비전, 팀 승인 또는 출판 권한이 아닙니다.
    </div>
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
        <h1 className="font-bold">프로젝트 범위를 확인할 수 없습니다</h1>
        <p className="my-3 text-sm">잘못되거나 서로 충돌하는 작품 정보입니다. 저장된 내용은 변경하지 않았습니다.</p>
        <button type="button" className={buttonClass()} onClick={onOpenStudio}>
          Studio 편집기로 돌아가기
        </button>
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
  const mode = useMemo(() => resolveStudioProductionWorkspaceMode({
    scopeKey: scope.key,
    search: location.search,
    serverBacked: false,
  }), [location.search, scope.key]);
  const capabilities = useMemo(
    () => studioProductionWorkspaceCapabilities(mode),
    [mode],
  );
  const initial = useMemo(
    () => mode === "demo"
      ? createDemoProductionWorkspace()
      : createEmptyProductionWorkspace(scope.key),
    [mode, scope.key],
  );
  const [workspace, setWorkspace] = useState<ProductionWorkspace>(initial);
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
      setPersistence("demo");
      setLoadError(null);
      return;
    }
    if (showLoading) setPersistence("loading");
    try {
      const loaded = await loadStudioProductionWorkspace(scope.key);
      adoptWorkspace(loaded ?? createEmptyProductionWorkspace(scope.key));
      setPersistence("saved");
      setLoadError(null);
    } catch (cause) {
      adoptWorkspace(createEmptyProductionWorkspace(scope.key));
      setPersistence("error");
      setLoadError(cause instanceof Error
        ? cause.message
        : "제작 운영 데이터를 불러오지 못했습니다.");
    }
  }, [adoptWorkspace, mode, scope.key]);

  useEffect(() => {
    void reloadWorkspace(true);
  }, [reloadWorkspace]);

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
    if (!capabilities.canPersistLocally) {
      setNotice("서버 제작 운영 저장소가 연결되지 않아 변경하지 않았습니다.");
      return;
    }
    setPersistence("saving");
    try {
      const next = await commitStudioProductionWorkspace(
        scope.key,
        workspaceRef.current,
        update,
      );
      adoptWorkspace(next);
      setPersistence("saved");
      setNotice(message);
      channelRef.current?.postMessage(createStudioProductionWorkspaceInvalidation({
        scopeKey: scope.key,
        revision: next.revision,
        sourceClientId: clientIdRef.current,
      }));
    } catch (cause) {
      setPersistence("error");
      const messageText = cause instanceof Error
        ? cause.message
        : "제작 운영 데이터를 저장하지 못했습니다.";
      setLoadError(messageText);
      setNotice(messageText);
    }
  }, [adoptWorkspace, capabilities, loadError, mode, scope.key]);

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
      const next = STUDIO_PRODUCTION_SURFACES[Number(event.key) - 1];
      if (!next) return;
      event.preventDefault();
      void navigate(surfaceHref(next, scope));
    };
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [navigate, scope]);

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
      },
    ],
  }), "새 제작 작업을 추가했습니다.");

  const addReview = () => void commit((current) => ({
    ...current,
    reviews: [
      ...current.reviews,
      {
        id: createId("review"),
        title: "새 로컬 검수 항목",
        assignee: "미배정",
        severity: "minor",
        status: "open",
      },
    ],
  }), "로컬 검수 항목을 추가했습니다.");

  const toggleTask = (id: string) => void commit((current) => ({
    ...current,
    tasks: current.tasks.map((task) => {
      if (task.id !== id) return task;
      return task.status === "done"
        ? { ...task, status: "doing", progress: Math.min(task.progress, 90) }
        : { ...task, status: "done", progress: 100 };
    }),
  }), "작업 상태를 갱신했습니다.");

  const toggleReview = (id: string) => void commit((current) => ({
    ...current,
    reviews: current.reviews.map((issue) => issue.id === id
      ? { ...issue, status: issue.status === "open" ? "resolved" : "open" }
      : issue),
  }), "검수 상태를 갱신했습니다.");

  const createSnapshot = () => void commit((current) => ({
    ...current,
    versions: [
      {
        id: createId("version"),
        name: `로컬 체크포인트 ${current.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        tasks: current.tasks,
        reviews: current.reviews,
      },
      ...current.versions,
    ],
  }), "로컬 작업·검수 체크포인트를 저장했습니다.");

  const restoreSnapshot = (snapshot: ProductionVersionSnapshot) => void commit((current) => ({
    ...current,
    tasks: snapshot.tasks,
    reviews: snapshot.reviews,
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
    >
      <header className="sticky top-0 z-40 border-b border-line bg-bg/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-3 px-3 py-2 sm:px-5">
          <button
            type="button"
            className={buttonClass({ variant: "quiet", size: "icon" })}
            onClick={onOpenStudio}
            aria-label="Studio 편집기로 돌아가기"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Radio className="size-4 text-accent" aria-hidden="true" />
              <p className="text-[0.6875rem] font-black uppercase tracking-[0.16em] text-fg-3">
                {studioProductionWorkspaceModeLabel(mode)} · {SURFACE_META[surface].label}
              </p>
              <Pill tone={releaseReady ? "success" : configured ? "warning" : "neutral"}>
                {releaseReady ? "로컬 점검 완료" : configured ? "점검 필요" : "설정 필요"}
              </Pill>
              <Pill>local r{workspace.revision}</Pill>
            </div>
            <input
              key={`${workspace.scopeKey}:${workspace.title}`}
              defaultValue={workspace.title}
              aria-label="프로젝트 제목"
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
            {persistenceLabel(persistence)}
          </div>
          <Link
            href={scope.editorHref}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            원고 열기
          </Link>
        </div>
        <nav
          className="mx-auto max-w-[1920px] overflow-x-auto px-3 pb-2 sm:px-5"
          aria-label="제작 운영 기능"
        >
          <div className="flex min-w-max gap-1">
            {STUDIO_PRODUCTION_SURFACES.map((item, index) => {
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
                  title={`${meta.label} · Alt+${index + 1}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {meta.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1920px] space-y-4 px-3 py-4 sm:px-5 sm:py-5">
        <ModeNotice mode={mode} />

        {loadError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm" role="alert">
            <p className="font-bold">저장된 제작 운영 데이터를 안전하게 열지 못했습니다.</p>
            <p className="mt-1 text-xs text-fg-2">{loadError}</p>
            <p className="mt-2 text-xs text-fg-2">손상된 값을 빈 데이터로 덮어쓰지 않았습니다.</p>
            <button
              type="button"
              className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-3")}
              onClick={() => void reloadWorkspace(true)}
            >
              다시 확인
            </button>
          </div>
        ) : null}

        {notice ? (
          <div
            className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-fg"
            role="status"
          >
            <span>{notice}</span>
            <button type="button" className="font-semibold text-accent" onClick={() => setNotice(null)}>
              닫기
            </button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="제작 진척"
            value={`${progress}%`}
            detail={workspace.tasks.length === 0
              ? "로컬 작업을 추가해 진행률을 관리하세요."
              : `${completed}/${workspace.tasks.length} 작업 완료`}
            tone={workspace.tasks.length > 0 && completed === workspace.tasks.length ? "success" : "neutral"}
          />
          <Metric
            label="차단 작업"
            value={`${blocked}건`}
            detail="현재 로컬 플래너 기준"
            tone={blocked > 0 ? "danger" : "success"}
          />
          <Metric
            label="미해결 검수"
            value={`${openBlockers + openMajor}건`}
            detail={`Blocker ${openBlockers} · Major ${openMajor}`}
            tone={openBlockers > 0 ? "danger" : openMajor > 0 ? "warning" : "success"}
          />
          <Metric
            label="표시 멤버"
            value={`${workspace.members.length}명`}
            detail={capabilities.serverAuthoritative ? "서버 권한 적용" : "권한 없는 로컬 메모"}
          />
        </div>

        {surface === "projects" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <Card
              title="제작 보드"
              description="현재 기기에 저장되는 작업 목록입니다. 서버 원고 상태와 자동으로 동일시하지 않습니다."
              action={(
                <button
                  type="button"
                  className={buttonClass({ size: "sm" })}
                  onClick={addTask}
                  disabled={!capabilities.canEdit || Boolean(loadError)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  작업 추가
                </button>
              )}
            >
              {workspace.tasks.length === 0 ? (
                <EmptyState
                  title="등록된 제작 작업이 없습니다"
                  description="실제 작품 범위에는 샘플 작업을 자동으로 넣지 않습니다. 필요한 작업을 직접 추가하세요."
                  action={(
                    <button type="button" className={buttonClass({ size: "sm" })} onClick={addTask}>
                      첫 작업 추가
                    </button>
                  )}
                />
              ) : (
                <div className="space-y-2">
                  {workspace.tasks.map((task) => (
                    <article key={task.id} className="rounded-xl border border-line bg-panel p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold">{task.title}</h3>
                            <Pill tone={taskTone(task.status)}>{task.status}</Pill>
                          </div>
                          <p className="mt-1 text-xs text-fg-2">{task.owner || "미배정"} · 마감 {task.due}</p>
                        </div>
                        <button
                          type="button"
                          className={buttonClass({ variant: "outline", size: "sm" })}
                          onClick={() => toggleTask(task.id)}
                          disabled={!capabilities.canEdit || Boolean(loadError)}
                        >
                          {task.status === "done" ? (
                            <RotateCcw className="size-4" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                          )}
                          {task.status === "done" ? "재개" : "완료"}
                        </button>
                      </div>
                      <div
                        className="mt-3 h-2 overflow-hidden rounded-full bg-raised"
                        role="progressbar"
                        aria-valuenow={task.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className="h-full rounded-full bg-accent" style={{ width: `${task.progress}%` }} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </Card>
            <Card title="출시 게이트" description="현재 화면은 로컬 점검 도구이며 서버 승인 기록이 아닙니다.">
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
                  {releaseReady ? "로컬 점검 완료" : configured ? "조치 필요" : "작업을 먼저 구성하세요"}
                </p>
                <p className="mt-1 text-xs text-fg-2">
                  차단 작업 {blocked} · 중요 검수 {openBlockers + openMajor}
                </p>
              </div>
            </Card>
          </div>
        ) : null}

        {surface === "review" ? (
          <Card
            title="로컬 리뷰 메모"
            description="서버 리비전에 고정된 공식 Review Snapshot이 아니라 현재 기기의 작업 메모입니다."
            action={(
              <button
                type="button"
                className={buttonClass({ size: "sm" })}
                onClick={addReview}
                disabled={!capabilities.canEdit || Boolean(loadError)}
              >
                <Plus className="size-4" aria-hidden="true" />
                검수 항목 추가
              </button>
            )}
          >
            {workspace.reviews.length === 0 ? (
              <EmptyState
                title="로컬 검수 항목이 없습니다"
                description="샘플 검수 내용을 실제 작품에 자동 삽입하지 않습니다. 공식 승인은 서버 검수본 기능에서만 제공됩니다."
              />
            ) : (
              <div className="space-y-2">
                {workspace.reviews.map((issue) => (
                  <article
                    key={issue.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold">{issue.title}</h3>
                        <Pill tone={reviewTone(issue.severity)}>{issue.severity}</Pill>
                        <Pill tone={issue.status === "resolved" ? "success" : "accent"}>{issue.status}</Pill>
                      </div>
                      <p className="mt-1 text-xs text-fg-2">담당 {issue.assignee || "미배정"}</p>
                    </div>
                    <button
                      type="button"
                      className={buttonClass({ variant: "outline", size: "sm" })}
                      onClick={() => toggleReview(issue.id)}
                      disabled={!capabilities.canEdit || Boolean(loadError)}
                    >
                      {issue.status === "open" ? "해결" : "다시 열기"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        {surface === "versions" ? (
          <div className="space-y-4">
            <Card
              title="로컬 작업·검수 체크포인트"
              description="로컬 작업·검수 목록만 저장·복원합니다. 원고의 컷·레이어와 서버 리비전은 포함하지 않습니다."
              action={(
                <button
                  type="button"
                  className={buttonClass({ size: "sm" })}
                  onClick={createSnapshot}
                  disabled={!capabilities.canEdit || Boolean(loadError)}
                >
                  <FileClock className="size-4" aria-hidden="true" />
                  체크포인트 만들기
                </button>
              )}
            >
              {workspace.versions.length === 0 ? (
                <EmptyState
                  title="로컬 체크포인트가 없습니다"
                  description="서버 원고 리비전과 별개로, 이 화면의 작업·검수 상태를 보관할 수 있습니다."
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
                          {DATE_TIME_FORMATTER.format(new Date(version.createdAt))} · 작업 {version.tasks.length} · 검수 {version.reviews.length}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={buttonClass({ variant: "outline", size: "sm" })}
                        onClick={() => restoreSnapshot(version)}
                        disabled={!capabilities.canEdit || Boolean(loadError)}
                      >
                        <RotateCcw className="size-4" aria-hidden="true" />
                        로컬 복원
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
          <Card
            title={capabilities.canInvite ? "서버 프로젝트 공유" : "서버 공유 잠금"}
            description="초대 링크는 서버에서 난수 토큰을 발급하고 권한·만료·폐기를 검증해야 합니다."
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
                  ? "서버 초대 서비스에서 링크를 발급하세요"
                  : "이 모드에서는 초대 링크를 만들 수 없습니다"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-2">
                브라우저에 저장된 문자열이나 작품 ID에서 계산한 값은 인증 토큰으로 인정하지 않습니다.
                현재 작업 목록은 {studioProductionWorkspaceModeLabel(mode)}에 있으며 팀 권한을 부여하지 않습니다.
              </p>
              <div className="mt-4 grid gap-2 text-xs text-fg-2 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-panel p-3">초대 권한: {capabilities.canInvite ? "서버 검증" : "사용 불가"}</div>
                <div className="rounded-xl border border-line bg-panel p-3">승인 권한: {capabilities.canApprove ? "서버 검증" : "사용 불가"}</div>
                <div className="rounded-xl border border-line bg-panel p-3">출판 권한: {capabilities.canPublish ? "서버 검증" : "사용 불가"}</div>
              </div>
            </div>
          </Card>
        ) : null}

        {surface === "join" ? (
          <Card
            title="참여 링크 검증"
            description="서버에서 발급·서명·폐기 가능한 초대만 프로젝트 권한으로 인정합니다."
          >
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
              <AlertTriangle className="size-8 text-amber-600" aria-hidden="true" />
              <h2 className="mt-3 text-base font-black">
                {inviteParameter
                  ? "이 링크는 서버에서 검증되지 않았습니다"
                  : "검증할 서버 초대 링크가 없습니다"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-2">
                로컬 ProductionHub 토큰이나 URL 파라미터만으로 멤버를 추가하지 않습니다. 유효한 서버 초대 API가 연결되기 전에는 참여 처리를 실패 안전 상태로 유지합니다.
              </p>
              {inviteParameter ? (
                <p className="mt-3 break-all rounded-xl border border-line bg-panel p-3 font-mono text-xs text-fg-2">
                  수신 토큰: {inviteParameter.slice(0, 12)}… · 권한 부여 안 됨
                </p>
              ) : null}
            </div>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
