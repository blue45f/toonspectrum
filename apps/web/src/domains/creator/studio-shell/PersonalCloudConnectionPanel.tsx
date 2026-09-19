import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
} from "lucide-react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual,
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { PersonalCloudProviderId } from "../save-first/personal-cloud-client";
import {
  PERSONAL_CLOUD_CONNECTION_PROVIDER_ORDER,
  type PersonalCloudConnectionsController,
} from "./usePersonalCloudConnections";

function timeLabel(value: string | null, locale: string, bt: (ko: string, en: string) => string): string {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return bt("아직 사용하지 않음", "Not used yet");
  }
  return new Intl.DateTimeFormat(locale || "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function providerDescription(
  provider: PersonalCloudProviderId,
  bt: (ko: string, en: string) => string,
): string {
  if (provider === "google-drive") {
    return bt("ToonStudio에서 만든 파일만 다루는 개인 Drive 연결", "Personal Drive access limited to files created by ToonStudio");
  }
  if (provider === "dropbox") {
    return bt("개인 Dropbox에 프로젝트 원본과 제출 파일 저장", "Store project originals and submission files in personal Dropbox");
  }
  return bt("개인 OneDrive 앱 폴더에 프로젝트 원본 저장", "Store project originals in the personal OneDrive app folder");
}

export function PersonalCloudConnectionPanel({
  locale: _locale,
  controller,
}: {
  readonly locale: string;
  readonly controller: PersonalCloudConnectionsController;
}) {
  const bt = useBilingual("PersonalCloudConnectionPanel");
  return (
    <section className="rounded-2xl border border-line bg-card p-5" aria-labelledby="personal-cloud-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.14em] text-accent">
            <Cloud size={15} aria-hidden="true" /> PERSONAL CLOUD
          </p>
          <h2 id="personal-cloud-title" className="mt-2 text-lg font-black text-fg">
            {bt("개인 계정 연결", "Connect personal accounts")}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-fg-3">
            {bt(
              "프로젝트 원본은 연결한 개인 저장소로 직접 전송됩니다. 접근 토큰은 브라우저 저장소에 남기지 않습니다.",
              "Project originals upload directly to your connected storage. Access tokens are not kept in browser storage.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void controller.reload(); }}
          disabled={controller.loading}
          className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5" })}
        >
          {controller.loading
            ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            : <RefreshCw size={14} aria-hidden="true" />}
          {bt("상태 새로고침", "Refresh status")}
        </button>
      </div>

      {controller.error ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-xs font-semibold text-danger">
          {controller.error}
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {PERSONAL_CLOUD_CONNECTION_PROVIDER_ORDER.map((provider) => {
          const status = controller.statusFor(provider);
          const busy = controller.busyProvider === provider;
          const configured = status?.configured === true;
          const connected = status?.connected === true;
          const Icon = connected ? CheckCircle2 : configured ? Link2 : CloudOff;
          return (
            <article
              key={provider}
              className={cn(
                "rounded-xl border p-4",
                connected
                  ? "border-success/30 bg-success-soft/10"
                  : configured
                    ? "border-line bg-panel/50"
                    : "border-warning/30 bg-warning-soft/10",
              )}
            >
              <div className="flex items-start gap-3">
                <span className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl",
                  connected ? "bg-success-soft/25 text-success" : "bg-panel text-fg-3",
                )}>
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-fg">{status?.label ?? provider}</h3>
                  <p className="mt-1 text-[0.68rem] leading-5 text-fg-3">
                    {providerDescription(provider, bt)}
                  </p>
                  {connected ? (
                    <div className="mt-3 rounded-lg bg-card/80 px-2.5 py-2">
                      <p className="truncate text-xs font-bold text-fg-2">
                        {status?.accountLabel}
                      </p>
                      <p className="mt-1 text-[0.64rem] text-fg-3">
                        {bt("마지막 사용", "Last used")} {timeLabel(status?.lastUsedAt ?? null, locale, bt)}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {connected ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { void controller.connect(provider); }}
                      disabled={busy}
                      className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                      {bt("다시 인증", "Reconnect")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void controller.disconnect(provider); }}
                      disabled={busy}
                      className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5 text-danger" })}
                    >
                      <LogOut size={14} aria-hidden="true" />
                      {bt("연결 해제", "Disconnect")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { void controller.connect(provider); }}
                    disabled={!configured || busy || controller.loading}
                    className={buttonClass({ size: "sm", className: "gap-1.5" })}
                  >
                    {busy
                      ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      : <Link2 size={14} aria-hidden="true" />}
                    {configured
                      ? bt("개인 계정 연결", "Connect account")
                      : bt("서버 설정 필요", "Server setup required")}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
