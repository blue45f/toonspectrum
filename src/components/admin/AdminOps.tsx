import { useCallback, useEffect, useState } from "react";
import { DollarSign, RefreshCw, Database, Play, CheckCircle2, AlertTriangle } from "lucide-react";
import { adminFetch, formatNum, type AdminApiError } from "./admin-client";
import { AdminNotice, AdminSpinner, adminButtonClass } from "./admin-ui";
import { getAuthToken } from "@/src/compat/auth-session";

interface AppConfig {
  monetizationEnabled: boolean;
}

interface IngestRunResult {
  runId: string;
  status: string;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  titleCount: number;
  runHash: string | null;
  snapshotId: string | null;
  duplicate: boolean;
  message: string | null;
  error: string | null;
}

interface IngestSnapshot {
  id: string;
  source: string;
  sourceVersion: string | null;
  titleCount: number;
  isCurrent: boolean;
  createdAt: string | null;
}

interface IngestRecentRun {
  id: string;
  source: string;
  status: string;
  triggeredBy: string | null;
  requestedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  titleCount: number;
  message: string | null;
  error: string | null;
  createdAt: string | null;
}

interface IngestScheduler {
  running: boolean;
  inProgress: boolean;
  nextRunAt: string | null;
  nextRunInSeconds: number | null;
  consecutiveFailures: number;
}

interface IngestStatus {
  currentSnapshot: IngestSnapshot | null;
  recentRuns: IngestRecentRun[];
  scheduler: IngestScheduler;
  generatedAt: string;
}

const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("ko-KR") : "—";

const formatDuration = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}초`);

// ingest 상태 전용 배지 — 공용 StatusBadge는 정산 상태(paid/approved/…) 톤만 알아서 회색으로 떨어진다.
function IngestStatusBadge({ status }: { status: string }) {
  const tone =
    status === "success"
      ? "border-good/40 text-good"
      : status === "failed"
        ? "border-bad/40 text-bad"
        : status === "aborted"
          ? "border-warn/40 text-warn"
          : status === "running"
            ? "border-cool/40 text-cool"
            : "border-line text-fg-3";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${tone}`}>
      {status}
    </span>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-accent">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description && <p className="mt-1 text-xs leading-relaxed text-fg-3">{description}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MonetizationToggle({ uid }: { uid: string }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    setConfig(null);
    adminFetch<AppConfig>("/config", uid)
      .then((c) => alive && setConfig(c))
      .catch((e: AdminApiError) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [uid]);

  const toggle = async () => {
    if (!config || saving) return;
    const next = !config.monetizationEnabled;
    setSaving(true);
    setError(null);
    try {
      const updated = await adminFetch<AppConfig>("/config", uid, {
        method: "POST",
        body: JSON.stringify({ monetizationEnabled: next }),
      });
      setConfig(updated ?? { monetizationEnabled: next });
    } catch (e) {
      setError((e as AdminApiError).message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <AdminNotice title="설정을 불러오지 못했어요" body={error} />;
  if (!config) return <AdminSpinner />;

  const on = config.monetizationEnabled;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-panel px-4 py-3">
        <div>
          <p className="text-sm font-medium text-fg">광고형 수익화</p>
          <p className="mt-0.5 text-xs text-fg-3">{on ? "ON · 광고/유료 기능 노출" : "OFF · 전 기능 무료"}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="광고형 수익화 토글"
          onClick={() => void toggle()}
          disabled={saving}
          className={[
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
            on ? "bg-accent" : "bg-raised",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block size-5 rounded-full bg-canvas shadow transition-transform",
              on ? "translate-x-[1.375rem]" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
      </div>
      <p className="text-xs leading-relaxed text-fg-3">OFF = 전 기능 무료·광고 없음 (초기 단계 권장)</p>
    </div>
  );
}

function ManualIngest({ uid, onSettled }: { uid: string; onSettled?: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<IngestRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/catalog/ingest/run", {
        method: "POST",
        cache: "no-store",
        headers: { "x-user-id": getAuthToken() ?? uid, "Content-Type": "application/json" },
        body: JSON.stringify({ requestedBy: "admin" }),
      });
      if (!res.ok) {
        let message = `요청 실패 (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error || data?.message) message = String(data.error ?? data.message);
        } catch {
          /* ignore */
        }
        if (res.status === 409) message = "이미 크롤이 실행 중이에요. 잠시 후 상태를 새로고침해 주세요.";
        if (res.status === 429) message = "요청이 너무 잦아요. 1분 뒤 다시 시도해 주세요.";
        throw new Error(message);
      }
      setResult((await res.json()) as IngestRunResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "크롤 실행에 실패했어요");
    } finally {
      setRunning(false);
      onSettled?.();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className={adminButtonClass("accent")}
        onClick={() => void run()}
        disabled={running}
      >
        <Play size={15} /> {running ? "크롤 실행 중… (수 분 걸릴 수 있어요)" : "지금 크롤 실행"}
      </button>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-bad">
          <AlertTriangle size={13} /> {error}
        </p>
      )}

      {result && (
        <div className="rounded-xl border border-line bg-panel p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-fg">실행 결과</span>
            <IngestStatusBadge status={result.status} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <DetailRow label="Run ID" value={result.runId} mono />
            <DetailRow label="작품 수" value={formatNum(result.titleCount)} />
            <DetailRow label="소요" value={formatDuration(result.durationMs)} />
            <DetailRow label="중복" value={result.duplicate ? "예 (변경 없음)" : "아니오"} />
            {result.snapshotId && <DetailRow label="스냅샷" value={result.snapshotId} mono />}
            {result.message && <DetailRow label="메시지" value={result.message} full />}
            {result.error && <DetailRow label="오류" value={result.error} full tone="bad" />}
          </dl>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  full,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
  tone?: "bad";
}) {
  return (
    <div className={["flex flex-col gap-0.5", full && "col-span-2"].filter(Boolean).join(" ")}>
      <dt className="text-fg-3">{label}</dt>
      <dd
        className={[
          "break-all",
          mono ? "numeral text-fg-2" : "text-fg-2",
          tone === "bad" && "text-bad",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function IngestStatusPanel({ reloadToken = 0 }: { reloadToken?: number }) {
  const [status, setStatus] = useState<IngestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/catalog/ingest/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
      setStatus((await res.json()) as IngestStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "수집 상태를 불러오지 못했어요");
    } finally {
      setLoading(false);
    }
  }, []);

  // 최초 로드 + 수동 크롤 종료 시(reloadToken 증가) 재조회.
  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  // 다른 곳(스케줄러·타 관리자)에서 실행 중이면 끝날 때까지 8초 간격으로 따라간다.
  useEffect(() => {
    if (!status?.scheduler.inProgress) return;
    const timer = setTimeout(() => void load(), 8000);
    return () => clearTimeout(timer);
  }, [status, load]);

  if (error) return <AdminNotice title="수집 상태를 불러오지 못했어요" body={error} />;
  if (!status) return <AdminSpinner />;

  const snap = status.currentSnapshot;
  const sched = status.scheduler;
  const recentRuns = status.recentRuns.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-3">{formatDateTime(status.generatedAt)} 기준</p>
        <button
          type="button"
          className={adminButtonClass("ghost")}
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : undefined} /> 새로고침
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs font-medium text-fg-3">현재 스냅샷</p>
          {snap ? (
            <dl className="mt-2 flex flex-col gap-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-fg-3">작품 수</dt>
                <dd className="numeral text-lg text-fg">{formatNum(snap.titleCount)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-fg-3">생성</dt>
                <dd className="text-xs text-fg-2">{formatDateTime(snap.createdAt)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-fg-3">소스</dt>
                <dd className="text-xs text-fg-2">{snap.source}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-fg-3">아직 스냅샷이 없어요.</p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs font-medium text-fg-3">스케줄러</p>
          <dl className="mt-2 flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-fg-3">상태</dt>
              <dd className="flex items-center gap-1.5 text-xs text-fg-2">
                {sched.running ? (
                  <>
                    <CheckCircle2 size={13} className="text-good" /> 가동 중
                  </>
                ) : (
                  "정지"
                )}
                {sched.inProgress && <span className="text-warn">· 실행 중</span>}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-fg-3">다음 실행</dt>
              <dd className="text-xs text-fg-2">
                {sched.nextRunInSeconds != null
                  ? `${formatNum(sched.nextRunInSeconds)}초 후`
                  : formatDateTime(sched.nextRunAt)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-fg-3">연속 실패</dt>
              <dd className={sched.consecutiveFailures > 0 ? "text-xs text-bad" : "text-xs text-fg-2"}>
                {formatNum(sched.consecutiveFailures)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="text-xs font-medium text-fg-3">최근 실행 이력</p>
        {recentRuns.length ? (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {recentRuns.map((run, index) => (
              <li key={run.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg-2">
                    {formatDateTime(run.createdAt)} · {run.triggeredBy ?? "—"}
                  </span>
                  <IngestStatusBadge status={run.status} />
                </div>
                {index === 0 ? (
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                    <DetailRow label="작품 수" value={formatNum(run.titleCount)} />
                    <DetailRow label="소요" value={formatDuration(run.durationMs)} />
                    <DetailRow label="소스" value={run.source} />
                    {run.message && <DetailRow label="메시지" value={run.message} full />}
                    {run.error && <DetailRow label="오류" value={run.error} full tone="bad" />}
                  </dl>
                ) : (
                  <p className="mt-1 text-xs text-fg-3">
                    {formatNum(run.titleCount)}작품 · {formatDuration(run.durationMs)}
                    {run.error ? <span className="break-all text-bad"> · {run.error}</span> : null}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-fg-3">아직 실행 이력이 없어요.</p>
        )}
      </div>
    </div>
  );
}

export function AdminOps({ uid }: { uid: string }) {
  // 수동 크롤이 끝나면(성공/실패 무관) 수집 상태 패널을 자동 재조회한다.
  const [statusReloadToken, setStatusReloadToken] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <Section
        icon={<DollarSign size={15} />}
        title="광고형 수익화 토글"
        description="앱 전역의 수익화(광고·유료 기능) 노출 여부를 켜고 끕니다."
      >
        <MonetizationToggle uid={uid} />
      </Section>

      <Section
        icon={<Play size={15} />}
        title="수동 데이터 갱신 (크롤)"
        description="외부 소스에서 카탈로그를 즉시 다시 수집합니다. 변경이 없으면 중복으로 표시됩니다."
      >
        <ManualIngest uid={uid} onSettled={() => setStatusReloadToken((token) => token + 1)} />
      </Section>

      <Section icon={<Database size={15} />} title="수집 상태" description="현재 스냅샷·스케줄러·최근 실행 이력입니다.">
        <IngestStatusPanel reloadToken={statusReloadToken} />
      </Section>
    </div>
  );
}
