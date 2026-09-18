import { RefreshCw, Server, ShieldCheck, Unplug } from "lucide-react";
import { useState } from "react";

import type { StudioToonBridgeConnectionState } from "./useStudioToonBridgeConnection";

export function StudioToonBridgeConnectionCard({
  connection,
  compact = false,
}: {
  readonly connection: StudioToonBridgeConnectionState;
  readonly compact?: boolean;
}) {
  const [showToken, setShowToken] = useState(false);

  return (
    <section className="rounded-2xl border border-line bg-panel/70 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
            <Server size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-base font-bold text-fg">로컬 제작 실행기</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-fg-3 sm:text-sm">
              외부 GPL·LGPL·AGPL 도구는 앱 번들에 넣지 않고 이 컴퓨터의 별도 프로세스에서 실행합니다.
              토큰은 현재 탭에만 저장됩니다.
            </p>
          </div>
        </div>
        <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${
          connection.connected
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "bg-raised text-fg-3"
        }`}>
          {connection.connected ? <ShieldCheck size={14} aria-hidden="true" /> : <Unplug size={14} aria-hidden="true" />}
          {connection.connected ? "연결됨" : "연결 안 됨"}
        </span>
      </div>

      {!compact || !connection.connected ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)_auto]">
          <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
            실행기 주소
            <input
              value={connection.settings.baseUrl}
              onChange={(event) => connection.setBaseUrl(event.currentTarget.value)}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="http://127.0.0.1:49631"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
            현재 탭 토큰
            <div className="flex min-w-0 rounded-xl border border-line bg-canvas focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
              <input
                value={connection.settings.token}
                onChange={(event) => connection.setToken(event.currentTarget.value)}
                type={showToken ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-fg outline-none"
                placeholder="32자 이상의 실행기 토큰"
              />
              <button
                type="button"
                className="min-h-11 shrink-0 px-3 text-xs font-bold text-fg-3 hover:text-fg"
                onClick={() => setShowToken((current) => !current)}
                aria-pressed={showToken}
              >
                {showToken ? "숨기기" : "보기"}
              </button>
            </div>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={connection.loading || !connection.settings.token}
              onClick={() => void connection.connect().catch(() => undefined)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-fg px-4 text-sm font-bold text-canvas disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw size={16} className={connection.loading ? "animate-spin" : undefined} aria-hidden="true" />
              {connection.loading ? "확인 중" : "연결 확인"}
            </button>
            {connection.connected ? (
              <button
                type="button"
                onClick={connection.disconnect}
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-xs font-bold text-fg-3 hover:border-line-strong hover:text-fg"
              >
                해제
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
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line px-3 font-bold hover:text-fg disabled:opacity-40"
          >
            <RefreshCw size={14} className={connection.loading ? "animate-spin" : undefined} aria-hidden="true" />
            다시 확인
          </button>
          <button
            type="button"
            onClick={connection.disconnect}
            className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 font-bold hover:text-fg"
          >
            연결 해제
          </button>
        </div>
      )}

      {connection.error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-700 dark:text-red-300">
          {connection.error}
        </p>
      ) : null}
      {connection.status ? (
        <p className="mt-3 text-xs text-fg-3">
          실행기 {connection.status.serviceVersion} · 실행 중 {connection.status.activeJobs}개 · 보관 작업 {connection.status.retainedJobs}개
        </p>
      ) : null}
    </section>
  );
}
