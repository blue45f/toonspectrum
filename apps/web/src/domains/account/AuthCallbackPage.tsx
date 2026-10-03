import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ToonStudioMark } from "@/shared/components/toonstudio-mark";
import { Container } from "@/shared/components/section";
import { useT } from "@/shared/lib/i18n";
import { completeOAuthLogin } from "@/domains/auth/public/session/auth-session-store";
import Link from "@/shared/navigation/router-link";
import { api, apiPath } from "@/platform/api";

type Phase = "working" | "done" | "error";

type OAuthResult = { user?: { id?: string } | null; error?: string } | null;
type OAuthSessionResult = {
  authenticated?: boolean;
  user?: { id?: string } | null;
  error?: string;
} | null;

const ERROR_LABEL_KEYS: Record<string, string> = {
  bad_state: "auth.callback.error.badState",
  no_code: "auth.callback.error.noCode",
  oauth_failed: "auth.callback.error.oauthFailed",
  oauth_unavailable: "auth.callback.error.oauthFailed",
  unsupported: "auth.callback.error.unsupported",
  access_denied: "auth.callback.error.accessDenied",
  account_link_required: "auth.callback.error.oauthFailed",
  account_blocked: "auth.callback.error.oauthFailed",
  identity_already_linked: "auth.callback.error.oauthFailed",
  provider_already_linked: "auth.callback.error.oauthFailed",
};

function parseHash(): Record<string, string> {
  const raw = typeof window !== "undefined" ? globalThis.location.hash.replace(/^#/, "") : "";
  return Object.fromEntries(new URLSearchParams(raw));
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("working");
  const [messageKey, setMessageKey] = useState("auth.callback.message.working");
  const [demo, setDemo] = useState(false);
  const ran = useRef(false); // 콜백 완료 요청은 한 번만 실행 — StrictMode 이중 실행 방지
  const t = useT();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = parseHash();

    const finish = (
      user: { id?: string } | null | undefined,
      isDemo: boolean,
      destination = "/",
    ) => {
      if (!user?.id) {
        setPhase("error");
        setMessageKey("auth.callback.error.noUser");
        return;
      }
      completeOAuthLogin(user as never);
      setDemo(isDemo);
      setPhase("done");
      setMessageKey(isDemo ? "auth.callback.message.doneDemo" : "auth.callback.message.done");
      globalThis.setTimeout(
        () => navigate(destination, { replace: true }),
        isDemo ? 1400 : 700,
      );
    };

    async function run() {
      if (params.error) {
        setPhase("error");
        setMessageKey(ERROR_LABEL_KEYS[params.error] ?? "auth.callback.error.generic");
        return;
      }
      try {
        if (params.session === "1" || params.linked) {
          const res = await api.raw(apiPath("/auth/session"), {
            method: "GET",
            cache: "no-store",
            throwHttpErrors: false,
          });
          const data = await res.json<OAuthSessionResult>().catch(() => null);
          if (!res.ok || data?.authenticated !== true || !data.user) {
            throw new Error(data?.error ?? "session-failed");
          }
          finish(
            data.user,
            false,
            params.linked ? "/settings#account-security" : "/",
          );
          return;
        }
        if (params.t) {
          const res = await api.raw(apiPath("/auth/oauth/exchange"), {
            method: "POST",
            throwHttpErrors: false,
            json: { token: params.t },
          });
          const data = await res.json<OAuthResult>().catch(() => null);
          if (!res.ok || !data?.user) throw new Error(data?.error ?? "exchange-failed");
          finish(data.user, false);
          return;
        }
        if (params.demo && (params.demo === "google" || params.demo === "kakao" || params.demo === "naver")) {
          const res = await api.raw(apiPath(`/auth/oauth/${params.demo}/demo`), {
            method: "POST",
            throwHttpErrors: false,
          });
          const data = await res.json<OAuthResult>().catch(() => null);
          if (!res.ok || !data?.user) throw new Error(data?.error ?? "demo-failed");
          finish(data.user, true);
          return;
        }
        setPhase("error");
        setMessageKey("auth.callback.error.invalidAccess");
      } catch {
        setPhase("error");
        setMessageKey("auth.callback.error.failed");
      }
    }
    void run();
  }, [navigate]);

  return (
    <Container size="prose" className="py-24">
      <div className="mx-auto max-w-sm rounded-[1.5rem] border border-line-strong bg-panel p-7 text-center shadow-xl shadow-[oklch(0.1_0.02_70/0.12)] sm:p-8">
        <div className="flex items-center justify-center gap-2.5">
          <ToonStudioMark className="size-9 rounded-lg" />
          <p className="font-display text-base font-bold tracking-tight text-fg">ToonStudio</p>
        </div>
        <div className="mt-6 flex flex-col items-center gap-4">
          {phase === "working" && <Loader2 className="size-8 animate-spin text-accent" />}
          {phase === "done" && <CheckCircle2 className="size-8 text-good" />}
          {phase === "error" && <AlertCircle className="size-8 text-bad" />}
          <h1 className="text-sm font-medium text-fg" role={phase === "error" ? "alert" : "status"}>{t(messageKey)}</h1>
          {demo && (
            <p className="rounded-lg border border-line bg-card px-3 py-2 text-[0.72rem] leading-relaxed text-fg-3">
              {t("auth.callback.demo.message")}
            </p>
          )}
          {phase === "error" && (
            <div className="flex flex-col items-center gap-2.5">
              <Link
                href="/auth/login"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
              >
                {t("auth.callback.backToLogin")}
              </Link>
              <Link href="/" className="text-xs font-semibold text-accent hover:underline">
                {t("common.backToHome")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
