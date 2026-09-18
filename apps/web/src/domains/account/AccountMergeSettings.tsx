import {
  AlertTriangle,
  CheckCircle2,
  Combine,
  Copy,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";

import { api, apiPath } from "@/infrastructure/api";

type MergePreview = {
  source: {
    name: string | null;
    email: string | null;
    providers: string[];
  };
  target: {
    name: string | null;
    email: string | null;
    providers: string[];
  };
  affectedRecordCount: number;
  expiresAt: string;
  warnings: string[];
};

function responseError(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fallback;
  }
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

function providerLabel(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "kakao") return "카카오";
  if (provider === "naver") return "네이버";
  if (provider === "github") return "GitHub";
  return provider;
}

export function AccountMergeSettings({ userId }: { userId: string | null }) {
  const [issuedCode, setIssuedCode] = useState("");
  const [mergeCode, setMergeCode] = useState("");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [busy, setBusy] = useState<"issue" | "preview" | "confirm" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const clearFeedback = () => {
    setMessage("");
    setError("");
  };

  const issueCode = async () => {
    clearFeedback();
    setBusy("issue");
    try {
      const response = await api.raw(apiPath("/auth/account-merge/code"), {
        method: "POST",
        cache: "no-store",
        throwHttpErrors: false,
      });
      const payload = await response.json<{
        token?: unknown;
        expiresAt?: unknown;
        error?: unknown;
      } | null>().catch(() => null);
      if (!response.ok || typeof payload?.token !== "string") {
        setError(responseError(payload, "계정 통합 코드를 만들지 못했어요."));
        return;
      }
      setIssuedCode(payload.token);
      setMessage("10분 동안 사용할 수 있는 통합 코드를 만들었어요. 코드를 복사한 뒤 주 계정으로 로그인해 주세요.");
    } catch {
      setError("계정 통합 서버에 접속하지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  const copyCode = async () => {
    if (!issuedCode) return;
    try {
      await navigator.clipboard.writeText(issuedCode);
      setMessage("통합 코드를 복사했어요.");
    } catch {
      setMessage("코드를 선택해서 직접 복사해 주세요.");
    }
  };

  const loadPreview = async () => {
    const token = mergeCode.trim();
    if (!token) {
      setError("보조 계정에서 만든 통합 코드를 입력해 주세요.");
      return;
    }
    clearFeedback();
    setPreview(null);
    setConfirming(false);
    setBusy("preview");
    try {
      const response = await api.raw(apiPath("/auth/account-merge/preview"), {
        method: "POST",
        cache: "no-store",
        throwHttpErrors: false,
        json: { token },
      });
      const payload = await response.json<(MergePreview & { error?: unknown }) | null>().catch(() => null);
      if (!response.ok || !payload?.source || !payload.target) {
        setError(responseError(payload, "통합할 계정을 확인하지 못했어요."));
        return;
      }
      setPreview(payload);
      setMessage("양쪽 계정 확인이 완료됐어요. 내용을 확인한 뒤 통합을 확정해 주세요.");
    } catch {
      setError("계정 통합 서버에 접속하지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  const confirmMerge = async () => {
    if (!preview) return;
    if (!confirming) {
      setConfirming(true);
      setMessage("한 번 더 누르면 계정 통합을 실행해요.");
      return;
    }
    clearFeedback();
    setBusy("confirm");
    try {
      const response = await api.raw(apiPath("/auth/account-merge/confirm"), {
        method: "POST",
        cache: "no-store",
        throwHttpErrors: false,
        json: { token: mergeCode.trim() },
      });
      const payload = await response.json<{
        transferredRecordCount?: unknown;
        error?: unknown;
      } | null>().catch(() => null);
      if (!response.ok) {
        setConfirming(false);
        setError(responseError(payload, "계정을 통합하지 못했어요."));
        return;
      }
      const count = typeof payload?.transferredRecordCount === "number"
        ? payload.transferredRecordCount
        : preview.affectedRecordCount;
      setMessage(`계정 통합을 완료했어요. ${count.toLocaleString()}개 연결 데이터를 현재 계정으로 정리했어요.`);
      globalThis.setTimeout(() => {
        globalThis.location.assign("/settings#account-security");
      }, 700);
    } catch {
      setConfirming(false);
      setError("계정 통합 서버에 접속하지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  if (!userId) return null;

  return (
    <div className="space-y-4 border-t border-line/60 py-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Combine size={16} aria-hidden />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-fg">중복 계정 통합</h3>
          <p className="mt-0.5 text-[0.78rem] leading-relaxed text-fg-2">
            없앨 보조 계정에서 통합 코드를 만든 뒤, 유지할 주 계정으로 다시 로그인해서 코드를 입력하세요.
            이메일이 같다는 이유만으로 자동 통합하지 않아요.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs text-bad" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-good/30 bg-good/5 px-3 py-2 text-xs text-good" role="status">
          {message}
        </p>
      )}

      <div className="rounded-xl border border-line bg-card/50 p-4">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">1. 보조 계정에서 코드 만들기</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">
              코드는 10분 뒤 만료되고 한 번만 쓸 수 있어요. 비밀번호 로그인 계정은 보안을 위해 주 계정으로만 사용할 수 있어요.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => { void issueCode(); }}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:opacity-50"
              >
                {busy === "issue" && <Loader2 size={14} className="animate-spin" aria-hidden />}
                통합 코드 만들기
              </button>
              {issuedCode && (
                <button
                  type="button"
                  onClick={() => { void copyCode(); }}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent"
                >
                  <Copy size={14} aria-hidden /> 코드 복사
                </button>
              )}
            </div>
            {issuedCode && (
              <code className="mt-3 block overflow-x-auto rounded-lg bg-raised px-3 py-2 text-xs text-fg">
                {issuedCode}
              </code>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-card/50 p-4">
        <p className="text-sm font-semibold text-fg">2. 주 계정에서 코드 확인</p>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">
          유지할 계정으로 로그인한 상태에서 보조 계정의 코드를 붙여 넣으세요.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={mergeCode}
            onChange={(event) => {
              setMergeCode(event.target.value);
              setPreview(null);
              setConfirming(false);
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="통합 코드"
            aria-label="계정 통합 코드"
            className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30"
          />
          <button
            type="button"
            disabled={busy !== null || !mergeCode.trim()}
            onClick={() => { void loadPreview(); }}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2 hover:bg-raised disabled:opacity-50"
          >
            {busy === "preview" && <Loader2 size={14} className="animate-spin" aria-hidden />}
            통합 내용 확인
          </button>
        </div>
      </div>

      {preview && (
        <div className="rounded-xl border border-accent/30 bg-accent-soft/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-card/70 p-3">
              <p className="text-[0.68rem] font-bold uppercase tracking-wide text-fg-3">보조 계정 · 통합 후 비활성</p>
              <p className="mt-1 text-sm font-semibold text-fg">{preview.source.name ?? "이름 없음"}</p>
              <p className="mt-0.5 text-xs text-fg-3">{preview.source.email ?? "연락 이메일 없음"}</p>
              <p className="mt-2 text-xs text-fg-2">
                {preview.source.providers.map(providerLabel).join(" · ") || "소셜 로그인 없음"}
              </p>
            </div>
            <div className="rounded-lg border border-good/30 bg-good/5 p-3">
              <p className="text-[0.68rem] font-bold uppercase tracking-wide text-good">주 계정 · 유지</p>
              <p className="mt-1 text-sm font-semibold text-fg">{preview.target.name ?? "이름 없음"}</p>
              <p className="mt-0.5 text-xs text-fg-3">{preview.target.email ?? "연락 이메일 없음"}</p>
              <p className="mt-2 text-xs text-fg-2">
                {preview.target.providers.map(providerLabel).join(" · ") || "이메일/비밀번호"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-card/60 px-3 py-2 text-xs text-fg-2">
            <CheckCircle2 size={14} className="shrink-0 text-good" aria-hidden />
            약 {preview.affectedRecordCount.toLocaleString()}개 사용자 연결 데이터가 주 계정으로 이전 대상이에요.
          </div>

          <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-fg-3">
            {preview.warnings.map((warning) => (
              <li key={warning} className="flex gap-2">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                <span>{warning}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => { void confirmMerge(); }}
              className={
                confirming
                  ? "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-bad px-4 text-xs font-semibold text-on-accent disabled:opacity-50"
                  : "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent disabled:opacity-50"
              }
            >
              {busy === "confirm" && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {confirming ? "정말 계정 통합하기" : "계정 통합"}
            </button>
            {confirming && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setConfirming(false);
                  setMessage("");
                }}
                className="min-h-10 rounded-lg border border-line px-3 text-xs font-semibold text-fg-2"
              >
                취소
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
