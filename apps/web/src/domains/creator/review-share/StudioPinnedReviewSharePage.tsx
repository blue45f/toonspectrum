import { AlertTriangle, ChevronLeft, ChevronRight, LoaderCircle, MessageSquareText, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  pinnedShareAccessSchema,
  type PinnedShareAccess,
  type PinnedShareView,
} from "@toonspectrum/studio-project-model/pinned-review-share";

import { getApiErrorMessage } from "@/infrastructure/api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import {
  loadPinnedReviewSharePage,
  submitPinnedReviewShareFeedback,
  viewPinnedReviewShare,
} from "./studio-pinned-review-share-client";

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : value;
};

function purposeLabel(purpose: PinnedShareView["purpose"]): string {
  if (purpose === "mentoring") return "멘토링 제출본";
  if (purpose === "showcase") return "공개 전시본";
  return "외부 검토본";
}

function accessFromLocation(shareId: string | undefined, token: string): PinnedShareAccess | null {
  if (shareId && token) return null;
  const candidate = token ? { token } : shareId ? { publicId: shareId } : null;
  if (!candidate) return null;
  const parsed = pinnedShareAccessSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function StudioPinnedReviewSharePage() {
  const { shareId } = useParams<{ shareId?: string }>();
  const { hash } = useLocation();
  const token = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("token") ?? "";
  const access = useMemo(() => accessFromLocation(shareId, token), [shareId, token]);
  const accessKey = JSON.stringify(access);
  const [view, setView] = useState<PinnedShareView | null>(null);
  const [selectedOrdinal, setSelectedOrdinal] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageLoading, setImageLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [body, setBody] = useState("");
  const generation = useRef<object>({});
  const feedbackAttempt = useRef<{ fingerprint: string; id: string } | null>(null);

  const refresh = useCallback(async (retainPage = false) => {
    const own = generation.current;
    if (!access || document.visibilityState === "hidden") {
      setLoading(false);
      if (!access) setError("검토 링크가 올바르지 않습니다.");
      return;
    }
    setLoading(true); setError(null);
    try {
      const next = await viewPinnedReviewShare(access);
      if (own !== generation.current) return;
      setView(next);
      setSelectedOrdinal((current) => retainPage && current !== null && next.pages.some((page) => page.ordinal === current)
        ? current : next.pages[0]?.ordinal ?? null);
    } catch (cause) {
      if (own === generation.current) {
        setView(null);
        setError(await getApiErrorMessage(cause, "링크가 만료되었거나 접근이 철회되었습니다."));
      }
    } finally {
      if (own === generation.current) setLoading(false);
    }
  }, [access]);

  useEffect(() => {
    generation.current = {};
    feedbackAttempt.current = null;
    setView(null); setSelectedOrdinal(null); setImageUrl(null); setError(null); setNotice(null); setLoading(true);
    void refresh();
    const focus = () => { void refresh(true); };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        generation.current = {}; setImageUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
      } else {
        generation.current = {}; void refresh(true);
      }
    };
    globalThis.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      generation.current = {};
      globalThis.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [accessKey, refresh]);

  useEffect(() => {
    if (!view) return;
    const delay = Math.max(1_000, Date.parse(view.leaseExpiresAt) - Date.now() - 1_000);
    const timer = setTimeout(() => { generation.current = {}; void refresh(true); }, delay);
    return () => clearTimeout(timer);
  }, [refresh, view]);

  useEffect(() => {
    const own = generation.current;
    const controller = new AbortController();
    setImageUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
    if (!access || selectedOrdinal === null || document.visibilityState === "hidden") return () => controller.abort();
    setImageLoading(true); setError(null);
    void loadPinnedReviewSharePage(access, selectedOrdinal, controller.signal)
      .then((blob) => {
        if (own !== generation.current || controller.signal.aborted) return;
        setImageUrl(URL.createObjectURL(blob));
      })
      .catch(async (cause) => {
        if (own !== generation.current || controller.signal.aborted) return;
        setError(await getApiErrorMessage(cause, "선택한 검수 이미지를 불러오지 못했습니다."));
      })
      .finally(() => { if (own === generation.current && !controller.signal.aborted) setImageLoading(false); });
    return () => controller.abort();
  }, [access, selectedOrdinal]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const currentIndex = view?.pages.findIndex((page) => page.ordinal === selectedOrdinal) ?? -1;
  const currentPage = currentIndex >= 0 ? view?.pages[currentIndex] ?? null : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!access || !view || view.role !== "commenter" || selectedOrdinal === null || !reviewerName.trim() || !body.trim() || submitting) return;
    const own = generation.current;
    const normalizedName = reviewerName.trim();
    const normalizedBody = body.trim();
    const fingerprint = JSON.stringify({ pageOrdinal: selectedOrdinal, reviewerName: normalizedName, body: normalizedBody });
    if (feedbackAttempt.current?.fingerprint !== fingerprint) {
      feedbackAttempt.current = { fingerprint, id: crypto.randomUUID() };
    }
    const feedbackId = feedbackAttempt.current.id;
    setSubmitting(true); setError(null); setNotice(null);
    try {
      await submitPinnedReviewShareFeedback(access, {
        id: feedbackId,
        pageOrdinal: selectedOrdinal,
        reviewerName: normalizedName,
        body: normalizedBody,
      });
      if (own !== generation.current) return;
      feedbackAttempt.current = null;
      setBody(""); setNotice("선택한 고정 페이지에 의견을 기록했습니다.");
      await refresh(true);
    } catch (cause) {
      const message = await getApiErrorMessage(cause, "의견 저장 결과를 확인하지 못했습니다.");
      if (own === generation.current) {
        setError(`${message} 같은 내용으로 다시 시도하면 중복 의견을 만들지 않습니다.`);
      }
    } finally {
      if (own === generation.current) setSubmitting(false);
    }
  };

  if (loading && !view) {
    return <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-fg">
      <p className="flex items-center gap-3 rounded-2xl border border-line bg-card px-5 py-4 text-sm font-semibold" role="status">
        <LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" /> 고정 검수본을 확인하는 중…
      </p>
    </div>;
  }

  if (!view) {
    return <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-fg">
      <section className="w-full max-w-lg rounded-3xl border border-bad/35 bg-card p-7 text-center" role="alert">
        <AlertTriangle className="mx-auto size-10 text-bad" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-black">고정 검수본을 열 수 없습니다</h1>
        <p className="mt-2 text-sm leading-6 text-fg-2">{error ?? "링크가 만료되었거나 접근 권한이 철회되었습니다."}</p>
      </section>
    </div>;
  }

  return <div className="min-h-dvh bg-canvas text-fg">
    <header className="border-b border-line bg-card">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-1 text-[0.6875rem] font-black text-accent">ToonStudio · {purposeLabel(view.purpose)}</span>
              <span className="rounded-full border border-line bg-raised px-2.5 py-1 text-[0.6875rem] font-bold text-fg-2">{view.role === "commenter" ? "댓글 가능" : "열람 전용"}</span>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{view.title}</h1>
            {view.instructions ? <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-fg-2">{view.instructions}</p> : null}
          </div>
          <div className="rounded-xl border border-line bg-panel px-4 py-3 text-xs text-fg-2">
            <p className="flex items-center gap-2"><ShieldCheck className="size-4 text-good" aria-hidden="true" />현재 원고가 아닌 고정 검수 이미지</p>
            <p className="mt-2">만료 · {formatDate(view.expiresAt)}</p>
          </div>
        </div>
      </div>
    </header>

    <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 rounded-3xl border border-line bg-card p-3 sm:p-5" aria-label="고정 검수 이미지">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black">{currentPage ? `${currentPage.ordinal + 1}페이지` : "페이지"}</h2>
            {currentPage ? <p className="mt-1 text-xs text-fg-3">{currentPage.width}×{currentPage.height} · SHA-256 {currentPage.sha256.slice(0, 12)}…</p> : null}
          </div>
          <div className="flex gap-2">
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={currentIndex <= 0}
              onClick={() => setSelectedOrdinal(view.pages[currentIndex - 1]!.ordinal)} aria-label="이전 페이지"><ChevronLeft className="size-4" aria-hidden="true" />이전</button>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={currentIndex < 0 || currentIndex >= view.pages.length - 1}
              onClick={() => setSelectedOrdinal(view.pages[currentIndex + 1]!.ordinal)} aria-label="다음 페이지">다음<ChevronRight className="size-4" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="relative mt-4 flex min-h-[18rem] items-center justify-center overflow-auto rounded-2xl border border-line bg-panel p-2 sm:min-h-[32rem]">
          {imageLoading ? <p className="flex items-center gap-2 text-sm" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />이미지 확인 중…</p> : null}
          {imageUrl ? <img src={imageUrl} alt={`${(currentPage?.ordinal ?? 0) + 1}페이지 고정 검수 이미지`} className="max-h-[75dvh] max-w-full object-contain" /> : null}
          {view.watermark && imageUrl ? <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden" aria-hidden="true">
            <span className="rotate-[-22deg] select-none text-5xl font-black tracking-[0.3em] text-fg/10 sm:text-7xl">REVIEW</span>
          </div> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="페이지 선택">
          {view.pages.map((page) => <button key={page.ordinal} type="button" className={cn("min-h-11 min-w-11 rounded-lg border px-3 text-sm", page.ordinal === selectedOrdinal ? "border-accent bg-accent-soft text-accent" : "border-line")}
            aria-current={page.ordinal === selectedOrdinal ? "page" : undefined} onClick={() => setSelectedOrdinal(page.ordinal)}>{page.ordinal + 1}</button>)}
        </div>
        {view.rightsStatement ? <details className="mt-4 rounded-xl border border-line p-3 text-sm"><summary className="cursor-pointer font-semibold">공유 권리 확인</summary><p className="mt-2 whitespace-pre-wrap text-fg-2">{view.rightsStatement}</p></details> : null}
        <details className="mt-3 text-xs text-fg-3"><summary className="cursor-pointer">고정 버전 식별 정보</summary><code className="mt-2 block break-all">{view.revisionFingerprint}</code></details>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {view.role === "commenter" ? <form onSubmit={(event) => void submit(event)} className="rounded-3xl border border-accent/30 bg-card p-5">
          <div className="flex items-center gap-2"><MessageSquareText className="size-5 text-accent" aria-hidden="true" /><h2 className="font-black">이 페이지에 의견 남기기</h2></div>
          <label className="mt-4 block text-xs font-semibold text-fg-2">검토자 이름<input className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm text-fg" maxLength={120} autoComplete="name" value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} /></label>
          <label className="mt-4 block text-xs font-semibold text-fg-2">의견<textarea className="mt-1.5 min-h-32 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg" maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
          <button type="submit" className={cn(buttonClass(), "mt-4 w-full")} disabled={submitting || selectedOrdinal === null || !reviewerName.trim() || !body.trim()}>{submitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <MessageSquareText className="size-4" aria-hidden="true" />}{submitting ? "저장 중…" : "의견 기록"}</button>
          <p className="mt-3 text-[0.6875rem] leading-5 text-fg-3">의견은 선택한 고정 페이지에만 연결됩니다. 프로젝트의 다른 원고나 팀 공간에는 접근할 수 없습니다.</p>
        </form> : <section className="rounded-3xl border border-line bg-card p-5 text-sm text-fg-2"><h2 className="font-black text-fg">열람 전용 링크</h2><p className="mt-2">이 링크는 댓글·승인·원고 수정을 허용하지 않습니다.</p></section>}

        <section className="rounded-3xl border border-line bg-card p-5">
          <h2 className="font-black">기록된 의견</h2>
          <div className="mt-3 space-y-2">
            {view.feedback.filter((item) => item.pageOrdinal === selectedOrdinal).map((item) => <article key={item.id} className="rounded-xl border border-line bg-panel p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black">{item.reviewerName}</p><time className="text-[0.625rem] text-fg-3" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-fg-2">{item.body}</p>
            </article>)}
            {!view.feedback.some((item) => item.pageOrdinal === selectedOrdinal) ? <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-3">이 페이지에는 아직 의견이 없습니다.</p> : null}
          </div>
        </section>

        {notice ? <p className="rounded-xl border border-good/35 bg-good/10 p-3 text-sm" role="status">{notice}</p> : null}
        {error ? <p className="rounded-xl border border-bad/35 bg-bad/10 p-3 text-sm" role="alert">{error}</p> : null}
      </aside>
    </div>
  </div>;
}
