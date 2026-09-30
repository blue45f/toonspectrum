import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { api, apiPath } from "@/platform/api";

type Phase = "working" | "done" | "error";

function readError(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return fallback;
  }
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export function VerifyEmailPage() {
  const t = useBilingual("VerifyEmailPage");
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState(() => t("이메일 주소를 확인하고 있어요.", "Verifying your email address."));
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const token = searchParams.get("token")?.trim() ?? "";
    if (!token) {
      setPhase("error");
      setMessage(t("인증 링크가 올바르지 않아요.", "This verification link is not valid."));
      return;
    }

    void api.raw(apiPath("/auth/email/verify"), {
      method: "POST",
      throwHttpErrors: false,
      json: { token },
    }).then(async (response) => {
      const payload = await response.json<unknown>().catch(() => null);
      if (!response.ok) {
        setPhase("error");
        setMessage(readError(payload, t("이메일 인증을 완료하지 못했어요.", "Could not complete email verification.")));
        return;
      }
      setPhase("done");
      setMessage(t("이메일 인증이 완료됐어요. 이제 로그인할 수 있어요.", "Your email is verified. You can now sign in."));
    }).catch(() => {
      setPhase("error");
      setMessage(t("인증 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", "Could not reach the verification server. Please try again later."));
    });
  }, [searchParams, t]);
  return (
    <Container size="prose" className="py-20 sm:py-28">
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-panel/70 p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          {phase === "working" ? (
            <Loader2 className="size-6 animate-spin" aria-hidden />
          ) : phase === "done" ? (
            <CheckCircle2 className="size-6 text-good" aria-hidden />
          ) : (
            <AlertCircle className="size-6 text-bad" aria-hidden />
          )}
        </div>
        <p className="eyebrow justify-center text-accent">
          <MailCheck size={14} aria-hidden /> {t("계정 보안", "Account security")}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-fg">
          {t("이메일 주소 확인", "Verify your email")}
        </h1>
        <p
          className={`mt-3 text-sm leading-relaxed ${phase === "error" ? "text-bad" : "text-fg-2"}`}
          role={phase === "error" ? "alert" : "status"}
        >
          {message}
        </p>
        {phase !== "working" && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              {t("홈으로 이동", "Go home")}
            </Link>
            {phase === "error" && (
              <Link
                to="/settings"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised"
              >
                {t("계정 설정 열기", "Open account settings")}
              </Link>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}
