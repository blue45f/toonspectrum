import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Container } from "@/shared/components/section";
import { api, apiPath } from "@/infrastructure/api";

function readError(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return "비밀번호를 재설정하지 못했어요.";
  }
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" && error.trim()
    ? error
    : "비밀번호를 재설정하지 못했어요.";
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(token ? "" : "재설정 링크가 올바르지 않아요.");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("재설정 링크가 올바르지 않아요.");
      return;
    }
    if (Array.from(password).length < 15) {
      setError("새 비밀번호는 15자 이상이어야 해요.");
      return;
    }
    if (password !== confirmPassword) {
      setError("새 비밀번호가 서로 일치하지 않아요.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await api.raw(apiPath("/auth/password/reset/confirm"), {
        method: "POST",
        throwHttpErrors: false,
        json: { token, password },
      });
      const payload = await response.json<unknown>().catch(() => null);
      if (!response.ok) {
        setError(readError(payload));
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setComplete(true);
    } catch {
      setError("재설정 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Container size="prose" className="py-16 sm:py-24">
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-panel/70 p-6 shadow-sm sm:p-8">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          {complete ? (
            <CheckCircle2 className="size-6 text-good" aria-hidden />
          ) : (
            <KeyRound className="size-6" aria-hidden />
          )}
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tight text-fg">
          {translateCurrentStaticSourceText("domains.account.ResetPasswordPage", "ko", "비밀번호 재설정")}</h1>
        {complete ? (
          <div className="mt-5 text-center">
            <p className="text-sm leading-relaxed text-fg-2" role="status">
              {translateCurrentStaticSourceText("domains.account.ResetPasswordPage", "ko", "새 비밀번호로 변경했어요. 보안을 위해 기존 기기에서는 모두 로그아웃됐어요.")}</p>
            <Link
              to="/"
              className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              {translateCurrentStaticSourceText("domains.account.ResetPasswordPage", "ko", "로그인하러 가기")}</Link>
          </div>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={submit}>
            <p className="text-sm leading-relaxed text-fg-2">
              {translateCurrentStaticSourceText("domains.account.ResetPasswordPage", "ko", "다른 곳에서 사용하지 않는 15자 이상의 긴 문구를 권장해요.")}</p>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-fg-2">{translateCurrentStaticSourceText("domains.account.ResetPasswordPage", "ko", "새 비밀번호")}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={15}
                maxLength={128}
                disabled={!token || submitting}
                className="h-11 w-full rounded-xl border border-line bg-canvas px-3.5 text-sm text-fg outline-none transition-colors focus:border-accent/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-fg-2">{translateCurrentStaticSourceText("domains.account.ResetPasswordPage", "ko", "새 비밀번호 확인")}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={15}
                maxLength={128}
                disabled={!token || submitting}
                className="h-11 w-full rounded-xl border border-line bg-canvas px-3.5 text-sm text-fg outline-none transition-colors focus:border-accent/60"
              />
            </label>
            {error && (
              <p
                className="flex items-start gap-1.5 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-xs leading-relaxed text-bad"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!token || submitting}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {submitting ? translateCurrentStaticSourceText("domains.account.ResetPasswordPage", "ko", "변경 중…") : translateCurrentStaticSourceText("domains.account.ResetPasswordPage", "ko", "새 비밀번호로 변경")}
            </button>
          </form>
        )}
      </div>
    </Container>
  );
}
