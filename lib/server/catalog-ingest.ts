import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { desc, eq } from "drizzle-orm";
import { catalogIngestRuns, catalogSnapshots, db, dbClient } from "../db";
import { getCatalogState, loadCatalogSnapshot, resetCatalogToEmpty } from "./catalog-store";
import type { Title } from "../types";
import { buildCatalogSourcePlan, parseCatalogSourceIds } from "./catalog-sources";

const execFileAsync = promisify(execFile);

export type CatalogIngestMode = "off" | "fixed";
export type CatalogIngestRunStatus = "running" | "success" | "failed" | "aborted";

export interface CatalogIngestConfig {
  mode: CatalogIngestMode;
  intervalSeconds: number;
  timeoutMs: number;
  maxOutputMb: number;
  scriptPath: string;
  triggerToken: string;
  sourceIds: ReturnType<typeof parseCatalogSourceIds>;
  minRetainRatio: number;
}

// 품질 게이트 상수: 직전에 이 이상 수집되던 주요 소스가 0이 되면 '붕괴'로 간주.
const SOURCE_PRESENT_FLOOR = 5;
const REGRESSION_SOURCE_KEYS = ["naverWebtoon", "naverSeries", "kakaoWebtoon", "lezhin"] as const;

export interface CatalogCrawlerPayload {
  titles: Title[];
  count?: number;
  sourceVersion?: string;
  crawledAt?: string;
  metadata?: unknown;
}

export interface CatalogIngestRunResult {
  runId: string;
  status: CatalogIngestRunStatus;
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

export interface CatalogIngestRunOptions {
  requestedBy?: string;
  triggeredBy?: string;
  force?: boolean;
  config?: CatalogIngestConfig;
}

type EnvLike = Partial<Record<string, string | undefined>>;

const execSource = "crawl.mjs";
let schemaReady = false;

export function normalizeCatalogIngestConfig(env: EnvLike = process.env): CatalogIngestConfig {
  return {
    mode: env.CATALOG_INGEST_MODE === "fixed" ? "fixed" : "off",
    intervalSeconds: parseBoundedInt(env.CATALOG_INGEST_INTERVAL_SECONDS, 1_800, 60, 86_400),
    timeoutMs: parseBoundedInt(env.CATALOG_INGEST_TIMEOUT_MS, 180_000, 30_000, 600_000),
    // 기본 소스셋(네이버시리즈 등 대형 포함)의 크롤 JSON은 수십 MB라, 12MB로는 maxBuffer 초과로
    // ingest가 실패한다. 기본값을 넉넉히 잡아 정식 파이프라인이 기본 소스셋에서도 동작하게 한다.
    maxOutputMb: parseBoundedInt(env.CATALOG_INGEST_SCRIPT_MAX_OUTPUT_MB, 64, 1, 200),
    scriptPath: env.CATALOG_CRAWL_SCRIPT || path.join("scripts", "crawl.mjs"),
    triggerToken: env.CATALOG_INGEST_TRIGGER_TOKEN || "",
    sourceIds: parseCatalogSourceIds(env.WEBDEX_SOURCE_IDS),
    // 직전 스냅샷 대비 이 비율 미만으로 총건수가 급감하면(force 아니면) 승격 거부 (0<r<=1)
    minRetainRatio: parseBoundedRatio(env.CATALOG_INGEST_MIN_RETAIN_RATIO, 0.6),
  };
}

// 직전 current 스냅샷 통계(총건수·소스별 count) vs 신규 payload 비교 — 순수 함수(테스트 용이)
export function evaluateRegression(
  newCount: number,
  newSources: Record<string, number> | null,
  current: { titleCount: number; sources: Record<string, number> | null } | null,
  minRetainRatio: number
): { reason: string; newCount: number; currentCount: number } | null {
  if (!current || current.titleCount <= 0) return null; // 비교 대상 없음(첫 스냅샷)
  if (newCount < Math.floor(current.titleCount * minRetainRatio)) {
    return {
      reason: `title count dropped ${newCount} < ${current.titleCount}×${minRetainRatio}`,
      newCount,
      currentCount: current.titleCount,
    };
  }
  if (current.sources && newSources) {
    for (const key of REGRESSION_SOURCE_KEYS) {
      const prev = current.sources[key] ?? 0;
      const next = newSources[key] ?? 0;
      if (prev >= SOURCE_PRESENT_FLOOR && next === 0) {
        return {
          reason: `source "${key}" collapsed (prev ${prev} → 0)`,
          newCount,
          currentCount: current.titleCount,
        };
      }
    }
  }
  return null;
}

export function extractSourceCounts(metadata: unknown): Record<string, number> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const sources = (metadata as { sources?: unknown }).sources;
  if (!sources || typeof sources !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sources as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function parseCrawlerJsonPayload(stdout: string): CatalogCrawlerPayload {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("crawler returned empty stdout");

  const candidates = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const payload = JSON.parse(candidate) as Partial<CatalogCrawlerPayload>;
      if (!Array.isArray(payload.titles)) continue;
      return {
        titles: payload.titles.filter(isTitleLike),
        count: typeof payload.count === "number" ? payload.count : payload.titles.length,
        sourceVersion: payload.sourceVersion,
        crawledAt: payload.crawledAt,
        metadata: payload.metadata,
      };
    } catch {
      continue;
    }
  }

  throw new Error("crawler stdout did not contain a valid catalog JSON payload");
}

export async function ensureCatalogIngestSchema() {
  if (schemaReady) return;

  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS catalog_snapshot (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      sourceVersion TEXT,
      titleCount INTEGER NOT NULL DEFAULT 0,
      isCurrent INTEGER NOT NULL DEFAULT 0,
      snapshot TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);
  await dbClient.execute("CREATE INDEX IF NOT EXISTS idx_catalog_snapshot_current ON catalog_snapshot(isCurrent, createdAt)");
  await dbClient.execute("CREATE INDEX IF NOT EXISTS idx_catalog_snapshot_created ON catalog_snapshot(createdAt)");

  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS catalog_ingest_run (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      runHash TEXT,
      triggeredBy TEXT,
      requestedBy TEXT,
      startedAt INTEGER NOT NULL,
      finishedAt INTEGER,
      durationMs INTEGER,
      titleCount INTEGER NOT NULL DEFAULT 0,
      message TEXT,
      error TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    )
  `);
  await dbClient.execute("CREATE INDEX IF NOT EXISTS idx_catalog_ingest_run_created ON catalog_ingest_run(createdAt)");
  await dbClient.execute("CREATE INDEX IF NOT EXISTS idx_catalog_ingest_run_status ON catalog_ingest_run(status, createdAt)");

  schemaReady = true;
}

export async function loadLatestCatalogSnapshotFromDb() {
  await ensureCatalogIngestSchema();
  const [snapshot] = await db
    .select()
    .from(catalogSnapshots)
    .where(eq(catalogSnapshots.isCurrent, true))
    .orderBy(desc(catalogSnapshots.createdAt))
    .limit(1);

  if (!snapshot) {
    resetCatalogToEmpty("no-current-db-snapshot");
    return {
      loaded: false,
      source: "empty",
      titleCount: getCatalogState().titleCount,
      generatedAt: new Date().toISOString(),
    };
  }

  try {
    const parsed = JSON.parse(snapshot.snapshot);
    const titles = loadCatalogSnapshot(parsed, snapshot.sourceVersion ?? snapshot.source, false);
    return {
      loaded: true,
      snapshotId: snapshot.id,
      source: snapshot.source,
      sourceVersion: snapshot.sourceVersion,
      titleCount: titles.length,
      createdAt: toIso(snapshot.createdAt),
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    resetCatalogToEmpty("invalid-db-snapshot");
    throw new Error(`catalog snapshot parse failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
}

export async function getCatalogIngestStatus(config = normalizeCatalogIngestConfig()) {
  await ensureCatalogIngestSchema();
  const [currentSnapshot] = await db
    .select()
    .from(catalogSnapshots)
    .where(eq(catalogSnapshots.isCurrent, true))
    .orderBy(desc(catalogSnapshots.createdAt))
    .limit(1);

  const recentRuns = await db
    .select()
    .from(catalogIngestRuns)
    .orderBy(desc(catalogIngestRuns.createdAt))
    .limit(10);

  return {
    config: withoutToken(config),
    sourcePlan: buildCatalogSourcePlan(config.sourceIds),
    currentSnapshot: currentSnapshot
      ? {
          id: currentSnapshot.id,
          source: currentSnapshot.source,
          sourceVersion: currentSnapshot.sourceVersion,
          titleCount: currentSnapshot.titleCount,
          isCurrent: Boolean(currentSnapshot.isCurrent),
          createdAt: toIso(currentSnapshot.createdAt),
          metadata: parseMaybeJson(currentSnapshot.metadata),
        }
      : null,
    catalogState: getCatalogState(),
    recentRuns: recentRuns.map((run) => ({
      id: run.id,
      source: run.source,
      status: run.status,
      runHash: run.runHash,
      triggeredBy: run.triggeredBy,
      requestedBy: run.requestedBy,
      startedAt: toIso(run.startedAt),
      finishedAt: toIso(run.finishedAt),
      durationMs: run.durationMs,
      titleCount: run.titleCount,
      message: run.message,
      error: run.error,
      metadata: parseMaybeJson(run.metadata),
      createdAt: toIso(run.createdAt),
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function runCatalogIngest(options: CatalogIngestRunOptions = {}): Promise<CatalogIngestRunResult> {
  const config = options.config ?? normalizeCatalogIngestConfig();
  await ensureCatalogIngestSchema();

  const runId = randomUUID();
  const startedAt = new Date();
  const requestedBy = sanitizeLabel(options.requestedBy ?? "system");
  const triggeredBy = sanitizeLabel(options.triggeredBy ?? "system");

  await db.insert(catalogIngestRuns).values({
    id: runId,
    source: execSource,
    status: "running",
    triggeredBy,
    requestedBy,
    startedAt,
    titleCount: 0,
    message: "started",
    metadata: {
      scriptPath: config.scriptPath,
      timeoutMs: config.timeoutMs,
      intervalSeconds: config.intervalSeconds,
      mode: config.mode,
      sourceIds: config.sourceIds,
      force: Boolean(options.force),
    },
  });

  try {
    const payload = await executeCrawler(config);
    if (!payload.titles.length) throw new Error("crawler returned no valid titles");

    const sourceVersion = payload.sourceVersion ?? `crawl/${new Date().toISOString()}`;
    const runHash = hashTitles(payload.titles);
    const duplicate = await currentSnapshotHasHash(runHash);

    // 품질 게이트: 신규 데이터가 아닌(중복도 아닌) 경우, 직전 current 대비 총건수 급감 또는 주요 소스
    // 붕괴면 승격을 거부한다(낡은 데이터를 부분 데이터로 덮어쓰지 않음). 빈자리를 seed/추정으로 채우지 않음.
    if (!duplicate && !options.force) {
      const currentStats = await getCurrentSnapshotStats();
      const regression = evaluateRegression(
        payload.titles.length,
        extractSourceCounts(payload.metadata),
        currentStats,
        config.minRetainRatio
      );
      if (regression) {
        const finishedAt = new Date();
        await db
          .update(catalogIngestRuns)
          .set({
            status: "aborted",
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            titleCount: payload.titles.length,
            message: null,
            error: `quality gate: ${regression.reason}`,
            metadata: { gate: regression, sourceVersion, crawledAt: payload.crawledAt ?? null },
          })
          .where(eq(catalogIngestRuns.id, runId));
        return {
          runId,
          status: "aborted",
          source: execSource,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          titleCount: payload.titles.length,
          runHash,
          snapshotId: null,
          duplicate: false,
          message: null,
          error: `quality gate: ${regression.reason}`,
        };
      }
    }

    let snapshotId: string | null = null;
    if (!duplicate || options.force) {
      snapshotId = await persistCatalogSnapshot({
        titles: payload.titles,
        source: execSource,
        sourceVersion,
        runHash,
        runId,
        requestedBy,
        triggeredBy,
        metadata: payload.metadata,
      });
    }

    const titleCount = loadCatalogSnapshot(payload.titles, sourceVersion, false).length;
    const finishedAt = new Date();
    const message = duplicate && !options.force ? "unchanged snapshot; memory catalog refreshed" : "snapshot stored";

    await db
      .update(catalogIngestRuns)
      .set({
        status: "success",
        runHash,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        titleCount,
        message,
        error: null,
        metadata: {
          sourceVersion,
          crawledAt: payload.crawledAt ?? null,
          count: payload.count ?? payload.titles.length,
          duplicate,
          force: Boolean(options.force),
          snapshotId,
          scriptMetadata: payload.metadata ?? null,
        },
      })
      .where(eq(catalogIngestRuns.id, runId));

    return {
      runId,
      status: "success",
      source: execSource,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      titleCount,
      runHash,
      snapshotId,
      duplicate,
      message,
      error: null,
    };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "unknown ingest error";
    await db
      .update(catalogIngestRuns)
      .set({
        status: "failed",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        titleCount: 0,
        message: null,
        error: message,
      })
      .where(eq(catalogIngestRuns.id, runId));
    throw new Error(message);
  }
}

async function executeCrawler(config: CatalogIngestConfig): Promise<CatalogCrawlerPayload> {
  const scriptPath = path.resolve(process.cwd(), config.scriptPath);
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--json", "--no-file"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: config.timeoutMs,
    maxBuffer: config.maxOutputMb * 1024 * 1024,
    env: { ...process.env, TZ: process.env.TZ ?? "Asia/Seoul", WEBDEX_SOURCE_IDS: config.sourceIds.join(",") },
  });
  return parseCrawlerJsonPayload(stdout);
}

async function persistCatalogSnapshot(input: {
  titles: Title[];
  source: string;
  sourceVersion: string;
  runHash: string;
  runId: string;
  requestedBy: string;
  triggeredBy: string;
  metadata: unknown;
}) {
  const snapshotId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.update(catalogSnapshots).set({ isCurrent: false }).where(eq(catalogSnapshots.isCurrent, true));
    await tx.insert(catalogSnapshots).values({
      id: snapshotId,
      source: input.source,
      sourceVersion: input.sourceVersion,
      titleCount: input.titles.length,
      isCurrent: true,
      snapshot: JSON.stringify(input.titles),
      metadata: {
        runHash: input.runHash,
        runId: input.runId,
        requestedBy: input.requestedBy,
        triggeredBy: input.triggeredBy,
        crawler: input.metadata ?? null,
      },
    });
  });
  return snapshotId;
}

async function currentSnapshotHasHash(runHash: string) {
  const [snapshot] = await db
    .select({ metadata: catalogSnapshots.metadata })
    .from(catalogSnapshots)
    .where(eq(catalogSnapshots.isCurrent, true))
    .orderBy(desc(catalogSnapshots.createdAt))
    .limit(1);
  const metadata = parseMaybeJson(snapshot?.metadata);
  return metadata && typeof metadata === "object" && "runHash" in metadata
    ? (metadata as { runHash?: unknown }).runHash === runHash
    : false;
}

// 품질 게이트용: 직전 current 스냅샷의 총건수 + 소스별 count(metadata.crawler.sources) 조회
async function getCurrentSnapshotStats(): Promise<{ titleCount: number; sources: Record<string, number> | null } | null> {
  const [snapshot] = await db
    .select({ titleCount: catalogSnapshots.titleCount, metadata: catalogSnapshots.metadata })
    .from(catalogSnapshots)
    .where(eq(catalogSnapshots.isCurrent, true))
    .orderBy(desc(catalogSnapshots.createdAt))
    .limit(1);
  if (!snapshot) return null;
  const metadata = parseMaybeJson(snapshot.metadata);
  const crawler =
    metadata && typeof metadata === "object" ? (metadata as { crawler?: unknown }).crawler : null;
  return { titleCount: snapshot.titleCount ?? 0, sources: extractSourceCounts(crawler) };
}

function hashTitles(titles: Title[]) {
  return createHash("sha256").update(JSON.stringify(titles)).digest("hex");
}

function isTitleLike(item: unknown): item is Title {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<Title>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.slug === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.availability)
  );
}

function parseBoundedInt(raw: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseBoundedRatio(raw: unknown, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return fallback;
  return parsed;
}

function parseMaybeJson(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toIso(value: Date | number | string | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeLabel(value: string) {
  return value.replace(/[^\w:./@-]/g, "_").slice(0, 80) || "system";
}

function withoutToken(config: CatalogIngestConfig) {
  return {
    mode: config.mode,
    intervalSeconds: config.intervalSeconds,
    timeoutMs: config.timeoutMs,
    maxOutputMb: config.maxOutputMb,
    scriptPath: config.scriptPath,
    sourceIds: config.sourceIds,
    minRetainRatio: config.minRetainRatio,
    triggerTokenConfigured: Boolean(config.triggerToken),
  };
}
