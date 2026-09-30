import { RefreshCw, Server, ShieldCheck, Unplug } from "lucide-react";
import { useId, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { ToonBridgeStartGuide } from "./ToolchainParts";

import type { StudioToonBridgeConnectionState } from "./useStudioToonBridgeConnection";

const FIELD = "min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

/** 로컬 제작 실행기(ToonBridge) 연결 카드. 토큰은 현재 탭 sessionStorage에만 남는다. */
export function StudioToonBridgeConnectionCard({
  connection,
  compact = false,
}: {
  readonly connection: StudioToonBridgeConnectionState;
  readonly compact?: boolean;
}) {
  const bt = useBilingual("StudioToonBridgeConnectionCard");
  const [showToken, setShowToken] = useState(false);
  const fieldId = useId();

  return (
    <section aria-labelledby={`${fieldId}-title`} className="rounded-2xl border border-line bg-panel/70 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
            <Server size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 id={`${fieldId}-title`} className="font-display text-base font-bold text-fg">{bt("로컬 제작 실행기", "Local production runner")}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-fg-3 sm:text-sm">
              {bt("외부 GPL·LGPL·AGPL 도구는 앱 번들에 넣지 않고 이 컴퓨터의 별도 프로세스에서 실행합니다. 토큰은 현재 탭에만 저장됩니다.", "GPL, LGPL and AGPL tools stay out of the app bundle and run as a separate process on this computer. The token is kept in this tab only.")}
            </p>
          </div>
        </div>
        <span className={cn(
          "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
          connection.connected ? "border-good/45 bg-good/12 text-fg" : "border-line bg-raised text-fg-3",
        )}>
          {connection.connected ? <ShieldCheck size={14} aria-hidden="true" /> : <Unplug size={14} aria-hidden="true" />}
          {connection.connected ? bt("연결됨", "Connected") : bt("연결 안 됨", "Not connected")}
        </span>
      </div>

      {!compact || !connection.connected ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)_auto]">
          <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
            {bt("실행기 주소", "Runner address")}
            <input
              value={connection.settings.baseUrl}
              onChange={(event) => connection.setBaseUrl(event.currentTarget.value)}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className={FIELD}
              placeholder="http://127.0.0.1:49631"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
            {bt("현재 탭 토큰", "Token for this tab")}
            <div className="flex min-w-0 rounded-xl border border-line bg-canvas focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
              <input
                value={connection.settings.token}
                onChange={(event) => connection.setToken(event.currentTarget.value)}
                type={showToken ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-fg outline-none"
                placeholder={bt("32자 이상의 실행기 토큰", "Runner token, 32+ characters")}
              />
              <button
                type="button"
                className="min-h-11 shrink-0 px-3 text-xs font-bold text-fg-3 hover:text-fg"
                onClick={() => setShowToken((current) => !current)}
                aria-pressed={showToken}
              >
                {showToken ? bt("숨기기", "Hide") : bt("보기", "Show")}
              </button>
            </div>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={connection.loading || !connection.settings.token}
              onClick={() => void connection.connect().catch(() => undefined)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw size={16} className={connection.loading ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" />
              {connection.loading ? bt("확인 중", "Checking") : bt("연결 확인", "Check connection")}
            </button>
            {connection.connected ? (
              <button
                type="button"
                onClick={connection.disconnect}
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-xs font-bold text-fg-3 hover:border-line-strong hover:text-fg"
              >
                {bt("해제", "Disconnect")}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-fg-3">
          <span>{connection.settings.baseUrl}</span>
          <button
            type="button"
            onClick={() => void connection.refresh().catch(() => undefined)}
            disabled={connection.loading}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 font-bold hover:text-fg disabled:opacity-40"
          >
            <RefreshCw size={14} className={connection.loading ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" />
            {bt("다시 확인", "Check again")}
          </button>
          <button
            type="button"
            onClick={connection.disconnect}
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 font-bold hover:text-fg"
          >
            {bt("연결 해제", "Disconnect")}
          </button>
        </div>
      )}

      {connection.error ? (
        <p role="alert" className="mt-3 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-xs leading-5 text-fg">
          {connection.error}
        </p>
      ) : null}
      {connection.status ? (
        <p className="mt-3 text-xs text-fg-3">
          {bt(
            `실행기 ${connection.status.serviceVersion} · 실행 중 ${connection.status.activeJobs}개 · 보관 작업 ${connection.status.retainedJobs}개`,
            `Runner ${connection.status.serviceVersion} · ${connection.status.activeJobs} running · ${connection.status.retainedJobs} retained`,
          )}
        </p>
      ) : null}
      {!connection.connected ? <ToonBridgeStartGuide /> : null}
    </section>
  );
}
