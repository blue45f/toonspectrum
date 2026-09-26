import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  ChevronRight,
  ClipboardCheck,
  FileKey2,
  GitBranch,
  Handshake,
  LayoutDashboard,
  LockKeyhole,
  Scale,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  getProductionPersonalInbox,
  listProductionProjects,
  type ProductionPersonalInboxItem,
  type ProductionProjectSummary,
} from "./production-dashboard-api";

import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { CampusObjectSource } from "@/shared/components/spatial-campus/CampusObjectSource";
import { cn } from "@/shared/lib/utils";
import { useApp } from "@/shared/lib/store";
import { getApiErrorMessage } from "@/platform/api";

const DATE_ONLY = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" });

function formatDay(value: string | null): string {
  if (!value) return "미정";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_ONLY.format(date) : "미정";
}

function Pill({ children, tone = "neutral" }: { readonly children: ReactNode; readonly tone?: "neutral" | "accent" | "success" | "warning" | "danger" }) {
  const tones = { neutral: "border-line bg-raised text-fg-2", accent: "border-accent/35 bg-accent-soft text-accent", success: "border-good/35 bg-good/10 text-good", warning: "border-warn/35 bg-warn/10 text-warn", danger: "border-bad/35 bg-bad/10 text-bad" } as const;
  return <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold", tones[tone])}>{children}</span>;
}

function SectionCard({ title, description, action, children, className }: { readonly title: string; readonly description?: string; readonly action?: ReactNode; readonly children: ReactNode; readonly className?: string }) {
  return <section className={cn("rounded-2xl border border-line bg-card p-4", className)}><header className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-fg">{title}</h2>{description ? <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-2">{description}</p> : null}</div>{action}</header>{children}</section>;
}

function Metric({ label, value, detail, icon: Icon, tone = "neutral" }: { readonly label: string; readonly value: string; readonly detail: string; readonly icon: LucideIcon; readonly tone?: "neutral" | "accent" | "success" | "warning" | "danger" }) {
  const toneClass = { neutral: "border-line bg-panel", accent: "border-accent/30 bg-accent-soft", success: "border-good/30 bg-good/10", warning: "border-warn/30 bg-warn/10", danger: "border-bad/30 bg-bad/10" }[tone];
  return <div className={cn("rounded-2xl border p-3.5", toneClass)}><div className="flex items-center justify-between gap-2"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">{label}</p><Icon className="size-4 text-fg-3" aria-hidden="true" /></div><p className="mt-2 text-2xl font-black tracking-tight text-fg">{value}</p><p className="mt-1 text-xs leading-relaxed text-fg-2">{detail}</p></div>;
}

export function ProductionLandingPage() {
  const { pathname } = useLocation();
  const directoryMode = pathname.replace(/\/+$/u, "") === "/production/projects";
  const userId = useApp((state) => state.userId);
  const [projects, setProjects] = useState<readonly ProductionProjectSummary[]>([]);
  const [inboxItems, setInboxItems] = useState<readonly ProductionPersonalInboxItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(Boolean(userId));
  const [projectsError, setProjectsError] = useState<string | null>(null);

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
  }, [userId]);

  return (
    <div data-route-ready="production-home" className="min-h-dvh bg-canvas text-fg">
      <CampusObjectSource objects={projects.slice(0, 8).flatMap((project) => {
        const id = encodeURIComponent(project.projectId);
        return [
          {
            id: project.projectId,
            title: project.title,
            href: `/production/projects/${id}/overview`,
            kind: "project" as const,
            exposure: "private" as const,
          },
          {
            id: `${project.projectId}.review`,
            title: `${project.title} · 검수`,
            href: `/production/projects/${id}/review`,
            kind: "review" as const,
            exposure: "private" as const,
          },
          {
            id: `${project.projectId}.handoff`,
            title: `${project.title} · 인계`,
            href: `/production/projects/${id}/handoff`,
            kind: "handoff" as const,
            exposure: "private" as const,
          },
        ];
      })} />
      <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
            <span>ToonStudio</span><span aria-hidden="true">/</span><span>{directoryMode ? "제작 프로젝트" : "웹툰 제작 관리"}</span>
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-fg sm:text-5xl">
                {directoryMode ? "제작 프로젝트를 찾고 바로 운영하세요" : "흩어진 웹툰 제작을 하나의 흐름으로"}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2 sm:text-base">
                {directoryMode
                  ? "작품별 일정·담당·검수·인수인계 상태를 같은 기준으로 비교하고, 지금 조치할 프로젝트부터 여세요."
                  : "기획·회차·담당자·일정·파일·검수·계약을 연결해, 팀과 1인 작가 모두 다음 할 일을 바로 알 수 있습니다."}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {directoryMode ? (
                  <>
                    <Link className={buttonClass({ size: "lg" })} to="/studio/new">새 프로젝트 만들기</Link>
                    <Link className={buttonClass({ variant: "outline", size: "lg" })} to="/production">제작 관리 소개</Link>
                  </>
                ) : (
                  <>
                    <Link className={buttonClass({ variant: "outline", size: "lg" })} to="/team/people">사람·권한</Link>
                    <Link className={buttonClass({ size: "lg" })} to="/production/projects/sample-project/overview">
                      기능 미리 보기 <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </>
                )}
                <Link className={buttonClass({ variant: "outline", size: "lg" })} to="/studio">
                  내 작품 열기
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

        {userId ? (
          <SectionCard
            className="mt-6"
            title="내 제작 포트폴리오"
            description="여러 작품의 다음 연재, 일정 안정도, 차단·검수·인력 공백을 같은 기준으로 비교합니다. 위험한 작품을 먼저 표시합니다."
            action={<Link className={buttonClass({ variant: "outline", size: "sm" })} to="/studio/new">새 프로젝트 만들기</Link>}
          >
            {projectsLoading ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="프로젝트 목록 불러오는 중">
                {[0, 1, 2].map((index) => <div key={index} className="h-44 animate-pulse rounded-2xl bg-raised" />)}
              </div>
            ) : projectsError ? (
              <div role="alert" className="rounded-xl border border-bad/35 bg-bad/10 p-4 text-sm text-fg">{projectsError}</div>
            ) : projects.length > 0 ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="운영 작품" value={String(projects.length)} detail={`진행 회차 ${projects.reduce((sum, project) => sum + project.activeEpisodeCount, 0)}개`} icon={LayoutDashboard} tone="accent" />
                  <Metric label="위험 작품" value={String(projects.filter((project) => project.healthScore < 64).length)} detail={`기한 초과 ${projects.reduce((sum, project) => sum + project.overdueTaskCount, 0)}건`} icon={AlertTriangle} tone={projects.some((project) => project.healthScore < 64) ? "danger" : "success"} />
                  <Metric label="완성 비축" value={`${projects.reduce((sum, project) => sum + project.readyBufferCount, 0)}회`} detail="게시 준비가 끝난 미공개 회차" icon={BadgeCheck} tone="success" />
                  <Metric label="검수 대기" value={String(projects.reduce((sum, project) => sum + project.reviewTaskCount, 0))} detail={`미배정 ${projects.reduce((sum, project) => sum + project.unassignedTaskCount, 0)}건`} icon={ClipboardCheck} tone="warning" />
                </div>
                <div className="rounded-2xl border border-line bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><h3 className="text-sm font-black text-fg">내 통합 작업함</h3><p className="mt-1 text-xs text-fg-2">모든 작품에서 오늘 제출·진행·검수·입력 대기 업무를 우선순위 순으로 모았습니다.</p></div>
                    <span className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-1 text-xs font-black text-accent">조치 {inboxItems.length}건</span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {inboxItems.slice(0, 8).map((item) => {
                      const bucketLabel = {
                        dueToday: "오늘 제출",
                        inProgress: "진행 중",
                        review: "내 검수",
                        ready: "시작 가능",
                        waitingInput: "입력 대기",
                        blockingOthers: "다른 작업 차단",
                      }[item.bucket];
                      const tone = item.bucket === "dueToday" || item.bucket === "blockingOthers"
                        ? "danger"
                        : item.bucket === "waitingInput" || item.bucket === "review"
                          ? "warning"
                          : item.bucket === "ready" ? "success" : "accent";
                      return (
                        <Link
                          key={`${item.bucket}:${item.projectId}:${item.taskId}`}
                          to={`/production/projects/${encodeURIComponent(item.projectId)}/production?task=${encodeURIComponent(item.taskId)}`}
                          className="rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent/40 hover:bg-raised"
                        >
                          <div className="flex items-center justify-between gap-2"><Pill tone={tone}>{bucketLabel}</Pill><span className="text-[0.625rem] text-fg-3">{formatDay(item.dueAt)}</span></div>
                          <p className="mt-2 line-clamp-2 text-xs font-black leading-5 text-fg">{item.taskTitle}</p>
                          <p className="mt-1 truncate text-[0.6875rem] text-fg-3">{item.projectTitle} · {item.processKey} · {item.estimateHours === null ? "예상 시간 미입력" : `${item.estimateHours}h`}</p>
                        </Link>
                      );
                    })}
                    {inboxItems.length === 0 ? <div className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3 md:col-span-2 xl:col-span-4">현재 사용자에게 배정된 조치 업무가 없습니다.</div> : null}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {projects.map((project) => {
                    const healthTone = project.healthScore >= 82 ? "success" : project.healthScore >= 64 ? "warning" : "danger";
                    return (
                      <Link
                        key={project.projectId}
                        to={`/production/projects/${encodeURIComponent(project.projectId)}/overview`}
                        className="group rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="truncate text-base font-black text-fg">{project.title}</p><p className="mt-1 text-[0.6875rem] text-fg-3">{project.collaborationModel} · r{project.revision}</p></div>
                          <Pill tone={healthTone}>안정도 {project.healthScore}</Pill>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[0.6875rem]">
                          <div className="rounded-lg border border-line bg-card p-2"><p className="text-fg-3">진행 회차</p><p className="mt-1 font-black text-fg">{project.activeEpisodeCount}</p></div>
                          <div className="rounded-lg border border-line bg-card p-2"><p className="text-fg-3">차단·지연</p><p className={cn("mt-1 font-black", project.blockedTaskCount + project.overdueTaskCount > 0 ? "text-bad" : "text-fg")}>{project.blockedTaskCount + project.overdueTaskCount}</p></div>
                          <div className="rounded-lg border border-line bg-card p-2"><p className="text-fg-3">비축</p><p className="mt-1 font-black text-fg">{project.readyBufferCount}회</p></div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-fg-2"><span>다음 공개 {formatDay(project.nextReleaseAt)}</span><span className="flex items-center gap-1 font-bold text-accent">운영 열기 <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span></div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              <ActionableEmptyState
                icon={LayoutDashboard}
                title="첫 제작 프로젝트를 연결하세요"
                description="새 작품을 만든 뒤 제작 관리에 연결하면 회차·담당·마감·검수·인수인계를 한 흐름에서 운영할 수 있습니다."
                primary={{ href: "/studio/new", label: "새 작품 만들기" }}
                secondary={{ href: "/studio", label: "기존 작품 열기" }}
                sample={{ href: "/production/projects/sample-project/overview", label: "10분 샘플로 먼저 보기" }}
              >
                <ol className="grid gap-2 text-xs sm:grid-cols-3">
                  {["작품 만들기", "제작 프로젝트 연결", "팀·일정·검수 운영"].map((label, index) => (
                    <li key={label} className="rounded-xl border border-line bg-panel/70 p-3 text-fg-2">
                      <span className="font-black text-accent">{index + 1}</span> · {label}
                    </li>
                  ))}
                </ol>
              </ActionableEmptyState>
            )}
          </SectionCard>
        ) : directoryMode ? (
          <SectionCard
            className="mt-6"
            title="제작 프로젝트를 한곳에서 관리하세요"
            description="로그인한 팀 프로젝트는 일정·담당·검수 상태와 함께 표시됩니다. 기기 안의 개인 작품은 작품 라이브러리에서 계속 작업할 수 있습니다."
            action={<Link className={buttonClass({ size: "sm" })} to="/studio/new">새 프로젝트 만들기</Link>}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Link to="/studio" className="group rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <LayoutDashboard className="size-6 text-accent" aria-hidden="true" />
                <h3 className="mt-4 text-base font-black text-fg">내 작품 라이브러리</h3>
                <p className="mt-2 text-xs leading-6 text-fg-2">최근 작품, 로컬 초안, 공유 작업과 복구 가능한 원고를 확인합니다.</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-accent">작품 열기 <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
              </Link>
              <Link to="/production/projects/sample-project/overview" className="group rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <ClipboardCheck className="size-6 text-accent" aria-hidden="true" />
                <h3 className="mt-4 text-base font-black text-fg">샘플 제작 프로젝트</h3>
                <p className="mt-2 text-xs leading-6 text-fg-2">기획부터 작업 배정, 인수인계, 검수와 배포까지 연결된 운영 화면을 미리 확인합니다.</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-accent">샘플 열기 <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
              </Link>
            </div>
          </SectionCard>
        ) : null}

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
