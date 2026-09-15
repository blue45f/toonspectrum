import {
  CheckCircle2,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  STUDIO_PRODUCTION_ROLES,
  type ProductionReviewIssue,
  type ProductionReviewSeverity,
  type ProductionReviewStatus,
  type ProductionRole,
  type ProductionWorkspace,
} from "./studio-production-workspace-runtime";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface StudioProductionReviewBoardProps {
  readonly workspace: ProductionWorkspace;
  readonly canEdit: boolean;
  readonly canApprove: boolean;
  readonly onCommit: (
    update: (current: ProductionWorkspace) => ProductionWorkspace,
    message: string,
  ) => void;
}

const ROLE_LABELS: Readonly<Record<ProductionRole, string>> = {
  story: "스토리",
  storyboard: "콘티",
  lineart: "선화",
  color: "채색",
  background: "배경",
  lettering: "레터링",
  reviewer: "검수",
  director: "디렉터",
  publisher: "게시",
};
const SEVERITY_LABELS: Readonly<Record<ProductionReviewSeverity, string>> = {
  blocker: "차단",
  major: "중요",
  minor: "경미",
};

function reviewTone(severity: ProductionReviewSeverity): string {
  if (severity === "blocker") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (severity === "major") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-line bg-raised text-fg-2";
}

function ReviewEditor({
  issue,
  workspace,
  canEdit,
  canApprove,
  onCommit,
}: {
  readonly issue: ProductionReviewIssue;
  readonly workspace: ProductionWorkspace;
  readonly canEdit: boolean;
  readonly canApprove: boolean;
  readonly onCommit: StudioProductionReviewBoardProps["onCommit"];
}) {
  const [title, setTitle] = useState(issue.title);
  const [assignee, setAssignee] = useState(issue.assignee);
  const [severity, setSeverity] = useState(issue.severity);
  const [status, setStatus] = useState<ProductionReviewStatus>(issue.status);
  const [hierarchyNodeId, setHierarchyNodeId] = useState(issue.hierarchyNodeId ?? "");
  const [pageId, setPageId] = useState(issue.pageId ?? "");
  const [requestedByRole, setRequestedByRole] = useState<ProductionRole | "">(
    issue.requestedByRole ?? "",
  );
  const [approvalRequired, setApprovalRequired] = useState(issue.approvalRequired ?? false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(issue.title);
    setAssignee(issue.assignee);
    setSeverity(issue.severity);
    setStatus(issue.status);
    setHierarchyNodeId(issue.hierarchyNodeId ?? "");
    setPageId(issue.pageId ?? "");
    setRequestedByRole(issue.requestedByRole ?? "");
    setApprovalRequired(issue.approvalRequired ?? false);
    setError(null);
  }, [issue]);

  const pageNodes = workspace.hierarchy.filter((node) => node.kind === "page" && node.pageId);
  const save = () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("검수 항목 제목을 입력해 주세요.");
      return;
    }
    if (approvalRequired && status === "resolved" && !canApprove) {
      setError("승인 필수 검수는 승인 권한이 있는 구성원만 해결할 수 있습니다.");
      return;
    }
    onCommit((current) => ({
      ...current,
      reviews: current.reviews.map((candidate) => candidate.id === issue.id
        ? {
            ...candidate,
            title: nextTitle,
            assignee: assignee.trim(),
            severity,
            status,
            hierarchyNodeId: hierarchyNodeId || null,
            pageId: pageId || null,
            requestedByRole: requestedByRole || null,
            approvalRequired,
          }
        : candidate),
    }), `“${nextTitle}” 검수 항목을 저장했습니다.`);
    setError(null);
  };

  const toggleResolved = () => {
    const resolving = issue.status === "open";
    if (resolving && issue.approvalRequired && !canApprove) {
      setError("승인 필수 검수는 승인 권한이 있는 구성원만 해결할 수 있습니다.");
      return;
    }
    onCommit((current) => ({
      ...current,
      reviews: current.reviews.map((candidate) => candidate.id === issue.id
        ? { ...candidate, status: resolving ? "resolved" : "open" }
        : candidate),
    }), resolving ? "검수 항목을 해결했습니다." : "검수 항목을 다시 열었습니다.");
  };

  const remove = () => {
    onCommit((current) => ({
      ...current,
      reviews: current.reviews.filter((candidate) => candidate.id !== issue.id),
    }), `“${issue.title}” 검수 항목을 삭제했습니다.`);
  };

  return (
    <article className="rounded-xl border border-line bg-panel p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold">{issue.title}</h3>
            <span className={cn(
              "rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
              reviewTone(issue.severity),
            )}>
              {SEVERITY_LABELS[issue.severity]}
            </span>
            <span className={cn(
              "rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
              issue.status === "resolved"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-accent/30 bg-accent-soft text-accent",
            )}>
              {issue.status === "resolved" ? "해결" : "열림"}
            </span>
            {issue.approvalRequired ? (
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[0.6875rem] font-bold text-violet-700 dark:text-violet-300">
                승인 필수
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-fg-2">담당 {issue.assignee || "미배정"}</p>
        </div>
        <button
          type="button"
          className={buttonClass({ variant: "outline", size: "sm" })}
          onClick={toggleResolved}
          disabled={!canEdit || (issue.status === "open" && issue.approvalRequired && !canApprove)}
        >
          {issue.status === "open" ? (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          ) : (
            <RotateCcw className="size-4" aria-hidden="true" />
          )}
          {issue.status === "open" ? "해결" : "다시 열기"}
        </button>
      </div>

      <details className="mt-3 rounded-xl border border-line bg-card">
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-bold">
          범위·승인 조건 편집
        </summary>
        <div className="grid gap-3 border-t border-line p-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-fg-2 md:col-span-2">
            제목
            <input
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              maxLength={240}
              disabled={!canEdit}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            담당자
            <input
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={assignee}
              onChange={(event) => setAssignee(event.currentTarget.value)}
              maxLength={240}
              disabled={!canEdit}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            심각도
            <select
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={severity}
              onChange={(event) => setSeverity(event.currentTarget.value as ProductionReviewSeverity)}
              disabled={!canEdit}
            >
              {(Object.keys(SEVERITY_LABELS) as ProductionReviewSeverity[]).map((value) => (
                <option key={value} value={value}>{SEVERITY_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            제작 범위
            <select
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={hierarchyNodeId}
              onChange={(event) => setHierarchyNodeId(event.currentTarget.value)}
              disabled={!canEdit}
            >
              <option value="">프로젝트 전체</option>
              {workspace.hierarchy.map((node) => (
                <option key={node.id} value={node.id}>{node.title}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            원고 페이지
            <select
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={pageId}
              onChange={(event) => setPageId(event.currentTarget.value)}
              disabled={!canEdit}
            >
              <option value="">페이지 미지정</option>
              {pageNodes.map((node) => (
                <option key={node.id} value={node.pageId ?? ""}>{node.title}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            요청 역할
            <select
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={requestedByRole}
              onChange={(event) => setRequestedByRole(
                event.currentTarget.value as ProductionRole | "",
              )}
              disabled={!canEdit}
            >
              <option value="">역할 미정</option>
              {STUDIO_PRODUCTION_ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end rounded-xl border border-line px-3 text-xs font-semibold text-fg-2">
            <input
              type="checkbox"
              checked={approvalRequired}
              onChange={(event) => setApprovalRequired(event.currentTarget.checked)}
              disabled={!canEdit || !canApprove}
            />
            해결 시 승인 권한 필요
          </label>
          {error ? (
            <p className="text-xs font-semibold text-red-600 md:col-span-2 xl:col-span-4" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-between gap-2 md:col-span-2 xl:col-span-4">
            <button
              type="button"
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "border-red-500/40 text-red-600 hover:border-red-500 hover:bg-red-500/10",
              })}
              onClick={remove}
              disabled={!canEdit}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              검수 삭제
            </button>
            <button
              type="button"
              className={buttonClass({ size: "sm" })}
              onClick={save}
              disabled={!canEdit || !title.trim() || (approvalRequired && status === "resolved" && !canApprove)}
            >
              <Save className="size-4" aria-hidden="true" />
              검수 정보 저장
            </button>
          </div>
        </div>
      </details>
    </article>
  );
}

export function StudioProductionReviewBoard({
  workspace,
  canEdit,
  canApprove,
  onCommit,
}: StudioProductionReviewBoardProps) {
  if (workspace.reviews.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line p-6 text-center">
        <p className="text-sm font-bold">검수 항목이 없습니다</p>
        <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-fg-2">
          수정 요청을 추가하고 제작 범위·페이지·승인 필수 여부를 지정하세요.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {workspace.reviews.map((issue) => (
        <ReviewEditor
          key={issue.id}
          issue={issue}
          workspace={workspace}
          canEdit={canEdit}
          canApprove={canApprove}
          onCommit={onCommit}
        />
      ))}
    </div>
  );
}
