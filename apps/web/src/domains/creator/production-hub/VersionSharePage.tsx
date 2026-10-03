import {
  AlertTriangle,
  Eye,
  KeyRound,
  LoaderCircle,
  Lock,
  MessageSquareText,
  PencilLine,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { productionManuscriptRevisionLabel } from "./production-manuscript-model";
import { toProductionRevisionKind } from "./production-manuscript-version-share-sync";
import {
  resolveVersionShare,
  type ResolvedVersionShare,
  type VersionShareResolution,
} from "./production-manuscript-version-share-api";

/**
 * CT-1: `/share/version/:token` 공유 링크 열람 페이지.
 *
 * 링크의 자격·만료·회수·비밀번호 판정은 전부 서버가 한다. 이 페이지는
 * 해석 결과를 상태별로 보여주고, 실제 원고 작업은 스튜디오로 이어 준다.
 */

type PageState =
  | { readonly kind: "loading" }
  | { readonly kind: "ok"; readonly share: ResolvedVersionShare }
  | { readonly kind: "password"; readonly invalid: boolean }
  | { readonly kind: "blocked"; readonly status: "not_found" | "revoked" | "expired" | "login_required" }
  | { readonly kind: "error" };

function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}

export function VersionSharePage() {
  const bt = useBilingual("VersionSharePage");
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const applyResolution = useCallback((resolution: VersionShareResolution) => {
    switch (resolution.status) {
      case "ok":
        setState({ kind: "ok", share: resolution.share });
        break;
      case "password_required":
        setState({ kind: "password", invalid: false });
        break;
      case "password_invalid":
        setState({ kind: "password", invalid: true });
        break;
      default:
        setState({ kind: "blocked", status: resolution.status });
    }
  }, []);

  const load = useCallback((withPassword?: string) => {
    if (!token) {
      setState({ kind: "blocked", status: "not_found" });
      return;
    }
    setSubmitting(true);
    resolveVersionShare(token, withPassword)
      .then(applyResolution)
      .catch(() => setState({ kind: "error" }))
      .finally(() => setSubmitting(false));
  }, [applyResolution, token]);

  useEffect(() => {
    setState({ kind: "loading" });
    load();
  }, [load]);

  const handlePasswordSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!password || submitting) return;
    load(password);
  };

  if (state.kind === "loading") {
    return <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-fg">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-card px-5 py-4 text-sm font-semibold">
        <LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" />
        {bt("공유 버전을 확인하는 중…", "Checking the shared version…")}
      </div>
    </div>;
  }

  if (state.kind === "password") {
    return <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-fg">
      <form
        onSubmit={handlePasswordSubmit}
        className="w-full max-w-md rounded-3xl border border-line bg-card p-7"
      >
        <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <KeyRound className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-black">
          {bt("비밀번호가 필요한 링크예요", "This link needs a password")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-fg-2">
          {bt(
            "공유한 사람에게 받은 비밀번호를 입력하면 버전을 볼 수 있어요.",
            "Enter the password from the person who shared this link.",
          )}
        </p>
        <label className="mt-5 block text-xs font-bold text-fg-2" htmlFor="version-share-password">
          {bt("비밀번호", "Password")}
        </label>
        <input
          id="version-share-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 text-sm font-semibold text-fg outline-none focus:border-accent"
        />
        {state.invalid ? <p role="alert" className="mt-2.5 text-sm font-semibold text-bad">
          {bt("비밀번호가 맞지 않아요. 다시 확인해 주세요.", "That password doesn't match. Please try again.")}
        </p> : null}
        <button
          type="submit"
          disabled={!password || submitting}
          className={cn(buttonClass({ variant: "solid" }), "mt-5 w-full")}
        >
          {submitting
            ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            : <Lock className="size-4" aria-hidden="true" />}
          {bt("버전 열기", "Open version")}
        </button>
      </form>
    </div>;
  }

  if (state.kind === "blocked" || state.kind === "error") {
    const blocked = state.kind === "blocked" ? state.status : null;
    const title = state.kind === "error"
      ? bt("버전을 불러오지 못했어요", "Couldn't load the version")
      : blocked === "login_required"
        ? bt("로그인이 필요해요", "Sign-in required")
        : blocked === "revoked"
          ? bt("회수된 공유 링크예요", "This link was revoked")
          : blocked === "expired"
            ? bt("만료된 공유 링크예요", "This link has expired")
            : bt("공유 링크를 찾을 수 없어요", "Share link not found");
    const description = state.kind === "error"
      ? bt("연결에 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.", "Something went wrong. Please try again in a moment.")
      : blocked === "login_required"
        ? bt("공유받은 버전을 보려면 먼저 로그인해 주세요. 로그인한 뒤 이 링크를 다시 열면 됩니다.", "Sign in first to view the shared version. After signing in, open this link again.")
        : blocked === "revoked" || blocked === "expired"
          ? bt("공유한 사람에게 새 링크를 요청해 주세요.", "Ask the person who shared it for a new link.")
          : bt("링크가 잘못됐거나 삭제됐을 수 있어요. 공유한 사람에게 확인해 주세요.", "The link may be wrong or deleted. Please check with the person who shared it.");
    return <div className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-fg">
      <div role="alert" className="w-full max-w-lg rounded-3xl border border-line bg-card p-7 text-center">
        <AlertTriangle className="mx-auto size-10 text-warn" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-black">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-fg-2">{description}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {blocked === "login_required" ? <Link to="/login" className={buttonClass({ variant: "solid" })}>
            {bt("로그인하기", "Sign in")}
          </Link> : null}
          {state.kind === "error" ? <button
            type="button"
            onClick={() => load()}
            className={buttonClass({ variant: "solid" })}
          >
            {bt("다시 시도", "Try again")}
          </button> : null}
          <Link to="/production" className={buttonClass({ variant: "outline" })}>
            {bt("제작 허브로 가기", "Go to production hub")}
          </Link>
        </div>
      </div>
    </div>;
  }

  const { share } = state;
  const PermissionIcon = share.permission === "edit"
    ? PencilLine
    : share.permission === "comment"
      ? MessageSquareText
      : Eye;
  const permissionLabel = share.permission === "edit"
    ? bt("보기·댓글·편집", "View · Comment · Edit")
    : share.permission === "comment"
      ? bt("보기·댓글", "View · Comment")
      : bt("보기 전용", "View only");
  const revisionKind = toProductionRevisionKind(share.revision.kind);
  const rows: ReadonlyArray<readonly [string, string]> = [
    [bt("버전", "Version"), share.snapshot.name],
    [bt("메모", "Memo"), share.snapshot.memo || "—"],
    [bt("버전 만든 시각", "Version created"), formatDateTime(share.snapshot.createdAt, "ko-KR")],
    [bt("원본 종류", "Source kind"), revisionKind
      ? productionManuscriptRevisionLabel(revisionKind)
      : share.revision.kind],
    [bt("원본 메시지", "Source message"), share.revision.message || "—"],
    ["Revision ID", share.revision.id],
    [bt("원본 해시", "Source hash"), shortHash(share.revision.rootGraphHash)],
  ];

  return <div data-creator-workflow="version-share" className="min-h-dvh bg-canvas text-fg">
    <header className="creator-workflow-topbar border-b border-line bg-card">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-1 text-[0.6875rem] font-black text-accent">
            {bt("ToonStudio 버전 공유", "ToonStudio version share")}
          </span>
          {share.watermark ? <span className="rounded-full border border-line bg-raised px-2.5 py-1 text-[0.6875rem] font-bold text-fg-2">
            {bt("워터마크 보호", "Watermark on")}
          </span> : null}
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-1 text-[0.6875rem] font-bold text-fg-2">
            <PermissionIcon className="size-3" aria-hidden="true" /> {permissionLabel}
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{share.workTitle}</h1>
        <p className="mt-2 text-sm text-fg-2">{share.artifactTitle}</p>
      </div>
    </header>
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-label={bt("공유된 버전 정보", "Shared version details")}>
        <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-accent">
          {bt("공유된 버전", "Shared version")}
        </p>
        <h2 className="mt-2 text-xl font-black">{share.snapshot.name}</h2>
        <dl className="mt-4 space-y-2.5">
          {rows.map(([term, value]) => <div key={term} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 text-sm">
            <dt className="font-bold text-fg-3">{term}</dt>
            <dd className="break-all font-semibold text-fg">{value}</dd>
          </div>)}
        </dl>
        <div className="mt-5 flex items-start gap-2 rounded-2xl bg-panel px-4 py-3 text-xs leading-5 text-fg-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />
          <p>
            {bt(
              "이 페이지는 공유된 시점의 버전 정보를 보여줘요. 원고 본문과 댓글·편집은 권한 범위 안에서 스튜디오에서 이어서 볼 수 있어요.",
              "This page shows the version as shared. Open the studio to read the manuscript and continue with comments or edits within your permission.",
            )}
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link to={`/studio/p/${share.workId}`} className={buttonClass({ variant: "solid" })}>
            {bt("스튜디오에서 이 작품 열기", "Open this work in the studio")}
          </Link>
          <Link to="/production" className={buttonClass({ variant: "outline" })}>
            {bt("제작 허브로 가기", "Go to production hub")}
          </Link>
        </div>
      </section>
    </main>
  </div>;
}
