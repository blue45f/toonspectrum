import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it } from "vitest";

import { AdminCampaignsService } from "./admin-campaigns.service";
import { AdminMembersService } from "./admin-members.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminModerationService } from "./admin-moderation.service";
import { AdminRevenueService } from "./admin-revenue.service";
import { AdminModule } from "./admin.module";
import { AdminService } from "./admin.service";

import type { INestApplicationContext } from "@nestjs/common";

let context: INestApplicationContext | null = null;

afterEach(async () => {
  await context?.close();
  context = null;
});

describe("AdminService dev-runtime dependency injection", () => {
  it("resolves every facade dependency without relying on emitted design metadata", async () => {
    context = await NestFactory.createApplicationContext(AdminModule, { logger: false });
    const service = context.get(AdminService) as AdminService & Record<string, unknown>;

    expect(service.adminMetricsService).toBeInstanceOf(AdminMetricsService);
    expect(service.adminMembersService).toBeInstanceOf(AdminMembersService);
    expect(service.adminModerationService).toBeInstanceOf(AdminModerationService);
    expect(service.adminRevenueService).toBeInstanceOf(AdminRevenueService);
    expect(service.adminCampaignsService).toBeInstanceOf(AdminCampaignsService);
  });
});
