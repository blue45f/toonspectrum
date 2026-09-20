import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { afterEach, expect, it, vi } from "vitest";

import type { INestApplication } from "@nestjs/common";

// Schema readiness has its own PostgreSQL tests. Resolve the actual feature
// module here without contacting a database or starting publication schedulers.
vi.mock("../creator/creator-asset-schema-preflight", async (original) => {
  const actual = await original<typeof import("../creator/creator-asset-schema-preflight")>();
  return { ...actual, creatorAssetSchemaPreflightProvider: { provide: actual.CREATOR_ASSET_SCHEMA_PREFLIGHT, useValue: true } };
});
vi.mock("../creator/studio-live-lock-schema-preflight", async (original) => {
  const actual = await original<typeof import("../creator/studio-live-lock-schema-preflight")>();
  return { ...actual, studioLiveLockSchemaPreflightProvider: { provide: actual.STUDIO_LIVE_LOCK_SCHEMA_PREFLIGHT, useValue: true } };
});

let application: INestApplication | undefined;
afterEach(async () => { await application?.close(); application = undefined; vi.unstubAllEnvs(); });

it("compiles the actual graph and Creator modules and resolves preview producer, guard and external binding dependencies", async () => {
  vi.stubEnv("PRIVATE_OBJECT_STORAGE_ENABLED", "false");
  const { StudioProjectGraphModule } = await import("./studio-project-graph.module");
  const { StudioProjectGraphRepository } = await import("./studio-project-graph.repository");
  const { StudioProjectGraphService } = await import("./studio-project-graph.service");
  const { StudioExternalFileBindingRepository } = await import("./studio-external-file-binding.repository");
  const { StudioWorkAssetService } = await import("../creator/studio-work-asset.service");
  const { StudioWorkAssetUploadGuard } = await import("../creator/studio-asset-upload.guard");
  const { StudioReviewPreviewProducerService } = await import("./studio-review-preview-producer.service");
  const { StudioReviewPreviewProducerRepository } = await import("./studio-review-preview-producer.repository");
  const { StudioReviewPreviewProducerController } = await import("./studio-review-preview-producer.controller");
  const { StudioReviewPreviewService } = await import("./studio-review-preview.service");
  // create() instantiates the actual Nest module graph; init()/listen() would also
  // start unrelated Creator lifecycle schedulers and is deliberately not called.
  application = await NestFactory.create(StudioProjectGraphModule, { logger: false, abortOnError: false });
  const producer = application.get(StudioReviewPreviewProducerService) as unknown as Record<string, unknown>;
  const repository = application.get(StudioReviewPreviewProducerRepository) as unknown as Record<string, unknown>;
  const graph = application.get(StudioProjectGraphService) as unknown as Record<string, unknown>;
  expect(producer.assets).toBe(application.get(StudioWorkAssetService));
  expect(producer.repository).toBe(application.get(StudioReviewPreviewProducerRepository));
  expect(repository.graph).toBe(application.get(StudioProjectGraphRepository));
  expect(graph.externalBindings).toBe(application.get(StudioExternalFileBindingRepository));
  expect(application.get(StudioWorkAssetUploadGuard)).toBeInstanceOf(StudioWorkAssetUploadGuard);
  expect(application.get(StudioReviewPreviewProducerController)).toBeInstanceOf(StudioReviewPreviewProducerController);
  expect(application.get(StudioReviewPreviewService)).toBeInstanceOf(StudioReviewPreviewService);
});
