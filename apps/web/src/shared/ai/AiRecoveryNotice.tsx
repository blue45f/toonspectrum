import {
  CircleUserRound,
  RefreshCw,
  Settings2,
  TriangleAlert,
  WifiOff,
} from "lucide-react";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { cn } from "@/shared/lib/utils";

import { inferAiRecoveryCode, type AiRecoveryCode } from "./ai-recovery-code";

const META: Record<AiRecoveryCode, {
  title: string;
  icon: typeof TriangleAlert;
  tone: string;
  iconTone: string;
}> = {
  login_required: {
    title: "로그인하면 자동 무료 AI를 바로 사용할 수 있어요",
    icon: CircleUserRound,
    tone: "border-accent/40 bg-accent/10",
    iconTone: "text-accent",
  },
  free_exhausted: {
    title: "현재 사용할 수 있는 무료 AI 경로가 모두 찼어요",
    icon: TriangleAlert,
    tone: "border-warn/40 bg-warn/10",
    iconTone: "text-warn",
  },
  not_configured: {
    title: "AI 연결을 준비해 주세요",
    icon: Settings2,
    tone: "border-line-strong bg-card",
    iconTone: "text-accent",
  },
  invalid_input: {
    title: "입력 내용을 확인해 주세요",
    icon: TriangleAlert,
    tone: "border-warn/35 bg-warn/10",
    iconTone: "text-warn",
  },
  network_error: {
    title: "AI 연결이 잠시 끊겼어요",
    icon: WifiOff,
    tone: "border-warn/40 bg-warn/10",
    iconTone: "text-warn",
  },
  http_error: {
    title: "AI 요청을 완료하지 못했어요",
    icon: TriangleAlert,
    tone: "border-bad/35 bg-bad/10",
    iconTone: "text-bad",
  },
  parse_error: {
    title: "AI 응답을 안전하게 읽지 못했어요",
    icon: TriangleAlert,
    tone: "border-warn/40 bg-warn/10",
    iconTone: "text-warn",
  },
};

export function AiRecoveryNotice({
  code,
  message,
  onRetry,
  compact = false,
  className,
}: {
  readonly code?: AiRecoveryCode | null;
  readonly message: string;
  readonly onRetry?: () => void;
  readonly compact?: boolean;
  readonly className?: string;
}) {
  const recoveryCode = inferAiRecoveryCode(message, code);
  const meta = META[recoveryCode];
  const Icon = meta.icon;
  const showSettings = recoveryCode === "login_required"
    || recoveryCode === "free_exhausted"
    || recoveryCode === "not_configured";
  const showRetry = Boolean(onRetry)
    && ["network_error", "http_error", "parse_error"].includes(recoveryCode);
  const assertive = recoveryCode === "http_error" || recoveryCode === "parse_error";

  return (
    <section
      data-ai-recovery-notice={recoveryCode}
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(
        "rounded-xl border text-fg",
        compact ? "p-2.5" : "p-3.5",
        meta.tone,
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-panel/70",
            meta.iconTone,
          )}
        >
          <Icon size={15} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-xs font-black text-fg">{meta.title}</strong>
          <p className="mt-1 text-[0.67rem] leading-relaxed text-fg-2">{message}</p>
          {(recoveryCode === "login_required" || showSettings || showRetry) ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recoveryCode === "login_required" ? (
                <button
                  type="button"
                  onClick={() => requestAuthModalOpen({ reason: "free-ai", source: "ai-recovery" })}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <CircleUserRound size={13} aria-hidden />
                  로그인하고 계속
                </button>
              ) : null}
              {showSettings ? (
                <a
                  href="/settings/ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-bold text-fg-2 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Settings2 size={13} aria-hidden />
                  {recoveryCode === "login_required" ? "개인 무료 키 연결" : "AI 설정 열기"}
                </a>
              ) : null}
              {showRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-bold text-fg-2 hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <RefreshCw size={13} aria-hidden /> 다시 시도
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
