import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { api, apiPath } from "@/platform/api";

function readError(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fallback;
  }
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export function ResetPasswordPage() {
  const t = useBilingual("ResetPasswordPage");
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const invalidLinkMessage = t("재설정 링크가 올바르지 않아요.", "This password reset link is not valid.");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(token ? "" : invalidLinkMessage);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError(invalidLinkMessage);
      return;
    }
    if (Array.from(password).length < 15) {
      setError(t("새 비밀번호는 15자 이상이어야 해요.", "Your new password must be at least 15 characters."));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("새 비밀번호가 서로 일치하지 않아요.", "The new passwords do not match."));
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
        setError(readError(payload, t("비밀번호를 재설정하지 못했어요.", "Could not reset your password.")));
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setComplete(true);
    } catch {
      setError(t("재설정 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", "Could not reach the reset server. Please try again later."));
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
          {t("비밀번호 재설정", "Reset your password")}
        </h1>
        {complete ? (
          <div className="mt-5 text-center">
            <p className="text-sm leading-relaxed text-fg-2" role="status">
              {t("새 비밀번호로 변경했어요. 보안을 위해 기존 기기에서는 모두 로그아웃됐어요.", "Your password has been changed. For security, all other devices have been signed out.")}
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              {t("로그인하러 가기", "Go to sign in")}
            </Link>
          </div>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={submit}>
            <p className="text-sm leading-relaxed text-fg-2">
              {t("다른 곳에서 사용하지 않는 15자 이상의 긴 문구를 권장해요.", "We recommend a long phrase of 15+ characters that you don't use anywhere else.")}
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-fg-2">{t("새 비밀번호", "New password")}</span>
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
              <span className="mb-1 block text-xs font-semibold text-fg-2">{t("새 비밀번호 확인", "Confirm new password")}</span>
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
              {submitting ? t("변경 중…", "Changing…") : t("새 비밀번호로 변경", "Change to the new password")}
            </button>
          </form>
        )}
      </div>
    </Container>
  );
}
