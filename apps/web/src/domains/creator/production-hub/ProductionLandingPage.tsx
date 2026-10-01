import "../studio-shell/creator-workflow-surfaces.css";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  ClipboardCheck,
  CloudOff,
  GalleryVerticalEnd,
  Kanban,
  Layers3,
  LayoutDashboard,
  MessageSquareMore,
  Plus,
  RefreshCw,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  getProductionPersonalInbox,
  listProductionProjects,
  type ProductionPersonalInboxItem,
  type ProductionProjectSummary,
} from "./production-dashboard-api";
import { formatProductionDay } from "./production-format";
import { ProductionMetric, ProductionPill, ProductionSampleBadge, type ProductionTone } from "./production-ui";

import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { getApiErrorMessage } from "@/platform/api";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";

const SAMPLE_BASE = "/production/projects/sample-project";
const ART = "/brand/illustrated-20260928";

interface Copy {
  readonly ko: string;
  readonly en: string;
}

interface FlowStep {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly title: Copy;
  readonly copy: Copy;
  readonly href: string;
  readonly art: string;
}

/** 샘플 체험 순서: 개요 → 공정 보드 → 회차 룸(핀 코멘트) → 버전 비교·승인. */
const FLOW_STEPS: readonly FlowStep[] = [
  {
    id: "overview",
    icon: LayoutDashboard,
    title: { ko: "개요", en: "Overview" },
    copy: { ko: "진행률·마감 임박 회차·내 할 일을 한눈에", en: "Progress, deadlines and your tasks at a glance" },
    href: `${SAMPLE_BASE}/overview`,
    art: "materials",
  },
  {
    id: "board",
    icon: Kanban,
    title: { ko: "공정 보드", en: "Process board" },
    copy: { ko: "콘티·선화·채색 담당과 마감을 옮기며 관리", en: "Move storyboard, line art and color work" },
    href: `${SAMPLE_BASE}/production?boardLayout=process`,
    art: "storyboard",
  },
  {
    id: "room",
    icon: MessageSquareMore,
    title: { ko: "회차 룸", en: "Episode room" },
    copy: { ko: "원고 위에 핀을 꽂아 수정 요청을 남기기", en: "Pin feedback right on the page" },
    href: `${SAMPLE_BASE}/episodes/episode-12`,
    art: "canvas-noir",
  },
  {
    id: "approve",
    icon: BadgeCheck,
    title: { ko: "비교·승인", en: "Compare & approve" },
    copy: { ko: "선화와 채색을 슬라이더로 비교하고 승인", en: "Slide between versions, then approve" },
    href: `${SAMPLE_BASE}/episodes/episode-12?roomView=compare`,
    art: "project-crimson",
  },
];

interface ModuleCard {
  readonly icon: LucideIcon;
  readonly title: Copy;
  readonly copy: Copy;
  readonly tagline: string;
  readonly href: string;
}

const MODULES: readonly ModuleCard[] = [
  { icon: Kanban, title: { ko: "공정 보드", en: "Process board" }, copy: { ko: "담당·마감·상태와 동시 진행 한도", en: "Owners, due dates, status and WIP" }, tagline: "Move the Work", href: `${SAMPLE_BASE}/production` },
  { icon: MessageSquareMore, title: { ko: "회차 룸", en: "Episode room" }, copy: { ko: "원고 뷰어와 핀 코멘트", en: "Page viewer with pinned comments" }, tagline: "Feedback on the Page", href: `${SAMPLE_BASE}/episodes/episode-12` },
  { icon: Layers3, title: { ko: "원고·버전", en: "Manuscripts" }, copy: { ko: "최신본과 최종본을 나눠 관리", en: "Latest vs. final versions" }, tagline: "Every Version Kept", href: `${SAMPLE_BASE}/manuscripts` },
  { icon: ClipboardCheck, title: { ko: "검수·승인", en: "Review" }, copy: { ko: "역할별 승인과 게시 차단", en: "Role approvals that gate publishing" }, tagline: "Approve with Evidence", href: `${SAMPLE_BASE}/review` },
  { icon: Users, title: { ko: "사람·권한", en: "People & access" }, copy: { ko: "소유자·관리자·멤버·게스트", en: "Owner, admin, member, guest" }, tagline: "Right People, Right Access", href: "/team/people" },
  { icon: BriefcaseBusiness, title: { ko: "구인·의뢰", en: "Hiring" }, copy: { ko: "팀원 모집과 작업 의뢰", en: "Recruit and commission work" }, tagline: "Find Your Crew", href: "/collaborate" },
  { icon: GalleryVerticalEnd, title: { ko: "검수본 공개 전시", en: "Approved showcase" }, copy: { ko: "작가가 공개를 허락한 검수본", en: "Reviews creators chose to show" }, tagline: "Share Your Story", href: "/showcase/reviews" },
  { icon: LayoutDashboard, title: { ko: "샘플 프로젝트", en: "Sample project" }, copy: { ko: "로그인 없이 전체 흐름 체험", en: "Try the whole flow without signing in" }, tagline: "Try It Now", href: `${SAMPLE_BASE}/overview` },
];

const INBOX_BUCKETS: Readonly<Record<ProductionPersonalInboxItem["bucket"], { readonly label: Copy; readonly tone: ProductionTone }>> = {
  dueToday: { label: { ko: "오늘 제출", en: "Due today" }, tone: "danger" },
  inProgress: { label: { ko: "진행 중", en: "In progress" }, tone: "accent" },
  review: { label: { ko: "내 검수", en: "To review" }, tone: "warning" },
  ready: { label: { ko: "시작 가능", en: "Ready" }, tone: "success" },
  waitingInput: { label: { ko: "입력 대기", en: "Waiting for input" }, tone: "warning" },
  blockingOthers: { label: { ko: "다른 작업 차단", en: "Blocking others" }, tone: "danger" },
};

function artSources(name: string) {
  return {
    src: `${ART}/${name}-640.webp`,
    srcSet: `${ART}/${name}-320.webp 320w, ${ART}/${name}-640.webp 640w`,
  };
}

/** 히어로 오른쪽의 샘플 화면 예시: 선화·채색 비교와 핀 코멘트가 어떻게 보이는지 보여 주는 장식. */
function HeroPreview() {
  const bt = useBilingual("ProductionLandingPage");
  const noir = artSources("canvas-noir");
  const crimson = artSources("project-crimson");
  return (
    <figure className="relative mx-auto w-full max-w-md" aria-label={bt("샘플 회차 룸 화면 예시", "Example of a sample episode room")}>
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-accent/35 shadow-2xl">
        <img {...crimson} sizes="(min-width: 1024px) 28rem, 90vw" alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover" loading="eager" decoding="async" />
        <div className="absolute inset-y-0 left-0 w-1/2 overflow-hidden border-r-2 border-fg/80">
          <img {...noir} sizes="(min-width: 1024px) 28rem, 90vw" alt="" aria-hidden="true" className="absolute inset-y-0 left-0 h-full w-[200%] max-w-none object-cover" loading="eager" decoding="async" />
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-canvas/80 px-2.5 py-1 text-[0.6875rem] font-bold text-fg">{bt("선화 v2", "Line art v2")}</span>
        <span className="absolute right-3 top-3 rounded-full bg-canvas/80 px-2.5 py-1 text-[0.6875rem] font-bold text-fg">{bt("채색 v1", "Color v1")}</span>
        <span aria-hidden="true" className="absolute left-[58%] top-[64%] grid size-8 -translate-x-1/2 -translate-y-full place-items-center rounded-full rounded-bl-sm border-2 border-fg/90 bg-bad text-xs font-black text-canvas">1</span>
        <span aria-hidden="true" className="absolute left-[22%] top-[30%] grid size-8 -translate-x-1/2 -translate-y-full place-items-center rounded-full rounded-bl-sm border-2 border-fg/90 bg-warn text-xs font-black text-canvas">2</span>
      </div>
      <figcaption className="absolute -bottom-5 left-4 right-4 rounded-2xl border border-line bg-panel/95 p-3 shadow-xl backdrop-blur">
        <p className="flex items-center gap-2 text-xs font-bold text-fg">
          <ProductionSampleBadge label={bt("샘플 화면", "Sample")} />
          {bt("12화 · 돌아온 봉투", "Ep. 12 · The Returned Envelope")}
        </p>
        <p className="mt-1 text-[0.6875rem] leading-5 text-fg-2">
          {bt("필수 수정 핀 1개가 남아 있어 '시각 연출' 승인이 잠겨 있어요.", "One required-fix pin keeps the visual approval locked.")}
        </p>
      </figcaption>
    </figure>
  );
}

function FlowCards() {
  const bt = useBilingual("ProductionLandingPage");
  return (
    <section aria-labelledby="production-flow-title" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="production-flow-title" className="text-xl font-black tracking-tight text-fg">{bt("샘플로 따라가는 협업 흐름", "Follow the collaboration flow")}</h2>
          <p className="mt-1 text-sm text-fg-2">{bt("네 단계를 누르면 실제 화면이 열립니다. 모든 사람·일정·원고는 예시입니다.", "Each step opens the real screen. All people, dates and pages are examples.")}</p>
        </div>
        <ProductionSampleBadge label={bt("예시 데이터", "Example data")} />
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {FLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const art = artSources(step.art);
          return (
            <li key={step.id}>
              <Link
                to={step.href}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card outline-none transition-colors hover:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
              >
                <span className="relative block aspect-[16/9] overflow-hidden">
                  <img {...art} sizes="(min-width: 1280px) 20rem, (min-width: 640px) 45vw, 90vw" alt="" aria-hidden="true" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
                  <span className="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-accent text-sm font-black text-on-accent shadow-lg">{index + 1}</span>
                </span>
                <span className="flex flex-1 flex-col p-4">
                  <span className="flex items-center gap-2 text-sm font-black text-fg group-hover:text-accent">
                    <Icon className="size-4 text-accent" aria-hidden="true" />
                    {bt(step.title.ko, step.title.en)}
                  </span>
                  <span className="mt-1 text-xs leading-5 text-fg-2">{bt(step.copy.ko, step.copy.en)}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-bold text-accent">
                    {bt("열어 보기", "Open")}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ModuleGrid() {
  const bt = useBilingual("ProductionLandingPage");
  return (
    <section aria-labelledby="production-modules-title" className="mt-10">
      <h2 id="production-modules-title" className="text-xl font-black tracking-tight text-fg">{bt("협업에 필요한 화면", "Everything for collaboration")}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map((module) => {
          const Icon = module.icon;
          return (
            <li key={module.href + module.title.ko}>
              <Link
                to={module.href}
                className="group flex h-full min-h-28 flex-col rounded-2xl border border-line bg-gradient-to-br from-card to-panel p-4 outline-none transition-colors hover:border-accent/45 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
              >
                <span className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent"><Icon className="size-4" aria-hidden="true" /></span>
                  <strong className="text-sm text-fg group-hover:text-accent">{bt(module.title.ko, module.title.en)}</strong>
                </span>
                <span className="mt-2 text-xs leading-5 text-fg-2">{bt(module.copy.ko, module.copy.en)}</span>
                <span className="mt-auto pt-2 text-[0.6875rem] italic text-fg-3">{module.tagline}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PortfolioSection({
  projects,
  inboxItems,
  loading,
  error,
  onRetry,
}: {
  readonly projects: readonly ProductionProjectSummary[];
  readonly inboxItems: readonly ProductionPersonalInboxItem[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry: () => void;
}) {
  const bt = useBilingual("ProductionLandingPage");
  const sum = (pick: (project: ProductionProjectSummary) => number) => projects.reduce((total, project) => total + pick(project), 0);
  return (
    <section className="creator-workflow-panel mt-8 rounded-2xl border border-line bg-card p-4 sm:p-5" aria-labelledby="production-portfolio-title">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="production-portfolio-title" className="text-base font-black text-fg">{bt("내 제작 포트폴리오", "My production portfolio")}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-2">{bt("여러 작품의 다음 연재, 막힘·검수·배정 공백을 같은 기준으로 비교합니다. 위험한 작품이 먼저 보입니다.", "Compare upcoming releases, blockers, reviews and unassigned work across projects. Riskier projects come first.")}</p>
        </div>
        <Link className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })} to="/studio/new"><Plus className="size-4" aria-hidden="true" />{bt("새 프로젝트 만들기", "New project")}</Link>
      </header>
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={bt("프로젝트 목록 불러오는 중", "Loading projects")} role="status">
          {[0, 1, 2].map((index) => <div key={index} className="h-44 animate-pulse rounded-2xl bg-raised motion-reduce:animate-none" />)}
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-bad/35 bg-bad/10 p-4">
          <p className="min-w-0 flex-1 text-sm text-fg">{error}</p>
          <button type="button" onClick={onRetry} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
            <RefreshCw size={13} aria-hidden="true" /> {bt("다시 불러오기", "Retry")}
          </button>
          <Link className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })} to={`${SAMPLE_BASE}/overview`}>{bt("그동안 샘플 보기", "Open the sample meanwhile")}</Link>
        </div>
      ) : projects.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ProductionMetric label={bt("운영 작품", "Projects")} value={String(projects.length)} detail={bt(`진행 회차 ${sum((project) => project.activeEpisodeCount)}개`, `${sum((project) => project.activeEpisodeCount)} active episodes`)} icon={LayoutDashboard} tone="accent" />
            <ProductionMetric label={bt("위험 작품", "At risk")} value={String(projects.filter((project) => project.healthScore < 64).length)} detail={bt(`기한 초과 ${sum((project) => project.overdueTaskCount)}건`, `${sum((project) => project.overdueTaskCount)} overdue`)} icon={AlertTriangle} tone={projects.some((project) => project.healthScore < 64) ? "danger" : "success"} />
            <ProductionMetric label={bt("완성 비축", "Ready buffer")} value={bt(`${sum((project) => project.readyBufferCount)}회`, `${sum((project) => project.readyBufferCount)}`)} detail={bt("게시 준비가 끝난 미공개 회차", "Finished, unreleased episodes")} icon={BadgeCheck} tone="success" />
            <ProductionMetric label={bt("검수 대기", "Waiting review")} value={String(sum((project) => project.reviewTaskCount))} detail={bt(`미배정 ${sum((project) => project.unassignedTaskCount)}건`, `${sum((project) => project.unassignedTaskCount)} unassigned`)} icon={ClipboardCheck} tone="warning" />
          </div>
          <div className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-fg">{bt("내 통합 작업함", "My inbox")}</h3>
                <p className="mt-1 text-xs text-fg-2">{bt("모든 작품에서 오늘 제출·진행·검수·입력 대기 업무를 우선순위 순으로 모았습니다.", "Due-today, in-progress, review and waiting work from every project, by priority.")}</p>
              </div>
              <ProductionPill tone="accent">{bt(`조치 ${inboxItems.length}건`, `${inboxItems.length} items`)}</ProductionPill>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {inboxItems.slice(0, 8).map((item) => {
                const bucket = INBOX_BUCKETS[item.bucket];
                return (
                  <Link
                    key={`${item.bucket}:${item.projectId}:${item.taskId}`}
                    to={`/production/projects/${encodeURIComponent(item.projectId)}/production?task=${encodeURIComponent(item.taskId)}`}
                    className="rounded-xl border border-line bg-card p-3 outline-none transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <ProductionPill tone={bucket.tone}>{bt(bucket.label.ko, bucket.label.en)}</ProductionPill>
                      <span className="text-[0.625rem] text-fg-3">{formatProductionDay(item.dueAt, bt("미정", "No date"))}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-black leading-5 text-fg">{item.taskTitle}</p>
                    <p className="mt-1 truncate text-[0.6875rem] text-fg-3">{item.projectTitle} · {item.processKey} · {item.estimateHours === null ? bt("예상 시간 미입력", "No estimate") : `${item.estimateHours}h`}</p>
                  </Link>
                );
              })}
              {inboxItems.length === 0 ? <div className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3 md:col-span-2 xl:col-span-4">{bt("현재 배정된 조치 업무가 없습니다.", "Nothing assigned to you right now.")}</div> : null}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const healthTone: ProductionTone = project.healthScore >= 82 ? "success" : project.healthScore >= 64 ? "warning" : "danger";
              return (
                <Link
                  key={project.projectId}
                  to={`/production/projects/${encodeURIComponent(project.projectId)}/overview`}
                  className="group rounded-2xl border border-line bg-panel p-4 outline-none transition-colors hover:border-accent/40 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-base font-black text-fg">{project.title}</p>
                    <ProductionPill tone={healthTone}>{bt(`안정도 ${project.healthScore}`, `Health ${project.healthScore}`)}</ProductionPill>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[0.6875rem]">
                    <div className="rounded-lg border border-line bg-card p-2"><p className="text-fg-3">{bt("진행 회차", "Active")}</p><p className="mt-1 font-black text-fg">{project.activeEpisodeCount}</p></div>
                    <div className="rounded-lg border border-line bg-card p-2"><p className="text-fg-3">{bt("막힘·지연", "Blocked")}</p><p className={cn("mt-1 font-black", project.blockedTaskCount + project.overdueTaskCount > 0 ? "text-bad" : "text-fg")}>{project.blockedTaskCount + project.overdueTaskCount}</p></div>
                    <div className="rounded-lg border border-line bg-card p-2"><p className="text-fg-3">{bt("비축", "Buffer")}</p><p className="mt-1 font-black text-fg">{project.readyBufferCount}</p></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-fg-2">
                    <span>{bt("다음 공개", "Next release")} {formatProductionDay(project.nextReleaseAt, bt("미정", "TBD"))}</span>
                    <span className="flex items-center gap-1 font-bold text-accent">{bt("운영 열기", "Open")} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <ActionableEmptyState
          icon={LayoutDashboard}
          title={bt("첫 제작 프로젝트를 연결하세요", "Connect your first production project")}
          description={bt("새 작품을 만든 뒤 제작 관리에 연결하면 회차·담당·마감·검수를 한 흐름에서 운영할 수 있습니다.", "Create a work, then connect it to run episodes, owners, deadlines and reviews in one flow.")}
          primary={{ href: "/studio/new", label: bt("새 작품 만들기", "Create a work") }}
          secondary={{ href: "/studio", label: bt("기존 작품 열기", "Open existing works") }}
          sample={{ href: `${SAMPLE_BASE}/overview`, label: bt("샘플로 먼저 보기", "See the sample first") }}
        />
      )}
    </section>
  );
}

export function ProductionLandingPage() {
  const { pathname } = useLocation();
  const directoryMode = pathname.replace(/\/+$/u, "") === "/production/projects";
  const userId = useApp((state) => state.userId);
  const bt = useBilingual("ProductionLandingPage");
  const [projects, setProjects] = useState<readonly ProductionProjectSummary[]>([]);
  const [inboxItems, setInboxItems] = useState<readonly ProductionPersonalInboxItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(Boolean(userId));
  const [projectsError, setProjectsError] = useState<string | null>(null);
  /** 프로젝트 목록 API 오류 시 "다시 불러오기" 버튼용 재시도 트리거. */
  const [projectsReloadToken, setProjectsReloadToken] = useState(0);

  useEffect(() => {
    if (!userId) {
      setProjects([]);
      setInboxItems([]);
      setProjectsLoading(false);
      setProjectsError(null);
      return;
    }
    let active = true;
    setProjectsLoading(true);
    setProjectsError(null);
    void Promise.all([listProductionProjects(), getProductionPersonalInbox()])
      .then(([projectResult, inboxResult]) => {
        if (!active) return;
        setProjects(projectResult.projects);
        setInboxItems(inboxResult.items);
      })
      .catch(async (cause: unknown) => {
        if (active) setProjectsError(await getApiErrorMessage(cause, "제작 포트폴리오를 불러오지 못했습니다."));
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, projectsReloadToken]);

  return (
    <div data-creator-workflow="production-home" data-route-ready="production-home" className="min-h-dvh bg-canvas text-fg">
      <CampusObjectSource objects={projects.slice(0, 8).flatMap((project) => {
        const id = encodeURIComponent(project.projectId);
        return [
          { id: project.projectId, title: project.title, href: `/production/projects/${id}/overview`, kind: "project" as const, exposure: "private" as const },
          { id: `${project.projectId}.review`, title: `${project.title} · 검수`, href: `/production/projects/${id}/review`, kind: "review" as const, exposure: "private" as const },
          { id: `${project.projectId}.handoff`, title: `${project.title} · 인계`, href: `/production/projects/${id}/handoff`, kind: "handoff" as const, exposure: "private" as const },
        ];
      })} />
      <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:px-8">
        <header className="creator-workflow-intro relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent-soft via-panel to-canvas p-6 sm:p-8 lg:p-10">
          <span aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-accent/10 blur-3xl" />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-10 size-96 rounded-full bg-cool/10 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
                <span>ToonStudio</span><span aria-hidden="true">/</span><span>{directoryMode ? bt("제작 프로젝트", "Production projects") : bt("웹툰 제작 관리", "Webtoon production")}</span>
              </p>
              <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight tracking-tight text-fg sm:text-5xl">
                {directoryMode
                  ? bt("제작 프로젝트를 찾고 바로 운영하세요", "Find a production project and run it")
                  : bt("웹툰 제작을 한 흐름으로", "Webtoon production in one flow")}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">
                {bt(
                  "공정 보드에서 담당과 마감을 옮기고, 원고 위에 핀 코멘트를 남기고, 버전을 비교해 승인까지. 팀도 1인 작가도 다음 할 일을 바로 압니다.",
                  "Move owners and deadlines on the board, pin comments on pages, compare versions and approve. Teams and solo creators always know what's next.",
                )}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className={buttonClass({ size: "lg", className: "gap-2" })} to={`${SAMPLE_BASE}/overview`}>
                  {bt("샘플 프로젝트로 체험하기", "Try the sample project")} <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link className={buttonClass({ variant: "outline", size: "lg" })} to="/studio/new">
                  {bt("새 작품 만들기", "Create a work")}
                </Link>
                <Link className={buttonClass({ variant: "ghost", size: "lg" })} to="/team/people">
                  {bt("사람·권한", "People & roles")}
                </Link>
              </div>
              <p className="mt-4 flex items-center gap-2 text-xs text-fg-3">
                <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
                {bt("샘플은 로그인·서버 없이 이 브라우저에서만 동작하고, 사람·일정·원고는 모두 예시입니다.", "The sample runs only in this browser without signing in; all people, dates and pages are examples.")}
              </p>
            </div>
            <div className="pb-6">
              <HeroPreview />
            </div>
          </div>
        </header>

        {userId ? (
          <PortfolioSection
            projects={projects}
            inboxItems={inboxItems}
            loading={projectsLoading}
            error={projectsError}
            onRetry={() => setProjectsReloadToken((token) => token + 1)}
          />
        ) : directoryMode ? (
          <section className="creator-workflow-panel mt-8 rounded-2xl border border-line bg-card p-5" aria-labelledby="production-directory-title">
            <h2 id="production-directory-title" className="text-base font-black text-fg">{bt("제작 프로젝트를 한곳에서 관리하세요", "Manage production projects in one place")}</h2>
            <p className="mt-1 max-w-3xl text-xs leading-6 text-fg-2">{bt("로그인하면 팀 프로젝트가 일정·담당·검수 상태와 함께 표시됩니다. 기기 안의 개인 작품은 작품 라이브러리에서 계속 작업할 수 있습니다.", "Sign in to see team projects with schedule, owners and review status. Personal works stay in your library.")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className={buttonClass({ className: "min-h-11" })} to="/studio">{bt("내 작품 라이브러리", "My library")}</Link>
              <Link className={buttonClass({ variant: "outline", className: "min-h-11" })} to={`${SAMPLE_BASE}/overview`}>{bt("샘플 제작 프로젝트", "Sample project")}</Link>
            </div>
          </section>
        ) : null}

        <FlowCards />
        <ModuleGrid />
      </div>
    </div>
  );
}
