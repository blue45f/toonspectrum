import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Eye,
  FileArchive,
  GitCompareArrows,
  History,
  Keyboard,
  Layers3,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  MonitorSmartphone,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonspectrum/core/production";

import { getApiErrorMessage, httpStatus } from "@/infrastructure/api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  getStudioProjectByWork,
  listStudioArtifactRevisions,
  listStudioReviews,
} from "../project-graph/studio-project-graph-client";
import type {
  StudioProjectRecord,
  StudioReviewSummary,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";
import { StudioProjectVersionStackPanel } from "../project-graph/StudioProjectVersionStackPanel";
import { StudioExportPanel } from "../studio-shell/StudioExportPanel";
import { StudioProjectAssistantPanel } from "../studio-shell/StudioProjectAssistantPanel";
import {
  studioVirtualSpaceReviewHref,
  type StudioVirtualSpaceReviewSubject,
} from "../virtual-space/studio-virtual-space-review-invitation";
import {
  buildProductionManuscriptActivity,
  buildProductionManuscriptProcesses,
  productionManuscriptMetrics,
  type ProductionManuscriptProcess,
} from "./production-manuscript-model";
import { ProductionManuscriptProcessBrowser } from "./ProductionManuscriptProcessBrowser";
import {
  isProductionManuscriptFilter,
  isProductionManuscriptLayout,
  isProductionManuscriptSort,
  nextProductionManuscriptProcess,
  productionManuscriptAttention,
  queryProductionManuscriptProcesses,
  type ProductionManuscriptAttentionFilter,
  type ProductionManuscriptLayout,
  type ProductionManuscriptSort,
} from "./production-manuscript-ux";

type ManuscriptView = "processes" | "versions" | "feedback" | "delivery" | "assistant" | "activity";

interface LoadedManuscriptData {
  readonly project: StudioProjectRecord;
  readonly revisionsByArtifact: Readonly<Record<string, readonly StudioRevisionRecord[]>>;
  readonly reviewsByArtifact: Readonly<Record<string, readonly StudioReviewSummary[]>>;
}

interface ProductionManuscriptWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly canEdit: boolean;
  readonly isDemo: boolean;
}

const VIEW_ITEMS: readonly {
  readonly id: ManuscriptView;
  readonly label: string;
  readonly icon: LucideIcon;
}[] = [
  { id: "processes", label: "공정·원고", icon: Workflow },
  { id: "versions", label: "버전·비교", icon: GitCompareArrows },
  { id: "feedback", label: "피드백", icon: MessageSquare },
  { id: "delivery", label: "공유·내보내기", icon: Download },
  { id: "assistant", label: "AI 도우미", icon: WandSparkles },
  { id: "activity", label: "활동", icon: History },
];

const CAPABILITIES: readonly {
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly destination: "workspace" | "production" | "versions" | "feedback" | "delivery" | "assistant";
}[] = [
  { title: "워크스페이스·멤버·권한", description: "소유자·관리자·편집자·댓글·보기 권한을 서버에서 다시 확인합니다.", icon: Users, destination: "workspace" },
  { title: "이미지·텍스트 공정", description: "대본·콘티·작화·배경·식자·현지화·오디오·납품 공정을 한 회차에 묶습니다.", icon: Layers3, destination: "production" },
  { title: "불변 버전·최종본", description: "자동 저장·체크포인트·검수본·승인본·게시본을 덮어쓰지 않고 보존합니다.", icon: FileArchive, destination: "versions" },
  { title: "원고 비교·복원", description: "버전 간 비교와 과거 revision의 새 체크포인트 복원을 지원합니다.", icon: GitCompareArrows, destination: "versions" },
  { title: "페이지·컷 피드백", description: "위치 주석, 필수 수정, 해결 상태, 댓글과 검수 결정을 고정 원고에 연결합니다.", icon: MessageSquare, destination: "feedback" },
  { title: "보호 공유·모바일 검수", description: "고정된 검수본만 공유하고 접근·만료·폐기를 매 열기마다 검증합니다.", icon: MonitorSmartphone, destination: "delivery" },
  { title: "다중 형식 내보내기", description: "플랫폼·SNS·인쇄·PDF·편집본·전자책·영상·보관 규격을 사전 검사합니다.", icon: Download, destination: "delivery" },
  { title: "AI 제작 보조", description: "대사·구도·배경·캐릭터·팔레트 요청을 편집기로 넘기고 원본은 보호합니다.", icon: Sparkles, destination: "assistant" },
];

function isManuscriptView(value: string | null): value is ManuscriptView {
  return VIEW_ITEMS.some((item) => item.id === value);
}

function blocksManuscriptShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(
    "input, textarea, select, [contenteditable='true'], [role='textbox'], "
      + "[data-studio-shortcut-boundary='true'], [aria-modal='true']",
  ));
}

async function copyPlainText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to a selection-based copy for restricted webviews.
  }
  if (typeof document === "undefined") return false;
  const input = document.createElement("textarea");
  input.value = value;
  input.readOnly = true;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input.remove();
  }
}

function handleViewTabKey(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  view: ManuscriptView,
  setView: (next: ManuscriptView) => void,
): void {
  const current = VIEW_ITEMS.findIndex((item) => item.id === view);
  let next: number;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % VIEW_ITEMS.length;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + VIEW_ITEMS.length) % VIEW_ITEMS.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = VIEW_ITEMS.length - 1;
  else return;
  event.preventDefault();
  setView(VIEW_ITEMS[next].id);
  const tabs = event.currentTarget.closest('[role="tablist"]');
  requestAnimationFrame(() => tabs?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function accessLabel(project: StudioProjectRecord): string {
  switch (project.access.role) {
    case "owner": return "소유자";
    case "admin": return "관리자";
    case "editor": return "편집자";
    case "commenter": return "댓글 작성자";
    case "viewer": return "보기 전용";
    default: return "프로젝트 멤버";
  }
}

function reviewTone(status: StudioReviewSummary["status"]): string {
  if (status === "approved") return "border-good/35 bg-good/10 text-good";
  if (status === "changes-requested") return "border-bad/35 bg-bad/10 text-bad";
  if (status === "open") return "border-warn/35 bg-warn/10 text-warn";
  return "border-line bg-raised text-fg-2";
}

function reviewStatusLabel(status: StudioReviewSummary["status"]): string {
  switch (status) {
    case "open": return "검수 중";
    case "changes-requested": return "수정 요청";
    case "approved": return "승인";
    case "rejected": return "반려";
    case "cancelled": return "취소";
  }
}

function attentionBadgeClass(
  level: ReturnType<typeof productionManuscriptAttention>["level"],
): string {
  if (level === "danger") return "border-bad/35 bg-bad/10 text-bad";
  if (level === "warning") return "border-warn/35 bg-warn/10 text-warn";
  if (level === "success") return "border-good/35 bg-good/10 text-good";
  return "border-line bg-raised text-fg-2";
}

function Badge({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-[0.6875rem] font-bold", className)}>{children}</span>;
}

function Metric({ label, value, detail, tone = "neutral" }: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const tones = {
    neutral: "border-line bg-panel",
    success: "border-good/30 bg-good/10",
    warning: "border-warn/30 bg-warn/10",
    danger: "border-bad/30 bg-bad/10",
  } as const;
  return <div className={cn("rounded-2xl border p-4", tones[tone])}>
    <p className="text-[0.6875rem] font-bold text-fg-3">{label}</p>
    <p className="mt-1 text-2xl font-black text-fg">{value}</p>
    <p className="mt-1 text-xs text-fg-2">{detail}</p>
  </div>;
}

function ManuscriptWorkspaceSkeleton() {
  return <div
    className="space-y-4"
    role="status"
    aria-label="원고 운영 화면을 불러오는 중"
  >
    <section className="overflow-hidden rounded-3xl border border-line bg-card">
      <div className="animate-pulse border-b border-line p-5 motion-reduce:animate-none sm:p-6">
        <div className="h-5 w-28 rounded-full bg-raised" />
        <div className="mt-4 h-8 w-64 max-w-full rounded-xl bg-raised" />
        <div className="mt-3 h-4 w-[36rem] max-w-full rounded bg-raised" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => <div key={index} className="h-24 rounded-2xl border border-line bg-panel" />)}
        </div>
      </div>
      <div className="flex animate-pulse gap-2 overflow-hidden p-4 motion-reduce:animate-none">
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-10 w-28 shrink-0 rounded-xl bg-raised" />)}
      </div>
    </section>
    <section className="animate-pulse rounded-3xl border border-line bg-card p-4 motion-reduce:animate-none sm:p-6">
      <div className="h-6 w-40 rounded bg-raised" />
      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {[0, 1].map((index) => <div key={index} className="h-60 rounded-2xl border border-line bg-panel" />)}
      </div>
    </section>
    <span className="sr-only">ProjectGraph 원고·버전·검수 이력을 불러오고 있습니다.</span>
  </div>;
}

function reviewHref(
  data: LoadedManuscriptData,
  process: ProductionManuscriptProcess,
  review: StudioReviewSummary,
): string {
  const revision = process.revisions.find((candidate) => candidate.id === review.revisionId);
  if (!revision || revision.kind !== "review-snapshot") {
    const query = new URLSearchParams({ view: "versions", artifact: process.artifact.id });
    return `/studio/p/${encodeURIComponent(data.project.workId)}/review?${query.toString()}`;
  }
  const subject: StudioVirtualSpaceReviewSubject = {
    schemaVersion: 1,
    projectId: data.project.id,
    workId: data.project.workId,
    artifactId: process.artifact.id,
    reviewId: review.id,
    revisionId: revision.id,
    rootGraphHash: revision.rootGraphHash,
  };
  return studioVirtualSpaceReviewHref(subject);
}

function ProcessNavigator({ processes, selected, view, onSelect }: {
  readonly processes: readonly ProductionManuscriptProcess[];
  readonly selected: ProductionManuscriptProcess | null;
  readonly view: "versions" | "feedback" | "assistant";
  readonly onSelect: (process: ProductionManuscriptProcess, view: ManuscriptView) => void;
}) {
  if (!selected) return null;
  const index = processes.findIndex((process) => process.artifact.id === selected.artifact.id);
  const previous = index > 0 ? processes[index - 1] : null;
  const next = index >= 0 && index < processes.length - 1 ? processes[index + 1] : null;
  const attention = productionManuscriptAttention(selected);
  return <section className="rounded-2xl border border-line bg-card p-3 sm:p-4" aria-label="선택한 원고 공정">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-black text-fg">{selected.artifact.title}</p>
          <Badge className={attentionBadgeClass(attention.level)}>{attention.label}</Badge>
        </div>
        <p className="mt-1 text-xs text-fg-2">
          {selected.artifact.scope.episodeId ?? "프로젝트 공통"} · {selected.label}
          {` · ${selected.revisions.length}개 revision`}
        </p>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          aria-label="이전 공정"
          disabled={!previous}
          onClick={() => previous && onSelect(previous, view)}
          className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-line bg-panel text-fg-2 hover:bg-raised disabled:opacity-40"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <label className="min-w-0 flex-1 lg:flex-none">
          <span className="sr-only">원고 공정 선택</span>
          <select
            value={selected.artifact.id}
            onChange={(event) => {
              const process = processes.find((candidate) => candidate.artifact.id === event.target.value);
              if (process) onSelect(process, view);
            }}
            className="min-h-10 max-w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
          >
            {processes.map((process) => <option key={process.artifact.id} value={process.artifact.id}>
              {process.artifact.title}
            </option>)}
          </select>
        </label>
        <button
          type="button"
          aria-label="다음 공정"
          disabled={!next}
          onClick={() => next && onSelect(next, view)}
          className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-line bg-panel text-fg-2 hover:bg-raised disabled:opacity-40"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  </section>;
}

function CapabilityGrid({ aggregate, setView }: {
  readonly aggregate: ProductionProjectAggregate;
  readonly setView: (view: ManuscriptView) => void;
}) {
  const hrefFor = (destination: (typeof CAPABILITIES)[number]["destination"]): string | null => {
    if (destination === "workspace") return "/production/workspaces";
    if (destination === "production") return `/studio/p/${encodeURIComponent(aggregate.workId)}/production?view=documents`;
    return null;
  };
  return <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="manuscript-capabilities-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">CREATIVE OPERATIONS</p>
        <h2 id="manuscript-capabilities-title" className="mt-2 text-xl font-black text-fg">툰스튜디오에 통합된 제작 기능</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">별도 원고 복사본을 만들지 않고 Production과 Studio의 동일 프로젝트·revision·권한을 사용합니다.</p>
      </div>
      <Badge className="border-good/35 bg-good/10 text-good"><CheckCircle2 className="mr-1 size-3.5" aria-hidden="true" />통합 운영</Badge>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {CAPABILITIES.map((capability) => {
        const Icon = capability.icon;
        const content = <>
          <span className="flex size-9 items-center justify-center rounded-xl border border-line bg-raised text-accent"><Icon className="size-4" aria-hidden="true" /></span>
          <span className="mt-3 block text-sm font-black text-fg">{capability.title}</span>
          <span className="mt-1 block text-xs leading-5 text-fg-2">{capability.description}</span>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">열기 <ArrowRight className="size-3.5" aria-hidden="true" /></span>
        </>;
        if (capability.destination === "workspace" || capability.destination === "production") {
          return <Link key={capability.title} to={hrefFor(capability.destination)!} className="rounded-2xl border border-line bg-panel p-4 transition hover:border-accent/40 hover:bg-raised">{content}</Link>;
        }
        const view: ManuscriptView = capability.destination;
        return <button key={capability.title} type="button" onClick={() => setView(view)} className="rounded-2xl border border-line bg-panel p-4 text-left transition hover:border-accent/40 hover:bg-raised">{content}</button>;
      })}
    </div>
  </section>;
}

function DemoWorkspace({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const [view, setView] = useState<ManuscriptView>("processes");
  return <div className="space-y-4">
    <section className="rounded-3xl border border-accent/30 bg-accent-soft/20 p-5">
      <div className="flex items-start gap-3"><Eye className="mt-0.5 size-5 text-accent" aria-hidden="true" /><div><h2 className="font-black text-fg">기능 미리보기 프로젝트</h2><p className="mt-1 text-sm leading-6 text-fg-2">실제 원고 revision과 검수 권한을 임의로 만들지 않습니다. 내 프로젝트에서 열면 아래 기능이 동일 ID로 연결됩니다.</p></div></div>
    </section>
    <CapabilityGrid aggregate={aggregate} setView={setView} />
    <div className="rounded-2xl border border-line bg-card p-4 text-xs text-fg-2">현재 선택: {VIEW_ITEMS.find((item) => item.id === view)?.label}</div>
  </div>;
}

export function ProductionManuscriptWorkspace({ aggregate, canEdit, isDemo }: ProductionManuscriptWorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<LoadedManuscriptData | null>(null);
  const [loading, setLoading] = useState(!isDemo);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const generation = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const patchSearch = useCallback((patch: Readonly<Record<string, string | null>>) => {
    setCopyStatus("idle");
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const view = isManuscriptView(searchParams.get("manuscriptView"))
    ? searchParams.get("manuscriptView") as ManuscriptView
    : "processes";
  const filter: ProductionManuscriptAttentionFilter = isProductionManuscriptFilter(searchParams.get("manuscriptFilter"))
    ? searchParams.get("manuscriptFilter") as ProductionManuscriptAttentionFilter
    : "all";
  const sort: ProductionManuscriptSort = isProductionManuscriptSort(searchParams.get("manuscriptSort"))
    ? searchParams.get("manuscriptSort") as ProductionManuscriptSort
    : "attention";
  const layout: ProductionManuscriptLayout = isProductionManuscriptLayout(searchParams.get("manuscriptLayout"))
    ? searchParams.get("manuscriptLayout") as ProductionManuscriptLayout
    : "cards";
  const query = (searchParams.get("manuscriptQuery") ?? "").slice(0, 120);
  const setView = useCallback((next: ManuscriptView) => patchSearch({ manuscriptView: next }), [patchSearch]);
  const setFilter = useCallback((next: ProductionManuscriptAttentionFilter) => {
    patchSearch({ manuscriptFilter: next === "all" ? null : next });
  }, [patchSearch]);
  const setSort = useCallback((next: ProductionManuscriptSort) => {
    patchSearch({ manuscriptSort: next === "attention" ? null : next });
  }, [patchSearch]);
  const setLayout = useCallback((next: ProductionManuscriptLayout) => {
    patchSearch({ manuscriptLayout: next === "cards" ? null : next });
  }, [patchSearch]);
  const setQuery = useCallback((next: string) => {
    patchSearch({ manuscriptQuery: next ? next.slice(0, 120) : null });
  }, [patchSearch]);

  const load = useCallback(async () => {
    if (isDemo) return;
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setMissing(false);
    try {
      const project = await getStudioProjectByWork(aggregate.workId);
      const pairs: Array<{
        readonly artifactId: string;
        readonly revisions: readonly StudioRevisionRecord[];
        readonly reviews: readonly StudioReviewSummary[];
      }> = [];
      const requestBatchSize = 6;
      for (let offset = 0; offset < project.artifacts.length; offset += requestBatchSize) {
        const batch = await Promise.all(project.artifacts.slice(offset, offset + requestBatchSize).map(async (artifact) => {
          const [revisions, reviews] = await Promise.all([
            listStudioArtifactRevisions(artifact.id),
            listStudioReviews(artifact.id),
          ]);
          return { artifactId: artifact.id, revisions, reviews } as const;
        }));
        pairs.push(...batch);
      }
      if (current !== generation.current) return;
      setData({
        project,
        revisionsByArtifact: Object.fromEntries(pairs.map((entry) => [entry.artifactId, entry.revisions])),
        reviewsByArtifact: Object.fromEntries(pairs.map((entry) => [entry.artifactId, entry.reviews])),
      });
    } catch (cause) {
      if (current !== generation.current) return;
      if (httpStatus(cause) === 404) {
        setMissing(true);
        setData(null);
      } else {
        setError(await getApiErrorMessage(cause, "원고 버전과 검수 데이터를 불러오지 못했습니다."));
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [aggregate.workId, isDemo]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const episodeIds = useMemo(() => aggregate.episodes
    .filter((episode) => episode.state !== "cancelled")
    .map((episode) => episode.episodeId), [aggregate.episodes]);
  const requestedEpisode = searchParams.get("episode");
  const episodeId = requestedEpisode && episodeIds.includes(requestedEpisode) ? requestedEpisode : null;

  const processes = useMemo(() => data ? buildProductionManuscriptProcesses({
    project: data.project,
    revisionsByArtifact: data.revisionsByArtifact,
    reviewsByArtifact: data.reviewsByArtifact,
    episodeId,
  }) : [], [data, episodeId]);
  const metrics = useMemo(() => productionManuscriptMetrics(processes), [processes]);
  const activities = useMemo(() => buildProductionManuscriptActivity(processes), [processes]);
  const visibleProcesses = useMemo(() => queryProductionManuscriptProcesses(processes, {
    query,
    filter,
    sort,
  }), [filter, processes, query, sort]);
  const priorityProcesses = useMemo(() => queryProductionManuscriptProcesses(processes, {
    query: "",
    filter: "all",
    sort: "attention",
  }), [processes]);
  const requestedArtifact = searchParams.get("artifact");
  const selectedProcess = processes.find((process) => process.artifact.id === requestedArtifact)
    ?? priorityProcesses[0]
    ?? null;
  const browserSelectedProcess = visibleProcesses.find((process) => process.artifact.id === requestedArtifact)
    ?? visibleProcesses[0]
    ?? null;
  const priorityProcess = priorityProcesses[0] ?? null;
  const priorityAttention = priorityProcess ? productionManuscriptAttention(priorityProcess) : null;

  const selectProcess = useCallback((process: ProductionManuscriptProcess, nextView?: ManuscriptView) => {
    patchSearch({ artifact: process.artifact.id, manuscriptView: nextView ?? view });
  }, [patchSearch, view]);
  const resetBrowser = useCallback(() => {
    patchSearch({ manuscriptQuery: null, manuscriptFilter: null });
  }, [patchSearch]);
  const copyCurrentView = useCallback(async () => {
    if (typeof window === "undefined") return;
    setCopyStatus(await copyPlainText(window.location.href) ? "copied" : "error");
  }, []);
  const episodeIndex = episodeId ? episodeIds.indexOf(episodeId) : -1;
  const previousEpisodeId = episodeIndex > 0 ? episodeIds[episodeIndex - 1] : null;
  const nextEpisodeId = episodeIndex < 0
    ? episodeIds[0] ?? null
    : episodeIndex < episodeIds.length - 1
      ? episodeIds[episodeIndex + 1]
      : null;
  const chooseEpisode = useCallback((nextEpisodeId: string | null) => {
    patchSearch({ episode: nextEpisodeId, artifact: null });
  }, [patchSearch]);

  useEffect(() => {
    if (copyStatus === "idle") return undefined;
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 2_400);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  useEffect(() => {
    if (requestedEpisode && !episodeIds.includes(requestedEpisode)) {
      patchSearch({ episode: null, artifact: null });
    }
  }, [episodeIds, patchSearch, requestedEpisode]);

  useEffect(() => {
    if (!data || !requestedArtifact) return;
    if (!processes.some((process) => process.artifact.id === requestedArtifact)) {
      patchSearch({ artifact: null });
    }
  }, [data, patchSearch, processes, requestedArtifact]);

  useEffect(() => {
    if (view !== "processes" || !browserSelectedProcess || typeof window === "undefined") return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(
        "manuscript-process-" + browserSelectedProcess.artifact.id,
      );
      if (!target || typeof target.scrollIntoView !== "function") return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      target.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [browserSelectedProcess, view]);

  useEffect(() => {
    if (isDemo || typeof window === "undefined") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || blocksManuscriptShortcut(event.target)
        || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        setShortcutsOpen(false);
        return;
      }
      if (event.repeat && (event.key === "?" || /^[1-6]$/u.test(event.key)
        || event.key.toLowerCase() === "g")) return;
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((current) => !current);
        return;
      }
      if (/^[1-6]$/u.test(event.key)) {
        event.preventDefault();
        setView(VIEW_ITEMS[Number(event.key) - 1].id);
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        setView("processes");
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }
      if (event.key.toLowerCase() === "g" && view === "processes") {
        event.preventDefault();
        setLayout(layout === "cards" ? "matrix" : "cards");
        return;
      }
      if ((event.key.toLowerCase() === "j" || event.key.toLowerCase() === "k")
        && view === "processes" && visibleProcesses.length > 0) {
        event.preventDefault();
        const process = nextProductionManuscriptProcess(
          visibleProcesses,
          browserSelectedProcess?.artifact.id ?? null,
          event.key.toLowerCase() === "j" ? 1 : -1,
        );
        if (process) selectProcess(process, "processes");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [browserSelectedProcess?.artifact.id, isDemo, layout, selectProcess, setLayout, setView, view, visibleProcesses]);

  if (isDemo) return <DemoWorkspace aggregate={aggregate} />;

  if (loading && !data) return <ManuscriptWorkspaceSkeleton />;

  if (missing) return <div className="space-y-4">
    <section className="rounded-3xl border border-warn/35 bg-warn/10 p-5">
      <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 text-warn" aria-hidden="true" /><div className="min-w-0 flex-1"><h2 className="font-black text-fg">Studio 프로젝트 연결이 필요합니다</h2><p className="mt-1 text-sm leading-6 text-fg-2">원고 파일을 Production에 복제하지 않습니다. Studio에서 이 작품을 한 번 저장하면 공정별 revision과 검수 이력이 이 화면에 연결됩니다.</p><Link to={`/studio/work/${encodeURIComponent(aggregate.workId)}/canvas`} className={cn(buttonClass({ size: "sm" }), "mt-3")}><UploadCloud className="size-4" aria-hidden="true" />Studio에서 원고 저장</Link></div></div>
    </section>
    <CapabilityGrid aggregate={aggregate} setView={setView} />
  </div>;

  if (error || !data) return <section className="rounded-3xl border border-bad/35 bg-bad/10 p-5" role="alert"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 text-bad" aria-hidden="true" /><div><h2 className="font-black text-fg">원고 운영 화면을 열 수 없습니다</h2><p className="mt-1 text-sm text-fg-2">{error ?? "프로젝트 데이터가 없습니다."}</p><button type="button" onClick={() => void load()} className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-3")}><RefreshCcw className="size-4" aria-hidden="true" />다시 불러오기</button></div></div></section>;

  const projectHref = `/studio/p/${encodeURIComponent(data.project.workId)}`;
  const editorHref = `/studio/work/${encodeURIComponent(data.project.workId)}/canvas`;
  const canEditProject = canEdit && data.project.access.edit;

  return <div
    className="space-y-4"
    data-production-manuscript-workspace=""
    aria-busy={loading || undefined}
  >
    <section
      className="overflow-hidden rounded-3xl border border-line bg-card"
      aria-labelledby="manuscript-workspace-title"
    >
      <div className="border-b border-line bg-gradient-to-br from-accent-soft/35 via-card to-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Badge className="border-accent/35 bg-accent-soft text-accent"><BookOpenText className="mr-1 size-3.5" aria-hidden="true" />원고 운영</Badge><Badge className="border-line bg-panel text-fg-2"><ShieldCheck className="mr-1 size-3.5" aria-hidden="true" />{accessLabel(data.project)}</Badge>{loading ? <Badge className="border-line bg-panel text-fg-3"><LoaderCircle className="mr-1 size-3.5 animate-spin" aria-hidden="true" />동기화 중</Badge> : null}</div>
            <h2 id="manuscript-workspace-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">공정별 원고·버전·피드백</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-fg-2">회차의 대본부터 게시본까지 동일 ProjectGraph revision으로 추적합니다. 최종본, 비교, 피드백, 공유와 내보내기가 서로 다른 복사본을 만들지 않습니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyCurrentView()}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              {copyStatus === "copied"
                ? <Check className="size-4 text-good" aria-hidden="true" />
                : <Copy className="size-4" aria-hidden="true" />}
              {copyStatus === "copied" ? "화면 링크 복사됨" : copyStatus === "error" ? "복사 실패" : "현재 화면 링크 복사"}
            </button>
            <button
              type="button"
              aria-expanded={shortcutsOpen}
              aria-controls="manuscript-shortcuts"
              onClick={() => setShortcutsOpen((current) => !current)}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              <Keyboard className="size-4" aria-hidden="true" /> 단축키
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              <RefreshCcw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" /> 새로고침
            </button>
            <Link to={`${projectHref}/overview`} className={buttonClass({ variant: "outline", size: "sm" })}>
              <Link2 className="size-4" aria-hidden="true" /> Studio 프로젝트
            </Link>
            {canEditProject ? <Link to={editorHref} className={buttonClass({ size: "sm" })}>
              <UploadCloud className="size-4" aria-hidden="true" /> 원고 작업
            </Link> : null}
            <span className="sr-only" role="status" aria-live="polite">
              {copyStatus === "copied"
                ? "현재 원고 운영 화면 링크를 복사했습니다."
                : copyStatus === "error"
                  ? "현재 화면 링크를 복사하지 못했습니다."
                  : ""}
            </span>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="최종본 준비"
            value={`${metrics.approvedProcessCount}/${metrics.processCount || 0}`}
            detail={`전체 ${metrics.processCount}개 공정 · 텍스트 ${metrics.textProcessCount}`}
            tone={metrics.approvedProcessCount === metrics.processCount && metrics.processCount > 0 ? "success" : "neutral"}
          />
          <Metric label="버전" value={String(metrics.versionCount)} detail="덮어쓰지 않는 revision" />
          <Metric
            label="진행 검수"
            value={String(metrics.openReviewCount)}
            detail="열린 검수본"
            tone={metrics.openReviewCount > 0 ? "warning" : "success"}
          />
          <Metric
            label="필수 수정"
            value={String(metrics.openRequiredFeedbackCount)}
            detail="승인 전 해결 필요"
            tone={metrics.openRequiredFeedbackCount > 0 ? "danger" : "success"}
          />
        </div>
        {priorityProcess && priorityAttention ? <div className={cn(
          "mt-4 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between",
          priorityAttention.level === "danger"
            ? "border-bad/35 bg-bad/10"
            : priorityAttention.level === "warning"
              ? "border-warn/35 bg-warn/10"
              : priorityAttention.level === "success"
                ? "border-good/35 bg-good/10"
                : "border-line bg-panel",
        )} role="status">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-fg-3">지금 확인할 항목</p>
            <p className="mt-1 truncate text-sm font-black text-fg">{priorityProcess.artifact.title}</p>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {priorityAttention.kind === "required-feedback"
                ? `${priorityProcess.openRequiredFeedbackCount}개 필수 수정을 해결해야 승인할 수 있습니다.`
                : priorityAttention.kind === "in-review"
                  ? `${priorityProcess.openReviewCount}건의 검수 결과를 확인하세요.`
                  : priorityAttention.kind === "missing-final"
                    ? "현재 작업본은 있지만 승인·게시 기준 최종본이 지정되지 않았습니다."
                    : "현재 범위에서 가장 최근에 확정된 최종본입니다."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => selectProcess(priorityProcess, priorityAttention.recommendedView)}
            className={buttonClass({ variant: priorityAttention.level === "danger" ? "solid" : "outline", size: "sm" })}
          >
            {priorityAttention.actionLabel} <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div> : null}
        {shortcutsOpen ? <div id="manuscript-shortcuts" className="mt-4 rounded-2xl border border-line bg-panel p-4" role="region" aria-label="원고 운영 단축키">
          <div className="grid gap-2 text-xs text-fg-2 sm:grid-cols-2 lg:grid-cols-3">
            <p><kbd className="mr-2 rounded border border-line bg-card px-1.5 py-0.5 font-mono text-fg">1–6</kbd>보기 탭 전환</p>
            <p><kbd className="mr-2 rounded border border-line bg-card px-1.5 py-0.5 font-mono text-fg">/</kbd>원고 검색</p>
            <p><kbd className="mr-2 rounded border border-line bg-card px-1.5 py-0.5 font-mono text-fg">J / K</kbd>다음·이전 공정</p>
            <p><kbd className="mr-2 rounded border border-line bg-card px-1.5 py-0.5 font-mono text-fg">G</kbd>카드·한눈 보기</p>
            <p><kbd className="mr-2 rounded border border-line bg-card px-1.5 py-0.5 font-mono text-fg">?</kbd>도움말 열기</p>
            <p><kbd className="mr-2 rounded border border-line bg-card px-1.5 py-0.5 font-mono text-fg">Esc</kbd>도움말 닫기</p>
          </div>
        </div> : null}
      </div>

      <div className="sticky top-0 z-20 flex flex-col gap-3 border-t border-line bg-card/95 p-3 backdrop-blur sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="원고 운영 보기"
        >
          {VIEW_ITEMS.map(({ id, label, icon: Icon }, index) => <button
            key={id}
            id={`manuscript-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={view === id}
            aria-controls={`manuscript-panel-${id}`}
            aria-keyshortcuts={String(index + 1)}
            tabIndex={view === id ? 0 : -1}
            onClick={() => setView(id)}
            onKeyDown={(event) => handleViewTabKey(event, view, setView)}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              view === id ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />{label}
          </button>)}
        </div>
        <div className="flex items-center gap-1 self-start lg:self-auto">
          <button
            type="button"
            aria-label="이전 회차"
            disabled={!previousEpisodeId}
            onClick={() => chooseEpisode(previousEpisodeId)}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-line bg-panel text-fg-2 hover:bg-raised disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs font-bold text-fg-2">
            회차
            <select
              value={episodeId ?? "all"}
              onChange={(event) => chooseEpisode(event.target.value === "all" ? null : event.target.value)}
              className="max-w-[12rem] bg-transparent text-fg outline-none"
            >
              <option value="all">전체 회차</option>
              {episodeIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <button
            type="button"
            aria-label="다음 회차"
            disabled={!nextEpisodeId}
            onClick={() => chooseEpisode(nextEpisodeId)}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-line bg-panel text-fg-2 hover:bg-raised disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>

    {view === "processes" ? <div
      id="manuscript-panel-processes"
      role="tabpanel"
      aria-labelledby="manuscript-tab-processes"
    >
      {processes.length > 0 ? <ProductionManuscriptProcessBrowser
        processes={processes}
        visibleProcesses={visibleProcesses}
        selectedProcessId={browserSelectedProcess?.artifact.id ?? null}
        query={query}
        filter={filter}
        sort={sort}
        layout={layout}
        searchRef={searchInputRef}
        projectHref={projectHref}
        editorHref={editorHref}
        onQueryChange={setQuery}
        onFilterChange={setFilter}
        onSortChange={setSort}
        onLayoutChange={setLayout}
        onOpenProcess={(process, nextView) => selectProcess(process, nextView)}
        onReset={resetBrowser}
      /> : <section className="rounded-3xl border border-line bg-card p-8 text-center">
        <Layers3 className="mx-auto size-8 text-fg-3" aria-hidden="true" />
        <h2 className="mt-3 font-black text-fg">선택한 회차의 공정 원고가 없습니다</h2>
        <p className="mt-1 text-sm text-fg-2">
          Studio 프로젝트에서 대본·콘티·작화 문서를 만들면 같은 revision으로 자동 연결됩니다.
        </p>
        <Link to={`${projectHref}/production?view=documents`} className={buttonClass({ variant: "outline", size: "sm", className: "mt-4" })}>
          공정·문서 관리 <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>}
    </div> : null}

    {view === "versions" ? <div
      id="manuscript-panel-versions"
      role="tabpanel"
      aria-labelledby="manuscript-tab-versions"
      className="space-y-4"
    >
      <ProcessNavigator processes={processes} selected={selectedProcess} view="versions" onSelect={selectProcess} />
      <StudioProjectVersionStackPanel projectId={data.project.workId} locale="ko" />
    </div> : null}

    {view === "feedback" ? <div
      id="manuscript-panel-feedback"
      role="tabpanel"
      aria-labelledby="manuscript-tab-feedback"
      className="space-y-4"
    >
      <ProcessNavigator processes={processes} selected={selectedProcess} view="feedback" onSelect={selectProcess} />
      <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="manuscript-feedback-title">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 id="manuscript-feedback-title" className="text-xl font-black text-fg">고정 원고 피드백</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
              피드백은 최신 편집본이 아니라 선택한 검수 snapshot의 페이지·컷·텍스트 위치에 고정됩니다. 필수 항목이 열려 있으면 승인을 차단합니다.
            </p>
          </div>
          {canEditProject ? <Link to={editorHref} className={buttonClass({ size: "sm" })}>
            <UploadCloud className="size-4" aria-hidden="true" /> 검수본 만들기
          </Link> : null}
        </div>
      <div className="mt-5 space-y-3">
        {selectedProcess?.reviews.map((review) => <article key={review.id} className="rounded-2xl border border-line bg-panel p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge className={reviewTone(review.status)}>{reviewStatusLabel(review.status)}</Badge>{review.openRequiredCommentCount > 0 ? <Badge className="border-bad/35 bg-bad/10 text-bad"><LockKeyhole className="mr-1 size-3.5" aria-hidden="true" />필수 {review.openRequiredCommentCount}</Badge> : null}</div><h3 className="mt-2 font-black text-fg">{review.title}</h3><p className="mt-1 text-xs text-fg-3">revision {review.revisionId} · 업데이트 {formatDate(review.updatedAt)} · 검토자 {review.reviewerIds.length}명</p></div><Link to={reviewHref(data, selectedProcess, review)} className={buttonClass({ variant: "outline", size: "sm" })}><Eye className="size-4" aria-hidden="true" />고정 검수본 열기</Link></div></article>)}
        {selectedProcess && selectedProcess.reviews.length === 0 ? <div className="rounded-2xl border border-dashed border-line p-8 text-center"><MessageSquare className="mx-auto size-7 text-fg-3" aria-hidden="true" /><p className="mt-2 font-black text-fg">아직 검수본이 없습니다</p><p className="mt-1 text-sm text-fg-2">Studio에서 저장된 원고를 고정 검수본으로 캡처하면 위치 피드백·댓글·비교·승인을 사용할 수 있습니다.</p></div> : null}
      </div>
      </section>
    </div> : null}

    {view === "delivery" ? <div
      id="manuscript-panel-delivery"
      role="tabpanel"
      aria-labelledby="manuscript-tab-delivery"
      className="space-y-4"
    >
      <section className="rounded-3xl border border-line bg-card p-4 sm:p-6"><div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><div><p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">SHARE & DELIVERY</p><h2 className="mt-2 text-xl font-black text-fg">검수본 공유와 공식 전달</h2><p className="mt-2 text-sm leading-6 text-fg-2">공유는 현재 head가 아니라 고정된 검수 snapshot을 대상으로 하며, 링크 만료·폐기와 접근 권한을 매번 다시 확인합니다. 승인본은 원본 이미지·체크섬·manifest를 ZIP으로 전달할 수 있습니다.</p><div className="mt-4 flex flex-wrap gap-2"><Link to={`${projectHref}/review?view=versions`} className={buttonClass({ variant: "outline", size: "sm" })}><Link2 className="size-4" aria-hidden="true" />검수·공유 관리</Link><Link to={`${projectHref}/space`} className={buttonClass({ variant: "outline", size: "sm" })}><MonitorSmartphone className="size-4" aria-hidden="true" />협업 스튜디오 초대</Link><Link to={`${projectHref}/export`} className={buttonClass({ size: "sm" })}><Download className="size-4" aria-hidden="true" />내보내기 열기</Link></div></div><div className="rounded-2xl border border-line bg-panel p-4"><h3 className="text-sm font-black text-fg">공유 안전 경계</h3><ul className="mt-3 space-y-2 text-xs leading-5 text-fg-2"><li>• 공유 URL은 편집 권한을 부여하지 않습니다.</li><li>• 공유 후 원고를 수정해도 검수 snapshot은 바뀌지 않습니다.</li><li>• 폐기·만료·권한 변경은 다음 열기부터 즉시 반영됩니다.</li><li>• 공식 전달은 게시나 법적 권리 인증을 대신하지 않습니다.</li></ul></div></div></section>
      <StudioExportPanel projectId={data.project.workId} locale="ko" />
    </div> : null}

    {view === "assistant" ? <div
      id="manuscript-panel-assistant"
      role="tabpanel"
      aria-labelledby="manuscript-tab-assistant"
      className="space-y-4"
    >
      <ProcessNavigator processes={processes} selected={selectedProcess} view="assistant" onSelect={selectProcess} />
      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 text-accent" aria-hidden="true" />
          <div>
            <h2 className="font-black text-fg">원고 컨텍스트를 유지하는 AI 보조</h2>
            <p className="mt-1 text-sm leading-6 text-fg-2">
              선택한 공정의 요청을 Studio 편집기로 넘깁니다. 실행 전에 공급 방식·외부 전송·예상 비용을 확인하며 결과는 원본 대신 새 작업으로 적용합니다.
            </p>
          </div>
        </div>
      </section>
      <StudioProjectAssistantPanel
        projectId={data.project.workId}
        section={selectedProcess?.processType === "text" ? "story" : "review"}
        locale="ko"
      />
    </div> : null}

    {view === "activity" ? <div
      id="manuscript-panel-activity"
      role="tabpanel"
      aria-labelledby="manuscript-tab-activity"
    >
      <section className="rounded-3xl border border-line bg-card p-4 sm:p-6" aria-labelledby="manuscript-activity-title"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="manuscript-activity-title" className="text-xl font-black text-fg">원고 활동</h2><p className="mt-1 text-sm text-fg-2">버전 생성과 검수 상태 변경을 ProjectGraph 시간순으로 표시합니다.</p></div><Badge className="border-line bg-panel text-fg-2"><Clock3 className="mr-1 size-3.5" aria-hidden="true" />최근 {activities.length}건</Badge></div><ol className="mt-5 space-y-2">{activities.map((activity) => <li key={activity.id} className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"><span className="flex size-10 items-center justify-center rounded-xl border border-line bg-card text-accent">{activity.kind === "revision" ? <History className="size-4" aria-hidden="true" /> : <MessageSquare className="size-4" aria-hidden="true" />}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-fg">{activity.title}</p><Badge className="border-line bg-card text-fg-3">{activity.artifactTitle}</Badge></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-fg-2">{activity.detail}</p></div><time className="text-xs text-fg-3" dateTime={activity.occurredAt}>{formatDate(activity.occurredAt)}</time></li>)}{activities.length === 0 ? <li className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-fg-3">표시할 활동이 없습니다.</li> : null}</ol></section>
    </div> : null}
  </div>;
}
