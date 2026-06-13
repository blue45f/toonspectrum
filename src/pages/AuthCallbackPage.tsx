import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Container } from "@/components/section";
import { completeOAuthLogin } from "@/src/compat/auth-session-store";
import Link from "@/src/compat/router-link";

type Phase = "working" | "done" | "error";

const ERROR_LABEL: Record<string, string> = {
  bad_state: "보안 검증에 실패했어요. 다시 시도해 주세요.",
  no_code: "인가 코드를 받지 못했어요.",
  oauth_failed: "제공자 인증에 실패했어요.",
  unsupported: "지원하지 않는 로그인 방식이에요.",
  access_denied: "로그인을 취소했어요.",
};

function parseHash(): Record<string, string> {
  const raw = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
  return Object.fromEntries(new URLSearchParams(raw));
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState("로그인을 마무리하는 중…");
  const [demo, setDemo] = useState(false);
  const ran = useRef(false); // 핸드오프 토큰은 1회용 — StrictMode 이중 실행 방지

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = parseHash();

    const finish = (user: { id?: string } | null | undefined, token: string | null | undefined, isDemo: boolean) => {
      if (!user?.id) {
        setPhase("error");
        setMessage("로그인 정보를 받지 못했어요.");
        return;
      }
      completeOAuthLogin(user as never, token ?? null);
      setDemo(isDemo);
      setPhase("done");
      setMessage(isDemo ? "데모 계정으로 로그인했어요." : "로그인되었어요.");
      window.setTimeout(() => navigate("/", { replace: true }), isDemo ? 1400 : 700);
    };

    async function run() {
      if (params.error) {
        setPhase("error");
        setMessage(ERROR_LABEL[params.error] ?? "로그인 중 문제가 발생했어요.");
        return;
      }
      try {
        if (params.t) {
          const res = await fetch("/api/auth/oauth/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: params.t }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.user) throw new Error(data?.error ?? "exchange-failed");
          finish(data.user, data.token, false);
          return;
        }
        if (params.demo && (params.demo === "google" || params.demo === "kakao" || params.demo === "naver")) {
          const res = await fetch(`/api/auth/oauth/${params.demo}/demo`, { method: "POST" });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.user) throw new Error(data?.error ?? "demo-failed");
          finish(data.user, data.token, true);
          return;
        }
        setPhase("error");
        setMessage("잘못된 접근이에요.");
      } catch {
        setPhase("error");
        setMessage("로그인을 완료하지 못했어요. 다시 시도해 주세요.");
      }
    }
    void run();
  }, [navigate]);

  return (
    <Container size="prose" className="py-24">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
        {phase === "working" && <Loader2 className="size-8 animate-spin text-accent" />}
        {phase === "done" && <CheckCircle2 className="size-8 text-good" />}
        {phase === "error" && <AlertCircle className="size-8 text-bad" />}
        <p className="text-sm font-medium text-fg">{message}</p>
        {demo && (
          <p className="rounded-lg border border-line bg-card px-3 py-2 text-[0.72rem] leading-relaxed text-fg-3">
            실제 구글·카카오 연동이 설정되지 않아 <strong className="text-fg-2">데모 계정</strong>으로 로그인했어요.
            기능 체험용이며 실제 소셜 계정과는 무관합니다.
          </p>
        )}
        {phase === "error" && (
          <Link href="/" className="text-xs font-semibold text-accent hover:underline">
            홈으로 돌아가기
          </Link>
        )}
      </div>
    </Container>
  );
}
