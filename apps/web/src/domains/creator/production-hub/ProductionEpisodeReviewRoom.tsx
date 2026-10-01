import { BadgeCheck, Columns2, Info, LockKeyhole, MessageSquareMore, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ProductionProjectAggregate, ReviewLane } from "@toonstudio/core/production";

import type { StudioCommentsDocument } from "../studio-comments";
import { ManuscriptPinFeedbackBridge } from "./ManuscriptPinFeedback";
import { ProcessCompareViewer } from "./ProcessCompareViewer";
import {
  countOpenPins,
  countOpenUrgentPins,
  createEpisodeSampleCompareItems,
  createEpisodeSampleComments,
  deriveEpisodeApprovalGate,
  EPISODE_SAMPLE_PAGE,
  episodeRoomAssigneeOptions,
  resolveEpisodeApprover,
} from "./production-episode-room-model";
import { reviewLaneLabel } from "./production-labels";
import { productionSurfacePath } from "./production-project-surfaces";
import { ProductionPill, ProductionSampleBadge } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

type RoomTab = "viewer" | "compare";

export interface ProductionEpisodeReviewRoomProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly episodeId: string;
  readonly isDemo: boolean;
  readonly canEdit: boolean;
  readonly roleLens: CreatorRoleLens;
  /** 로그인 사용자와 연결된 참여 배정. 실제 프로젝트에서 승인 주체를 정한다. */
  readonly viewerAssignmentId: string | null;
  readonly onApproveLane: (lane: ReviewLane, assignmentId: string) => Promise<void>;
}

/**
 * 회차 룸의 중심: 원고 위에 핀 코멘트를 달고, 공정 버전을 비교하고,
 * 필수 수정이 남아 있으면 승인을 잠그는 흐름을 한 화면에서 보여 준다.
 */
export function ProductionEpisodeReviewRoom({
  aggregate,
  episodeId,
  isDemo,
  canEdit,
  roleLens,
  viewerAssignmentId,
  onApproveLane,
}: ProductionEpisodeReviewRoomProps) {
  const bt = useBilingual("ProductionEpisodeReviewRoom");
  // 보기 탭은 주소에 남겨 링크로 공유하거나 새로고침해도 같은 화면을 연다.
  const [params, setParams] = useSearchParams();
  const tab: RoomTab = params.get("roomView") === "compare" ? "compare" : "viewer";
  const setTab = (next: RoomTab) => setParams((previous) => {
    const updated = new URLSearchParams(previous);
    if (next === "compare") updated.set("roomView", "compare");
    else updated.delete("roomView");
    return updated;
  }, { replace: true });
  const [comments, setComments] = useState<StudioCommentsDocument | null>(() =>
    isDemo ? createEpisodeSampleComments(aggregate, new Date()) : null);
  const [approving, setApproving] = useState(false);
  const compareItems = useMemo(
    () => isDemo
      ? createEpisodeSampleCompareItems(new Date(), {
        storyboard: bt("콘티", "Storyboard"),
        lineArt: bt("선화·명암", "Line & tone"),
        color: bt("채색", "Color"),
      })
      : [],
    [bt, isDemo],
  );
  const approver = resolveEpisodeApprover(aggregate, episodeId, { isDemo, roleLens, viewerAssignmentId });
  const assigneeOptions = useMemo(() => episodeRoomAssigneeOptions(aggregate, bt), [aggregate, bt]);
  const gate = deriveEpisodeApprovalGate(aggregate, episodeId);
  const myLane = approver?.lane ?? null;
  const myLaneState = myLane ? gate.lanes.find((lane) => lane.lane === myLane) ?? null : null;
  const urgentOpen = comments ? countOpenUrgentPins(comments, EPISODE_SAMPLE_PAGE.pageId) : 0;
  const openPins = comments ? countOpenPins(comments, EPISODE_SAMPLE_PAGE.pageId) : 0;
  const manuscriptsHref = productionSurfacePath(aggregate.projectId, "manuscripts", `episode=${encodeURIComponent(episodeId)}&manuscriptView=feedback`);
  const lockReason = !canEdit
    ? bt("편집 권한이 있어야 승인할 수 있습니다.", "You need edit access to approve.")
    : !approver || !myLaneState
      ? isDemo
        ? bt("이 회차 검수 정책에 선택한 역할의 승인 항목이 없습니다.", "The selected role has no approval lane in this review policy.")
        : bt("이 회차에서 내 계정이 승인할 항목이 없습니다.", "Your account has no approval lane in this episode.")
      : myLaneState.approved
        ? bt("내 역할의 승인이 이미 기록되었습니다.", "Your approval is already recorded.")
        : urgentOpen > 0
            ? bt(`필수 수정 핀 ${urgentOpen}개를 먼저 해결해야 승인할 수 있습니다.`, `Resolve ${urgentOpen} required-fix pins before approving.`)
            : null;

  const approve = async () => {
    if (lockReason || !approver || approving) return;
    setApproving(true);
    try {
      await onApproveLane(approver.lane, approver.assignmentId);
    } finally {
      setApproving(false);
    }
  };

  return (
    <section
      aria-labelledby="episode-review-room-title"
      data-production-episode-review-room="true"
      className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="episode-review-room-title" className="text-lg font-black tracking-tight text-fg">
              {bt("원고 검수", "Manuscript review")}
            </h2>
            {isDemo ? <ProductionSampleBadge label={bt("예시 원고·코멘트", "Sample pages & comments")} /> : null}
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-2">
            {bt(
              "원고 위를 눌러 핀을 꽂고 의견을 남기세요. '긴급'으로 표시한 핀은 필수 수정이 되어, 해결될 때까지 내 역할의 승인이 잠깁니다.",
              "Click the page to drop a pin. Pins marked urgent become required fixes and lock your approval until they are resolved.",
            )}
          </p>
        </div>
        <div className="flex rounded-xl border border-line bg-panel p-1" role="tablist" aria-label={bt("검수 보기", "Review view")}>
          {([
            ["viewer", MessageSquareMore, bt("원고 뷰어·핀 코멘트", "Viewer & pins")],
            ["compare", Columns2, bt("버전 비교", "Compare versions")],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`episode-review-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`episode-review-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const next: RoomTab = event.key === "Home" ? "viewer" : event.key === "End" ? "compare" : tab === "viewer" ? "compare" : "viewer";
                setTab(next);
                event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#episode-review-tab-${next}`)?.focus();
              }}
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
                tab === id ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div
          role="tabpanel"
          id={`episode-review-panel-${tab}`}
          aria-labelledby={`episode-review-tab-${tab}`}
          className="min-w-0"
        >
          {tab === "viewer" ? (
            comments ? (
              <ManuscriptPinFeedbackBridge
                imageSrc={EPISODE_SAMPLE_PAGE.imageSrc}
                imageAlt={bt(EPISODE_SAMPLE_PAGE.alt.ko, EPISODE_SAMPLE_PAGE.alt.en)}
                pageId={EPISODE_SAMPLE_PAGE.pageId}
                document={comments}
                onChange={setComments}
                currentActor={approver?.actor ?? { displayName: bt("나", "Me") }}
                assigneeOptions={assigneeOptions}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-line bg-panel p-6 text-center">
                <MessageSquareMore className="mx-auto size-7 text-accent" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-fg">{bt("원고와 핀 코멘트는 고정 검수본에서 엽니다", "Pages and pins open from a pinned review")}</p>
                <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-fg-2">
                  {bt(
                    "실제 원고 이미지와 코멘트는 Studio 원고 버전에 고정된 검수본이 기준입니다. 원고·버전의 피드백 탭에서 이 회차 검수본을 선택하세요.",
                    "Real pages and comments come from a review snapshot pinned to a Studio version. Pick this episode's snapshot in the Feedback tab.",
                  )}
                </p>
                <Link className={buttonClass({ size: "sm", className: "mt-4 min-h-11" })} to={manuscriptsHref}>
                  {bt("원고·버전 피드백 열기", "Open manuscript feedback")}
                </Link>
              </div>
            )
          ) : compareItems.length >= 2 ? (
            <ProcessCompareViewer items={compareItems} title={bt("공정 비교", "Process compare")} />
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-panel p-6 text-center">
              <Columns2 className="mx-auto size-7 text-accent" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-fg">{bt("비교할 버전을 원고·버전에서 고르세요", "Pick versions to compare in Manuscripts")}</p>
              <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-fg-2">
                {bt("버전은 Studio 원고의 수정 기록에서 옵니다. 과거 버전을 덮어쓰지 않고 새 버전으로 복원합니다.", "Versions come from the Studio history. Restores create a new version instead of overwriting.")}
              </p>
              <Link className={buttonClass({ size: "sm", className: "mt-4 min-h-11" })} to={productionSurfacePath(aggregate.projectId, "manuscripts", `episode=${encodeURIComponent(episodeId)}&manuscriptView=versions`)}>
                {bt("버전 비교 열기", "Open version compare")}
              </Link>
            </div>
          )}
        </div>

        <aside aria-labelledby="episode-approval-gate-title" className="rounded-2xl border border-line bg-panel p-4">
          <h3 id="episode-approval-gate-title" className="flex items-center gap-2 text-sm font-black text-fg">
            <BadgeCheck className="size-4 text-accent" aria-hidden="true" />
            {bt("승인 게이트", "Approval gate")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt("모든 필수 역할이 승인해야 다음 공정과 게시로 넘어갑니다.", "Every required role must approve before the next step or publishing.")}
          </p>
          {gate.lanes.length ? (
            <ul className="mt-3 space-y-2">
              {gate.lanes.map((lane) => (
                <li key={lane.lane} className={cn("flex items-center justify-between gap-2 rounded-xl border px-3 py-2", lane.lane === myLane ? "border-accent/40 bg-accent-soft" : "border-line bg-card")}>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-fg">
                      {reviewLaneLabel(lane.lane, bt)}
                      {lane.lane === myLane ? <span className="ml-1 font-normal text-accent">· {bt("내 역할", "You")}</span> : null}
                    </span>
                    <span className="text-[0.6875rem] text-fg-3">{bt(`${lane.approvals}/${lane.requiredApprovals} 승인`, `${lane.approvals}/${lane.requiredApprovals} approved`)}</span>
                  </span>
                  <ProductionPill tone={lane.approved ? "success" : lane.changeRequested ? "danger" : "warning"}>
                    {lane.approved ? bt("승인", "Approved") : lane.changeRequested ? bt("수정 요청", "Changes") : bt("대기", "Waiting")}
                  </ProductionPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-line p-3 text-xs text-fg-3">
              {bt("이 회차에는 검수 정책이 없습니다. 검수 화면에서 역할별 승인 기준을 정하세요.", "No review policy for this episode yet. Set one in Review.")}
            </p>
          )}

          {comments ? (
            <div className={cn("mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs leading-5", urgentOpen ? "border-bad/35 bg-bad/10 text-fg" : "border-good/35 bg-good/10 text-fg")}>
              {urgentOpen ? <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" /> : <BadgeCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />}
              <span>
                {urgentOpen
                  ? bt(`필수 수정 핀 ${urgentOpen}개 · 미해결 핀 ${openPins}개`, `${urgentOpen} required fixes · ${openPins} open pins`)
                  : bt(`필수 수정 없음 · 미해결 핀 ${openPins}개`, `No required fixes · ${openPins} open pins`)}
              </span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void approve()}
            disabled={Boolean(lockReason) || approving}
            aria-describedby="episode-approval-lock-reason"
            className={buttonClass({ className: "mt-3 min-h-11 w-full gap-1.5" })}
          >
            {lockReason ? <LockKeyhole className="size-4" aria-hidden="true" /> : <BadgeCheck className="size-4" aria-hidden="true" />}
            {approving
              ? bt("기록 중…", "Recording…")
              : myLane
                ? bt(`${reviewLaneLabel(myLane, bt)} 승인`, `Approve ${reviewLaneLabel(myLane, bt)}`)
                : bt("승인", "Approve")}
          </button>
          <p id="episode-approval-lock-reason" className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-5 text-fg-3" role="status">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {lockReason ?? bt("승인하면 되돌릴 수 없는 결정 기록으로 남습니다.", "Approval is kept as a permanent decision record.")}
          </p>
        </aside>
      </div>
    </section>
  );
}
