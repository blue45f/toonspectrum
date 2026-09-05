import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Filter,
  FolderKanban,
  Gauge,
  ListChecks,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  STUDIO_PRODUCTION_STAGES,
  STUDIO_PRODUCTION_STATUSES,
  buildStudioProductionOverview,
  studioProductionEpisodeProgress,
  type StudioProductionEpisode,
  type StudioProductionStage,
  type StudioProductionStatus,
} from "./studio-production-model";
import type { StudioProductionSurfaceProps } from "./studio-production-component-types";
import {
  STUDIO_PRODUCTION_INPUT_CLASS,
  STUDIO_PRODUCTION_TEXTAREA_CLASS,
  StudioProductionCard,
  StudioProductionField,
  StudioProductionMetric,
  StudioProductionPill,
  StudioProductionProgress,
  formatStudioProductionDate,
  studioProductionRelativeDate,
} from "./StudioProductionUi";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Readonly<Record<StudioProductionStage, string>> = {
  idea: "아이디어",
  script: "대본",
  storyboard: "콘티",
  sketch: "러프",
  line: "선화",
  color: "채색",
  lettering: "식자",
  qa: "검수",
  delivered: "납품",
};

const STATUS_LABELS: Readonly<Record<StudioProductionStatus, string>> = {
  planned: "예정",
  active: "진행",
  blocked: "막힘",
  review: "검수",
  done: "완료",
};

function statusTone(status: StudioProductionStatus) {
  if (status === "done") return "success" as const;
  if (status === "blocked") return "danger" as const;
  if (status === "review") return "warning" as const;
  if (status === "active") return "accent" as const;
  return "neutral" as const;
}

function nextStage(stage: StudioProductionStage): StudioProductionStage {
  const index = STUDIO_PRODUCTION_STAGES.indexOf(stage);
  return STUDIO_PRODUCTION_STAGES[Math.min(STUDIO_PRODUCTION_STAGES.length - 1, index + 1)]!;
}

function nextEpisodeNumber(episodes: readonly StudioProductionEpisode[]): number {
  return Math.max(0, ...episodes.map((episode) => episode.number)) + 1;
}

function createEpisode(
  episodes: readonly StudioProductionEpisode[],
  title: string,
  nowIso = new Date().toISOString(),
): StudioProductionEpisode {
  const number = nextEpisodeNumber(episodes);
  const due = new Date(nowIso);
  due.setUTCDate(due.getUTCDate() + Math.max(7, number * 2));
  return {
    id: `episode-${Date.now().toString(36)}-${number}`,
    number,
    title: title.trim() || `${number}화 새 회차`,
    stage: "idea",
    status: "planned",
    owner: "미배정",
    dueOn: due.toISOString().slice(0, 10),
    priority: "normal",
    panelCount: 60,
    plannedHours: 48,
    spentHours: 0,
    words: 0,
    localeCount: 1,
    notes: "",
    tags: [],
    updatedAt: nowIso,
  };
}

export function StudioProductionProjectsSurface({
  workspace,
  commit,
}: StudioProductionSurfaceProps) {
  const [view, setView] = useState<"board" | "schedule" | "delivery">("board");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudioProductionStatus | "all">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const overview = useMemo(() => buildStudioProductionOverview(workspace), [workspace]);

  const filteredEpisodes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return workspace.episodes.filter((episode) => {
      if (statusFilter !== "all" && episode.status !== statusFilter) return false;
      if (!normalized) return true;
      return [
        episode.title,
        episode.owner,
        episode.notes,
        episode.tags.join(" "),
        `${episode.number}화`,
      ].some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized));
    });
  }, [query, statusFilter, workspace.episodes]);

  const updateEpisode = (
    episodeId: string,
    patch: Partial<StudioProductionEpisode>,
    action = "회차 정보 변경",
  ) => {
    commit(
      { action, detail: workspace.episodes.find((item) => item.id === episodeId)?.title ?? episodeId },
      (current) => ({
        ...current,
        episodes: current.episodes.map((episode) => (
          episode.id === episodeId
            ? { ...episode, ...patch, updatedAt: new Date().toISOString() }
            : episode
        )),
      }),
    );
  };

  const toggleSelected = (episodeId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(episodeId)) next.delete(episodeId);
      else next.add(episodeId);
      return next;
    });
  };

  const applyBulkStatus = (status: StudioProductionStatus) => {
    if (selectedIds.size === 0) return;
    commit(
      { action: "회차 일괄 상태 변경", detail: `${selectedIds.size}개 회차 → ${STATUS_LABELS[status]}` },
      (current) => ({
        ...current,
        episodes: current.episodes.map((episode) => (
          selectedIds.has(episode.id)
            ? { ...episode, status, updatedAt: new Date().toISOString() }
            : episode
        )),
      }),
    );
    setSelectedIds(new Set());
  };

  const addEpisode = () => {
    const episode = createEpisode(workspace.episodes, newTitle);
    commit(
      { action: "회차 추가", detail: `${episode.number}화 ${episode.title}` },
      (current) => ({ ...current, episodes: [...current.episodes, episode] }),
    );
    setNewTitle("");
    setShowAdd(false);
  };

  return (
    <div className="space-y-4" data-studio-production-surface="projects">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StudioProductionMetric
          label="전체 진척도"
          value={`${overview.completionPercent}%`}
          detail={`${workspace.episodes.length}개 회차 · 패널 ${workspace.episodes.reduce((sum, item) => sum + item.panelCount, 0).toLocaleString("ko-KR")}개`}
          icon={<Gauge className="size-4" aria-hidden="true" />}
          tone="accent"
        />
        <StudioProductionMetric
          label="남은 작업"
          value={`${overview.remainingHours}h`}
          detail={`현재 용량 ${workspace.dailyCapacityHours}h/일`}
          icon={<Clock3 className="size-4" aria-hidden="true" />}
        />
        <StudioProductionMetric
          label="예상 납품"
          value={formatStudioProductionDate(overview.projectedDeliveryOn)}
          detail={`목표 ${formatStudioProductionDate(workspace.projectBrief.targetReleaseOn)}`}
          icon={<CalendarDays className="size-4" aria-hidden="true" />}
          tone={overview.projectedDeliveryOn > workspace.projectBrief.targetReleaseOn ? "warning" : "success"}
        />
        <StudioProductionMetric
          label="지연·막힘"
          value={`${overview.overdueCount + overview.blockedCount}건`}
          detail={`지연 ${overview.overdueCount} · 막힘 ${overview.blockedCount}`}
          icon={<CircleAlert className="size-4" aria-hidden="true" />}
          tone={overview.overdueCount + overview.blockedCount > 0 ? "danger" : "success"}
        />
        <StudioProductionMetric
          label="제작 건강도"
          value={overview.risk === "healthy" ? "안정" : overview.risk === "at_risk" ? "주의" : "위험"}
          detail={`필요 속도 ${overview.requiredDailyHours}h/일`}
          icon={<Sparkles className="size-4" aria-hidden="true" />}
          tone={overview.risk === "healthy" ? "success" : overview.risk === "at_risk" ? "warning" : "danger"}
        />
      </div>

      <StudioProductionCard className="overflow-hidden p-0">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
                <FolderKanban className="size-4 text-accent" aria-hidden="true" />
                제작 파이프라인
              </h2>
              <p className="mt-1 text-xs text-fg-2">회차·담당·마감·작업량을 한 곳에서 조정합니다.</p>
            </div>
            <button type="button" className={buttonClass({ size: "sm" })} onClick={() => setShowAdd(true)}>
              <Plus className="size-4" aria-hidden="true" /> 새 회차
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="제작 보기">
              {([
                ["board", "보드", FolderKanban],
                ["schedule", "일정", CalendarDays],
                ["delivery", "납품", ListChecks],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors pointer-coarse:min-h-11",
                    view === id ? "bg-raised text-fg shadow-sm" : "text-fg-2 hover:text-fg",
                  )}
                  onClick={() => setView(id)}
                >
                  <Icon className="size-3.5" aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
            <label className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <span className="sr-only">회차 검색</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="회차, 담당자, 태그 검색"
                className={cn(STUDIO_PRODUCTION_INPUT_CLASS, "pl-9")}
              />
            </label>
            <label className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <span className="sr-only">상태 필터</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value as StudioProductionStatus | "all")}
                className={cn(STUDIO_PRODUCTION_INPUT_CLASS, "w-auto min-w-32 pl-9")}
              >
                <option value="all">모든 상태</option>
                {STUDIO_PRODUCTION_STATUSES.map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft/50 px-4 py-2.5 text-xs">
            <strong className="text-fg">{selectedIds.size}개 선택</strong>
            {STUDIO_PRODUCTION_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className={buttonClass({ variant: "outline", size: "sm" })}
                onClick={() => applyBulkStatus(status)}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
            <button
              type="button"
              className={buttonClass({ variant: "quiet", size: "sm", className: "ml-auto" })}
              onClick={() => setSelectedIds(new Set())}
            >
              선택 해제
            </button>
          </div>
        ) : null}

        {showAdd ? (
          <form
            className="grid gap-3 border-b border-line bg-panel/60 p-4 sm:grid-cols-[1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              addEpisode();
            }}
          >
            <StudioProductionField label="새 회차 제목" hint={`${nextEpisodeNumber(workspace.episodes)}화`}>
              <input
                autoFocus
                value={newTitle}
                onChange={(event) => setNewTitle(event.currentTarget.value)}
                className={STUDIO_PRODUCTION_INPUT_CLASS}
                placeholder="회차 제목"
              />
            </StudioProductionField>
            <div className="flex items-end gap-2">
              <button type="submit" className={buttonClass({ size: "sm" })}>추가</button>
              <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} onClick={() => setShowAdd(false)} aria-label="새 회차 취소">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </form>
        ) : null}

        {view === "board" ? (
          <div className="overflow-x-auto p-4">
            <div className="grid min-w-[76rem] grid-cols-9 gap-3">
              {STUDIO_PRODUCTION_STAGES.map((stage) => {
                const episodes = filteredEpisodes.filter((episode) => episode.stage === stage);
                return (
                  <section key={stage} className="rounded-2xl bg-panel/65 p-2.5" aria-label={`${STAGE_LABELS[stage]} 단계`}>
                    <header className="mb-2 flex items-center justify-between gap-2 px-1">
                      <h3 className="text-xs font-bold text-fg">{STAGE_LABELS[stage]}</h3>
                      <StudioProductionPill>{episodes.length}</StudioProductionPill>
                    </header>
                    <div className="space-y-2">
                      {episodes.map((episode) => (
                        <article key={episode.id} className="rounded-xl border border-line bg-card p-2.5 shadow-sm">
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(episode.id)}
                              onChange={() => toggleSelected(episode.id)}
                              aria-label={`${episode.title} 선택`}
                              className="mt-0.5 size-4 accent-accent"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[0.6875rem] font-semibold text-fg-3">{episode.number}화</p>
                              <h4 className="mt-0.5 text-xs font-bold leading-snug text-fg">{episode.title}</h4>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <StudioProductionPill tone={statusTone(episode.status)}>{STATUS_LABELS[episode.status]}</StudioProductionPill>
                            {episode.priority === "urgent" || episode.priority === "high" ? (
                              <StudioProductionPill tone="danger">{episode.priority === "urgent" ? "긴급" : "높음"}</StudioProductionPill>
                            ) : null}
                          </div>
                          <StudioProductionProgress value={studioProductionEpisodeProgress(episode)} className="mt-2" />
                          <div className="mt-2 space-y-1 text-[0.6875rem] text-fg-2">
                            <p className="flex items-center gap-1"><Users className="size-3" aria-hidden="true" />{episode.owner}</p>
                            <p className={cn("flex items-center gap-1", episode.dueOn < new Date().toISOString().slice(0, 10) && episode.status !== "done" ? "font-semibold text-red-600 dark:text-red-300" : "") }>
                              <CalendarDays className="size-3" aria-hidden="true" />{studioProductionRelativeDate(episode.dueOn)}
                            </p>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            <select
                              value={episode.status}
                              onChange={(event) => updateEpisode(episode.id, { status: event.currentTarget.value as StudioProductionStatus })}
                              aria-label={`${episode.title} 상태`}
                              className="min-h-8 rounded-lg border border-line bg-panel px-1.5 text-[0.6875rem] text-fg outline-none pointer-coarse:min-h-11"
                            >
                              {STUDIO_PRODUCTION_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                            </select>
                            <button
                              type="button"
                              disabled={episode.stage === "delivered"}
                              className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-line bg-panel px-1.5 text-[0.6875rem] font-semibold text-fg transition-colors hover:border-accent disabled:opacity-40 pointer-coarse:min-h-11"
                              onClick={() => updateEpisode(
                                episode.id,
                                {
                                  stage: nextStage(episode.stage),
                                  status: nextStage(episode.stage) === "delivered" ? "done" : "active",
                                },
                                "제작 단계 전진",
                              )}
                            >
                              다음 <ArrowRight className="size-3" aria-hidden="true" />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : null}

        {view === "schedule" ? (
          <div className="divide-y divide-line">
            {[...filteredEpisodes].sort((left, right) => left.dueOn.localeCompare(right.dueOn)).map((episode) => {
              const remaining = Math.max(0, episode.plannedHours - episode.spentHours);
              return (
                <article key={episode.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(14rem,1fr)_repeat(4,minmax(8rem,0.55fr))] lg:items-end">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-fg">{episode.number}화 · {episode.title}</strong>
                      <StudioProductionPill tone={statusTone(episode.status)}>{STATUS_LABELS[episode.status]}</StudioProductionPill>
                    </div>
                    <p className="mt-1 text-xs text-fg-2">{STAGE_LABELS[episode.stage]} · 패널 {episode.panelCount} · 잔여 {remaining}h</p>
                  </div>
                  <StudioProductionField label="담당자">
                    <input
                      defaultValue={episode.owner}
                      onBlur={(event) => {
                        if (event.currentTarget.value !== episode.owner) updateEpisode(episode.id, { owner: event.currentTarget.value });
                      }}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                    />
                  </StudioProductionField>
                  <StudioProductionField label="마감일" hint={studioProductionRelativeDate(episode.dueOn)}>
                    <input
                      type="date"
                      value={episode.dueOn}
                      onChange={(event) => updateEpisode(episode.id, { dueOn: event.currentTarget.value })}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                    />
                  </StudioProductionField>
                  <StudioProductionField label="계획 시간">
                    <input
                      type="number"
                      min={0}
                      value={episode.plannedHours}
                      onChange={(event) => updateEpisode(episode.id, { plannedHours: Math.max(0, Number(event.currentTarget.value)) })}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                    />
                  </StudioProductionField>
                  <StudioProductionField label="소요 시간">
                    <input
                      type="number"
                      min={0}
                      value={episode.spentHours}
                      onChange={(event) => updateEpisode(episode.id, { spentHours: Math.max(0, Number(event.currentTarget.value)) })}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                    />
                  </StudioProductionField>
                </article>
              );
            })}
          </div>
        ) : null}

        {view === "delivery" ? (
          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
            <div className="space-y-4">
              <StudioProductionCard title="프로젝트 브리프" description="피치·검수·공유 화면이 이 정보를 함께 사용합니다.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <StudioProductionField label="시리즈 제목">
                    <input
                      defaultValue={workspace.seriesTitle}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                      onBlur={(event) => {
                        const value = event.currentTarget.value.trim();
                        if (value && value !== workspace.seriesTitle) commit(
                          { action: "시리즈 제목 변경", detail: value },
                          (current) => ({ ...current, seriesTitle: value }),
                        );
                      }}
                    />
                  </StudioProductionField>
                  <StudioProductionField label="시즌">
                    <input
                      defaultValue={workspace.projectBrief.seasonLabel}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                      onBlur={(event) => commit(
                        { action: "프로젝트 브리프 변경", detail: "시즌" },
                        (current) => ({ ...current, projectBrief: { ...current.projectBrief, seasonLabel: event.currentTarget.value } }),
                      )}
                    />
                  </StudioProductionField>
                  <StudioProductionField label="장르">
                    <input
                      defaultValue={workspace.projectBrief.genre}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                      onBlur={(event) => commit(
                        { action: "프로젝트 브리프 변경", detail: "장르" },
                        (current) => ({ ...current, projectBrief: { ...current.projectBrief, genre: event.currentTarget.value } }),
                      )}
                    />
                  </StudioProductionField>
                  <StudioProductionField label="대상 플랫폼">
                    <input
                      defaultValue={workspace.projectBrief.targetPlatform}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                      onBlur={(event) => commit(
                        { action: "프로젝트 브리프 변경", detail: "대상 플랫폼" },
                        (current) => ({ ...current, projectBrief: { ...current.projectBrief, targetPlatform: event.currentTarget.value } }),
                      )}
                    />
                  </StudioProductionField>
                  <StudioProductionField label="등급">
                    <input
                      defaultValue={workspace.projectBrief.targetRating}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                      onBlur={(event) => commit(
                        { action: "프로젝트 브리프 변경", detail: "등급" },
                        (current) => ({ ...current, projectBrief: { ...current.projectBrief, targetRating: event.currentTarget.value } }),
                      )}
                    />
                  </StudioProductionField>
                  <StudioProductionField label="목표 공개일">
                    <input
                      type="date"
                      value={workspace.projectBrief.targetReleaseOn}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                      onChange={(event) => commit(
                        { action: "목표 공개일 변경", detail: event.currentTarget.value },
                        (current) => ({ ...current, projectBrief: { ...current.projectBrief, targetReleaseOn: event.currentTarget.value } }),
                      )}
                    />
                  </StudioProductionField>
                  <StudioProductionField label="일일 작업 용량" hint="시간/일">
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={workspace.dailyCapacityHours}
                      className={STUDIO_PRODUCTION_INPUT_CLASS}
                      onChange={(event) => commit(
                        { action: "작업 용량 변경", detail: `${event.currentTarget.value}시간/일` },
                        (current) => ({ ...current, dailyCapacityHours: Math.max(1, Math.min(24, Number(event.currentTarget.value))) }),
                      )}
                    />
                  </StudioProductionField>
                </div>
                <div className="mt-3">
                  <StudioProductionField label="로그라인">
                    <textarea
                      defaultValue={workspace.projectBrief.logline}
                      className={STUDIO_PRODUCTION_TEXTAREA_CLASS}
                      onBlur={(event) => commit(
                        { action: "로그라인 변경" },
                        (current) => ({ ...current, projectBrief: { ...current.projectBrief, logline: event.currentTarget.value } }),
                      )}
                    />
                  </StudioProductionField>
                </div>
              </StudioProductionCard>
            </div>

            <StudioProductionCard
              title="납품 프리플라이트"
              description="필수 항목은 검수 승인 게이트와 연결됩니다."
              action={<StudioProductionPill tone={overview.missingRequiredChecks > 0 ? "warning" : "success"}>{overview.missingRequiredChecks > 0 ? `필수 ${overview.missingRequiredChecks}건 남음` : "필수 완료"}</StudioProductionPill>}
            >
              <div className="space-y-2">
                {workspace.deliveryChecklist.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent/50">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => commit(
                        { action: item.done ? "납품 체크 해제" : "납품 체크 완료", detail: item.label },
                        (current) => ({
                          ...current,
                          deliveryChecklist: current.deliveryChecklist.map((candidate) => (
                            candidate.id === item.id ? { ...candidate, done: !candidate.done } : candidate
                          )),
                        }),
                      )}
                      className="mt-0.5 size-4 accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-fg">
                        {item.label}
                        {item.required ? <StudioProductionPill tone="danger">필수</StudioProductionPill> : <StudioProductionPill>권장</StudioProductionPill>}
                      </span>
                      <span className="mt-1 block text-[0.6875rem] text-fg-2">담당 {item.owner}{item.evidence ? ` · ${item.evidence}` : " · 증빙 미첨부"}</span>
                    </span>
                    {item.done ? <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" /> : null}
                  </label>
                ))}
              </div>
            </StudioProductionCard>
          </div>
        ) : null}
      </StudioProductionCard>
    </div>
  );
}
