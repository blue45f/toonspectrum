import { DollarSign, RefreshCw, Database, Play, CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { adminFetch, formatNum, type AdminApiError } from "./admin-client";
import { AdminNotice, AdminSpinner } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

import { useT } from "@/lib/i18n";
import { api, getApiErrorMessage, httpStatus } from "@/src/infrastructure/api";


interface AppConfig {
  monetizationEnabled: boolean;
  showCovers: boolean;
  showPricing: boolean;
  showAvailability: boolean;
  showSynopsis: boolean;
  showRelatedInfo: boolean;
}
// 콘텐츠 노출 킬스위치 — 법적 리스크(저작권·크롤 성과도용) 있는 기능을 즉시 끈다. 기본 ON(노출).
const CONTENT_KILL_SWITCHES = [
  { key: "showCovers", label: "표지 이미지", desc: "저작권 · 끄면 자체 타이포 커버만 노출" },
  { key: "showPricing", label: "가격 비교(추정)", desc: "크롤 유통 기반 · 끄면 숨김" },
  { key: "showAvailability", label: "플랫폼 유통 '어디서 봐'", desc: "크롤 유통·유료무료 · 끄면 숨김" },
  { key: "showSynopsis", label: "시놉시스 원문", desc: "저작권(창작표현) · 끄면 숨김" },
  { key: "showRelatedInfo", label: "관련 정보(크롤 링크)", desc: "유튜브·뉴스·위키 · 끄면 숨김" },
] as const satisfies ReadonlyArray<{ key: keyof AppConfig; label: string; desc: string }>;

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
  const t = useT();

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

  if (error) return <AdminNotice title={t("admin.ops.loadError")} body={error} />;
  if (!config) return <AdminSpinner />;

  const on = config.monetizationEnabled;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-panel px-4 py-3">
        <div>
          <p className="text-sm font-medium text-fg">{t("admin.ops.monetizationTitle")}</p>
          <p className="mt-0.5 text-xs text-fg-3">{on ? "ON" : "OFF"}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("admin.ops.monetizationTitle")}
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
      <p className="text-xs leading-relaxed text-fg-3">{t("admin.ops.monetizationDesc")}</p>
    </div>
  );
}

function ContentKillSwitches({ uid }: { uid: string }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const t = useT();

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

  const toggle = async (key: keyof AppConfig) => {
    if (!config || savingKey) return;
    const next = !config[key];
    setSavingKey(key);
    setError(null);
    try {
      const updated = await adminFetch<AppConfig>("/config", uid, {
        method: "POST",
        body: JSON.stringify({ [key]: next }),
      });
      setConfig(updated ?? { ...config, [key]: next });
    } catch (e) {
      setError((e as AdminApiError).message);
    } finally {
      setSavingKey(null);
    }
  };

  if (error) return <AdminNotice title={t("admin.ops.loadError")} body={error} />;
  if (!config) return <AdminSpinner />;

  return (
    <div className="flex flex-col gap-2">
      {CONTENT_KILL_SWITCHES.map(({ key, label, desc }) => {
        const on = config[key] !== false;
        return (
          <div
            key={key}
            className="flex items-center justify-between gap-4 rounded-xl border border-line bg-panel px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">{label}</p>
              <p className="mt-0.5 text-xs text-fg-3">
                {on ? t("admin.plans.statusActive") : t("admin.plans.statusInactive")} · {desc}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={label}
              onClick={() => void toggle(key)}
              disabled={savingKey !== null}
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
        );
      })}
    </div>
  );
}

function ManualIngest({ onSettled }: { onSettled?: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<IngestRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const result = await api.post<IngestRunResult>(
        "/catalog/ingest/run",
        { requestedBy: "admin" },
      );
      setResult(result);
    } catch (e) {
      const status = httpStatus(e);
      let message = await getApiErrorMessage(e, t("admin.ops.runError"));
      if (status === 409) message = t("admin.ops.runConflict");
      if (status === 429) message = t("admin.ops.runTooMany");
      setError(message);
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
        <Play size={15} /> {running ? t("admin.ops.runningIngest") : t("admin.ops.runIngestNow")}
      </button>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-bad">
          <AlertTriangle size={13} /> {error}
        </p>
      )}

      {result && (
        <div className="rounded-xl border border-line bg-panel p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-fg">Result</span>
            <IngestStatusBadge status={result.status} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <DetailRow label="Run ID" value={result.runId} mono />
            <DetailRow label="Titles" value={formatNum(result.titleCount)} />
            <DetailRow label="Duration" value={formatDuration(result.durationMs)} />
            <DetailRow label="Duplicate" value={result.duplicate ? "Yes" : "No"} />
            {result.snapshotId && <DetailRow label="Snapshot" value={result.snapshotId} mono />}
            {result.message && <DetailRow label="Message" value={result.message} full />}
            {result.error && <DetailRow label="Error" value={result.error} full tone="bad" />}
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
  const t = useT();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await api.get<IngestStatus>("/catalog/ingest/status"));
    } catch (e) {
      setError(await getApiErrorMessage(e, t("admin.ops.loadError")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  useEffect(() => {
    if (!status?.scheduler.inProgress) return;
    const timer = setTimeout(() => void load(), 8000);
    return () => clearTimeout(timer);
  }, [status, load]);

  if (error) return <AdminNotice title={t("admin.ops.loadError")} body={error} />;
  if (!status) return <AdminSpinner />;

  const snap = status.currentSnapshot;
  const sched = status.scheduler;
  const recentRuns = status.recentRuns.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-3">{formatDateTime(status.generatedAt)}</p>
        <button
          type="button"
          className={adminButtonClass("ghost")}
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : undefined} /> {t("admin.members.refresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs font-medium text-fg-3">Snapshot</p>
          {snap ? (
            <dl className="mt-2 flex flex-col gap-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-fg-3">Titles</dt>
                <dd className="numeral text-lg text-fg">{formatNum(snap.titleCount)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-fg-3">Created</dt>
                <dd className="text-xs text-fg-2">{formatDateTime(snap.createdAt)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-xs text-fg-3">Source</dt>
                <dd className="text-xs text-fg-2">{snap.source}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-fg-3">{t("admin.ops.noSnapshot")}</p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs font-medium text-fg-3">Scheduler</p>
          <dl className="mt-2 flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs text-fg-3">Status</dt>
              <dd className="flex items-center gap-1.5 text-xs text-fg-2">
                {sched.running ? (
                  <>
                    <CheckCircle2 size={13} className="text-good" /> Running
                  </>
                ) : (
                  "Stopped"
                )}
                {sched.inProgress && <span className="text-warn">· Active</span>}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-fg-3">Next</dt>
              <dd className="text-xs text-fg-2">
                {sched.nextRunInSeconds != null
                  ? `${formatNum(sched.nextRunInSeconds)}s`
                  : formatDateTime(sched.nextRunAt)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-fg-3">Failures</dt>
              <dd className={sched.consecutiveFailures > 0 ? "text-xs text-bad" : "text-xs text-fg-2"}>
                {formatNum(sched.consecutiveFailures)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="text-xs font-medium text-fg-3">Recent Runs</p>
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
                    <DetailRow label="Titles" value={formatNum(run.titleCount)} />
                    <DetailRow label="Duration" value={formatDuration(run.durationMs)} />
                    <DetailRow label="Source" value={run.source} />
                    {run.message && <DetailRow label="Message" value={run.message} full />}
                    {run.error && <DetailRow label="Error" value={run.error} full tone="bad" />}
                  </dl>
                ) : (
                  <p className="mt-1 text-xs text-fg-3">
                    {formatNum(run.titleCount)} · {formatDuration(run.durationMs)}
                    {run.error ? <span className="break-all text-bad"> · {run.error}</span> : null}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-fg-3">{t("admin.ops.noRuns")}</p>
        )}
      </div>
    </div>
  );
}


export function AdminOps({ uid }: { uid: string }) {
  // 수동 크롤이 끝나면(성공/실패 무관) 수집 상태 패널을 자동 재조회한다.
  const [statusReloadToken, setStatusReloadToken] = useState(0);
  const t = useT();

  return (
    <div className="flex flex-col gap-6">
      <Section
        icon={<DollarSign size={15} />}
        title={t("admin.ops.monetizationTitle")}
        description={t("admin.ops.monetizationDesc")}
      >
        <MonetizationToggle uid={uid} />
      </Section>

      <Section
        icon={<ShieldAlert size={15} />}
        title={t("admin.ops.killSwitchTitle")}
        description={t("admin.ops.killSwitchDesc")}
      >
        <ContentKillSwitches uid={uid} />
      </Section>

      <Section
        icon={<Play size={15} />}
        title={t("admin.ops.ingestTitle")}
        description={t("admin.ops.ingestDesc")}
      >
        <ManualIngest onSettled={() => setStatusReloadToken((token) => token + 1)} />
      </Section>

      <Section icon={<Database size={15} />} title={t("admin.ops.statusTitle")} description={t("admin.ops.statusDesc")}>
        <IngestStatusPanel reloadToken={statusReloadToken} />
      </Section>
    </div>
  );
}
