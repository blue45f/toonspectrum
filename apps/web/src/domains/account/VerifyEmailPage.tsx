import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Container } from "@/shared/components/section";
import { api, apiPath } from "@/infrastructure/api";

type Phase = "working" | "done" | "error";

function readError(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return "이메일 인증을 완료하지 못했어요.";
  }
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" && error.trim()
    ? error
    : "이메일 인증을 완료하지 못했어요.";
}

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState("이메일 주소를 확인하고 있어요.");
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const token = searchParams.get("token")?.trim() ?? "";
    if (!token) {
      setPhase("error");
      setMessage("인증 링크가 올바르지 않아요.");
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
        setMessage(readError(payload));
        return;
      }
      setPhase("done");
      setMessage("이메일 인증이 완료됐어요. 이제 로그인할 수 있어요.");
    }).catch(() => {
      setPhase("error");
      setMessage("인증 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    });
  }, [searchParams]);
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
          <MailCheck size={14} aria-hidden /> {translateCurrentStaticSourceText("domains.account.VerifyEmailPage", "ko", "계정 보안")}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-fg">
          {translateCurrentStaticSourceText("domains.account.VerifyEmailPage", "ko", "이메일 주소 확인")}</h1>
        <p
          className={formatI18nTemplate(translateCurrentStaticSourceText("domains.account.VerifyEmailPage", "en", "mt-3 text-sm leading-relaxed {v0}"), { v0: String(phase === "error" ? "text-bad" : "text-fg-2") })}
          role={phase === "error" ? translateCurrentStaticSourceText("domains.account.VerifyEmailPage", "en", "alert") : translateCurrentStaticSourceText("domains.account.VerifyEmailPage", "en", "status")}
        >
          {message}
        </p>
        {phase !== "working" && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              to="/"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              {translateCurrentStaticSourceText("domains.account.VerifyEmailPage", "ko", "홈으로 이동")}</Link>
            {phase === "error" && (
              <Link
                to="/settings"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised"
              >
                {translateCurrentStaticSourceText("domains.account.VerifyEmailPage", "ko", "계정 설정 열기")}</Link>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}
