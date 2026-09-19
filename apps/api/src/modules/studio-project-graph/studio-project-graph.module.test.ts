import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { StudioExternalFileBindingRepository } from "./studio-external-file-binding.repository";
import { StudioProjectGraphModule } from "./studio-project-graph.module";
import { StudioProjectGraphRepository } from "./studio-project-graph.repository";
import { StudioProjectGraphService } from "./studio-project-graph.service";
import { dbPool } from "../../db";

import type { INestApplicationContext } from "@nestjs/common";

vi.mock("../../db", () => ({ dbPool: { connect: vi.fn(), query: vi.fn() } }));

describe("StudioProjectGraphModule dependency injection", () => {
  it("resolves both repositories through the real Nest module without database access", async () => {
    let application: INestApplicationContext | undefined;
    try {
      application = await NestFactory.createApplicationContext(StudioProjectGraphModule, {
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