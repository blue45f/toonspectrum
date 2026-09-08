import "reflect-metadata";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadLatestCatalogSnapshotFromDb,
  loadLatestCatalogSnapshotFromFile,
  refreshCatalogIfChanged,
} from "../../server/catalog-ingest";

import { CatalogService } from "./catalog.service";

import type { INestApplicationContext } from "@nestjs/common";

vi.mock("../../db", async () => ({
  ...await import("../../db/schema"),
  db: {},
  dbClient: {},
}));

vi.mock("../../server/catalog-ingest", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../server/catalog-ingest")>(),
  loadLatestCatalogSnapshotFromDb: vi.fn(),
  loadLatestCatalogSnapshotFromFile: vi.fn(),
  refreshCatalogIfChanged: vi.fn(),
}));

@Module({ providers: [CatalogService] })
class CatalogLifecycleTestModule {}

const emptySnapshot = {
  loaded: false as const,
  source: "empty",
  titleCount: 0,
  generatedAt: "2026-09-08T00:00:00.000Z",
};
const unchangedSnapshot = { reloaded: false, snapshotId: null, titleCount: 0 };
let context: INestApplicationContext | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.stubEnv("CATALOG_REFRESH_POLL_SECONDS", undefined);
  vi.stubEnv("WEBDEX_CATALOG_FORCE_DB", "");
  vi.mocked(loadLatestCatalogSnapshotFromFile).mockReturnValue(emptySnapshot);
  vi.mocked(loadLatestCatalogSnapshotFromDb).mockResolvedValue(emptySnapshot);
  vi.mocked(refreshCatalogIfChanged).mockResolvedValue(unchangedSnapshot);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await context?.close();
  context = null;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("CatalogService refresh lifecycle", () => {
  it("keeps the default file poll until Nest closes and clears only its own timer", async () => {
    const unrelatedTick = vi.fn();
    setInterval(unrelatedTick, 60_000);
    context = await NestFactory.createApplicationContext(CatalogLifecycleTestModule, { logger: false });
    expect(loadLatestCatalogSnapshotFromFile).toHaveBeenCalledOnce();
    expect(loadLatestCatalogSnapshotFromDb).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(59_999);
    expect(refreshCatalogIfChanged).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refreshCatalogIfChanged).toHaveBeenCalledOnce();

    await context.close();
    context = null;
    await vi.advanceTimersByTimeAsync(180_000);
    expect(refreshCatalogIfChanged).toHaveBeenCalledOnce();
    expect(unrelatedTick).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(["resolve", "reject"] as const)("does not restart polling when DB initialization settles after destruction: %s", async (outcome) => {
    vi.stubEnv("WEBDEX_CATALOG_FORCE_DB", "1");
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof loadLatestCatalogSnapshotFromDb>>>();
    vi.mocked(loadLatestCatalogSnapshotFromDb).mockReturnValue(pending.promise);
    const service = new CatalogService();
    const initialization = service.onModuleInit();
    expect(loadLatestCatalogSnapshotFromDb).toHaveBeenCalledOnce();
    expect(loadLatestCatalogSnapshotFromFile).not.toHaveBeenCalled();

    service.onModuleDestroy();
    service.onModuleDestroy();
    if (outcome === "resolve") pending.resolve(emptySnapshot);
    else pending.reject(new Error("initial snapshot unavailable"));
    await initialization;
    await vi.advanceTimersByTimeAsync(180_000);

    expect(refreshCatalogIfChanged).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not schedule another refresh after an in-flight poll finishes during shutdown", async () => {
    const pending = Promise.withResolvers<typeof unchangedSnapshot>();
    vi.mocked(refreshCatalogIfChanged).mockReturnValue(pending.promise);
    context = await NestFactory.createApplicationContext(CatalogLifecycleTestModule, { logger: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refreshCatalogIfChanged).toHaveBeenCalledOnce();
    await context.close();
    context = null;
    pending.resolve(unchangedSnapshot);
    await vi.advanceTimersByTimeAsync(180_000);

    expect(refreshCatalogIfChanged).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps polling after an initial DB load failure while the service is alive", async () => {
    vi.stubEnv("WEBDEX_CATALOG_FORCE_DB", "1");
    vi.mocked(loadLatestCatalogSnapshotFromDb).mockRejectedValue(new Error("initial snapshot unavailable"));
    context = await NestFactory.createApplicationContext(CatalogLifecycleTestModule, { logger: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refreshCatalogIfChanged).toHaveBeenCalledOnce();
  });

  it("preserves the explicit zero-poll setting", async () => {
    vi.stubEnv("CATALOG_REFRESH_POLL_SECONDS", "0");
    context = await NestFactory.createApplicationContext(CatalogLifecycleTestModule, { logger: false });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(loadLatestCatalogSnapshotFromFile).toHaveBeenCalledOnce();
    expect(refreshCatalogIfChanged).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
