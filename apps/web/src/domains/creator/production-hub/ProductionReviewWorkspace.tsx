import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Columns2,
  Eye,
  GitCompareArrows,
  Layers3,
  MessageCirclePlus,
  MessagesSquare,
  ScanLine,
  Send,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  evaluateReviewApproval,
  type ClarificationThread,
  type CutPlan,
  type ProductionProjectAggregate,
  type ReviewDecision,
  type ReviewDecisionValue,
  type ReviewLane,
  type RoleAssignment,
  type ScopeRef,
} from "@toonspectrum/core/production";

import type { ProductionClientCommand } from "./production-api";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export type ProductionRoleLens = "story" | "art" | "producer";
type ReviewMode = "vertical" | "compare" | "overlay";
type ExecuteCommand = (command: ProductionClientCommand, message: string) => Promise<void>;

export interface ProductionReviewWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: ExecuteCommand;
  readonly canEdit: boolean;
  readonly roleLens: ProductionRoleLens;
}

const REVIEW_MODE: readonly { readonly id: ReviewMode; readonly label: string; readonly icon: typeof Eye }[] = [
  { id: "vertical", label: "세로 원고", icon: Eye },
  { id: "compare", label: "나란히 비교", icon: Columns2 },
  { id: "overlay", label: "오버레이", icon: Layers3 },
];

const LANE_LABEL: Readonly<Record<ReviewLane, string>> = {
  narrative: "서사",
  "canon-continuity": "캐논·연속성",
  "visual-direction": "시각 연출",
  production: "제작",
  "lettering-localization": "식자·현지화",
  accessibility: "접근성",
  "rights-compliance": "권리·컴플라이언스",
  "client-publisher": "클라이언트·플랫폼",
};

function uniqueId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

function latestCuts(values: readonly CutPlan[]): readonly CutPlan[] {
  const projected = new Map<string, CutPlan>();
  for (const value of values) {
    const current = projected.get(value.cutId);
    if (!current || current.revision < value.revision) projected.set(value.cutId, value);
  }
  return [...projected.values()]
    .filter((value) => value.status !== "archived" && value.status !== "superseded")
    .sort((left, right) => left.order - right.order);
}

function partyLabel(aggregate: ProductionProjectAggregate, assignmentId: string): string {
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : null;
  return party?.publicDisplayName ?? assignmentId;
}

function lensAssignment(
  aggregate: ProductionProjectAggregate,
  roleLens: ProductionRoleLens,
): RoleAssignment | null {
  const priorities: Readonly<Record<ProductionRoleLens, readonly RoleAssignment["roleType"][]>> = {
    story: ["story-lead", "writer", "adaptation-writer"],
    art: ["art-lead", "storyboard-artist", "line-artist"],
    producer: ["producer", "editor"],
  };
  return priorities[roleLens]
    .map((role) => aggregate.assignments.find((entry) => entry.status === "active" && entry.roleType === role))
    .find((entry): entry is RoleAssignment => Boolean(entry)) ?? null;
}

function oppositeAnswerOwner(
  aggregate: ProductionProjectAggregate,
  roleLens: ProductionRoleLens,
): RoleAssignment | null {
  if (roleLens === "art") return lensAssignment(aggregate, "story");
  return lensAssignment(aggregate, "art") ?? lensAssignment(aggregate, "story");
}

function cutScope(aggregate: ProductionProjectAggregate, cut: CutPlan): ScopeRef {
  return {
    kind: "cut",
    id: cut.cutId,
    ancestors: [
      { kind: "project", id: aggregate.projectId },
      { kind: "episode", id: cut.episodeId },
      { kind: "scene", id: cut.sceneId },
    ],
  };
}

function Pill({ children, tone = "neutral" }: { readonly children: ReactNode; readonly tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  const tones = {
    neutral: "border-line bg-raised text-fg-2",
    good: "border-good/35 bg-good/10 text-good",
    warn: "border-warn/35 bg-warn/10 text-warn",
    bad: "border-bad/35 bg-bad/10 text-bad",
    accent: "border-accent/35 bg-accent-soft text-accent",
  } as const;
  return <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold", tones[tone])}>{children}</span>;
}

function ReviewPanel({
  cut,
  selected,
  issues,
  revisionLabel,
  muted = false,
  onSelect,
}: {
  readonly cut: CutPlan;
  readonly selected: boolean;
  readonly issues: number;
  readonly revisionLabel: string;
  readonly muted?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${cut.cutId} 검수 선택`}
      onClick={onSelect}
      className={cn(
        "relative min-h-48 w-full overflow-hidden rounded-xl border bg-gradient-to-br from-raised via-panel to-accent-soft text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent",
        selected ? "border-accent" : "border-line hover:border-accent/45",
        muted && "opacity-55 grayscale-[35%]",
      )}
    >
      <div className="absolute left-[8%] top-[10%] h-[34%] w-[44%] rounded-[55%_45%_48%_52%] border border-line-strong/50 bg-card/65" />
      <div className="absolute bottom-[18%] right-[10%] h-[42%] w-[35%] rounded-t-full border border-line-strong/45 bg-raised/75" />
      <div className="absolute inset-x-3 bottom-3 rounded-lg border border-line/70 bg-card/90 p-2 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2"><span className="text-[0.6875rem] font-black text-accent">{cut.cutId}</span><span className="text-[0.625rem] text-fg-3">{revisionLabel}</span></div>
        <p className="mt-1 text-xs font-semibold text-fg">{cut.framing}</p>
        <p className="mt-1 line-clamp-1 text-[0.625rem] text-fg-3">{cut.camera}</p>
      </div>
      {issues > 0 ? (
        <span className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full border-2 border-card bg-bad text-[0.6875rem] font-black text-white" aria-label={`${issues}개 검수 이슈`}>{issues}</span>
      ) : null}
    </button>
  );
}

export function ProductionReviewWorkspace({
  aggregate,
  execute,
  canEdit,
  roleLens,
}: ProductionReviewWorkspaceProps) {
  const episodes = aggregate.episodes.filter((episode) => episode.state !== "cancelled");
  const preferredEpisodeId = aggregate.reviewPolicies.find((policy) => policy.scope.kind === "episode")?.scope.id;
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(preferredEpisodeId ?? episodes[0]?.episodeId ?? "");
  const [mode, setMode] = useState<ReviewMode>("vertical");
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    if (!episodes.some((episode) => episode.episodeId === selectedEpisodeId)) {
      setSelectedEpisodeId(episodes[0]?.episodeId ?? "");
    }
  }, [episodes, selectedEpisodeId]);

  const cuts = useMemo(
    () => latestCuts(aggregate.cutPlans).filter((cut) => cut.episodeId === selectedEpisodeId),
    [aggregate.cutPlans, selectedEpisodeId],
  );
  useEffect(() => {
    if (!selectedCutId || !cuts.some((cut) => cut.cutId === selectedCutId)) setSelectedCutId(cuts[0]?.cutId ?? null);
  }, [cuts, selectedCutId]);

  const selectedCut = cuts.find((cut) => cut.cutId === selectedCutId) ?? null;
  const episodePlan = [...aggregate.episodePlans]
    .filter((plan) => plan.episodeId === selectedEpisodeId)
    .sort((left, right) => right.revision - left.revision)[0] ?? null;
  const handoff = aggregate.handoffs.find((entry) => entry.episodeId === selectedEpisodeId && !["superseded", "cancelled"].includes(entry.status)) ?? null;
  const clarifications = handoff ? aggregate.clarifications.filter((entry) => entry.handoffId === handoff.id) : [];
  const changeRequests = aggregate.changeRequests.filter((entry) => entry.episodeId === selectedEpisodeId);
  const policy = aggregate.reviewPolicies.find((entry) => entry.scope.id === selectedEpisodeId) ?? null;
  const reviewRoundId = aggregate.reviewDecisions.find((entry) => policy?.lanes.some((lane) => lane.lane === entry.lane))?.reviewRoundId
    ?? `${selectedEpisodeId}-review-round-1`;
  const decisions = aggregate.reviewDecisions.filter((entry) => entry.reviewRoundId === reviewRoundId);
  const evaluation = policy ? evaluateReviewApproval(policy, decisions) : null;
  const assignment = lensAssignment(aggregate, roleLens);
  const answerOwner = oppositeAnswerOwner(aggregate, roleLens);

  const deliverableIds = aggregate.deliverables
    .filter((deliverable) => deliverable.scope.id === selectedEpisodeId || deliverable.scope.ancestors.some((ancestor) => ancestor.id === selectedEpisodeId))
    .map((deliverable) => deliverable.id);
  const submissions = aggregate.submissions.filter((submission) => deliverableIds.includes(submission.deliverableId));
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("");
  useEffect(() => {
    if (!submissions.some((submission) => submission.id === selectedSubmissionId)) {
      setSelectedSubmissionId(submissions[0]?.id ?? "");
    }
  }, [selectedSubmissionId, submissions]);
  const submission = submissions.find((entry) => entry.id === selectedSubmissionId) ?? submissions[0] ?? null;

  const issueCountForCut = (cut: CutPlan): number => {
    const directClarifications = clarifications.filter((entry) => entry.scope.id === cut.cutId || entry.scope.id === cut.sceneId).length;
    const directChanges = changeRequests.filter((entry) => entry.changedScopes.some((scope) => scope.id === cut.cutId || scope.id === cut.sceneId)).length;
    const fallback = cut.order === 1 ? clarifications.filter((entry) => entry.scope.id === selectedEpisodeId).length : 0;
    return directClarifications + directChanges + fallback;
  };

  const recordDecision = async (lane: ReviewLane, value: ReviewDecisionValue) => {
    if (!policy || !assignment || !canEdit) return;
    const rule = policy.lanes.find((entry) => entry.lane === lane);
    if (!rule || !rule.eligibleAssignmentIds.includes(assignment.id)) return;
    const scope = selectedCut ? cutScope(aggregate, selectedCut) : policy.scope;
    const decision: ReviewDecision = {
      id: uniqueId("review-decision"),
      reviewRoundId,
      lane,
      assignmentId: assignment.id,
      value,
      reasonCode: value === "approve" ? "reviewed-against-canonical-intent" : "revision-required",
      evidenceScopeRefs: [scope],
      conditions: value === "request-changes" ? ["선택한 컷의 검수 의견을 반영한 새 revision 제출"] : [],
      createdAt: new Date().toISOString(),
    };
    await execute({ type: "record-review-decision", policyId: policy.id, decision }, `${LANE_LABEL[lane]} lane에 ${value === "approve" ? "승인" : "수정 요청"} 결정을 기록했습니다.`);
  };

  const addClarification = async () => {
    const question = comment.trim();
    if (!question || !handoff || !selectedCut || !assignment || !answerOwner || !canEdit) return;
    const clarification: ClarificationThread = {
      id: uniqueId("clarification"),
      handoffId: handoff.id,
      scope: cutScope(aggregate, selectedCut),
      category: "visual-reference",
      blocking,
      question,
      askedByAssignmentId: assignment.id,
      answerOwnerAssignmentId: answerOwner.id,
      dueAt: blocking ? new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString() : null,
      status: "open",
      answer: null,
      decisionRecordId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await execute({ type: "upsert-clarification", clarification }, `${selectedCut.cutId}에 검수 질문을 추가했습니다.`);
    setComment("");
    setBlocking(false);
  };

  const eligibleLanes = policy?.lanes.filter((lane) => assignment && lane.eligibleAssignmentIds.includes(assignment.id)) ?? [];

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-card shadow-sm" data-production-review-workspace>
      <header className="border-b border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-accent"><GitCompareArrows className="size-4" aria-hidden="true" /><p className="text-[0.6875rem] font-black uppercase tracking-[0.14em]">Visual Review Workspace</p></div>
            <h2 className="mt-1 text-lg font-black text-fg">원고 비교·주석·승인</h2>
            <p className="mt-1 text-xs leading-5 text-fg-2">회차 정본과 제출 revision을 컷 위치를 유지한 채 검수합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2">회차 <select aria-label="검수 회차" value={selectedEpisodeId} onChange={(event) => setSelectedEpisodeId(event.target.value)} className="ml-2 bg-transparent font-semibold text-fg outline-none">{episodes.map((episode) => <option key={episode.episodeId} value={episode.episodeId}>{episode.episodeId}</option>)}</select></label>
            <label className="rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2">제출본 <select aria-label="검수 제출본" value={selectedSubmissionId} onChange={(event) => setSelectedSubmissionId(event.target.value)} className="ml-2 max-w-44 bg-transparent font-semibold text-fg outline-none"><option value="">제출본 없음</option>{submissions.map((entry) => <option key={entry.id} value={entry.id}>{entry.id}</option>)}</select></label>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-xl border border-line bg-card p-1" role="group" aria-label="검수 비교 방식">{REVIEW_MODE.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent", mode === id ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")}><Icon className="size-3.5" aria-hidden="true" />{label}</button>)}</div>
          <div className="flex flex-wrap gap-2"><Pill tone={submission?.status === "approved" ? "good" : submission ? "warn" : "neutral"}>{submission ? `${submission.status} · r${submission.revisionRef.revision}` : "제출본 없음"}</Pill><Pill tone={evaluation?.approved ? "good" : "warn"}>{evaluation?.approved ? "검수 통과" : `${evaluation?.blockingLanes.length ?? 0} lane 대기`}</Pill><Pill>{assignment ? `${partyLabel(aggregate, assignment.id)} · ${assignment.publicCreditRole ?? assignment.roleType}` : "역할 배정 없음"}</Pill></div>
        </div>
      </header>

      <div className="grid min-h-[46rem] xl:grid-cols-[13rem_minmax(0,1fr)_21rem]">
        <aside className="border-b border-line bg-panel/70 p-3 xl:border-b-0 xl:border-r" aria-label="검수 컷 목록">
          <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-fg-3">컷 내비게이터</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 xl:block xl:max-h-[40rem] xl:space-y-2 xl:overflow-y-auto">
            {cuts.map((cut) => { const issues = issueCountForCut(cut); return <button key={cut.cutId} type="button" aria-pressed={selectedCutId === cut.cutId} onClick={() => setSelectedCutId(cut.cutId)} className={cn("min-w-40 rounded-xl border p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent xl:min-w-0 xl:w-full", selectedCutId === cut.cutId ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-raised")}><div className="flex items-center justify-between gap-2"><span className="text-[0.6875rem] font-black text-accent">{cut.cutId}</span>{issues > 0 ? <span className="flex size-5 items-center justify-center rounded-full bg-bad text-[0.625rem] font-black text-white">{issues}</span> : <CheckCircle2 className="size-4 text-good" aria-label="열린 이슈 없음" />}</div><p className="mt-1 line-clamp-2 text-xs font-semibold leading-4 text-fg">{cut.framing}</p></button>; })}
          </div>
          {cuts.length === 0 ? <div className="mt-3 rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-3">이 회차에 검수할 컷 계획이 없습니다.</div> : null}
        </aside>

        <div className="min-w-0 border-b border-line bg-canvas/65 p-3 sm:p-4 xl:border-b-0 xl:border-r">
          {cuts.length > 0 ? (
            <div className="mx-auto max-w-4xl">
              {mode === "vertical" ? <div className="mx-auto max-w-md rounded-[2rem] border border-line bg-card p-3 shadow-lg"><div className="mb-3 flex items-center justify-between rounded-xl bg-raised px-3 py-2 text-[0.6875rem] text-fg-2"><span className="inline-flex items-center gap-1"><ScanLine className="size-3.5" />세로 독자뷰</span><span>{episodePlan?.targetScrollHeightPx.toLocaleString("ko-KR") ?? "—"}px 목표</span></div><div className="space-y-4 bg-canvas p-2">{cuts.map((cut) => <ReviewPanel key={cut.cutId} cut={cut} selected={selectedCutId === cut.cutId} issues={issueCountForCut(cut)} revisionLabel={`계획 r${cut.revision}`} onSelect={() => setSelectedCutId(cut.cutId)} />)}</div></div> : null}

              {mode === "compare" ? <div className="grid gap-4 lg:grid-cols-2"><div><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black text-fg">기준 revision</p><Pill>Story/Thumbnail baseline</Pill></div><div className="space-y-3 rounded-2xl border border-line bg-card p-3">{cuts.map((cut) => <ReviewPanel key={`base-${cut.cutId}`} cut={cut} selected={selectedCutId === cut.cutId} issues={0} muted revisionLabel={`base r${Math.max(1, cut.revision - 1)}`} onSelect={() => setSelectedCutId(cut.cutId)} />)}</div></div><div><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black text-fg">제출 revision</p><Pill tone="accent">{submission ? `r${submission.revisionRef.revision}` : "미제출"}</Pill></div><div className="space-y-3 rounded-2xl border border-accent/30 bg-accent-soft/35 p-3">{cuts.map((cut) => <ReviewPanel key={`head-${cut.cutId}`} cut={cut} selected={selectedCutId === cut.cutId} issues={issueCountForCut(cut)} revisionLabel={submission ? `제출 r${submission.revisionRef.revision}` : `계획 r${cut.revision}`} onSelect={() => setSelectedCutId(cut.cutId)} />)}</div></div></div> : null}

              {mode === "overlay" && selectedCut ? <div className="mx-auto max-w-lg"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black text-fg">선택 컷 오버레이 비교</p><Pill tone="accent">차이 강조</Pill></div><div className="relative overflow-hidden rounded-2xl border border-line bg-card p-3"><ReviewPanel cut={selectedCut} selected issues={issueCountForCut(selectedCut)} revisionLabel="제출본" onSelect={() => undefined} /><div className="pointer-events-none absolute inset-3 translate-x-2 translate-y-1 rounded-xl border-2 border-dashed border-warn/70 bg-warn/10 mix-blend-multiply dark:mix-blend-screen" /><div className="pointer-events-none absolute left-[18%] top-[22%] rounded-full border-2 border-bad bg-card/90 px-2 py-1 text-[0.6875rem] font-black text-bad">구도 이동</div><div className="pointer-events-none absolute bottom-[27%] right-[15%] rounded-full border-2 border-accent bg-card/90 px-2 py-1 text-[0.6875rem] font-black text-accent">정보 공개 범위</div></div><p className="mt-3 text-center text-xs leading-5 text-fg-2">실제 픽셀 diff가 연결되기 전에는 계획·제출 revision 메타데이터와 주석 범위를 비교합니다.</p></div> : null}
            </div>
          ) : <div className="flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-line"><div className="text-center"><Eye className="mx-auto size-8 text-fg-3" /><p className="mt-3 text-sm font-bold text-fg">검수할 컷이 없습니다</p><p className="mt-1 text-xs text-fg-2">기획 캔버스에서 컷을 만든 뒤 제출 revision과 비교하세요.</p></div></div>}
        </div>

        <aside className="bg-panel/70 p-3 sm:p-4" aria-label="검수 인스펙터">
          <div className="space-y-4">
            <section className="rounded-2xl border border-line bg-card p-3">
              <div className="flex items-center gap-2"><BadgeCheck className="size-4 text-accent" aria-hidden="true" /><h3 className="text-xs font-black text-fg">승인 Lane</h3></div>
              <div className="mt-3 space-y-2">
                {policy?.lanes.map((lane) => {
                  const result = evaluation?.laneResults.find((entry) => entry.lane === lane.lane);
                  const eligible = Boolean(assignment && lane.eligibleAssignmentIds.includes(assignment.id));
                  return <div key={lane.lane} className="rounded-xl border border-line bg-panel p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-fg">{LANE_LABEL[lane.lane]}</span><Pill tone={result?.approved ? "good" : result?.vetoedByAssignmentIds.length ? "bad" : "warn"}>{result?.approved ? "승인" : `${result?.approvals ?? 0}/${result?.requiredApprovals ?? lane.quorum}`}</Pill></div><p className="mt-1 text-[0.6875rem] text-fg-3">{lane.blocksPublication ? "게시 차단 lane" : "권고 lane"} · {eligible ? "현재 역할 결정 가능" : "현재 역할 관찰"}</p>{eligible ? <div className="mt-2 grid grid-cols-2 gap-1.5"><button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit} onClick={() => void recordDecision(lane.lane, "approve")}><CheckCircle2 className="size-3.5" />승인</button><button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit} onClick={() => void recordDecision(lane.lane, "request-changes")}><XCircle className="size-3.5" />수정</button></div> : null}</div>;
                })}
                {!policy ? <p className="rounded-xl border border-dashed border-line p-3 text-xs text-fg-3">이 회차의 검수 정책이 없습니다.</p> : null}
              </div>
              {eligibleLanes.length === 0 && policy ? <div className="mt-3 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 p-2.5 text-[0.6875rem] leading-5 text-fg-2"><ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />현재 역할에는 이 회차의 승인 권한이 없습니다.</div> : null}
            </section>

            <section className="rounded-2xl border border-line bg-card p-3">
              <div className="flex items-center gap-2"><MessageCirclePlus className="size-4 text-accent" aria-hidden="true" /><h3 className="text-xs font-black text-fg">컷 위치 질문</h3></div>
              <p className="mt-1 text-[0.6875rem] leading-5 text-fg-3">{selectedCut ? `${selectedCut.cutId}에 고정됩니다.` : "먼저 컷을 선택하세요."}</p>
              <textarea aria-label="검수 질문" value={comment} onChange={(event) => setComment(event.target.value)} rows={3} disabled={!canEdit || !selectedCut || !handoff || !assignment || !answerOwner} placeholder="수정 이유나 확인할 의도를 입력하세요." className="mt-3 w-full resize-y rounded-xl border border-line bg-panel p-3 text-xs leading-5 text-fg outline-none focus:border-accent/50 disabled:opacity-60" />
              <label className="mt-2 flex items-center gap-2 text-xs text-fg-2"><input type="checkbox" checked={blocking} disabled={!canEdit} onChange={(event) => setBlocking(event.target.checked)} className="size-4 rounded border-line accent-[rgb(var(--accent))]" />답변 전 다음 공정 차단</label>
              <button type="button" className={cn(buttonClass({ size: "sm" }), "mt-3 w-full")} disabled={!canEdit || !comment.trim() || !selectedCut || !handoff || !assignment || !answerOwner} onClick={() => void addClarification()}><Send className="size-4" />질문 추가</button>
            </section>

            <section className="rounded-2xl border border-line bg-card p-3">
              <div className="flex items-center gap-2"><MessagesSquare className="size-4 text-accent" aria-hidden="true" /><h3 className="text-xs font-black text-fg">열린 이슈</h3></div>
              <div className="mt-3 space-y-2">
                {clarifications.filter((entry) => entry.status === "open" || entry.status === "answered").map((entry) => <div key={entry.id} className={cn("rounded-xl border p-2.5", entry.blocking ? "border-bad/30 bg-bad/10" : "border-line bg-panel")}><div className="flex items-center gap-2">{entry.blocking ? <AlertTriangle className="size-3.5 text-bad" /> : <MessagesSquare className="size-3.5 text-fg-3" />}<Pill tone={entry.blocking ? "bad" : "neutral"}>{entry.scope.id}</Pill></div><p className="mt-2 text-xs font-semibold leading-5 text-fg">{entry.question}</p><p className="mt-1 text-[0.6875rem] text-fg-3">{partyLabel(aggregate, entry.askedByAssignmentId)} → {partyLabel(aggregate, entry.answerOwnerAssignmentId)}</p></div>)}
                {clarifications.filter((entry) => entry.status === "open" || entry.status === "answered").length === 0 ? <div className="rounded-xl border border-dashed border-line p-3 text-center text-xs text-fg-3">열린 질문이 없습니다.</div> : null}
              </div>
            </section>
          </div>
        </aside>
      </div>
    </section>
  );
}
