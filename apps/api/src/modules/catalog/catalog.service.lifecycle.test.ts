import "reflect-metadata";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadBundledCatalog } from "../../server/catalog-loader";

import { CatalogService } from "./catalog.service";

import type { INestApplicationContext } from "@nestjs/common";

vi.mock("../../platform/database", async () => ({
  ...await import("../../platform/database/schema"),
  db: {},
  dbClient: {},
}));

vi.mock("../../server/catalog-loader", () => ({
  loadBundledCatalog: vi.fn(),
}));

@Module({ providers: [CatalogService] })
class CatalogLifecycleTestModule {}

const emptyCatalog = {
  loaded: false as const,
  source: "empty",
  titleCount: 0,
  generatedAt: "2026-09-15T00:00:00.000Z",
};
let context: INestApplicationContext | null = null;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadBundledCatalog).mockReturnValue(emptyCatalog);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await context?.close();
  context = null;
  vi.restoreAllMocks();
});

describe("CatalogService bundled catalog lifecycle", () => {
  it("loads the reviewed catalog artifact exactly once during ordinary startup", async () => {
    context = await NestFactory.createApplicationContext(CatalogLifecycleTestModule, { logger: false });

    expect(loadBundledCatalog).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("catalog file missing"));
  });

  it("does not fail application startup when the bundled catalog is unreadable", async () => {
    vi.mocked(loadBundledCatalog).mockImplementation(() => {
      throw new Error("invalid gzip");
    });

    context = await NestFactory.createApplicationContext(CatalogLifecycleTestModule, { logger: false });

    expect(loadBundledCatalog).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "catalog load failed; runtime catalog is empty",
      expect.any(Error),
    );
  });
});
