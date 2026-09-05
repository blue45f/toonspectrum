import {
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Filter,
  MessageSquarePlus,
  Search,
  ShieldAlert,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  STUDIO_REVIEW_CATEGORIES,
  STUDIO_REVIEW_SEVERITIES,
  STUDIO_REVIEW_STATUSES,
  buildStudioReviewGate,
  createStudioVersionSnapshot,
  type StudioReviewCategory,
  type StudioReviewItem,
  type StudioReviewSeverity,
  type StudioReviewStatus,
} from "./studio-production-model";
import type { StudioProductionSurfaceProps } from "./studio-production-component-types";
import {
  STUDIO_PRODUCTION_INPUT_CLASS,
  STUDIO_PRODUCTION_TEXTAREA_CLASS,
  StudioProductionCard,
  StudioProductionEmpty,
  StudioProductionField,
  StudioProductionMetric,
  StudioProductionPill,
  StudioProductionProgress,
  formatStudioProductionDate,
} from "./StudioProductionUi";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Readonly<Record<StudioReviewCategory, string>> = {
  story: "스토리",
  art: "작화",
  lettering: "식자",
  continuity: "연속성",
  platform: "플랫폼",
  rights: "권리",
  accessibility: "접근성",
  localization: "현지화",
};

const SEVERITY_LABELS: Readonly<Record<StudioReviewSeverity, string>> = {
  blocker: "차단",
  major: "중요",
  minor: "경미",
  note: "참고",
};

const STATUS_LABELS: Readonly<Record<StudioReviewStatus, string>> = {
  open: "열림",
  in_progress: "수정 중",
  resolved: "해결",
  waived: "예외 승인",
};

function severityTone(severity: StudioReviewSeverity) {
  if (severity === "blocker") return "danger" as const;
  if (severity === "major") return "warning" as const;
  if (severity === "minor") return "info" as const;
  return "neutral" as const;
}

function statusTone(status: StudioReviewStatus) {
  if (status === "resolved") return "success" as const;
  if (status === "waived") return "neutral" as const;
  if (status === "in_progress") return "accent" as const;
  return "warning" as const;
}

function createReviewItem(
  input: {
    title: string;
    detail: string;
    category: StudioReviewCategory;
    severity: StudioReviewSeverity;
    assignee: string;
    episodeId: string | null;
  },
  nowIso = new Date().toISOString(),
): StudioReviewItem {
  const due = new Date(nowIso);
  due.setUTCDate(due.getUTCDate() + (input.severity === "blocker" ? 1 : input.severity === "major" ? 3 : 7));
  return {
    id: `review-${Date.now().toString(36)}`,
    episodeId: input.episodeId,
    pageLabel: input.episodeId ?? "프로젝트 전체",
    title: input.title.trim() || "새 검수 이슈",
    detail: input.detail.trim(),
    category: input.category,
    severity: input.severity,
    status: "open",
    assignee: input.assignee.trim() || "미배정",
    reporter: "나",
    dueOn: due.toISOString().slice(0, 10),
    comments: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function StudioProductionReviewSurface({
  workspace,
  commit,
}: StudioProductionSurfaceProps) {
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<StudioReviewSeverity | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StudioReviewStatus | "active" | "all">("active");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(workspace.reviews[0]?.id ?? null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [newIssue, setNewIssue] = useState({
    title: "",
    detail: "",
    category: "art" as StudioReviewCategory,
    severity: "major" as StudioReviewSeverity,
    assignee: "",
    episodeId: "" as string,
  });
  const [comment, setComment] = useState("");
  const gate = useMemo(() => buildStudioReviewGate(workspace), [workspace]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return workspace.reviews.filter((item) => {
      if (severityFilter !== "all" && item.severity !== severityFilter) return false;
      if (statusFilter === "active" && (item.status === "resolved" || item.status === "waived")) return false;
      if (statusFilter !== "all" && statusFilter !== "active" && item.status !== statusFilter) return false;
      if (!normalized) return true;
      return [item.title, item.detail, item.assignee, item.pageLabel, CATEGORY_LABELS[item.category]]
        .some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized));
    });
  }, [query, severityFilter, statusFilter, workspace.reviews]);

  const selectedIssue = workspace.reviews.find((item) => item.id === selectedIssueId) ?? null;
  const activeCount = workspace.reviews.filter((item) => item.status === "open" || item.status === "in_progress").length;
  const resolvedCount = workspace.reviews.filter((item) => item.status === "resolved").length;

  const patchIssue = (issueId: string, patch: Partial<StudioReviewItem>, action = "검수 이슈 변경") => {
    commit(
      { action, detail: workspace.reviews.find((item) => item.id === issueId)?.title ?? issueId },
      (current) => ({
        ...current,
        reviews: current.reviews.map((item) => (
          item.id === issueId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
        )),
      }),
    );
  };

  const toggleChecked = (issueId: string) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  };

  const bulkSetStatus = (status: Extract<StudioReviewStatus, "resolved" | "waived">) => {
    if (checkedIds.size === 0) return;
    commit(
      { action: status === "resolved" ? "검수 이슈 일괄 해결" : "검수 이슈 일괄 예외 승인", detail: `${checkedIds.size}건` },
      (current) => ({
        ...current,
        reviews: current.reviews.map((item) => (
          checkedIds.has(item.id)
            ? { ...item, status, updatedAt: new Date().toISOString() }
            : item
        )),
      }),
    );
    setCheckedIds(new Set());
  };

  const addIssue = () => {
    const issue = createReviewItem({
      ...newIssue,
      episodeId: newIssue.episodeId || null,
    });
    commit(
      { action: "검수 이슈 등록", detail: issue.title },
      (current) => ({ ...current, reviews: [issue, ...current.reviews] }),
    );
    setSelectedIssueId(issue.id);
    setNewIssue({ title: "", detail: "", category: "art", severity: "major", assignee: "", episodeId: "" });
    setShowAdd(false);
  };

  const addComment = () => {
    if (!selectedIssue || comment.trim().length === 0) return;
    const nowIso = new Date().toISOString();
    const body = comment.trim().slice(0, 500);
    patchIssue(
      selectedIssue.id,
      {
        comments: [
          ...selectedIssue.comments,
          { id: `comment-${Date.now().toString(36)}`, author: workspace.owner, body, createdAt: nowIso },
        ],
      },
      "검수 댓글 추가",
    );
    setComment("");
  };

  const approveRelease = () => {
    if (!gate.ready) {
      commit(
        { action: "출시 승인 보류", detail: gate.reasons.join(" · ") },
        (current) => ({
          ...current,
          releaseApproval: {
            status: "changes_requested",
            actor: current.owner,
            note: gate.reasons.join(" · "),
            updatedAt: new Date().toISOString(),
          },
        }),
      );
      return;
    }
    commit(
      { action: "출시 승인", detail: "검수 게이트 통과 및 승인 버전 생성" },
      (current) => {
        const nowIso = new Date().toISOString();
        const approved = {
          ...current,
          releaseApproval: {
            status: "approved" as const,
            actor: current.owner,
            note: "모든 차단 조건을 통과했습니다.",
            updatedAt: nowIso,
          },
        };
        const snapshot = createStudioVersionSnapshot(approved, {
          name: `출시 승인 ${new Intl.DateTimeFormat("ko-KR").format(new Date(nowIso))}`,
          summary: "검수 게이트를 통과한 승인 기준선입니다.",
          kind: "approval",
          nowIso,
        });
        return { ...approved, versions: [snapshot, ...current.versions] };
      },
    );
  };

  return (
    <div className="space-y-4" data-studio-production-surface="review">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StudioProductionMetric
          label="승인 준비도"
          value={`${gate.readinessPercent}%`}
          detail={gate.ready ? "출시 승인 가능" : gate.reasons.join(" · ")}
          icon={<ClipboardCheck className="size-4" aria-hidden="true" />}
          tone={gate.ready ? "success" : gate.blockerCount > 0 ? "danger" : "warning"}
        />
        <StudioProductionMetric
          label="활성 이슈"
          value={`${activeCount}건`}
          detail={`해결 ${resolvedCount}건`}
          icon={<CircleAlert className="size-4" aria-hidden="true" />}
          tone={activeCount > 0 ? "warning" : "success"}
        />
        <StudioProductionMetric
          label="차단 이슈"
          value={`${gate.blockerCount}건`}
          detail={`중요 ${gate.majorCount}건`}
          icon={<ShieldAlert className="size-4" aria-hidden="true" />}
          tone={gate.blockerCount > 0 ? "danger" : gate.majorCount > 0 ? "warning" : "success"}
        />
        <StudioProductionMetric
          label="납품 체크"
          value={`${gate.missingRequiredChecks.length}건`}
          detail="미완료 필수 항목"
          icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
          tone={gate.missingRequiredChecks.length > 0 ? "warning" : "success"}
        />
      </div>

      <StudioProductionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-fg">출시 승인 게이트</h2>
              <StudioProductionPill tone={gate.ready ? "success" : "warning"}>
                {gate.ready ? "승인 가능" : "수정 필요"}
              </StudioProductionPill>
              <StudioProductionPill tone={workspace.releaseApproval.status === "approved" ? "success" : "neutral"}>
                {workspace.releaseApproval.status === "approved" ? "승인됨" : workspace.releaseApproval.status === "changes_requested" ? "변경 요청" : "승인 대기"}
              </StudioProductionPill>
            </div>
            <StudioProductionProgress value={gate.readinessPercent} className="mt-3 max-w-2xl" />
            <p className="mt-2 text-xs leading-relaxed text-fg-2">
              {gate.ready
                ? "차단·중요 이슈와 필수 납품 체크가 모두 닫혔습니다. 승인하면 자동으로 버전 기준선을 남깁니다."
                : `남은 조건: ${gate.reasons.join(" · ")}`}
            </p>
          </div>
          <button
            type="button"
            className={buttonClass({ variant: gate.ready ? "solid" : "outline" })}
            onClick={approveRelease}
          >
            {gate.ready ? <UserRoundCheck className="size-4" aria-hidden="true" /> : <ShieldAlert className="size-4" aria-hidden="true" />}
            {gate.ready ? "출시 승인·버전 생성" : "변경 요청 남기기"}
          </button>
        </div>
      </StudioProductionCard>

      <StudioProductionCard className="overflow-hidden p-0">
        <div className="border-b border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-fg">리뷰 인박스</h2>
              <p className="mt-1 text-xs text-fg-2">작화·식자·연속성·권리·플랫폼 이슈를 한 승인 흐름으로 관리합니다.</p>
            </div>
            <button type="button" className={buttonClass({ size: "sm" })} onClick={() => setShowAdd(true)}>
              <MessageSquarePlus className="size-4" aria-hidden="true" /> 이슈 등록
            </button>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[minmax(12rem,1fr)_auto_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <span className="sr-only">검수 이슈 검색</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="제목, 상세, 담당자 검색"
                className={cn(STUDIO_PRODUCTION_INPUT_CLASS, "pl-9")}
              />
            </label>
            <label className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <span className="sr-only">중요도 필터</span>
              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.currentTarget.value as StudioReviewSeverity | "all")}
                className={cn(STUDIO_PRODUCTION_INPUT_CLASS, "w-auto min-w-32 pl-9")}
              >
                <option value="all">모든 중요도</option>
                {STUDIO_REVIEW_SEVERITIES.map((severity) => <option key={severity} value={severity}>{SEVERITY_LABELS[severity]}</option>)}
              </select>
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.currentTarget.value as StudioReviewStatus | "active" | "all")}
              className={cn(STUDIO_PRODUCTION_INPUT_CLASS, "w-auto min-w-32")}
              aria-label="검수 상태 필터"
            >
              <option value="active">활성 이슈</option>
              <option value="all">모든 상태</option>
              {STUDIO_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          </div>
        </div>

        {checkedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft/50 px-4 py-2.5 text-xs">
            <strong className="text-fg">{checkedIds.size}건 선택</strong>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => bulkSetStatus("resolved")}>
              <Check className="size-4" aria-hidden="true" /> 해결 처리
            </button>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => bulkSetStatus("waived")}>
              예외 승인
            </button>
            <button type="button" className={buttonClass({ variant: "quiet", size: "sm", className: "ml-auto" })} onClick={() => setCheckedIds(new Set())}>선택 해제</button>
          </div>
        ) : null}

        {showAdd ? (
          <form
            className="border-b border-line bg-panel/50 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              addIssue();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="md:col-span-2 xl:col-span-2">
                <StudioProductionField label="이슈 제목">
                  <input autoFocus required value={newIssue.title} onChange={(event) => setNewIssue((current) => ({ ...current, title: event.currentTarget.value }))} className={STUDIO_PRODUCTION_INPUT_CLASS} />
                </StudioProductionField>
              </div>
              <StudioProductionField label="회차">
                <select value={newIssue.episodeId} onChange={(event) => setNewIssue((current) => ({ ...current, episodeId: event.currentTarget.value }))} className={STUDIO_PRODUCTION_INPUT_CLASS}>
                  <option value="">프로젝트 전체</option>
                  {workspace.episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.number}화 · {episode.title}</option>)}
                </select>
              </StudioProductionField>
              <StudioProductionField label="분류">
                <select value={newIssue.category} onChange={(event) => setNewIssue((current) => ({ ...current, category: event.currentTarget.value as StudioReviewCategory }))} className={STUDIO_PRODUCTION_INPUT_CLASS}>
                  {STUDIO_REVIEW_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
                </select>
              </StudioProductionField>
              <StudioProductionField label="중요도">
                <select value={newIssue.severity} onChange={(event) => setNewIssue((current) => ({ ...current, severity: event.currentTarget.value as StudioReviewSeverity }))} className={STUDIO_PRODUCTION_INPUT_CLASS}>
                  {STUDIO_REVIEW_SEVERITIES.map((severity) => <option key={severity} value={severity}>{SEVERITY_LABELS[severity]}</option>)}
                </select>
              </StudioProductionField>
              <div className="md:col-span-2 xl:col-span-4">
                <StudioProductionField label="상세 내용">
                  <textarea value={newIssue.detail} onChange={(event) => setNewIssue((current) => ({ ...current, detail: event.currentTarget.value }))} className={STUDIO_PRODUCTION_TEXTAREA_CLASS} />
                </StudioProductionField>
              </div>
              <StudioProductionField label="담당자">
                <input value={newIssue.assignee} onChange={(event) => setNewIssue((current) => ({ ...current, assignee: event.currentTarget.value }))} className={STUDIO_PRODUCTION_INPUT_CLASS} placeholder="미배정" />
              </StudioProductionField>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={buttonClass({ variant: "quiet", size: "sm" })} onClick={() => setShowAdd(false)}>취소</button>
              <button type="submit" className={buttonClass({ size: "sm" })}>등록</button>
            </div>
          </form>
        ) : null}

        <div className="grid min-h-[34rem] xl:grid-cols-[minmax(22rem,0.85fr)_minmax(24rem,1.15fr)]">
          <div className="border-b border-line xl:border-b-0 xl:border-r">
            {filtered.length === 0 ? (
              <div className="p-4">
                <StudioProductionEmpty icon={<Sparkles className="size-5" aria-hidden="true" />} title="조건에 맞는 이슈가 없습니다" description="필터를 바꾸거나 새 검수 이슈를 등록하세요." />
              </div>
            ) : (
              <div className="divide-y divide-line">
                {filtered.map((item) => (
                  <article
                    key={item.id}
                    className={cn(
                      "flex cursor-pointer gap-3 p-4 transition-colors hover:bg-raised/50",
                      selectedIssueId === item.id ? "bg-accent-soft/50" : "",
                    )}
                    onClick={() => setSelectedIssueId(item.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(item.id)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleChecked(item.id)}
                      aria-label={`${item.title} 선택`}
                      className="mt-1 size-4 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StudioProductionPill tone={severityTone(item.severity)}>{SEVERITY_LABELS[item.severity]}</StudioProductionPill>
                        <StudioProductionPill>{CATEGORY_LABELS[item.category]}</StudioProductionPill>
                        <StudioProductionPill tone={statusTone(item.status)}>{STATUS_LABELS[item.status]}</StudioProductionPill>
                      </div>
                      <h3 className="mt-2 text-sm font-bold leading-snug text-fg">{item.title}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-2">{item.detail}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-fg-3">
                        <span>{item.pageLabel}</span>
                        <span>담당 {item.assignee}</span>
                        <span>마감 {formatStudioProductionDate(item.dueOn)}</span>
                        <span>댓글 {item.comments.length}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="p-4">
            {selectedIssue ? (
              <div className="space-y-4">
                <header>
                  <div className="flex flex-wrap items-center gap-2">
                    <StudioProductionPill tone={severityTone(selectedIssue.severity)}>{SEVERITY_LABELS[selectedIssue.severity]}</StudioProductionPill>
                    <StudioProductionPill>{CATEGORY_LABELS[selectedIssue.category]}</StudioProductionPill>
                    <StudioProductionPill tone={statusTone(selectedIssue.status)}>{STATUS_LABELS[selectedIssue.status]}</StudioProductionPill>
                  </div>
                  <h2 className="mt-3 text-xl font-black tracking-tight text-fg">{selectedIssue.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-fg-2">{selectedIssue.detail || "상세 설명이 없습니다."}</p>
                </header>

                <div className="grid gap-3 sm:grid-cols-3">
                  <StudioProductionField label="상태">
                    <select value={selectedIssue.status} onChange={(event) => patchIssue(selectedIssue.id, { status: event.currentTarget.value as StudioReviewStatus })} className={STUDIO_PRODUCTION_INPUT_CLASS}>
                      {STUDIO_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                    </select>
                  </StudioProductionField>
                  <StudioProductionField label="담당자">
                    <input defaultValue={selectedIssue.assignee} onBlur={(event) => patchIssue(selectedIssue.id, { assignee: event.currentTarget.value })} className={STUDIO_PRODUCTION_INPUT_CLASS} />
                  </StudioProductionField>
                  <StudioProductionField label="마감일">
                    <input type="date" value={selectedIssue.dueOn} onChange={(event) => patchIssue(selectedIssue.id, { dueOn: event.currentTarget.value })} className={STUDIO_PRODUCTION_INPUT_CLASS} />
                  </StudioProductionField>
                </div>

                <StudioProductionCard title={`댓글 ${selectedIssue.comments.length}개`} className="bg-panel/50">
                  <div className="space-y-2">
                    {selectedIssue.comments.length === 0 ? <p className="text-xs text-fg-3">아직 댓글이 없습니다.</p> : null}
                    {selectedIssue.comments.map((entry) => (
                      <article key={entry.id} className="rounded-xl border border-line bg-card p-3">
                        <div className="flex items-center justify-between gap-2 text-[0.6875rem] text-fg-3">
                          <strong className="text-fg">{entry.author}</strong>
                          <time>{formatStudioProductionDate(entry.createdAt)}</time>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-fg-2">{entry.body}</p>
                      </article>
                    ))}
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addComment();
                    }}
                  >
                    <input value={comment} onChange={(event) => setComment(event.currentTarget.value)} className={STUDIO_PRODUCTION_INPUT_CLASS} placeholder="수정 내용이나 승인 근거를 남기세요" />
                    <button type="submit" disabled={!comment.trim()} className={buttonClass({ size: "sm" })}>댓글</button>
                  </form>
                </StudioProductionCard>
              </div>
            ) : (
              <StudioProductionEmpty icon={<ClipboardCheck className="size-5" aria-hidden="true" />} title="이슈를 선택하세요" description="왼쪽 목록에서 검수 항목을 선택하면 상세 내용과 승인 이력을 볼 수 있습니다." />
            )}
          </div>
        </div>
      </StudioProductionCard>
    </div>
  );
}
