import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  FileCheck2,
  FileClock,
  FilePlus2,
  Link2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  evaluateProductionStudioRevisionCoverage,
  inferProductionStudioDocumentRole,
  type ProductionProjectAggregate,
  type ProductionStudioDocumentRole,
  type ProductionStudioRevisionLink,
  type RoleAssignment,
} from "@toonspectrum/core/production";

import type { ProductionClientCommand } from "./production-api";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export type ProductionStudioRoleLens = "story" | "art" | "producer";

interface ProductionStudioRevisionWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly roleLens: ProductionStudioRoleLens;
  readonly actorUserId: string | null;
}
const ROLE_LABELS: Readonly<Record<ProductionStudioDocumentRole, string>> = {
  story: "대본",
  thumbnail: "콘티",
  lineart: "선화",
  background: "배경",
  color: "채색·효과",
  lettering: "식자·현지화",
  final: "통합 승인본",
};

function activeAssignment(
  aggregate: ProductionProjectAggregate,
  roleLens: ProductionStudioRoleLens,
  actorUserId: string | null,
): RoleAssignment | null {
  const priorities: Readonly<Record<ProductionStudioRoleLens, readonly RoleAssignment["roleType"][]>> = {
    story: ["story-lead", "writer", "adaptation-writer"],
    art: ["art-lead", "storyboard-artist", "line-artist", "background-artist", "colorist"],
    producer: ["producer", "editor", "rights-reviewer"],
  };
  const actorPartyIds = new Set(aggregate.parties
    .filter((party) => party.accountUserId === actorUserId && party.status === "active")
    .map((party) => party.id));
  const actorAssignments = aggregate.assignments.filter((entry) => (
    entry.status === "active" && actorPartyIds.has(entry.partyId)
  ));
  return priorities[roleLens]
    .map((role) => actorAssignments.find((entry) => entry.roleType === role))
    .find((entry): entry is RoleAssignment => Boolean(entry))
    ?? actorAssignments[0]
    ?? null;
}

function deliverableBelongsToEpisode(
  deliverable: ProductionProjectAggregate["deliverables"][number],
  episodeId: string,
): boolean {
  return deliverable.scope.id === episodeId
    || deliverable.scope.ancestors.some((ancestor) => (
      ancestor.kind === "episode" && ancestor.id === episodeId
    ));
}

function activeLink(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
  role: ProductionStudioDocumentRole,
  deliverableId: string,
): ProductionStudioRevisionLink | null {
  return [...(aggregate.studioRevisionLinks ?? [])]
    .filter((link) => (
      link.episodeId === episodeId
      && link.documentRole === role
      && link.deliverableId === deliverableId
      && link.status !== "superseded"
    ))
    .sort((left, right) => right.linkedAt.localeCompare(left.linkedAt))[0] ?? null;
}

function linkId(deliverableId: string, submissionId: string): string {
  return `studio-link:${deliverableId}:${submissionId}`;
}
export function ProductionStudioRevisionWorkspace({
  aggregate,
  execute,
  canEdit,
  roleLens,
  actorUserId,
}: ProductionStudioRevisionWorkspaceProps) {
  const episodes = aggregate.episodes.filter((episode) => episode.state !== "cancelled");
  const initialEpisodeId = episodes.find((episode) => aggregate.deliverables.some((deliverable) => (
    deliverableBelongsToEpisode(deliverable, episode.episodeId)
    && inferProductionStudioDocumentRole(deliverable.type) !== null
  )))?.episodeId ?? episodes[0]?.episodeId ?? "";
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(initialEpisodeId);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!episodes.some((episode) => episode.episodeId === selectedEpisodeId)) {
      setSelectedEpisodeId(episodes[0]?.episodeId ?? "");
    }
  }, [episodes, selectedEpisodeId]);

  const coverage = useMemo(
    () => evaluateProductionStudioRevisionCoverage(aggregate, selectedEpisodeId),
    [aggregate, selectedEpisodeId],
  );
  const assignment = activeAssignment(aggregate, roleLens, actorUserId);
  const rows = useMemo(() => aggregate.deliverables
    .filter((deliverable) => deliverableBelongsToEpisode(deliverable, selectedEpisodeId))
    .flatMap((deliverable) => {
      const role = inferProductionStudioDocumentRole(deliverable.type);
      if (!role) return [];
      const submission = aggregate.submissions.find((entry) => (
        entry.id === (deliverable.approvedSubmissionId ?? deliverable.currentSubmissionId)
      )) ?? null;
      return [{ deliverable, role, submission, link: activeLink(aggregate, selectedEpisodeId, role, deliverable.id) }];
    }), [aggregate, selectedEpisodeId]);

  const connectSubmission = async (row: (typeof rows)[number]) => {
    if (!canEdit || !assignment || !row.submission || linkingId) return;
    const approved = row.submission.status === "approved"
      && row.deliverable.approvedSubmissionId === row.submission.id;
    const at = new Date().toISOString();
    const link: ProductionStudioRevisionLink = {
      id: linkId(row.deliverable.id, row.submission.id),
      projectId: aggregate.projectId,
      workId: aggregate.workId,
      episodeId: selectedEpisodeId,
      studioDocumentRef: row.submission.revisionRef.id,
      documentRole: row.role,
      studioRevisionRef: row.submission.revisionRef,
      deliverableId: row.deliverable.id,
      submissionId: row.submission.id,
      linkedByAssignmentId: assignment.id,
      status: approved ? "approved" : "submitted",
      linkedAt: at,
      approvedAt: approved ? at : null,
    };
    setLinkingId(link.id);
    try {
      await execute(
        { type: "upsert-studio-revision-link", link },
        `${ROLE_LABELS[row.role]} Studio revision을 제작 산출물에 연결했습니다.`,
      );
    } finally {
      setLinkingId(null);
    }
  };

  if (episodes.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5" aria-labelledby="studio-revision-link-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link2 className="size-4 text-accent" aria-hidden="true" />
            <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-accent">Production ↔ Studio</p>
          </div>
          <h2 id="studio-revision-link-title" className="mt-2 text-lg font-black text-fg">
            실제 원고 revision 연결
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-2">
            업무 완료 표시만으로 다음 공정을 열지 않습니다. Studio 제출본과 승인 revision을 산출물에 고정해 검수·게시 기준으로 사용합니다.
          </p>
        </div>
        <label className="text-xs font-bold text-fg-2">
          회차
          <select
            value={selectedEpisodeId}
            onChange={(event) => setSelectedEpisodeId(event.target.value)}
            className="ml-2 min-h-10 rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
          >
            {episodes.map((episode) => (
              <option key={episode.episodeId} value={episode.episodeId}>{episode.episodeId}</option>
            ))}
          </select>
        </label>
      </header>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[0.6875rem] font-bold text-fg-3">필요 revision</p>
          <p className="mt-1 text-xl font-black text-fg">{coverage.expectedRoles.length}</p>
        </div>
        <div className="rounded-xl border border-good/35 bg-good/10 p-3">
          <p className="text-[0.6875rem] font-bold text-good">승인 연결</p>
          <p className="mt-1 text-xl font-black text-fg">{coverage.approvedRoles.length}</p>
        </div>
        <div className="rounded-xl border border-warn/35 bg-warn/10 p-3">
          <p className="text-[0.6875rem] font-bold text-warn">검수 대기</p>
          <p className="mt-1 text-xl font-black text-fg">{coverage.pendingRoles.length}</p>
        </div>
        <div className={cn(
          "rounded-xl border p-3",
          coverage.missingRoles.length > 0 ? "border-bad/35 bg-bad/10" : "border-good/35 bg-good/10",
        )}>
          <p className={cn("text-[0.6875rem] font-bold", coverage.missingRoles.length > 0 ? "text-bad" : "text-good")}>
            미연결
          </p>
          <p className="mt-1 text-xl font-black text-fg">{coverage.missingRoles.length}</p>
        </div>
      </div>

      <div className={cn(
        "mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-xs",
        coverage.readyForIntegratedReview
          ? "border-good/35 bg-good/10 text-good"
          : "border-line bg-panel text-fg-2",
      )} role="status">
        {coverage.readyForIntegratedReview
          ? <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
          : <CircleAlert className="size-4 shrink-0 text-warn" aria-hidden="true" />}
        <strong>{coverage.readyForIntegratedReview ? "통합 검수 revision 준비 완료" : "아직 통합 검수 기준이 완성되지 않았습니다"}</strong>
        {!coverage.readyForIntegratedReview ? (
          <span>
            {coverage.missingRoles.map((role) => ROLE_LABELS[role]).join(" · ") || "검수 대기 revision"}을 확인하세요.
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {rows.map((row) => {
          const linked = row.link;
          const approved = linked?.status === "approved";
          const pending = linked?.status === "submitted";
          const canConnect = Boolean(canEdit && assignment && row.submission && !linkingId);
          const versionHref = linked
            ? `/studio/work/${encodeURIComponent(aggregate.workId)}/canvas?version=${encodeURIComponent(linked.studioRevisionRef.id)}`
            : `/studio/work/${encodeURIComponent(aggregate.workId)}/canvas`;
          return (
            <article key={row.deliverable.id} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex items-start gap-3">
                <span className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl border",
                  approved
                    ? "border-good/35 bg-good/10 text-good"
                    : pending
                      ? "border-warn/35 bg-warn/10 text-warn"
                      : "border-line bg-card text-fg-3",
                )}>
                  {approved
                    ? <FileCheck2 className="size-5" aria-hidden="true" />
                    : pending
                      ? <FileClock className="size-5" aria-hidden="true" />
                      : <FilePlus2 className="size-5" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black text-fg">{ROLE_LABELS[row.role]}</h3>
                    <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.625rem] font-bold text-fg-3">
                      {row.deliverable.expectedFormat}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-xs text-fg-2">{row.deliverable.type}</p>
                  {row.submission ? (
                    <p className="mt-1 break-all font-mono text-[0.625rem] text-fg-3">
                      {row.submission.revisionRef.id} · r{row.submission.revisionRef.revision}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-fg-3">아직 연결할 제출본이 없습니다.</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  to={versionHref}
                  className={buttonClass({ variant: "outline", size: "sm" })}
                >
                  Studio에서 열기 <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  className={buttonClass({ size: "sm" })}
                  disabled={!canConnect}
                  aria-describedby={!canConnect ? `${row.deliverable.id}-link-reason` : undefined}
                  onClick={() => { void connectSubmission(row); }}
                >
                  <Link2 className="size-3.5" aria-hidden="true" />
                  {linkingId === linkId(row.deliverable.id, row.submission?.id ?? "missing")
                    ? "연결 중…"
                    : approved
                      ? "승인 revision 갱신"
                      : pending
                        ? "검수 revision 갱신"
                        : row.submission?.status === "approved"
                          ? "승인 revision 연결"
                          : "검수 revision 연결"}
                </button>
              </div>
              {!canConnect ? (
                <p id={`${row.deliverable.id}-link-reason`} className="mt-2 text-[0.6875rem] leading-4 text-fg-3">
                  {!row.submission
                    ? "산출물 제출본을 먼저 등록해야 합니다."
                    : !assignment
                      ? "현재 관점에서 사용할 활성 역할 배정이 없습니다."
                      : !canEdit
                        ? "편집 권한이 있어야 revision을 연결할 수 있습니다."
                        : "다른 revision을 연결하는 중입니다."}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line p-6 text-center">
          <FilePlus2 className="mx-auto size-7 text-fg-3" aria-hidden="true" />
          <p className="mt-2 text-sm font-black text-fg">연결할 제작 산출물이 없습니다</p>
          <p className="mt-1 text-xs text-fg-2">회차 작업 보드에서 대본·콘티·작화·통합 산출물을 먼저 구성하세요.</p>
        </div>
      ) : null}
    </section>
  );
}
