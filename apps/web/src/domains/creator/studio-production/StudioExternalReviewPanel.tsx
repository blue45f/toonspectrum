import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  MessageSquare,
  Send,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addStudioExternalReviewFeedback,
  loadStudioExternalReview,
  type StudioExternalReviewFeedback,
  type StudioExternalReviewSnapshot,
} from "./studio-production-server-client";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface StudioExternalReviewPanelProps {
  readonly token: string | null;
}

type ReviewState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly snapshot: StudioExternalReviewSnapshot };

export function StudioExternalReviewPanel({ token }: StudioExternalReviewPanelProps) {
  const [state, setState] = useState<ReviewState>({ kind: "loading" });
  const [reviewerName, setReviewerName] = useState("");
  const [kind, setKind] = useState<"comment" | "approve" | "reject">("comment");
  const [pageId, setPageId] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!token) {
      setState({ kind: "error", message: "검토 링크 토큰이 없습니다." });
      return;
    }
    setState({ kind: "loading" });
    try {
      const snapshot = await loadStudioExternalReview(token, signal);
      setState({ kind: "ready", snapshot });
      setPageId((current) => current || snapshot.work.pages[0]?.id || "");
    } catch (cause) {
      if (signal?.aborted) return;
      setState({
        kind: "error",
        message: cause instanceof Error ? cause.message : "검토 원고를 불러오지 못했습니다.",
      });
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const feedback = state.kind === "ready" ? state.snapshot.feedback : [];
  const groupedFeedback = useMemo(() => {
    const groups = new Map<string, StudioExternalReviewFeedback[]>();
    for (const item of feedback) {
      const key = item.anchor?.pageId ?? "project";
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }
    return groups;
  }, [feedback]);

  const submit = async () => {
    if (!token || state.kind !== "ready" || state.snapshot.link.role !== "commenter") return;
    if (!reviewerName.trim() || (kind !== "approve" && !body.trim())) {
      setNotice("검토자 이름과 댓글 또는 반려 사유를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const created = await addStudioExternalReviewFeedback(token, {
        kind,
        reviewerName: reviewerName.trim(),
        anchor: pageId ? { pageId } : null,
        body: body.trim(),
      });
      setState((current) => current.kind === "ready"
        ? {
            kind: "ready",
            snapshot: {
              ...current.snapshot,
              feedback: [...current.snapshot.feedback, created],
            },
          }
        : current);
      setBody("");
      setNotice(kind === "approve" ? "승인 의견을 저장했습니다." : "검토 의견을 저장했습니다.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "검토 의견을 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-2xl border border-line bg-card" role="status">
        <Loader2 className="mr-2 size-5 animate-spin text-accent" aria-hidden="true" />
        검토 원고를 불러오는 중입니다.
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6" role="alert">
        <AlertTriangle className="size-8 text-red-600" aria-hidden="true" />
        <h2 className="mt-3 text-base font-black">검토 원고를 열 수 없습니다</h2>
        <p className="mt-1 text-sm text-fg-2">{state.message}</p>
        <button type="button" className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-4")} onClick={() => void load()}>
          다시 시도
        </button>
      </div>
    );
  }
  const { snapshot } = state;
  const commenter = snapshot.link.role === "commenter";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 rounded-2xl border border-line bg-card p-3 sm:p-5">
        <header className="mb-5 border-b border-line pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.6875rem] font-black uppercase tracking-[0.16em] text-accent">External review</p>
              <h1 className="mt-1 text-xl font-black tracking-tight">{snapshot.work.title}</h1>
              {snapshot.work.description ? (
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-fg-2">{snapshot.work.description}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-line bg-panel px-2 py-1">
                {commenter ? "댓글·승인 가능" : "열람 전용"}
              </span>
              <span className="rounded-full border border-line bg-panel px-2 py-1">
                만료 {new Date(snapshot.link.expiresAt).toLocaleString("ko-KR")}
              </span>
            </div>
          </div>
        </header>

        {snapshot.work.pages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-fg-2">
            이 링크에 공개된 렌더 페이지가 없습니다.
          </p>
        ) : (
          <div className="space-y-5">
            {snapshot.work.pages.map((page, index) => (
              <article key={page.id} id={`review-page-${page.id}`} className="scroll-mt-28">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
                  <span className="font-bold">{index + 1}페이지 · {page.id}</span>
                  {snapshot.link.allowDownload ? (
                    <a
                      href={page.source}
                      download={`${snapshot.work.title}-${index + 1}`}
                      className={buttonClass({ variant: "quiet", size: "sm" })}
                    >
                      <Download className="size-4" aria-hidden="true" />
                      다운로드
                    </a>
                  ) : null}
                </div>
                <div className="relative overflow-hidden rounded-xl border border-line bg-black/5">
                  <img
                    src={page.source}
                    alt={`${snapshot.work.title} ${index + 1}페이지`}
                    className="block h-auto w-full"
                    loading={index > 1 ? "lazy" : "eager"}
                    draggable={false}
                  />
                  {snapshot.link.watermark ? (
                    <div
                      className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden"
                      aria-hidden="true"
                    >
                      <span className="-rotate-12 select-none whitespace-nowrap text-2xl font-black uppercase tracking-[0.3em] text-black/15 dark:text-white/15 sm:text-4xl">
                        Toon Studio Review
                      </span>
                    </div>
                  ) : null}
                </div>
                {(groupedFeedback.get(page.id) ?? []).length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {(groupedFeedback.get(page.id) ?? []).map((item) => (
                      <FeedbackItem key={item.id} feedback={item} />
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
        <section className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-5 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-black">검토 의견</h2>
          </div>
          {!commenter ? (
            <p className="mt-3 rounded-xl border border-line bg-panel p-3 text-xs leading-relaxed text-fg-2">
              이 링크는 열람 전용입니다. 의견을 남기려면 댓글 권한이 있는 링크를 요청하세요.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
                검토자 이름
                <input
                  className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                  value={reviewerName}
                  onChange={(event) => setReviewerName(event.currentTarget.value)}
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
                의견 종류
                <select
                  className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                  value={kind}
                  onChange={(event) => setKind(event.currentTarget.value as typeof kind)}
                >
                  <option value="comment">댓글</option>
                  <option value="approve">승인</option>
                  <option value="reject">반려</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
                대상 페이지
                <select
                  className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                  value={pageId}
                  onChange={(event) => setPageId(event.currentTarget.value)}
                >
                  <option value="">프로젝트 전체</option>
                  {snapshot.work.pages.map((page, index) => (
                    <option key={page.id} value={page.id}>{index + 1}페이지</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
                {kind === "reject" ? "반려 사유" : "의견"}
                <textarea
                  className="min-h-28 rounded-xl border border-line bg-panel p-3 text-sm text-fg"
                  value={body}
                  onChange={(event) => setBody(event.currentTarget.value)}
                  maxLength={4_000}
                  placeholder={kind === "approve" ? "선택 사항" : "구체적인 수정 또는 검토 의견을 입력하세요."}
                />
              </label>
              <button
                type="button"
                className={buttonClass({ size: "sm" })}
                onClick={() => void submit()}
                disabled={submitting}
              >
                <Send className="size-4" aria-hidden="true" />
                {submitting ? "저장 중" : "의견 저장"}
              </button>
            </div>
          )}
          {notice ? (
            <p className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-3 text-xs" role="status">
              {notice}
            </p>
          ) : null}
        </section>

        {(groupedFeedback.get("project") ?? []).length > 0 ? (
          <section className="rounded-2xl border border-line bg-card p-4">
            <h2 className="text-sm font-black">프로젝트 전체 의견</h2>
            <div className="mt-3 space-y-2">
              {(groupedFeedback.get("project") ?? []).map((item) => (
                <FeedbackItem key={item.id} feedback={item} />
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function FeedbackItem({ feedback }: { readonly feedback: StudioExternalReviewFeedback }) {
  const Icon = feedback.kind === "approve"
    ? CheckCircle2
    : feedback.kind === "reject"
      ? XCircle
      : MessageSquare;
  return (
    <article className="rounded-xl border border-line bg-panel p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className={cn(
          "size-4",
          feedback.kind === "approve"
            ? "text-emerald-600"
            : feedback.kind === "reject"
              ? "text-red-600"
              : "text-accent",
        )} aria-hidden="true" />
        <strong>{feedback.reviewerName}</strong>
        <span className="text-fg-3">{new Date(feedback.createdAt).toLocaleString("ko-KR")}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap leading-relaxed text-fg-2">
        {feedback.body || (feedback.kind === "approve" ? "승인" : "")}
      </p>
    </article>
  );
}
