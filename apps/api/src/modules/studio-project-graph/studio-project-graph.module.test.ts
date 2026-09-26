import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioExternalFileBindingRepository } from "./studio-external-file-binding.repository";
import { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import { StudioProjectGraphService } from "./studio-project-graph.service";
import { dbPool } from "../../platform/database";

import type { INestApplication } from "@nestjs/common";

vi.mock("../../platform/database", async (original) => {
  const actual = await original<typeof import("../../platform/database")>();
  // Keep real schema objects used by Creator's Drizzle aliases, while failing
  // immediately if provider construction attempts any database operation.
  const denied = () => { throw new Error("DI construction must not access a database"); };
  return { ...actual, db: new Proxy({}, { get: denied }), dbClient: { execute: vi.fn(denied) },
    dbPool: { connect: vi.fn(denied), query: vi.fn(denied) } };
});
// Creator is now a real imported feature module. Its schema preflights have
// separate database coverage; this test only verifies provider construction.
vi.mock("../creator/creator-asset-schema-preflight", async (original) => {
  const actual = await original<typeof import("../creator/creator-asset-schema-preflight")>();
  return { ...actual, creatorAssetSchemaPreflightProvider: { provide: actual.CREATOR_ASSET_SCHEMA_PREFLIGHT, useValue: true } };
});
vi.mock("../creator/studio-live-lock-schema-preflight", async (original) => {
  const actual = await original<typeof import("../creator/studio-live-lock-schema-preflight")>();
  return { ...actual, studioLiveLockSchemaPreflightProvider: { provide: actual.STUDIO_LIVE_LOCK_SCHEMA_PREFLIGHT, useValue: true } };
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("StudioProjectGraphModule dependency injection", () => {
  it("resolves both repositories through the real Nest module without database access", async () => {
    vi.stubEnv("PRIVATE_OBJECT_STORAGE_ENABLED", "false");
    let application: INestApplication | undefined;
    try {
      const { StudioProjectGraphModule } = await import("./studio-project-graph.module");
      // create() constructs the actual module graph. init()/listen() or
      // createApplicationContext() would also start unrelated Creator schedulers.
      application = await NestFactory.create(StudioProjectGraphModule, {
        logger: false,
        abortOnError: false,
      });
      const service = application.get(StudioProjectGraphService);
      expect(Reflect.get(service, "repository")).toBe(application.get(StudioProjectGraphRepository));
      expect(Reflect.get(service, "externalBindings")).toBe(application.get(StudioExternalFileBindingRepository));
      expect(dbPool.connect).not.toHaveBeenCalled();
      expect(dbPool.query).not.toHaveBeenCalled();
    } finally { await application?.close(); }
  });
});
