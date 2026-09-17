import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  getProductionExternalReview,
  submitProductionExternalReview,
  type ProductionExternalReviewView,
} from "./production-api";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { getApiErrorMessage } from "@/infrastructure/api";
import { cn } from "@/shared/lib/utils";

type Decision = "comment" | "approve" | "request-changes";

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : value;
}

function decisionLabel(decision: Decision): string {
  return {
    comment: "댓글",
    approve: "승인",
    "request-changes": "수정 요청",
  }[decision];
}

function decisionTone(decision: Decision): string {
  if (decision === "approve") return "border-good/35 bg-good/10 text-good";
  if (decision === "request-changes") return "border-bad/35 bg-bad/10 text-bad";
  return "border-accent/35 bg-accent-soft text-accent";
}

function isWebUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}


const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/u;

function reviewTokenStorageKey(projectId: string, reviewId: string): string {
  return `toonstudio:external-review:${projectId}:${reviewId}`;
}

function storageToken(key: string): string {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function saveStorageToken(key: string, token: string): void {
  try {
    globalThis.sessionStorage?.setItem(key, token);
  } catch {
    // The review still works in memory when storage is unavailable.
  }
}

function clearStorageToken(key: string): void {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // Nothing else to clean up.
  }
}

function tokenFromLocation(search: string, hash: string, storageKey: string): string {
  const queryToken = new URLSearchParams(search).get("token") ?? "";
  const fragmentToken = new URLSearchParams(hash.replace(/^#/u, "")).get("token") ?? "";
  return [fragmentToken, queryToken, storageToken(storageKey)]
    .map((value) => value.trim())
    .find((value) => TOKEN_PATTERN.test(value)) ?? "";
}

function privacyMeta(name: "referrer" | "robots", content: string): () => void {
  const selector = `meta[name="${name}"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const previous = existing?.content ?? null;
  const element = existing ?? document.createElement("meta");
  element.name = name;
  element.content = content;
  if (!existing) document.head.append(element);
  return () => {
    if (previous === null) element.remove();
    else element.content = previous;
  };
}

export function ProductionExternalReviewPage() {
  const params = useParams<{ projectId: string; reviewId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const storageKey = reviewTokenStorageKey(params.projectId ?? "unknown", params.reviewId ?? "unknown");
  const [token] = useState(() => tokenFromLocation(location.search, location.hash, storageKey));
  const [view, setView] = useState<ProductionExternalReviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [decision, setDecision] = useState<Decision>("comment");
  const [note, setNote] = useState("");

  useEffect(() => {
    const restoreReferrer = privacyMeta("referrer", "no-referrer");
    const restoreRobots = privacyMeta("robots", "noindex,nofollow,noarchive");
    const previousTitle = document.title;
    document.title = "보안 외부 검수 · ToonStudio";
    return () => {
      restoreReferrer();
      restoreRobots();
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (token) saveStorageToken(storageKey, token);
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.replace(/^#/u, ""));
    const hadVisibleToken = query.has("token") || fragment.has("token");
    if (!hadVisibleToken) return;
    query.delete("token");
    fragment.delete("token");
    const nextSearch = query.toString();
    const nextHash = fragment.toString();
    navigate({
      pathname: location.pathname,
      search: nextSearch ? `?${nextSearch}` : "",
      hash: nextHash ? `#${nextHash}` : "",
    }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate, storageKey, token]);

  useEffect(() => {
    if (!params.projectId || !params.reviewId || !token) {
      setError("검수 링크가 올바르지 않습니다.");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void getProductionExternalReview(params.projectId, params.reviewId, token)
      .then((result) => {
        if (active) setView(result);
      })
      .catch(async (cause: unknown) => {
        clearStorageToken(storageKey);
        if (active) setError(await getApiErrorMessage(cause, "검수 링크가 만료되었거나 유효하지 않습니다."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.projectId, params.reviewId, storageKey, token]);

  const allowedDecisions = useMemo<readonly Decision[]>(() => {
    if (!view) return [];
    const values: Decision[] = [];
    if (view.review.permissions.includes("comment")) values.push("comment");
    if (view.review.permissions.includes("approve")) values.push("approve", "request-changes");
    return values;
  }, [view]);

  useEffect(() => {
    if (allowedDecisions.length > 0 && !allowedDecisions.includes(decision)) {
      setDecision(allowedDecisions[0]!);
    }
  }, [allowedDecisions, decision]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!params.projectId || !params.reviewId || !view || submitting) return;
    if (!reviewerName.trim()) {
      setError("검수자 이름을 입력해 주세요.");
      return;
    }
    if (decision !== "approve" && !note.trim()) {
      setError("댓글 또는 수정 요청 내용을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await submitProductionExternalReview(params.projectId, params.reviewId, {
        token,
        reviewerName: reviewerName.trim(),
        decision,
        note: note.trim(),
      });
      setView(result);
      setNote("");
      setSuccess(`${decisionLabel(decision)} 의견을 안전하게 기록했습니다.`);
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "검수 의견을 저장하지 못했습니다."));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-fg">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card px-5 py-4 text-sm font-semibold">
          <LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" /> 검수 자료를 확인하는 중…
        </div>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-fg">
        <div role="alert" className="w-full max-w-lg rounded-3xl border border-bad/35 bg-card p-7 text-center">
          <AlertTriangle className="mx-auto size-10 text-bad" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-black">검수 링크를 열 수 없습니다</h1>
          <p className="mt-2 text-sm leading-6 text-fg-2">{error ?? "링크가 만료되었거나 접근 권한이 회수되었습니다."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-canvas text-fg">
      <header className="border-b border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-1 text-[0.6875rem] font-black text-accent">ToonStudio 외부 검수</span>
                {view.review.watermark ? <span className="rounded-full border border-line bg-raised px-2.5 py-1 text-[0.6875rem] font-bold text-fg-2">워터마크 보호</span> : null}
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{view.review.label}</h1>
              <p className="mt-2 text-sm text-fg-2">{view.projectTitle}</p>
            </div>
            <div className="rounded-xl border border-line bg-panel px-4 py-3 text-xs text-fg-2">
              <div className="flex items-center gap-2"><Clock3 className="size-4 text-warn" aria-hidden="true" />만료 {formatDate(view.review.expiresAt)}</div>
              <div className="mt-2 flex items-center gap-2"><ShieldCheck className="size-4 text-good" aria-hidden="true" />다운로드 {view.review.permissions.includes("download") ? "허용" : "차단"}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {view.submissions.map((submission, index) => (
            <article key={submission.id} className="relative overflow-hidden rounded-3xl border border-line bg-card p-5 sm:p-6">
              {view.review.watermark ? (
                <div className="pointer-events-none absolute -right-10 top-8 rotate-12 text-5xl font-black text-fg/5" aria-hidden="true">REVIEW</div>
              ) : null}
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><FileCheck2 className="size-5" aria-hidden="true" /></span>
                    <div><p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-fg-3">제출본 {index + 1}</p><h2 className="mt-1 text-base font-black">{submission.deliverable?.type ?? submission.id}</h2></div>
                  </div>
                  <span className="rounded-full border border-good/35 bg-good/10 px-2.5 py-1 text-[0.6875rem] font-bold text-good">{submission.status}</span>
                </div>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                  <div className="rounded-xl border border-line bg-panel p-3"><dt className="text-fg-3">Revision</dt><dd className="mt-1 font-bold">{submission.revisionRef.lineage} r{submission.revisionRef.revision}</dd></div>
                  <div className="rounded-xl border border-line bg-panel p-3"><dt className="text-fg-3">형식</dt><dd className="mt-1 font-bold">{submission.deliverable?.expectedFormat ?? "연결된 형식 없음"}</dd></div>
                  <div className="rounded-xl border border-line bg-panel p-3"><dt className="text-fg-3">제출</dt><dd className="mt-1 font-bold">{formatDate(submission.submittedAt)}</dd></div>
                </dl>
                {submission.deliverable?.completionCriteria.length ? (
                  <div className="mt-4 rounded-xl border border-line bg-panel p-4"><p className="text-xs font-black">검수 기준</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-fg-2">{submission.deliverable.completionCriteria.map((criterion) => <li key={criterion} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden="true" /><span>{criterion}</span></li>)}</ul></div>
                ) : null}
                {submission.evidenceRefs.length ? (
                  <div className="mt-4"><p className="text-xs font-black">검수 자료</p><div className="mt-2 flex flex-wrap gap-2">{submission.evidenceRefs.map((reference) => isWebUrl(reference) ? <a key={reference} href={reference} target="_blank" rel="noreferrer noopener" className={buttonClass({ variant: "outline", size: "sm" })}>자료 열기 <ExternalLink className="size-3.5" aria-hidden="true" /></a> : <span key={reference} className="rounded-lg border border-line bg-panel px-3 py-2 font-mono text-[0.6875rem] text-fg-2">{reference}</span>)}</div></div>
                ) : null}
                <p className="mt-4 break-all font-mono text-[0.625rem] text-fg-3">{submission.revisionRef.digest}</p>
              </div>
            </article>
          ))}
          {view.submissions.length === 0 ? <div className="rounded-3xl border border-dashed border-line bg-card p-10 text-center text-sm text-fg-2">공개된 제출본이 없습니다.</div> : null}

          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6">
            <h2 className="text-base font-black">이전 검수 응답</h2>
            <div className="mt-3 space-y-2">
              {view.review.responses.map((response) => (
                <article key={response.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black">{response.reviewerName}</p><span className={cn("rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold", decisionTone(response.decision))}>{decisionLabel(response.decision)}</span></div>
                  {response.note ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-fg-2">{response.note}</p> : null}
                  <p className="mt-2 text-[0.625rem] text-fg-3">{formatDate(response.createdAt)}</p>
                </article>
              ))}
              {view.review.responses.length === 0 ? <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3">아직 기록된 응답이 없습니다.</p> : null}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <form onSubmit={(event) => void submit(event)} className="rounded-3xl border border-accent/30 bg-card p-5">
            <div className="flex items-center gap-2"><MessageSquareText className="size-5 text-accent" aria-hidden="true" /><h2 className="text-base font-black">검수 의견 남기기</h2></div>
            <label className="mt-4 block text-xs font-semibold text-fg-2">검수자 이름<input className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} autoComplete="name" /></label>
            <fieldset className="mt-4"><legend className="text-xs font-semibold text-fg-2">결정</legend><div className="mt-2 grid gap-2">{allowedDecisions.map((value) => <label key={value} className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-bold", decision === value ? decisionTone(value) : "border-line bg-panel text-fg-2")}><input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} />{decisionLabel(value)}</label>)}</div></fieldset>
            <label className="mt-4 block text-xs font-semibold text-fg-2">의견<textarea className="mt-1.5 min-h-32 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg" value={note} onChange={(event) => setNote(event.target.value)} placeholder={decision === "approve" ? "승인 메모는 선택 사항입니다." : "수정 위치와 이유를 구체적으로 적어 주세요."} /></label>
            {success ? <div role="status" className="mt-3 rounded-lg border border-good/35 bg-good/10 p-3 text-xs text-fg">{success}</div> : null}
            {error ? <div role="alert" className="mt-3 rounded-lg border border-bad/35 bg-bad/10 p-3 text-xs text-fg">{error}</div> : null}
            <button type="submit" className={cn(buttonClass(), "mt-4 w-full")} disabled={submitting || allowedDecisions.length === 0}>{submitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="size-4" aria-hidden="true" />}{submitting ? "저장 중…" : `${decisionLabel(decision)} 기록`}</button>
            <p className="mt-3 text-[0.6875rem] leading-5 text-fg-3">응답은 선택된 불변 제출본과 함께 감사 기록으로 저장됩니다. 이 링크로 프로젝트의 다른 자료에는 접근할 수 없습니다.</p>
          </form>
        </aside>
      </div>
    </main>
  );
}
