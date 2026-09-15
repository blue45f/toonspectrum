import { Download, DollarSign, Gauge, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  adminFetch,
  formatNum,
  type AdminApiError,
  type AdminBenchmarkResult,
} from "./admin-client";
import { AdminNotice, AdminSpinner } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

import { useT } from "@/shared/lib/i18n";
import { getApiErrorMessage } from "@/infrastructure/api";


interface AppConfig {
  monetizationEnabled: boolean;
  showCovers: boolean;
  showPricing: boolean;
  showAvailability: boolean;
  showSynopsis: boolean;
  showRelatedInfo: boolean;
}

type ConfigKey = keyof AppConfig;
// 콘텐츠 노출 킬스위치 — 법적 리스크(저작권·크롤 성과도용) 있는 기능을 즉시 끈다. 기본 ON(노출).
const CONTENT_KILL_SWITCHES = [
  { key: "showCovers", label: "표지 이미지", desc: "저작권 · 끄면 자체 타이포 커버만 노출" },
  { key: "showPricing", label: "가격 비교(추정)", desc: "카탈로그 유통 데이터 · 끄면 숨김" },
  { key: "showAvailability", label: "플랫폼 유통 '어디서 봐'", desc: "카탈로그 유통·유료무료 · 끄면 숨김" },
  { key: "showSynopsis", label: "시놉시스 원문", desc: "저작권(창작표현) · 끄면 숨김" },
  { key: "showRelatedInfo", label: "관련 정보 링크", desc: "유튜브·뉴스·위키 · 끄면 숨김" },
] as const satisfies ReadonlyArray<{ key: keyof AppConfig; label: string; desc: string }>;

const BENCHMARK_ITERATION_MIN = 1;
const BENCHMARK_ITERATION_MAX = 10;
const BENCHMARK_ITERATION_DEFAULT = 3;
const BENCHMARK_PREVIOUS_RESULT_KEY = "admin.benchmark.previousResult";

const normalizeIterations = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return BENCHMARK_ITERATION_DEFAULT;
  return Math.min(BENCHMARK_ITERATION_MAX, Math.max(BENCHMARK_ITERATION_MIN, parsed));
};

const quoteCsvCell = (value: unknown) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, "\"\"")}"`;
};

const buildBenchmarkCsv = (result: AdminBenchmarkResult) => {
  const rows = [
    [
      "generatedAt",
      "name",
      "status",
      "iterations",
      "successCount",
      "errorCount",
      "errorRate",
      "durationMs",
      "p50Ms",
      "p95Ms",
      "p99Ms",
      "stdDevMs",
      "minMs",
      "maxMs",
      "metadataIterations",
      "metadataSampleCount",
      "metadataWarmup",
      "metadataTotalDurationMs",
      "sampleSize",
      "error",
    ],
    ...result.samples.map((sample) => [
      result.generatedAt,
      sample.name,
      sample.status,
      sample.iterations,
      sample.successCount,
      sample.errorCount,
      sample.errorRate,
      sample.durationMs,
      sample.p50Ms,
      sample.p95Ms,
      sample.p99Ms,
      sample.stdDevMs,
      sample.minMs,
      sample.maxMs,
      result.metadata?.iterations ?? "",
      result.metadata?.sampleCount ?? "",
      String(Boolean(result.metadata?.warmup)),
      result.metadata?.totalDurationMs ?? "",
      sample.sampleSize ?? "",
      sample.error ?? "",
    ]),
  ];
  return rows.map((row) => row.map(quoteCsvCell).join(",")).join("\n");
};

const downloadFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("ko-KR") : "—";

const formatDuration = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}초`);

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

function MonetizationToggle({
  config,
  savingKey,
  onSave,
}: {
  config: AppConfig;
  savingKey: ConfigKey | null;
  onSave: (key: ConfigKey, value: boolean) => Promise<void>;
}) {
  const t = useT();

  const toggle = async () => {
    const next = !config.monetizationEnabled;
    await onSave("monetizationEnabled", next);
  };

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
          disabled={savingKey === "monetizationEnabled"}
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

function ContentKillSwitches({
  config,
  savingKey,
  onSave,
}: {
  config: AppConfig;
  savingKey: ConfigKey | null;
  onSave: (key: ConfigKey, value: boolean) => Promise<void>;
}) {
  const t = useT();

  const toggle = async (key: keyof AppConfig) => {
    const next = !config[key];
    await onSave(key, next);
  };

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

function AdminBenchmarkPanel({ uid }: { uid: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminBenchmarkResult | null>(null);
  const [previousResult, setPreviousResult] = useState<AdminBenchmarkResult | null>(null);
  const [iterationsInput, setIterationsInput] = useState<string>(String(BENCHMARK_ITERATION_DEFAULT));
  const [warmupEnabled, setWarmupEnabled] = useState(false);
  const t = useT();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(BENCHMARK_PREVIOUS_RESULT_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.generatedAt && Array.isArray(parsed.samples)) {
        setPreviousResult(parsed as AdminBenchmarkResult);
      }
    } catch {
      window.localStorage.removeItem(BENCHMARK_PREVIOUS_RESULT_KEY);
    }
  }, []);

  const run = async () => {
    if (loading) return;
    const normalizedIterations = normalizeIterations(iterationsInput);
    setIterationsInput(String(normalizedIterations));
    const query = new URLSearchParams({
      iterations: String(normalizedIterations),
      warmup: warmupEnabled ? "1" : "0",
    });

    setLoading(true);
    setError(null);
    try {
      const next = await adminFetch<AdminBenchmarkResult>(
        `/benchmark?${query.toString()}`,
        uid,
      );

      let previous = previousResult;
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(BENCHMARK_PREVIOUS_RESULT_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.generatedAt && Array.isArray(parsed.samples)) {
              previous = parsed as AdminBenchmarkResult;
            }
          } catch {
            window.localStorage.removeItem(BENCHMARK_PREVIOUS_RESULT_KEY);
          }
        }
        window.localStorage.setItem(BENCHMARK_PREVIOUS_RESULT_KEY, JSON.stringify(next));
      }

      setPreviousResult(previous);
      setResult(next);
    } catch (e) {
      setError(await getApiErrorMessage(e, t("admin.ops.benchmarkError")));
    } finally {
      setLoading(false);
    }
  };

  const exportJson = () => {
    if (!result) return;
    downloadFile(
      `admin-benchmark-${new Date(result.generatedAt).toISOString()}.json`,
      JSON.stringify(result, null, 2),
      "application/json;charset=utf-8",
    );
  };

  const exportCsv = () => {
    if (!result) return;
    downloadFile(
      `admin-benchmark-${new Date(result.generatedAt).toISOString()}.csv`,
      buildBenchmarkCsv(result),
      "text/csv;charset=utf-8",
    );
  };

  const formatDelta = (sample: AdminBenchmarkResult["samples"][number]) => {
    const previous = previousResult?.samples.find((item) => item.name === sample.name);
    if (!previous) return null;
    const delta = sample.durationMs - previous.durationMs;
    if (Number.isNaN(delta) || previous.durationMs === 0) return null;
    const direction = delta === 0 ? "0" : delta > 0 ? `+${formatNum(delta)}ms` : `${formatNum(delta)}ms`;
    const tone = delta > 0 ? "text-bad" : delta < 0 ? "text-good" : "text-fg-3";
    return { direction, tone };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <p className="text-xs text-fg-3">반복 횟수 (1~10)</p>
          <input
            type="number"
            inputMode="numeric"
            min={BENCHMARK_ITERATION_MIN}
            max={BENCHMARK_ITERATION_MAX}
            step={1}
            value={iterationsInput}
            onChange={(e) => setIterationsInput(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none transition focus:border-accent"
          />
        </label>

        <button
          type="button"
          className={adminButtonClass("accent")}
          onClick={() => void run()}
          disabled={loading}
        >
          <Gauge size={15} /> {loading ? t("admin.ops.runningBenchmark") : t("admin.ops.runBenchmark")}
        </button>
        <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs">
          <input
            type="checkbox"
            className="size-3.5 accent-accent"
            checked={warmupEnabled}
            onChange={(e) => setWarmupEnabled(e.target.checked)}
            disabled={loading}
          />
          <span className="text-fg-3">워밍업 1회 포함</span>
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            className={adminButtonClass("ghost")}
            onClick={() => void exportJson()}
            disabled={!result || loading}
            title="JSON 저장"
          >
            <Download size={15} /> JSON
          </button>
          <button
            type="button"
            className={adminButtonClass("ghost")}
            onClick={() => void exportCsv()}
            disabled={!result || loading}
            title="CSV 저장"
          >
            <Download size={15} /> CSV
          </button>
        </div>
      </div>

      {error && <AdminNotice title={t("admin.ops.benchmarkError")} body={error} />}

      {result ? (
        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-fg">{t("admin.ops.benchmarkResult")}</span>
            <span className="text-fg-3">
              실행 시각 {formatDateTime(result.generatedAt)} · 반복 {formatNum(result.samples[0]?.iterations ?? 0)}
              {result.metadata ? ` · 총 측정 시간 ${formatDuration(result.metadata.totalDurationMs)}` : null}
              {result.metadata ? ` / 워밍업 ${result.metadata.warmup ? "ON" : "OFF"}` : null}
              {previousResult ? ` / 이전 비교 기준 ${formatDateTime(previousResult.generatedAt)}` : null}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {result.samples.map((sample) => {
              const delta = formatDelta(sample);
              return (
                <li key={sample.name} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-fg-2">{sample.name}</span>
                    <span
                      className={[
                        "text-xs font-semibold",
                        sample.status === "ok" ? "text-good" : sample.status === "partial" ? "text-warn" : "text-bad",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {sample.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-3">
                    <span>응답 {formatDuration(sample.durationMs)}</span>
                    {delta ? <span className={delta.tone}>({delta.direction})</span> : null}
                    {sample.sampleSize != null && <span>샘플 수 {formatNum(sample.sampleSize)}</span>}
                    <span>p50 {formatDuration(sample.p50Ms)}</span>
                    <span>p95 {formatDuration(sample.p95Ms)}</span>
                    <span>p99 {formatDuration(sample.p99Ms)}</span>
                    <span>표준편차 {formatDuration(sample.stdDevMs)}</span>
                    <span>실패율 {formatNum(sample.errorRate * 100)}%</span>
                    {sample.status === "error" && sample.error && (
                      <span className="text-bad break-all">오류: {sample.error}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-fg-3">{t("admin.ops.benchmarkIdle")}</p>
      )}
    </div>
  );
}


export function AdminOps({ uid }: { uid: string }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [savingConfigKey, setSavingConfigKey] = useState<ConfigKey | null>(null);
  const t = useT();

  useEffect(() => {
    let alive = true;
    setConfigError(null);
    setConfig(null);
    adminFetch<AppConfig>("/config", uid)
      .then((next) => {
        if (alive) setConfig(next);
      })
      .catch((e: AdminApiError) => {
        if (alive) setConfigError(e.message);
      });

    return () => {
      alive = false;
    };
  }, [uid]);

  const saveConfig = useCallback(async (key: ConfigKey, value: boolean) => {
    setConfigError(null);
    setSavingConfigKey(key);
    try {
      const updated = await adminFetch<AppConfig>("/config", uid, {
        method: "POST",
        body: JSON.stringify({ [key]: value }),
      });
      setConfig((current) => {
        if (!current) return current;
        if (updated) {
          return { ...current, ...updated };
        }
        return { ...current, [key]: value } as AppConfig;
      });
    } catch (e) {
      setConfigError((e as AdminApiError).message);
    } finally {
      setSavingConfigKey(null);
    }
  }, [uid]);

  if (configError && !config) {
    return <AdminNotice title={t("admin.ops.loadError")} body={configError} />;
  }

  if (!config) {
    return <AdminSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      {configError && <AdminNotice title={t("admin.ops.loadError")} body={configError} />}

      <Section
        icon={<DollarSign size={15} />}
        title={t("admin.ops.monetizationTitle")}
        description={t("admin.ops.monetizationDesc")}
      >
        <MonetizationToggle config={config} savingKey={savingConfigKey} onSave={saveConfig} />
      </Section>

      <Section
        icon={<ShieldAlert size={15} />}
        title={t("admin.ops.killSwitchTitle")}
        description={t("admin.ops.killSwitchDesc")}
      >
        <ContentKillSwitches config={config} savingKey={savingConfigKey} onSave={saveConfig} />
      </Section>

      <Section
        icon={<Gauge size={15} />}
        title={t("admin.ops.benchmarkTitle")}
        description={t("admin.ops.benchmarkDesc")}
      >
        <AdminBenchmarkPanel uid={uid} />
      </Section>

    </div>
  );
}
